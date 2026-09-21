import { withAdmin, ok, jsonError } from "@/lib/api-route";
import { computeAudiencePreview } from "@/lib/mtproto/audience";
import { DEFAULT_DAILY_CAP, DEFAULT_HOLDOUT_PCT, RUN_SEGMENTS, type RunFilters, type RunSegment } from "@/lib/mtproto/types";

export const dynamic = "force-dynamic";

// Read-only audience preview (test gate: "preview never writes"). GET, not
// POST, precisely so it never needs a WRITE_ROUTES entry in
// scripts/check-admin-api.ts's B5 check — this route cannot write by
// construction, not just by convention.
export const GET = withAdmin(async (req) => {
  const params = new URL(req.url).searchParams;
  const cloneIds = params.getAll("clone");
  if (cloneIds.length === 0) return jsonError("at least one ?clone= is required", 400);

  const segmentRaw = params.get("segment");
  if (segmentRaw && !(RUN_SEGMENTS as readonly string[]).includes(segmentRaw)) {
    return jsonError(`segment must be one of ${RUN_SEGMENTS.join(", ")}`, 400);
  }

  const filters: RunFilters = {
    cloneIds,
    segment: (segmentRaw as RunSegment) ?? "all_silent",
    minSpendStars: params.get("minSpendStars") ? Number(params.get("minSpendStars")) : undefined,
    lastActiveFromDays: params.get("lastActiveFromDays") ? Number(params.get("lastActiveFromDays")) : undefined,
    lastActiveToDays: params.get("lastActiveToDays") ? Number(params.get("lastActiveToDays")) : undefined,
    language: params.get("language") ?? undefined,
  };
  const dailyCap = params.get("dailyCap") ? Number(params.get("dailyCap")) : DEFAULT_DAILY_CAP;
  const runCap = params.get("runCap") ? Number(params.get("runCap")) : null;
  const holdoutPct = params.get("holdoutPct") ? Number(params.get("holdoutPct")) : DEFAULT_HOLDOUT_PCT;

  const preview = await computeAudiencePreview(filters, { dailyCap, runCap, holdoutPct });
  return ok({ preview });
});
