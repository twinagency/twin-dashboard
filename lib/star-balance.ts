import { supabaseAdmin } from "./supabase";

// The three Star figures the product conflates into one "revenue" number if
// you're not careful, and what each one genuinely means:
//
//   - lifetimeStars    Every Star this clone has EVER been paid, gross,
//                       forever. SUM(star_transactions.amount_stars). Never
//                       falls when Stars are spent or withdrawn - a running
//                       total of proceeds, not a balance. This is what
//                       "revenue" charts and totals mean throughout the app.
//   - totalBalanceStars Stars sitting in the bot's Telegram wallet right now
//                       (matured + still on hold, minus anything already
//                       withdrawn). Read straight from getMyStarBalance -
//                       this is the one real "balance" field Telegram's Bot
//                       API exposes.
//   - availableStars    The slice of totalBalanceStars that has cleared
//                       Telegram's 21-day maturation hold and can actually be
//                       withdrawn right now.
//   - pendingStars      The slice still inside the 21-day hold.
//
// Telegram's Bot API does NOT expose the matured/pending split - only the
// transaction list (getStarTransactions, what star-reconcile.ts polls into
// star_transactions) and the single current total (getMyStarBalance). The
// split has to be derived here from ledger timestamps: sum every transaction
// paid 21+ days ago as "matured", then assume any Stars already missing from
// the current balance (lifetime earned minus current total) came out of the
// matured pool first, since that's the only pool Telegram would ever let
// anyone withdraw from. Clamped into [0, totalBalanceStars] so a clone that
// has never withdrawn anything (alreadyGone = 0) shows available = matured.
export type StarBalance = {
  lifetimeStars: number;
  totalBalanceStars: number | null;
  availableStars: number | null;
  pendingStars: number | null;
};

const MS_21D = 21 * 86_400_000;

async function getMyStarBalance(token: string): Promise<number | null> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getMyStarBalance`, { method: "POST" });
    const j = await r.json();
    return j.ok ? (j.result?.amount ?? null) : null;
  } catch {
    return null;
  }
}

export async function getStarBalance(cloneId: string, botToken: string): Promise<StarBalance> {
  const [{ data: tx }, balance] = await Promise.all([
    supabaseAdmin.from("star_transactions").select("amount_stars,paid_at").eq("clone_id", cloneId),
    getMyStarBalance(botToken),
  ]);
  const rows = (tx ?? []) as { amount_stars: number | null; paid_at: string }[];

  const lifetimeStars = rows.reduce((s, r) => s + (Number(r.amount_stars) || 0), 0);
  const matured = rows.reduce(
    (s, r) => s + (Date.now() - new Date(r.paid_at).getTime() >= MS_21D ? Number(r.amount_stars) || 0 : 0),
    0,
  );
  const alreadyGone = balance != null ? Math.max(0, lifetimeStars - balance) : 0;
  const availableStars = balance != null ? Math.max(0, Math.min(matured - alreadyGone, balance)) : null;
  const pendingStars = balance != null && availableStars != null ? balance - availableStars : null;

  return { lifetimeStars, totalBalanceStars: balance, availableStars, pendingStars };
}
