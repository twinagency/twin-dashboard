import { withAdmin, ok, fromQueryError } from "@/lib/api-route";
import { parseRevenueWindow, isQueryError } from "@/lib/api-read";
import { simRevenue, seedFrom } from "@/lib/api-sim";
import type { Period } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

// Synthetic revenue in EXACTLY the shape of GET /api/v1/revenue, so a dashboard
// can be built against this and repointed at the real endpoint by changing the
// URL and nothing else.
//
// READS NOTHING, WRITES NOTHING. No fake row ever enters the live tables, so no
// revenue number is ever polluted and no future query has to remember to
// exclude test data. That is the entire point; see lib/api-sim.ts.
//
// ?seed= makes it deterministic: the same seed is the same model every time, so
// a screenshot and a bug report refer to the same numbers.
export const GET = withAdmin(async (req) => {
  const params = new URL(req.url).searchParams;
  const window = parseRevenueWindow(params);
  if (isQueryError(window)) return fromQueryError(window);

  const seed = seedFrom(params.get("seed"));
  const revenue = simRevenue(seed, window.period as Period, Date.now(), window.range);

  return ok({
    simulated: true,
    seed,
    warning: "SYNTHETIC DATA. Generated on request, stored nowhere, read from nowhere. Never treat these numbers as real.",
    shapeOf: "GET /api/v1/revenue",
    revenue,
  });
});
