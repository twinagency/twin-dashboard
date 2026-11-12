// NOTE: the dashboard, the info pages and the wallet no longer use this file:
// non-admin reads arrive NET from lib/agency-fetch.ts (see lib/agency-scale.ts),
// and scaling them again would double-cut. scaleDashboardData/scaleAnalyticsData
// remain ONLY for the public Twin API (lib/api-public.ts), whose model keys are
// not an agency identity and so never pass through that wrapper.
//
// ── Projects gross DashboardData/AnalyticsData down to what an agency or a
//    creator may see: gross scaled by the platform cut (agency) or by the
//    platform cut AND the agency's own further cut (creator). Master admins
//    never go through this file — they get gross straight from the cache.
//
// lib/revenue-cache.ts holds GROSS numbers only, keyed by role (accessCacheKey)
// but never scaled itself — scaling happens here, per request, downstream of
// the cache, so the cut can change (an admin edits it) without a stale scaled
// number surviving in the cache for up to a minute.

import type { DashboardData, CloneStats, CloneSummary, RecentTransaction } from "./dashboard-data";
import type { AnalyticsData } from "./analytics-data";
import { getCutPctForClone, getAgencyCreatorCutPct, applyCut, applyStackedCut } from "./platform-cut";

export type CloneCuts = { platformPct: number; agencyCreatorPct: number };

/** "creator": platform cut then the agency's own cut, stacked. "agency": platform cut only. */
export type ViewerMode = "agency" | "creator";

/** Resolve both cuts for every clone id in one payload, once, before scaling anything. */
export async function resolveCloneCuts(cloneIds: Iterable<string>): Promise<Map<string, CloneCuts>> {
  const ids = [...new Set(cloneIds)];
  const entries = await Promise.all(
    ids.map(async (id) => {
      const [platformPct, agencyCreatorPct] = await Promise.all([getCutPctForClone(id), getAgencyCreatorCutPct(id)]);
      return [id, { platformPct, agencyCreatorPct }] as const;
    }),
  );
  return new Map(entries);
}

function net(gross: number, cuts: CloneCuts | undefined, mode: ViewerMode): number {
  // Fail closed. resolveCloneCuts gives every id it is asked about an entry (no
  // platform_cuts row = a real 0%), so a missing entry means the caller never
  // looked this clone up. Passing gross through as net would leak the cut.
  if (!cuts) throw new Error("No cut resolved for a clone in this payload");
  return mode === "creator" ? applyStackedCut(gross, cuts.platformPct, cuts.agencyCreatorPct) : applyCut(gross, cuts.platformPct);
}

/**
 * Scale a gross DashboardData payload for an agency or creator viewer.
 * Every per-clone money figure (perClone[].stars/grossPaymentStars, the
 * per-clone chart series, clones[].stars, recent[].stars) is scaled by ITS
 * OWN clone's cut(s), then the fleet totals are recomputed as the sum of the
 * already-scaled per-clone figures — never the other way around. Counts
 * (sales, fans, messages, buyers, reachable24h, newFans, activeUsers,
 * totalFans) and the AI cost/error fields are left untouched: this cut is
 * off gross earnings, not off usage.
 */
export function scaleDashboardData(data: DashboardData, cuts: Map<string, CloneCuts>, mode: ViewerMode): DashboardData {
  const perClone: Record<string, CloneStats> = {};
  let totalStars = 0;
  let totalGrossPaymentStars = 0;
  for (const [cloneId, stats] of Object.entries(data.perClone)) {
    const c = cuts.get(cloneId);
    const stars = net(stats.stars, c, mode);
    const grossPaymentStars = net(stats.grossPaymentStars, c, mode);
    perClone[cloneId] = { ...stats, stars, grossPaymentStars };
    totalStars += stars;
    totalGrossPaymentStars += grossPaymentStars;
  }

  const clones: CloneSummary[] = data.clones.map((c) => ({ ...c, stars: net(c.stars, cuts.get(c.id), mode) }));

  const series = data.series.map((row) => {
    const out: Record<string, number | string> = { bucket: row.bucket };
    for (const [key, value] of Object.entries(row)) {
      if (key === "bucket") continue;
      out[key] = typeof value === "number" ? net(value, cuts.get(key), mode) : value;
    }
    return out;
  });

  const recent: RecentTransaction[] = data.recent.map((t) => ({ ...t, stars: net(t.stars, cuts.get(t.cloneId), mode) }));

  return {
    ...data,
    clones,
    series,
    recent,
    perClone,
    totals: { ...data.totals, stars: totalStars, grossPaymentStars: totalGrossPaymentStars },
  };
}

/**
 * Scale a gross AnalyticsData payload for an agency or creator viewer.
 *
 * EXACT when the payload is scoped to a single clone (the ordinary case: a
 * creator's own view, or an agency drilled into one creator) — every money
 * field in the payload belongs to that one clone, so it is scaled by that
 * clone's own cut(s).
 *
 * APPROXIMATE when the payload mixes more than one clone (an agency's "all
 * creators" view). `totals.revenueStars` and `clones[].revenueStars` ARE
 * scaled per clone before summing, same as the dashboard payload above. The
 * remaining breakdowns (byKind/byFeature/byDay/byHour/byDow/byTier,
 * whaleFans, topWeeklySpenders, funnel, paywallFunnel, buyerConversion)
 * are NOT broken down per clone by the data layer — getAnalytics() rolls
 * them up in one pass across whichever clones are in scope. Those are
 * scaled by a single BLENDED ratio (net revenue / gross revenue across the
 * clones actually in `clones[]`), which is exact when every clone in scope
 * shares one cut and an honest approximation otherwise. This is a known,
 * documented limitation, not a silent gross leak: every scaled figure here
 * is still <= its gross counterpart.
 */
export function scaleAnalyticsData(data: AnalyticsData, cuts: Map<string, CloneCuts>, mode: ViewerMode): AnalyticsData {
  let grossRevenue = 0;
  let netRevenue = 0;
  const clones = data.clones.map((c) => {
    const scaled = net(c.revenueStars, cuts.get(c.id), mode);
    grossRevenue += c.revenueStars;
    netRevenue += scaled;
    return { ...c, revenueStars: scaled };
  });
  // Zero gross (a window without sales) must still scale: byTier is lifetime,
  // so a ratio of 1 here would show it gross in one window and net in another,
  // and the two divide out the exact cut. Use the clones' own multiplier, the
  // lowest one when several are in scope (clones[] empty: the resolved cuts).
  const ids = data.clones.length ? data.clones.map((c) => c.id) : [...cuts.keys()];
  const blendRatio = grossRevenue > 0 ? netRevenue / grossRevenue : ids.length ? Math.min(...ids.map((id) => net(1, cuts.get(id), mode))) : 0;
  const scaleStars = (v: number) => v * blendRatio;

  return {
    ...data,
    totals: { ...data.totals, revenueStars: netRevenue },
    clones,
    byKind: data.byKind.map((r) => ({ ...r, stars: scaleStars(r.stars) })),
    byFeature: data.byFeature.map((r) => ({ ...r, stars: scaleStars(r.stars), avgStars: scaleStars(r.avgStars) })),
    byDay: data.byDay.map((r) => ({ ...r, stars: scaleStars(r.stars) })),
    byHour: data.byHour.map((r) => ({ ...r, stars: scaleStars(r.stars) })),
    byDow: data.byDow.map((r) => ({ ...r, stars: scaleStars(r.stars) })),
    byTier: data.byTier.map((r) => ({ ...r, stars: scaleStars(r.stars) })),
    byFlow: data.byFlow.map((r) => ({ ...r, stars: scaleStars(r.stars) })),
    whaleFans: data.whaleFans.map((f) => ({ ...f, stars: scaleStars(f.stars) })),
    topWeeklySpenders: data.topWeeklySpenders.map((f) => ({ ...f, stars: scaleStars(f.stars) })),
    weeklySpenderSummary: {
      ...data.weeklySpenderSummary,
      stars: scaleStars(data.weeklySpenderSummary.stars),
      avgStars: scaleStars(data.weeklySpenderSummary.avgStars),
    },
    funnel: {
      ...data.funnel,
      avgStarsPerBuyer: scaleStars(data.funnel.avgStarsPerBuyer),
      medianStarsPerBuyer: scaleStars(data.funnel.medianStarsPerBuyer),
    },
    paywallFunnel: {
      ...data.paywallFunnel,
      paidMessageStars: scaleStars(data.paywallFunnel.paidMessageStars),
    },
    buyerConversion: {
      ...data.buyerConversion,
      purchaseMix: data.buyerConversion.purchaseMix.map((r) => ({ ...r, stars: scaleStars(r.stars) })),
    },
  };
}

// ── cost/profit/margin redaction for non-admin responses ───────────────────
//
// costUsd/profitUsd/margin are OUR cost and margin, not the creator's or the
// agency's. scaleDashboardData/scaleAnalyticsData above scale revenue-shaped
// fields only and leave cost/profit/margin untouched (see their doc comments)
// — which means, unscaled, they still carry the GROSS figures. Since gross
// revenue = profit + cost, exposing both alongside the cut-applied (net)
// revenue lets the viewer recover the gross figure and back out the exact
// cut percentage, defeating the whole point of the split. So these fields
// must never reach a non-admin response at all, scaled or not.
//
// Applied as a generic deep redaction, not a per-field allowlist, so any
// present or future per-clone/per-day/per-flow copy of these keys is caught
// structurally rather than requiring every call site to remember to omit it.
const COST_FIELD_NAMES = new Set(["costUsd", "profitUsd", "margin"]);

export function redactCostFields<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => redactCostFields(v)) as unknown as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (COST_FIELD_NAMES.has(key)) continue;
      out[key] = redactCostFields(v);
    }
    return out as T;
  }
  return value;
}
