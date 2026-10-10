import { withModelKey, publicOk } from "@/lib/api-public-route";
import { publicStats, publicFleetStats } from "@/lib/api-public-v2";

export const dynamic = "force-dynamic";

// One call that answers "how are we doing right now": revenue and buyers over
// the last hour, day, week and month, fan counts (total, active, new, buyers),
// the day's sales by feature and by hour, and (fleet key) a row per model.
//
// SCOPED BY THE KEY. The snapshot is rebuilt at most every 15 seconds per
// scope; polling faster returns the same numbers with the same `generatedAt`,
// which is what keeps a refresh loop from taking the operator dashboard down.
//
// Revenue is net of the cuts this key's role is entitled to, deduplicated, and
// agrees with /api/v1/revenue and /api/v1/payments. Our AI cost and margin are
// not computed here at all.
export const GET = withModelKey(async ({ tenant }) => {
  const fleet = tenant.scope === "fleet";
  const stats = fleet ? await publicFleetStats() : await publicStats(tenant.cloneId as string);
  return publicOk({ stats, scope: tenant.scope });
});
