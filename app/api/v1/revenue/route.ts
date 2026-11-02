import { withModelKey, publicOk, publicError } from "@/lib/api-public-route";
import { publicRevenue, publicFleetRevenue } from "@/lib/api-public";
import { parseRevenueWindow, isQueryError } from "@/lib/api-read";
import type { Period } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

// Revenue for the scope the KEY carries. Two shapes, one endpoint:
//
//   clone key -> revenue for that one model.
//   fleet key -> the same shape plus `models[]`, every clone, ranked by
//                revenue. Added 2026-08-24 (migration 127) so one key can draw
//                every girl's earnings on one page.
//
// The caller does not choose. There is no ?clone= and no ?scope= — the shape of
// the response follows the key row, which is the only thing that cannot be
// forged from the outside. `scope` is echoed in the fleet body so a client can
// branch on it without having to infer from a field's presence.
//
// OUR COST AND MARGIN ARE NOT IN EITHER RESPONSE. getAnalytics returns costUsd,
// profitUsd and a per-clone margin breakdown; none of it reaches here. Both
// projections in lib/api-public.ts name every field that goes out, which is why
// widening the key from one clone to ten did not widen it from revenue to
// profit. Both paths also run getAnalytics with includeCost:false, so the cost
// rollup those fields would come from is never even executed.
export const GET = withModelKey(async ({ tenant, params }) => {
  const window = parseRevenueWindow(params);
  if (isQueryError(window)) return publicError(window.error, window.status);
  const period = window.period as Period;

  if (tenant.scope === "fleet") {
    return publicOk({ revenue: await publicFleetRevenue(period, window.range) });
  }

  // tenant.cloneId is non-null for scope "clone" — resolveKey() refuses any row
  // where that is not true rather than handing back a half-valid tenant.
  const data = await publicRevenue(tenant.cloneId as string, period, window.range);
  return publicOk({ revenue: data });
});
