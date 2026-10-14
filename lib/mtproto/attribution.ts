// lib/mtproto/attribution.ts
//
// N3 ("ATTRIBUTION RULES, fixed BEFORE launch so numbers can't be gamed
// later"): a purchase counts as re-engagement-driven only if the fan REPLIED
// to our send AND bought within a fixed window of it. Windows are shown side
// by side — 24h / 72h / 7d — never collapsed to one number.
//
// LIFT (contacted vs hold-out) has to be apples to apples, so it does NOT use
// the reply requirement: on BOTH sides "buyers" is any fan with a paid order in
// the window, measured from that fan's own anchor time. The reply-gated number
// is reported separately as attributedBuyers/attributedStars (contacted only).
//
//   contacted anchor = the real send time (acked, with a Telegram message id)
//   hold-out anchor  = the episode's creation time + the median (send - created)
//                      lag of the contacted fans of the SAME creator, i.e. when
//                      that fan would have been contacted. Same window length.
//
// Only fans whose window has fully elapsed are counted (per window), so a
// half-finished 7d window cannot depress whichever group was assigned last.
// Groups are disjoint (a fan who is both in a hold-out episode and a sent one
// is dropped from the hold-out) and deduplicated per (creator, fan).
//
// Purchases come from star_transactions restricted to exactly this run's fans
// (chunked .in()), bounded by paid_at, paged with a stable order, and run
// through lib/revenue-ledger.ts's classifier so refunds/adjustments are never a
// "purchase" (N4: never rollup star_transactions).

import { mtDb } from "./db";
import { classifyRevenueLedgerRow } from "@/lib/revenue-ledger";
import { dedupeStarRows } from "@/lib/star-dedupe";
import { hasIndividualReceiptSchema, withReceiptColumns } from "@/lib/star-receipts";
import { episodeFanKey, isRealSend } from "./episodes";
import { selectAllRowsMtproto } from "./paging";
import { ATTRIBUTION_WINDOWS_HOURS, type AttributionWindowHours, type LiftReport, type LiftSide, type ReengageEpisode } from "./types";

export type PurchaseRow = { id: string; user_id: string; clone_id: string; telegram_id: number | null; kind: string | null; amount_stars: number; invoice_payload: string | null; paid_at: string; created_at: string; receipt_namespace?: string | null };
export type PaidOrder = { userId: string; cloneId: string; stars: number; paidMs: number };
export type PurchaseRead = { orders: PaidOrder[]; truncated: boolean };

const CHUNK = 200; // uuid IN lists this long stay well inside the URL limit
const HOUR = 3_600_000;
const MAX_WINDOW_MS = ATTRIBUTION_WINDOWS_HOURS[ATTRIBUTION_WINDOWS_HOURS.length - 1] * HOUR;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Paid orders (positive, non-refund) for these fans with paid_at in
 *  [earliestMs, latestMs]. Chunks run in parallel; `truncated` is true if any
 *  chunk hit the row ceiling or failed. */
export async function purchasesForUsers(userIds: string[], earliestMs: number, latestMs: number = Date.now()): Promise<PurchaseRead> {
  if (userIds.length === 0) return { orders: [], truncated: false };
  const receiptSchema = await hasIndividualReceiptSchema(mtDb());
  const earliestIso = new Date(earliestMs).toISOString();
  const latestIso = new Date(latestMs).toISOString();
  const results = await Promise.all(
    chunk(userIds, CHUNK).map((ids) =>
      selectAllRowsMtproto<PurchaseRow>(
        () =>
          mtDb()
            .from("star_transactions")
            .select(withReceiptColumns("id,user_id,clone_id,telegram_id,kind,amount_stars,invoice_payload,paid_at,created_at", receiptSchema))
            .in("user_id", ids)
            .gte("paid_at", earliestIso)
            .lte("paid_at", latestIso)
            .order("id", { ascending: true }) as any,
        { label: "star_transactions (mtproto attribution)", maxRows: 20_000 },
      ),
    ),
  );
  const orders: PaidOrder[] = [];
  for (const r of results) {
    // See lib/star-dedupe.ts: collapse double-recorded payments before
    // classifying, so a duplicate can't be counted as two "purchases".
    for (const row of dedupeStarRows(r.rows)) {
      const c = classifyRevenueLedgerRow(row);
      if (!c.paidOrder) continue;
      orders.push({ userId: row.user_id, cloneId: row.clone_id, stars: c.stars, paidMs: new Date(row.paid_at ?? row.created_at).getTime() });
    }
  }
  return { orders, truncated: results.some((r) => r.truncated) };
}

/** One read that serves lift, funnel and the sends table for a set of episodes. */
export async function loadPurchasesForEpisodes(episodes: ReengageEpisode[]): Promise<PurchaseRead> {
  const relevant = episodes.filter((e) => (e.state === "holdout" && !e.dryRun) || isRealSend(e));
  if (relevant.length === 0) return { orders: [], truncated: false };
  const earliest = Math.min(...relevant.map((e) => new Date(e.sentAt ?? e.createdAt).getTime()));
  // star_transactions joins on users.id. An episode whose fan row was deleted
  // (user_id NULL, migration 163) has nothing to join, so it is left out of the
  // purchase read: it counts as a fan in the funnel/lift but never as a buyer,
  // and it can never be joined to somebody else's purchases.
  const userIds = [...new Set(relevant.map((e) => e.userId).filter((u): u is string => u != null))];
  return purchasesForUsers(userIds, earliest);
}

/** userId is null for a deleted fan (no purchase can be joined to it). */
type Side = { userId: string | null; cloneId: string; anchorMs: number; replied: boolean };

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function liftSideFor(side: Side[], ordersByUser: Map<string, PaidOrder[]>, windowHours: AttributionWindowHours, nowMs: number, contactedSide: boolean): LiftSide {
  let fans = 0;
  let replies = 0;
  let buyers = 0;
  let stars = 0;
  let attributedBuyers = 0;
  let attributedStars = 0;
  for (const s of side) {
    if (s.anchorMs + windowHours * HOUR > nowMs) continue; // window not finished yet
    fans += 1;
    if (s.replied) replies += 1;
    let fanStars = 0;
    for (const o of (s.userId != null ? ordersByUser.get(s.userId) : undefined) ?? []) {
      if (o.cloneId !== s.cloneId) continue;
      const hours = (o.paidMs - s.anchorMs) / HOUR;
      if (hours >= 0 && hours <= windowHours) fanStars += o.stars;
    }
    if (fanStars > 0) {
      buyers += 1;
      stars += fanStars;
      if (contactedSide && s.replied) {
        attributedBuyers += 1;
        attributedStars += fanStars;
      }
    }
  }
  return {
    fans,
    replies,
    buyers,
    stars,
    attributedBuyers,
    attributedStars,
    replyRate: fans ? replies / fans : 0,
    buyerRate: fans ? buyers / fans : 0,
    starsPerFan: fans ? stars / fans : 0,
  };
}

/** Pure core of computeLift (no I/O): exported so the test can drive it. */
export function liftFromData(episodes: ReengageEpisode[], purchases: PurchaseRead, nowMs: number = Date.now()): LiftReport[] {
  const contactedByFan = new Map<string, Side & { createdMs: number }>();
  for (const e of episodes) {
    if (!isRealSend(e)) continue;
    const key = episodeFanKey(e); // (clone_id, telegram_id): user_id may be NULL
    const sentMs = new Date(e.sentAt as string).getTime();
    const prev = contactedByFan.get(key);
    // one row per fan; the earliest send anchors the window, replied is sticky
    if (!prev || sentMs < prev.anchorMs) {
      contactedByFan.set(key, { userId: e.userId ?? prev?.userId ?? null, cloneId: e.cloneId, anchorMs: sentMs, replied: (prev?.replied ?? false) || e.state === "replied", createdMs: new Date(e.createdAt).getTime() });
    } else {
      if (e.state === "replied") prev.replied = true;
      prev.userId = e.userId ?? prev.userId;
    }
  }
  const contactedSide = [...contactedByFan.values()];

  const lagByClone = new Map<string, number>();
  for (const cloneId of new Set(contactedSide.map((s) => s.cloneId))) {
    lagByClone.set(cloneId, Math.max(0, median(contactedSide.filter((s) => s.cloneId === cloneId).map((s) => s.anchorMs - s.createdMs))));
  }

  const holdoutByFan = new Map<string, Side>();
  for (const e of episodes) {
    if (e.state !== "holdout" || e.dryRun) continue; // a dry run's hold-out is not a control group
    const key = episodeFanKey(e);
    if (contactedByFan.has(key)) continue; // keep the groups disjoint
    const anchorMs = new Date(e.createdAt).getTime() + (lagByClone.get(e.cloneId) ?? 0);
    const prev = holdoutByFan.get(key);
    if (!prev || anchorMs < prev.anchorMs) holdoutByFan.set(key, { userId: e.userId, cloneId: e.cloneId, anchorMs, replied: false });
  }
  const holdoutSide = [...holdoutByFan.values()];

  const ordersByUser = new Map<string, PaidOrder[]>();
  for (const o of purchases.orders) {
    const list = ordersByUser.get(o.userId) ?? [];
    list.push(o);
    ordersByUser.set(o.userId, list);
  }

  return ATTRIBUTION_WINDOWS_HOURS.map((windowHours) => ({
    windowHours,
    partial: purchases.truncated || undefined,
    contacted: liftSideFor(contactedSide, ordersByUser, windowHours, nowMs, true),
    holdout: liftSideFor(holdoutSide, ordersByUser, windowHours, nowMs, false),
  }));
}

/** One LiftReport per attribution window (24h/72h/7d), contacted vs holdout,
 *  for a set of episodes. Pass `purchases` to reuse a read done for the page. */
export async function computeLift(episodes: ReengageEpisode[], purchases?: PurchaseRead): Promise<LiftReport[]> {
  return liftFromData(episodes, purchases ?? (await loadPurchasesForEpisodes(episodes)));
}

export { MAX_WINDOW_MS };
