// ── The read surface behind the Twin Admin API ───────────────────────────────
//
// This DELIBERATELY REUSES the AI assistant's allowlist rather than defining a
// second one. dashboard/CLAUDE.md rule 3 is explicit that reads go through an
// explicit table+column allowlist against the Supabase query builder, never raw
// SQL, and says to follow that exact pattern for any future data feature. Two
// allowlists would drift, and the one that drifts is the one that leaks.
//
// The admin API adds columns the assistant excludes, and it is worth being
// precise about WHY each was excluded, because only one of the two reasons is
// a security reason:
//   - persona / *_prompt / intake  were excluded for CONTEXT-WINDOW COST, not
//     secrecy (see the comment on ALLOWLIST). Sim testing and prompt tooling
//     genuinely need them, so they are re-admitted here.
//   - bot_token and app_settings.value are CREDENTIALS. They stay excluded
//     here, forever, and check-admin-api.ts asserts they are unreachable.

import { supabaseAdmin } from "./supabase";
import { ALLOWLIST } from "@/app/api/ai-assistant/tools";

// Re-admitted for admin callers only. `persona` is the live compiled slot data
// the runtime actually uses. The four *_prompt columns are FROZEN LEGACY and
// no longer read by the bot (bot/db/schema.sql:58) — they are exposed because
// they are history, and flagged in the payload so nobody builds a simulator
// against dead columns believing they drive the live prompt.
// `business_username` is the @handle a fan actually messages (migration 094).
// It is not a credential and the dashboard already shows it read-only.
export const ADMIN_EXTRA: Record<string, string[]> = {
  clones: [
    "persona",
    "intake",
    "text_prompt",
    "voice_prompt",
    "photo_reply_prompt",
    "routing_prompt",
    "business_username",
    // Typed shared creator facts consumed by the OF projection through this
    // existing authenticated allowlisted reader. No prompt/compiler or key.
    "date_of_birth", "cover_story", "relationship_canon", "tattoos",
    "tattoo_details", "turn_ons", "hard_limits", "hard_limits_extra",
  ],
};

// Never reachable through this API by any route, parameter or filter.
// clones.bot_token is a live Telegram credential; app_settings.value holds the
// raw OpenRouter / ElevenLabs / Deepgram keys with no safe per-row split.
export const FORBIDDEN_COLUMNS: Record<string, string[]> = {
  clones: ["bot_token"],
  app_settings: ["value"],
};

export const LEGACY_PROMPT_COLUMNS = [
  "text_prompt",
  "voice_prompt",
  "photo_reply_prompt",
  "routing_prompt",
] as const;

// Higher than the assistant's 200 because a full fan transcript is the whole
// point of this API, and lower than unbounded because one clone's chat_history
// is the largest table on the stack and this runs on a micro Supabase compute.
export const MAX_LIMIT = 1000;
export const DEFAULT_LIMIT = 100;

const FILTER_OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "ilike"] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

export type QuerySpec = {
  table: string;
  select?: string[];
  filters?: { column: string; op: FilterOp; value: string }[];
  orderBy?: string;
  ascending?: boolean;
  limit?: number;
};

export type QueryError = { error: string; status: 400 | 500 };

export function adminTables(): string[] {
  return Object.keys(ALLOWLIST).sort();
}

// The single definition of "what may this API read". Every path that touches
// Supabase goes through this, so there is one place to audit and one place a
// mistake could live. Forbidden columns are subtracted LAST and unconditionally,
// so re-admitting a column above can never accidentally re-admit a credential.
export function adminColumns(table: string): string[] | null {
  const base = ALLOWLIST[table];
  if (!base) return null;
  const forbidden = FORBIDDEN_COLUMNS[table] ?? [];
  const merged = [...base, ...(ADMIN_EXTRA[table] ?? [])];
  return merged.filter((c, i) => merged.indexOf(c) === i && !forbidden.includes(c));
}

export function clampLimit(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(v));
}

// Parses `?table=&select=a,b&order=col&asc=1&limit=50&filter=col:op:value` with
// `filter` repeatable. Values are passed to the query BUILDER, never to SQL
// text, so there is no injection surface — supabase-js parameterizes and the
// column/op are allowlist-checked before they get near it.
export function parseQuery(params: URLSearchParams, tableOverride?: string): QuerySpec | QueryError {
  const table = tableOverride ?? (params.get("table") || "");
  const allowed = adminColumns(table);
  if (!allowed) {
    return { error: `table not allowed: "${table}". Allowed: ${adminTables().join(", ")}`, status: 400 };
  }

  const rawSelect = params.get("select");
  let select: string[] | undefined;
  if (rawSelect && rawSelect !== "*") {
    const requested = rawSelect.split(",").map((s) => s.trim()).filter(Boolean);
    const invalid = requested.filter((c) => !allowed.includes(c));
    if (invalid.length) {
      return { error: `column(s) not allowed for "${table}": ${invalid.join(", ")}`, status: 400 };
    }
    select = requested;
  }

  const filters: { column: string; op: FilterOp; value: string }[] = [];
  for (const raw of params.getAll("filter")) {
    // column:op:value — value may itself contain ':' (timestamps do), so split
    // only on the first two separators.
    const first = raw.indexOf(":");
    const second = raw.indexOf(":", first + 1);
    if (first < 1 || second < 0) {
      return { error: `filter must be "column:op:value", got "${raw}"`, status: 400 };
    }
    const column = raw.slice(0, first);
    const op = raw.slice(first + 1, second);
    const value = raw.slice(second + 1);
    if (!allowed.includes(column)) {
      return { error: `filter column not allowed for "${table}": ${column}`, status: 400 };
    }
    if (!(FILTER_OPS as readonly string[]).includes(op)) {
      return { error: `filter op not allowed: ${op}. Allowed: ${FILTER_OPS.join(", ")}`, status: 400 };
    }
    filters.push({ column, op: op as FilterOp, value });
  }

  const orderBy = params.get("order") || undefined;
  if (orderBy && !allowed.includes(orderBy)) {
    return { error: `order column not allowed for "${table}": ${orderBy}`, status: 400 };
  }

  const asc = params.get("asc");
  return {
    table,
    select,
    filters,
    orderBy,
    ascending: asc === "1" || asc === "true",
    limit: clampLimit(params.get("limit")),
  };
}

export type QueryResult = {
  table: string;
  columns: string[];
  rows: unknown[];
  rowCount: number;
  limitApplied: number;
  truncated: boolean;
  notes?: string[];
};

export async function runQuery(spec: QuerySpec): Promise<QueryResult | QueryError> {
  const allowed = adminColumns(spec.table);
  if (!allowed) return { error: `table not allowed: "${spec.table}"`, status: 400 };

  // Re-validate here even though parseQuery already did. runQuery is exported
  // and a future caller may build a spec by hand; the check that matters is the
  // one next to the database call, not the one next to the URL parser.
  const columns = spec.select?.length ? spec.select.filter((c) => allowed.includes(c)) : allowed;
  if (spec.select?.length && columns.length !== spec.select.length) {
    return { error: `column(s) not allowed for "${spec.table}"`, status: 400 };
  }

  const limit = clampLimit(spec.limit);
  let q = supabaseAdmin.from(spec.table).select(columns.join(","));
  for (const f of spec.filters ?? []) {
    if (!allowed.includes(f.column)) return { error: `filter column not allowed: ${f.column}`, status: 400 };
    q = (q as unknown as Record<string, (c: string, v: string) => typeof q>)[f.op](f.column, f.value);
  }
  if (spec.orderBy) q = q.order(spec.orderBy, { ascending: spec.ascending === true });
  q = q.limit(limit);

  const { data, error } = await q;
  if (error) return { error: error.message, status: 500 };

  const rows = (data ?? []) as unknown[];
  const notes: string[] = [];
  if (spec.table === "clones" && columns.some((c) => (LEGACY_PROMPT_COLUMNS as readonly string[]).includes(c))) {
    notes.push(
      "text_prompt/voice_prompt/photo_reply_prompt/routing_prompt are FROZEN LEGACY columns and are not read by the bot. The live prompt is assembled by the bot from `persona` plus prompt_templates.",
    );
  }
  return {
    table: spec.table,
    columns,
    rows,
    rowCount: rows.length,
    limitApplied: limit,
    // The caller cannot otherwise tell a 100-row table from a 100-row page.
    // Silent truncation reading as "that's all of it" is how a sim run ends up
    // trained on a third of a conversation.
    truncated: rows.length === limit,
    ...(notes.length ? { notes } : {}),
  };
}

// Clone lookup by UUID, slug, or name — same three-step shape as the assistant's
// resolveCloneIdLoose, so "cat-chase" works everywhere it works in the UI.
// Write routes resolve their target here, so the name step is an EXACT
// case-insensitive match: LIKE wildcards are escaped, `*` (PostgREST's alias
// for `%`, no escape exists) never matches by name, and two hits is no hit.
// A read error throws (withAdmin answers 500): null means "no such clone" and
// an outage must not read as a 404. The id step only runs on uuid-shaped input
// because clones.id is uuid and any other string errors (22P02).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type CloneRef = { id: string; slug: string; name: string };
function cloneLookupFailed(error: { message: string }): Error {
  return new Error(`clone lookup failed: ${error.message}`);
}
export async function resolveClone(idOrSlug: string): Promise<CloneRef | null> {
  const cols = "id,slug,name";
  if (UUID.test(idOrSlug)) {
    const byId = await supabaseAdmin.from("clones").select(cols).eq("id", idOrSlug).maybeSingle();
    if (byId.error) throw cloneLookupFailed(byId.error);
    if (byId.data) return byId.data as CloneRef;
  }
  const bySlug = await supabaseAdmin.from("clones").select(cols).eq("slug", idOrSlug).maybeSingle();
  if (bySlug.error) throw cloneLookupFailed(bySlug.error);
  if (bySlug.data) return bySlug.data as CloneRef;
  if (idOrSlug.includes("*")) return null;
  const byName = await supabaseAdmin.from("clones").select(cols).ilike("name", idOrSlug.replace(/[\\%_]/g, "\\$&")).limit(2);
  if (byName.error) throw cloneLookupFailed(byName.error);
  return byName.data?.length === 1 ? (byName.data[0] as CloneRef) : null;
}

// ── the revenue window ───────────────────────────────────────────────────────
// Pulled out of app/api/admin/v1/revenue/route.ts so it can be checked. It was
// wrong when it lived inline and the bug was invisible to a typecheck AND to
// reading it: Number(null) is 0, and 0 is finite, so `Number.isFinite(startMs)
// && Number.isFinite(endMs)` was TRUE on every request that passed neither
// bound. Every call silently became a custom range of {0, 0} and the requested
// period was discarded. Found by calling the live endpoint.
export const PERIODS = ["ALL", "1Y", "6M", "3M", "1M", "2W", "1W", "1D", "CUSTOM"] as const;
export type PeriodName = (typeof PERIODS)[number];

export function parseRevenueWindow(
  params: URLSearchParams,
): { period: PeriodName; range?: { startMs: number; endMs: number } } | QueryError {
  const p = params.get("period");
  if (p && !(PERIODS as readonly string[]).includes(p)) {
    return { error: `period must be one of ${PERIODS.join(", ")}`, status: 400 };
  }

  const rawStart = params.get("start");
  const rawEnd = params.get("end");
  if (rawStart === null && rawEnd === null) {
    return { period: (p as PeriodName) ?? "1M" };
  }
  if (rawStart === null || rawEnd === null) {
    return { error: "start and end must BOTH be given, or neither", status: 400 };
  }
  const startMs = Number(rawStart);
  const endMs = Number(rawEnd);
  if (rawStart.trim() === "" || rawEnd.trim() === "" || !Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { error: "start and end must be epoch-millisecond numbers", status: 400 };
  }
  if (endMs < startMs) return { error: "end must not be before start", status: 400 };
  return { period: "CUSTOM", range: { startMs, endMs } };
}

export function isQueryError(v: unknown): v is QueryError {
  return !!v && typeof v === "object" && "error" in (v as Record<string, unknown>) && "status" in (v as Record<string, unknown>);
}
