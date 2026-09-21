// lib/mtproto/funnel.ts
//
// Composes episodes.ts (state-derived funnel steps) with attribution.ts
// (purchase-derived bought/stars) into the one FunnelCounts the Overview /
// run detail pages render (N2.1: "eligible -> holdout | contacted ->
// delivered -> replied -> bought -> Stars"). Bought/stars here use the
// widest window (7d) — the Lift panel shows 24h/72h/7d side by side
// separately (N3) for anyone who needs the narrower cut.

import { computeLift } from "./attribution";
import { funnelFromEpisodes } from "./episodes";
import { ATTRIBUTION_WINDOWS_HOURS, type FunnelCounts, type ReengageEpisode } from "./types";

export async function computeFunnel(episodes: ReengageEpisode[]): Promise<FunnelCounts> {
  const base = funnelFromEpisodes(episodes);
  const lift = await computeLift(episodes);
  const widest = lift.find((l) => l.windowHours === ATTRIBUTION_WINDOWS_HOURS[ATTRIBUTION_WINDOWS_HOURS.length - 1]);
  return {
    ...base,
    bought: widest?.contacted.buyers ?? 0,
    stars: widest?.contacted.stars ?? 0,
  };
}
