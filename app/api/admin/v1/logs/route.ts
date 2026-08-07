import { withAdmin, jsonError, okOrError } from "@/lib/api-route";
import { resolveClone, runQuery, clampLimit, type FilterOp } from "@/lib/api-read";

export const dynamic = "force-dynamic";

const LEVELS = ["info", "warn", "error"];

// system_logs — the bot's own structured log stream (services/syslog.ts), the
// same rows the dashboard Logs page renders.
//
// THIS IS NOT THE AWS/CONTAINER LOG. Docker stdout and CloudWatch are a
// separate surface that this API does not reach, and reaching them is blocked
// on infra work that is already open (no CloudWatch role on the dash box, root
// AWS account). A caller debugging a crash will find nothing here and should
// know why rather than concluding the box is quiet.
//
// RETENTION: 30 days, enforced by pg_cron (migration 101). Anything older is
// gone from this endpoint because it is gone from the table.
export const GET = withAdmin(async (req) => {
  const params = new URL(req.url).searchParams;
  const filters: { column: string; op: FilterOp; value: string }[] = [];

  const cloneKey = params.get("clone");
  if (cloneKey) {
    const clone = await resolveClone(cloneKey);
    if (!clone) return jsonError(`no clone matching "${cloneKey}"`, 404);
    filters.push({ column: "clone_id", op: "eq", value: clone.id });
  }

  const level = params.get("level");
  if (level) {
    if (!LEVELS.includes(level)) return jsonError(`level must be one of ${LEVELS.join(", ")}`, 400);
    filters.push({ column: "level", op: "eq", value: level });
  }

  // `source` is free text set by the caller of logSystem (llm, payments,
  // openrouter, admin-api, …) — matched loosely, since nothing constrains it.
  const source = params.get("source");
  if (source) filters.push({ column: "source", op: "ilike", value: `%${source}%` });

  const since = params.get("since");
  if (since) {
    if (Number.isNaN(Date.parse(since))) return jsonError("since must be an ISO timestamp", 400);
    filters.push({ column: "ts", op: "gte", value: since });
  }

  return okOrError(
    await runQuery({
      table: "system_logs",
      filters,
      orderBy: "ts",
      ascending: false,
      limit: clampLimit(params.get("limit")),
    }),
  );
});
