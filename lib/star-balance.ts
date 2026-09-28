import { supabaseAdmin } from "./supabase";
import { selectAllRows } from "./select-all";
import { dedupeStarRows } from "./star-dedupe";

// The two Star figures Telegram's Bot API actually gives us, and what each
// genuinely means. Don't add a matured/pending "21-day hold" split back in -
// Telegram doesn't expose that breakdown anywhere, it can only be estimated
// from ledger timestamps, and that estimate was confusing enough next to the
// two real fields that it got pulled (2026-07-28):
//
//   - lifetimeStars     Every Star this clone has EVER been paid, gross,
//                       forever. SUM(star_transactions.amount_stars) - that
//                       table is itself populated by polling Telegram's
//                       getStarTransactions (see star-reconcile.ts). Never
//                       falls when Stars are spent or withdrawn - a running
//                       total of proceeds, not a balance. This is what
//                       "revenue" charts and totals mean throughout the app.
//   - totalBalanceStars Stars sitting in the bot's Telegram wallet right now,
//                       read straight from getMyStarBalance - the one real
//                       current-balance field Telegram's Bot API exposes.
export type StarBalance = {
  lifetimeStars: number;
  totalBalanceStars: number | null;
};

async function getMyStarBalance(token: string): Promise<number | null> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getMyStarBalance`, { method: "POST", signal: AbortSignal.timeout(8_000) });
    const j = await r.json();
    return j.ok ? (j.result?.amount ?? null) : null;
  } catch {
    return null;
  }
}

export async function getStarBalance(cloneId: string, botToken: string): Promise<StarBalance> {
  // PAGED: this is one clone's LIFETIME star total, so it grows without bound and
  // is exactly the shape that outruns the PostgREST cap. alanna-pow crossed it on
  // 2026-08-09 with 5,010 transactions, at which point an unpaged read reported
  // the first thousand of them as her lifetime earnings.
  const [{ rows }, balance] = await Promise.all([
    selectAllRows<{
      id: string;
      clone_id: string;
      telegram_id: number | null;
      kind: string | null;
      amount_stars: number | null;
      paid_at: string;
      invoice_payload: string | null;
    }>(
      supabaseAdmin
        .from("star_transactions")
        .select("id,clone_id,telegram_id,kind,amount_stars,paid_at,invoice_payload")
        .eq("clone_id", cloneId),
      { label: "clone lifetime star total" },
    ),
    getMyStarBalance(botToken),
  ]);

  // See lib/star-dedupe.ts: collapse double-recorded payments before summing.
  const lifetimeStars = dedupeStarRows(rows).reduce((s, r) => s + (Number(r.amount_stars) || 0), 0);

  return { lifetimeStars, totalBalanceStars: balance };
}
