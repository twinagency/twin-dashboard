import { withAdmin, ok, jsonError, fromQueryError } from "@/lib/api-route";
import { resolveClone, runQuery, isQueryError, clampLimit } from "@/lib/api-read";

export const dynamic = "force-dynamic";

// Verbatim fan transcripts. This is the single most sensitive payload on the
// API and the reason the whole thing is Tailscale-gated.
//
// Ordering is newest-first with a `before` cursor rather than an offset,
// because chat_history is the largest table on the stack and offset paging over
// it re-scans everything already read. idx_chat_history_lookup is on
// (clone_id, telegram_id, created_at), which is exactly this access pattern.
export const GET = withAdmin(async (req) => {
  const params = new URL(req.url).searchParams;
  const cloneKey = params.get("clone");
  if (!cloneKey) return jsonError("clone is required (uuid, slug, or name)", 400);

  const clone = await resolveClone(cloneKey);
  if (!clone) return jsonError(`no clone matching "${cloneKey}"`, 404);

  const filters: { column: string; op: "eq" | "lt"; value: string }[] = [
    { column: "clone_id", op: "eq", value: clone.id },
  ];

  // `fan` is a Telegram id. Omitting it returns the clone's whole recent
  // stream interleaved across fans, which is useful for "what is she saying
  // right now" and useless for reconstructing one conversation — so say so
  // rather than letting a caller mistake one for the other.
  const fan = params.get("fan");
  if (fan) {
    if (!/^\d+$/.test(fan)) return jsonError("fan must be a numeric telegram_id", 400);
    filters.push({ column: "telegram_id", op: "eq", value: fan });
  }

  // Cursor: return messages strictly older than this ISO timestamp.
  const before = params.get("before");
  if (before) {
    if (Number.isNaN(Date.parse(before))) return jsonError("before must be an ISO timestamp", 400);
    filters.push({ column: "created_at", op: "lt", value: before });
  }

  const limit = clampLimit(params.get("limit"));
  const result = await runQuery({
    table: "chat_history",
    filters,
    orderBy: "created_at",
    ascending: false,
    limit,
  });
  if (isQueryError(result)) return fromQueryError(result);

  const rows = result.rows as { created_at?: string }[];
  const oldest = rows.length ? rows[rows.length - 1].created_at ?? null : null;

  return ok({
    clone: { id: clone.id, slug: clone.slug, name: clone.name },
    fan: fan ? Number(fan) : null,
    scope: fan ? "one fan's conversation" : "all fans for this clone, interleaved",
    order: "newest first",
    messages: rows,
    rowCount: result.rowCount,
    limitApplied: result.limitApplied,
    truncated: result.truncated,
    // Feed this back as ?before= to page further into the past. Null means the
    // page came back empty, not that the history ended.
    nextBefore: result.truncated ? oldest : null,
  });
});
