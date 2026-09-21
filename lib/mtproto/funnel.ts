// lib/mtproto/funnel.ts
//
// Composes episodes.ts (state-derived funnel steps) with attribution.ts
// (purchase-derived bought/stars) into the one FunnelCounts the Overview /
// run detail pages render (N2.1: "eligible -> holdout | contacted ->
// acknowledged -> replied -> bought -> Stars"). Bought/stars here are the N3
// attribution (replied AND bought within the window) at the widest window
// (7d), so bought <= replied always holds; the Lift panel shows 24h/72h/7d
// side by side for anyone who needs the narrower cut.

import { computeLift } from "./attribution";
import { funnelFromEpisodes } from "./episodes";
import { ATTRIBUTION_WINDOWS_HOURS, type FunnelCounts, type LiftReport, type ReengageEpisode } from "./types";

/** Pass an already-computed `lift` to avoid a second star_transactions read. */
export async function computeFunnel(episodes: ReengageEpisode[], lift?: LiftReport[]): Promise<FunnelCounts> {
  const base = funnelFromEpisodes(episodes);
  const reports = lift ?? (await computeLift(episodes));
  const widest = reports.find((l) => l.windowHours === ATTRIBUTION_WINDOWS_HOURS[ATTRIBUTION_WINDOWS_HOURS.length - 1]);
  return {
    ...base,
    bought: widest?.contacted.attributedBuyers ?? 0,
    stars: widest?.contacted.attributedStars ?? 0,
    partial: reports.some((r) => r.partial) || undefined,
  };
}
