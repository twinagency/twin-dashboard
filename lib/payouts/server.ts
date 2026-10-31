import { payoutClient, payoutTerms, type PayoutViewer } from "./access";
import { flirtExternalPayouts } from "./flirt-external";
export { requirePayoutViewer } from "./access";
export type { PayoutViewer } from "./access";
import { PayoutError, UUID, parsePayout, safeCents, type PayoutCurrency, type PayoutSnapshot } from "./model";

type Earned = { at: number; promise: Promise<Map<string, number>> };
const earnedCache = new Map<string, Earned>();
async function creatorEarnings(ids: string[], viewer: PayoutViewer): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const key = `${viewer.dataScope || "default"}:${[...ids].sort().join(",")}`;
  const hit = earnedCache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.promise;
  const promise = (async () => {
    const db = payoutClient(viewer);
    const { data, error } = await db.rpc("telegram_payout_earnings", { p_clone_ids: ids });
    if (error || !data) throw new PayoutError("Earnings are temporarily unavailable.", 503);
    const rows = data as { clone_id: string; stars: number | string }[];
    const stars = new Map(rows.map(row => [row.clone_id, Number(row.stars)]));
    const values = new Map<string, number>();
    // Use each creator's own existing terms for BOTH audiences. An admin's
    // gross rate or an agency's rate must never change a creator's total here.
    for (let start = 0; start < ids.length; start += 12) {
      await Promise.all(ids.slice(start, start + 12).map(async id => {
        const gross = stars.get(id);
        if (gross == null || !Number.isFinite(gross)) throw new PayoutError("Earnings are temporarily unavailable.", 503);
        const terms = await payoutTerms(id, viewer);
        const cents = Math.round(gross * terms.starMult * terms.usdPerStar * 100);
        if (!Number.isSafeInteger(cents)) throw new PayoutError("Earnings are temporarily unavailable.", 503);
        values.set(id, cents);
      }));
    }
    return values;
  })();
  if (earnedCache.size >= 64) earnedCache.delete(earnedCache.keys().next().value!);
  earnedCache.set(key, { at: Date.now(), promise });
  promise.catch(() => { if (earnedCache.get(key)?.promise === promise) earnedCache.delete(key); });
  return promise;
}

export async function payoutSnapshot(viewer: PayoutViewer, selected?: string | null, page = 0): Promise<PayoutSnapshot> {
  if (selected && !UUID.test(selected)) throw new PayoutError("Creator access denied.", 403);
  if (!Number.isInteger(page) || page < 0 || page > 100_000) throw new PayoutError("Invalid history page.");
  const db = payoutClient(viewer);
  let query = db.from("clones").select("id,name").order("name");
  if (viewer.cloneIds) query = query.in("id", viewer.cloneIds.length ? viewer.cloneIds : ["00000000-0000-0000-0000-000000000000"]);
  const clones = await query;
  if (clones.error) throw new PayoutError("Creator list is temporarily unavailable.", 503);
  const rows = (clones.data || []) as { id: string; name: string }[];
  const ids = rows.map(row => row.id);
  const external = await flirtExternalPayouts(viewer);
  if (selected && !ids.includes(selected) && !external.creators.some(row => row.id === selected)) {
    throw new PayoutError("Creator access denied.", 403);
  }
  const pageSize = 50;
  if (!ids.length && !external.creators.length) return { audience: viewer.audience, canManage: viewer.canManage, brand: viewer.brand, creators: [], history: [], historyCount: 0, page: 0, pageSize, checkedAt: new Date().toISOString() };
  const historyIds = selected ? ids.filter(id => id === selected) : ids;
  // FLIRT combines local clone payouts with external creator-account payouts.
  // Fetch native payments from the beginning before paginating the merged list.
  const start = viewer.brand === "flirt" ? 0 : page * pageSize;
  const [earned, summary, history] = await Promise.all([
    ids.length ? creatorEarnings(ids, viewer).catch(() => null) : Promise.resolve(new Map<string, number>()),
    ids.length ? db.rpc("telegram_payout_summary", { p_clone_ids: ids }) : Promise.resolve({ data: [], error: null }),
    historyIds.length ? db.from("telegram_creator_payouts").select("id,clone_id,amount_cents,currency,paid_on,reference,payment_method,voided_at", { count: "exact" }).in("clone_id", historyIds).order("paid_on", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false }).range(start, (page + 1) * pageSize - 1) : Promise.resolve({ data: [], count: 0, error: null }),
  ]);
  if (summary.error || history.error) throw new PayoutError("Payment history is temporarily unavailable. Please try again.", 503);
  const creators = [...rows.map(row => ({ id: row.id, name: row.name, earnedUsdCents: earned?.get(row.id) ?? null, paid: { USD: 0, AUD: 0 }, lastPaidOn: null as string | null })), ...external.creators];
  const byId = new Map(creators.map(row => [row.id, row]));
  for (const row of summary.data as { clone_id: string; currency: PayoutCurrency; paid_cents: number | string; last_paid_on: string | null }[] || []) {
    const creator = byId.get(row.clone_id);
    if (!creator || !["USD", "AUD"].includes(row.currency)) throw new PayoutError("Payment totals are unavailable.", 503);
    creator.paid[row.currency] = safeCents(row.paid_cents);
    if (row.last_paid_on && (!creator.lastPaidOn || row.last_paid_on > creator.lastPaidOn)) creator.lastPaidOn = row.last_paid_on;
  }
  const nativeHistory = (history.data || []).map(row => ({ id: row.id, cloneId: row.clone_id, creatorName: byId.get(row.clone_id)!.name, amountCents: safeCents(row.amount_cents), currency: row.currency as PayoutCurrency, paidOn: row.paid_on, reference: row.reference, method: row.payment_method, voided: !!row.voided_at }));
  const externalHistory = selected ? external.history.filter(row => row.cloneId === selected) : external.history;
  const mergedHistory = viewer.brand === "flirt"
    ? [...nativeHistory, ...externalHistory].sort((a, b) => b.paidOn.localeCompare(a.paidOn) || b.id.localeCompare(a.id)).slice(page * pageSize, (page + 1) * pageSize)
    : nativeHistory;
  return { audience: viewer.audience, canManage: viewer.canManage, brand: viewer.brand, creators, history: mergedHistory, historyCount: (history.count || 0) + externalHistory.length, page, pageSize, checkedAt: new Date().toISOString() };
}

export async function recordPayout(viewer: PayoutViewer, input: unknown) {
  if (!viewer.canManage || viewer.audience === "creator") throw new PayoutError("Administrator access required.", 403);
  const value = parsePayout(input);
  const db = payoutClient(viewer);
  const nativeAllowed = !viewer.cloneIds || viewer.cloneIds.includes(value.cloneId);
  const creator = nativeAllowed ? await db.from("clones").select("id").eq("id", value.cloneId).maybeSingle() : { data: null, error: null };
  if (creator.error) throw new PayoutError("Creator access denied.", 403);
  const externalAllowed = !creator.data && viewer.brand === "flirt" &&
    (await flirtExternalPayouts(viewer)).creators.some(row => row.id === value.cloneId);
  if (!creator.data && !externalAllowed) throw new PayoutError("Creator access denied.", 403);
  const owner = creator.data ? { clone_id: value.cloneId } : { creator_account_id: value.cloneId };
  const entry = { ...owner, amount_cents: value.amountCents, currency: value.currency, paid_on: value.paidOn, reference: value.reference, payment_method: value.method, request_id: value.requestId, recorded_by: viewer.actor };
  const result = await db.from("telegram_creator_payouts").insert(entry).select("id").single();
  if (!result.error) return { id: result.data.id };
  if (result.error.code === "23505") {
    const existing = await db.from("telegram_creator_payouts").select("id,clone_id,creator_account_id,amount_cents,currency,paid_on,reference,payment_method,recorded_by").eq("request_id", value.requestId).maybeSingle();
    const row = existing.data;
    if (!existing.error && row && Object.entries(entry).filter(([key]) => key !== "request_id").every(([key, v]) => String(row[key as keyof typeof row]) === String(v))) return { id: row.id };
    throw new PayoutError("This payment request has already been used. Reload before recording another payment.", 409);
  }
  throw new PayoutError("The payout could not be saved. Your entry is still in the form.", 503);
}

export async function voidPayout(viewer: PayoutViewer, input: unknown) {
  if (!viewer.canManage || viewer.audience === "creator") throw new PayoutError("Administrator access required.", 403);
  const value = input as { id?: unknown; reason?: unknown } | null;
  if (!value || typeof value.id !== "string" || !UUID.test(value.id) || typeof value.reason !== "string" || !value.reason.trim() || value.reason.trim().length > 240) throw new PayoutError("Enter a reason for correcting this entry.");
  const db = payoutClient(viewer);
  if (viewer.brand === "flirt") {
    const current = await db.from("telegram_creator_payouts").select("clone_id,creator_account_id").eq("id", value.id).maybeSingle();
    if (current.error || !current.data) throw new PayoutError("This payout is unavailable.", 404);
    const nativeAllowed = !!current.data.clone_id && (!viewer.cloneIds || viewer.cloneIds.includes(current.data.clone_id));
    const externalAllowed = !!current.data.creator_account_id &&
      (await flirtExternalPayouts(viewer)).creators.some(row => row.id === current.data!.creator_account_id);
    if (!nativeAllowed && !externalAllowed) throw new PayoutError("Creator access denied.", 403);
  }
  let query = db.from("telegram_creator_payouts").update({ voided_at: new Date().toISOString(), voided_by: viewer.actor, void_reason: value.reason.trim() }).eq("id", value.id).is("voided_at", null);
  if (viewer.cloneIds && viewer.brand !== "flirt") query = query.in("clone_id", viewer.cloneIds);
  const result = await query.select("id").maybeSingle();
  if (result.error) throw new PayoutError("The correction could not be saved.", 503);
  if (!result.data) throw new PayoutError("This entry is unavailable or already voided.", 409);
  return { id: result.data.id };
}
