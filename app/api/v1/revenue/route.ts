import { withModelKey, publicOk, publicError } from "@/lib/api-public-route";
import { publicRevenue } from "@/lib/api-public";
import { parseRevenueWindow, isQueryError } from "@/lib/api-read";
import type { Period } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

// Revenue for ONE model — the key's model. Computed by the same getAnalytics()
// the operator Revenue page uses, then put through projectRevenue(), which
// names every field that goes out.
//
// OUR COST AND MARGIN ARE NOT IN THE RESPONSE. getAnalytics returns costUsd,
// profitUsd and a fleet-wide per-clone breakdown; none of it reaches here. See
// lib/api-public.ts for why that is a projection rather than a deletion.
export const GET = withModelKey(async ({ tenant, params }) => {
  const window = parseRevenueWindow(params);
  if (isQueryError(window)) return publicError(window.error, window.status);

  const data = await publicRevenue(tenant.cloneId, window.period as Period, window.range);
  return publicOk({ revenue: data });
});
