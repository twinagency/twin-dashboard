import { withModelKey, publicOk } from "@/lib/api-public-route";
import { publicFans, clampFanLimit, PUBLIC_FAN_COLUMNS } from "@/lib/api-public";

export const dynamic = "force-dynamic";

// This model's fans, ranked by lifetime Star spend.
//
// SCOPED BY THE KEY. publicFans() filters on the clone_id it is handed and that
// value comes from the key row, never from the query string — withModelKey
// rejects a ?clone= outright rather than ignoring it.
//
// NO MESSAGE CONTENT. Chat transcripts are not on this API at any limit or
// parameter; they exist only on the internal admin API.
export const GET = withModelKey(async ({ tenant, params }) => {
  const limit = clampFanLimit(params.get("limit"));
  const result = await publicFans(tenant.cloneId, limit);

  return publicOk({
    fans: result.fans,
    rowCount: result.rowCount,
    limitApplied: result.limitApplied,
    truncated: result.truncated,
    fields: PUBLIC_FAN_COLUMNS,
    order: "highest lifetime spend first",
  });
});
