import { withModelKey, publicOk } from "@/lib/api-public-route";
import {
  publicFans,
  publicFleetFans,
  clampFanLimit,
  PUBLIC_FAN_COLUMNS,
  PUBLIC_FLEET_FAN_COLUMNS,
} from "@/lib/api-public";

export const dynamic = "force-dynamic";

// Fans ranked by lifetime Star spend.
//
// SCOPED BY THE KEY. A clone key gets that clone's fans; a fleet key (migration
// 127) gets the fleet's, with `clone_id` on each row so they can be grouped by
// girl. Neither value comes from the query string — withModelKey rejects a
// ?clone= outright rather than ignoring it.
//
// `fields` is returned alongside the rows and differs between the two scopes.
// It is not decoration: it is how a client knows whether clone_id is there
// without probing a row that might happen to be missing it.
//
// NO MESSAGE CONTENT, at either scope. Chat transcripts are not on this API at
// any limit or parameter; they exist only on the internal admin API.
export const GET = withModelKey(async ({ tenant, params }) => {
  const limit = clampFanLimit(params.get("limit"));
  const fleet = tenant.scope === "fleet";

  // tenant.cloneId is non-null whenever scope is "clone" — resolveKey() refuses
  // any row where that is not true rather than handing back a half-valid tenant.
  const result = fleet ? await publicFleetFans(limit) : await publicFans(tenant.cloneId as string, limit);

  return publicOk({
    fans: result.fans,
    rowCount: result.rowCount,
    limitApplied: result.limitApplied,
    truncated: result.truncated,
    fields: fleet ? PUBLIC_FLEET_FAN_COLUMNS : PUBLIC_FAN_COLUMNS,
    scope: tenant.scope,
    order: "highest lifetime spend first",
  });
});
