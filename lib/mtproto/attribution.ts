// lib/mtproto/attribution.ts
//
// N3 ("ATTRIBUTION RULES, fixed BEFORE launch so numbers can't be gamed
// later"): a purchase counts as re-engagement-driven only if the fan REPLIED
// to our send AND bought within a fixed window of it. Windows are shown side
// by side — 24h / 72h / 7d — never collapsed to one number. Hold-out fans are
// measured over the identical window, from the same reference point (when
// they would have been contacted), with no reply requirement since they were
// never sent anything to reply to.
//
// N4: "Do NOT rollup star_transactions; join by fan_id + time window with an
// index." This reads star_transactions filtered to exactly the run's own
// fans (bounded set, chunked .in() calls) and a coarse paid_at lower bound —
// never an unfiltered or fleet-wide read.

import { supabaseAdmin } from "@/lib/supabase";
import { selectAllRowsMtproto } from "./paging";
import { ATTRIBUTION_WINDOWS_HOURS, type AttributionWindowHours, type LiftReport, type LiftSide, type ReengageEpisode } from "./types";

export type PurchaseRow = { user_id: string; clone_id: string; amount_stars: number; paid_at: string | null; created_at: string };

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function purchasesForUsers(userIds: string[], earliestIso: string): Promise<PurchaseRow[]> {
  if (userIds.length === 0) return [];
  const results = await Promise.all(
    chunk(userIds, 400).map((ids) =>
      selectAllRowsMtproto<PurchaseRow>(
        () =>
          supabaseAdmin
            .from("star_transactions")
            .select("user_id,clone_id,amount_stars,paid_at,created_at")
            .in("user_id", ids)
            .gte("created_at", earliestIso) as any,
        { label: "star_transactions (mtproto attribution)", maxRows: 20_000 },
      ),
    ),
  );
  return results.flatMap((r) => r.rows);
}

type Side = { userId: string; cloneId: string; referenceMs: number; replied: boolean; attributionEligible: boolean };

function liftSideFor(
  side: Side[],
  purchasesByUser: Map<string, PurchaseRow[]>,
  windowHours: AttributionWindowHours,
): LiftSide {
  const fans = side.length;
  let replies = 0;
  let buyers = 0;
  let stars = 0;
  const seenBuyers = new Set<string>();
  for (const s of side) {
    if (s.replied) replies += 1;
    if (!s.attributionEligible) continue;
    const txns = purchasesByUser.get(s.userId) ?? [];
    let boughtInWindow = false;
    for (const t of txns) {
      const paidMs = new Date(t.paid_at ?? t.created_at).getTime();
      const hoursSince = (paidMs - s.referenceMs) / 3_600_000;
      if (hoursSince >= 0 && hoursSince <= windowHours) {
        boughtInWindow = true;
        stars += t.amount_stars ?? 0;
      }
    }
    if (boughtInWindow && !seenBuyers.has(s.userId)) {
      seenBuyers.add(s.userId);
      buyers += 1;
    }
  }
  return {
    fans,
    replies,
    buyers,
    stars,
    replyRate: fans ? replies / fans : 0,
    buyerRate: fans ? buyers / fans : 0,
    starsPerFan: fans ? stars / fans : 0,
  };
}

/** One LiftReport per attribution window (24h/72h/7d), contacted vs holdout,
 *  for a set of episodes (a single run, or a fleet/date-range roll-up handed
 *  in by the caller). */
export async function computeLift(episodes: ReengageEpisode[]): Promise<LiftReport[]> {
  const contactedSide: Side[] = episodes
    .filter((e) => e.state !== "holdout")
    .map((e) => ({
      userId: e.userId,
      cloneId: e.cloneId,
      referenceMs: new Date(e.sentAt ?? e.episodeStartInboundAt).getTime(),
      replied: e.state === "replied",
      // Attribution requires a reply (N3) — a contacted fan who never
      // replied is "observed" revenue at most, never counted as
      // re-engagement-driven here.
      attributionEligible: e.state === "replied",
    }));
  const holdoutSide: Side[] = episodes
    .filter((e) => e.state === "holdout")
    .map((e) => ({
      userId: e.userId,
      cloneId: e.cloneId,
      referenceMs: new Date(e.episodeStartInboundAt).getTime(),
      replied: false, // hold-out was never sent anything to reply to
      attributionEligible: true, // but IS measured for purchases over the identical window (N3)
    }));

  const allUserIds = [...new Set([...contactedSide, ...holdoutSide].map((s) => s.userId))];
  const earliestMs = Math.min(
    ...[...contactedSide, ...holdoutSide].map((s) => s.referenceMs),
    Date.now(),
  );
  const purchases = allUserIds.length ? await purchasesForUsers(allUserIds, new Date(earliestMs).toISOString()) : [];
  const purchasesByUser = new Map<string, PurchaseRow[]>();
  for (const p of purchases) {
    const list = purchasesByUser.get(p.user_id) ?? [];
    list.push(p);
    purchasesByUser.set(p.user_id, list);
  }

  return ATTRIBUTION_WINDOWS_HOURS.map((windowHours) => ({
    windowHours,
    contacted: liftSideFor(contactedSide, purchasesByUser, windowHours),
    holdout: liftSideFor(holdoutSide, purchasesByUser, windowHours),
  }));
}
