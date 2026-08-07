import { withAdmin, ok } from "@/lib/api-route";
import { simFans, seedFrom } from "@/lib/api-sim";
import { clampFanLimit, PUBLIC_FAN_COLUMNS } from "@/lib/api-public";

export const dynamic = "force-dynamic";

// Synthetic fans in EXACTLY the shape of GET /api/v1/fans. Reads nothing,
// writes nothing.
//
// Every generated fan is visibly fake — names end in "(sim)", usernames are
// sim_fan_N — because a payload that could be mistaken for real people is the
// one thing worse than no fixture at all.
export const GET = withAdmin(async (req) => {
  const params = new URL(req.url).searchParams;
  const seed = seedFrom(params.get("seed"));
  const limit = clampFanLimit(params.get("limit"));
  const result = simFans(seed, limit, Date.now());

  return ok({
    simulated: true,
    seed,
    warning: "SYNTHETIC DATA. Generated on request, stored nowhere, read from nowhere. Never treat these fans as real people.",
    shapeOf: "GET /api/v1/fans",
    fans: result.fans,
    rowCount: result.rowCount,
    limitApplied: result.limitApplied,
    truncated: result.truncated,
    fields: PUBLIC_FAN_COLUMNS,
    order: "highest lifetime spend first",
  });
});
