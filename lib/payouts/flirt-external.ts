import { serviceClient } from "../supabase-service";
import { PayoutError, safeCents, type PayoutCreator, type PayoutRecord } from "./model";
import type { PayoutViewer } from "./access";

// A FLIRT creator linked by a Twin slug has no FLIRT Telegram clone. Read their
// separately owned payout records by the authenticated creator account ID.
// Never insert a fake clone: that could accidentally activate messaging.
export async function flirtExternalPayouts(viewer: PayoutViewer): Promise<{
  creators: PayoutCreator[];
  history: PayoutRecord[];
}> {
  if (viewer.brand !== "flirt") return { creators: [], history: [] };
  const db = serviceClient();
  let allowed: string[] | null = null;
  if (viewer.audience === "creator") {
    allowed = viewer.creatorAccountId ? [viewer.creatorAccountId] : [];
  } else if (viewer.access) {
    const assignment = await db.from("creator_agency_assignments")
      .select("creator_account_id").eq("agency_id", viewer.access.id);
    if (assignment.error) throw new PayoutError("Creator payouts could not be loaded.", 503);
    allowed = (assignment.data || []).map(row => row.creator_account_id);
  }
  if (allowed && !allowed.length) return { creators: [], history: [] };

  let query = db.from("creator_payout_earnings_snapshots").select(
    "creator_account_id,gross_usd_cents,agency_cut_bps,platform_balance_usd_cents,available_balance_usd_cents"
  );
  if (allowed) query = query.in("creator_account_id", allowed);
  const snapshots = await query;
  if (snapshots.error) throw new PayoutError("Creator payouts could not be loaded.", 503);
  const details = snapshots.data || [];
  if (!details.length) return { creators: [], history: [] };
  const ids = details.map(row => row.creator_account_id);
  const [accounts, links, payouts] = await Promise.all([
    db.from("creator_accounts").select("id,display_name").in("id", ids),
    db.from("creator_clone_links").select("creator_account_id,twin_slug,clone_id").in("creator_account_id", ids),
    db.from("telegram_creator_payouts")
      .select("id,creator_account_id,amount_cents,currency,paid_on,reference,payment_method,voided_at,original_aud_cents")
      .in("creator_account_id", ids).order("paid_on", { ascending: false })
      .order("created_at", { ascending: false }).limit(1000),
  ]);
  if (accounts.error || links.error || payouts.error) throw new PayoutError("Creator payout history could not be loaded.", 503);
  const linked = new Set((links.data || []).filter(row => !row.clone_id && !!row.twin_slug).map(row => row.creator_account_id));
  const names = new Map((accounts.data || []).map(row => [row.id, row.display_name || "Creator"]));
  const creators = details.filter(row => linked.has(row.creator_account_id) && names.has(row.creator_account_id))
    .map(row => {
      const gross = safeCents(row.gross_usd_cents);
      const cut = Number(row.agency_cut_bps);
      if (!Number.isInteger(cut) || cut < 0 || cut > 10000) throw new PayoutError("Creator terms could not be loaded.", 503);
      return {
        id: row.creator_account_id, name: names.get(row.creator_account_id)!,
        earnedUsdCents: Math.round(gross * (10000 - cut) / 10000),
        paid: { USD: 0, AUD: 0 }, lastPaidOn: null as string | null,
        statement: {
          grossUsdCents: gross, agencyCutBps: cut,
          platformBalanceUsdCents: row.platform_balance_usd_cents == null ? null : safeCents(row.platform_balance_usd_cents),
          availableBalanceUsdCents: row.available_balance_usd_cents == null ? null : safeCents(row.available_balance_usd_cents),
        },
      };
    });
  const byId = new Map(creators.map(row => [row.id, row]));
  const history: PayoutRecord[] = [];
  for (const row of payouts.data || []) {
    const creator = byId.get(row.creator_account_id);
    if (!creator) continue;
    if (row.currency !== "USD" && row.currency !== "AUD") throw new PayoutError("Invalid payout currency.", 503);
    const amount = safeCents(row.amount_cents);
    if (!row.voided_at) {
      creator.paid[row.currency] += amount;
      if (!creator.lastPaidOn || creator.lastPaidOn < row.paid_on) creator.lastPaidOn = row.paid_on;
    }
    history.push({
      id: row.id, cloneId: creator.id, creatorName: creator.name,
      amountCents: amount, currency: row.currency, paidOn: row.paid_on,
      reference: row.reference, method: row.payment_method, voided: !!row.voided_at,
      originalAudCents: row.original_aud_cents == null ? null : safeCents(row.original_aud_cents),
    });
  }
  return { creators, history };
}
