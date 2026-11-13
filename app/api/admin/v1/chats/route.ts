import { withAdmin, ok, jsonError, fromQueryError } from "@/lib/api-route";
import { resolveClone, runQuery, isQueryError, clampLimit } from "@/lib/api-read";

export const dynamic = "force-dynamic";

type Msg = { id?: unknown; created_at?: unknown };
const ISO_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/;

// created_at is kept verbatim: Date would drop Postgres's microseconds and the
// eq read on the boundary timestamp would then match nothing.
function encodeCursor(m: Msg): string {
  return Buffer.from(JSON.stringify({ t: m.created_at, i: String(m.id) })).toString("base64url");
}
function decodeCursor(raw: string): { t: string; i: string } | null {
  try {
    const { t, i } = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Record<string, unknown>;
    return typeof t === "string" && ISO_RE.test(t) && typeof i === "string" && /^\d{1,19}$/.test(i) ? { t, i } : null;
  } catch {
    return null;
  }
}

// Verbatim fan transcripts. This is the single most sensitive payload on the
// API and the reason the whole thing is Tailscale-gated.
//
// Ordering is newest-first with a keyset cursor rather than an offset,
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

  // Caller bound: messages strictly older than this ISO timestamp. Narrows only.
  const before = params.get("before");
  if (before) {
    if (Number.isNaN(Date.parse(before))) return jsonError("before must be an ISO timestamp", 400);
    filters.push({ column: "created_at", op: "lt", value: before });
  }

  // Keyset cursor on (created_at, id), minted below as nextCursor. Paging on
  // created_at alone skipped every row sharing the boundary timestamp. Only the
  // shape is checked, not provenance: a hand-built cursor narrows the read like
  // ?before= does and cannot widen it past clone/fan.
  const rawCursor = params.get("cursor");
  const cursor = rawCursor ? decodeCursor(rawCursor) : null;
  if (rawCursor && !cursor) return jsonError("cursor must be a nextCursor from a previous page", 400);

  const limit = clampLimit(params.get("limit"));
  const spec = { table: "chat_history", orderBy: "created_at", tieBreak: "id", ascending: false };
  // With a cursor: first the rest of the boundary timestamp (lower ids), then
  // everything strictly older. Two plain eq/lt reads, no hand-built or= string.
  let rows: Msg[] = [];
  if (cursor) {
    const tie = await runQuery({ ...spec, limit, filters: [...filters, { column: "created_at", op: "eq", value: cursor.t }, { column: "id", op: "lt", value: cursor.i }] });
    if (isQueryError(tie)) return fromQueryError(tie);
    rows = tie.rows as Msg[];
  }
  if (rows.length < limit) {
    const older = await runQuery({ ...spec, limit: limit - rows.length, filters: cursor ? [...filters, { column: "created_at", op: "lt", value: cursor.t }] : filters });
    if (isQueryError(older)) return fromQueryError(older);
    rows = [...rows, ...(older.rows as Msg[])];
  }
  const truncated = rows.length === limit;
  const last = rows[rows.length - 1];

  return ok({
    clone: { id: clone.id, slug: clone.slug, name: clone.name },
    fan: fan ? Number(fan) : null,
    scope: fan ? "one fan's conversation" : "all fans for this clone, interleaved",
    order: "newest first",
    messages: rows,
    rowCount: rows.length,
    limitApplied: limit,
    truncated,
    // Feed this back as ?cursor= to page further into the past. Null means
    // this page was not full, so the history ended.
    nextCursor: truncated && last ? encodeCursor(last) : null,
    // Deprecated: kept so pagers written against ?before= keep working. It is
    // the boundary created_at, so paging on it skips rows sharing that
    // timestamp. Use nextCursor.
    nextBefore: truncated && last && typeof last.created_at === "string" ? last.created_at : null,
  });
});
