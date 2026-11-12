// ── Request-parameter parsing for the public API's list endpoints ────────────
//
// PURE, NO DATABASE. lib/api-public.ts must never read request parameters (the
// tenancy boundary is the key, and check B1 greps that file for params.get), so
// everything a caller can ask for is parsed here into a plain, bounded object
// and handed to the projection layer. Nothing in this file can name a clone.
//
// Every parser returns either a value or { error }, and every number is
// clamped: a public caller must not be able to turn one request into an
// unbounded table scan on a micro Supabase compute.

export type QueryError = { error: string };
export const isQueryError = (v: unknown): v is QueryError =>
  typeof v === "object" && v !== null && "error" in v && typeof (v as QueryError).error === "string";

// ── fans ─────────────────────────────────────────────────────────────────────
export const FAN_SORTS = ["spend", "recent", "joined", "messages"] as const;
export type FanSort = (typeof FAN_SORTS)[number];

export const FAN_SORT_COLUMN: Record<FanSort, string> = {
  spend: "total_spent_stars",
  recent: "last_message_received",
  joined: "first_seen_at",
  messages: "total_messages_sent",
};

export const MAX_FAN_OFFSET = 20_000;
export const FAN_TIERS = ["whale", "high", "mid", "low", "none"] as const;

export type FanQuery = {
  sort: FanSort;
  offset: number;
  /** only fans whose last message is at or after this instant (ISO) */
  activeSince: string | null;
  /** only fans who first appeared at or after this instant (ISO) */
  joinedSince: string | null;
  minSpent: number;
  tier: string | null;
  buyersOnly: boolean;
};

const ISO_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const REL_RE = /^(\d{1,3})(m|h|d)$/;

/** "24h", "7d", "90m" or an ISO date/time -> an ISO instant, or null if unreadable. */
export function parseInstant(raw: string | null, now: number): string | null {
  if (raw == null || raw === "") return null;
  const rel = REL_RE.exec(raw.trim());
  if (rel) {
    const unit = rel[2] === "m" ? 60_000 : rel[2] === "h" ? 3_600_000 : 86_400_000;
    return new Date(now - Number(rel[1]) * unit).toISOString();
  }
  if (!ISO_RE.test(raw.trim())) return null;
  const t = Date.parse(raw.trim().replace(" ", "T"));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export function parseFanQuery(params: URLSearchParams, now = Date.now()): FanQuery | QueryError {
  const sortRaw = params.get("sort") ?? "spend";
  if (!(FAN_SORTS as readonly string[]).includes(sortRaw)) {
    return { error: `sort must be one of ${FAN_SORTS.join(", ")}` };
  }
  const offsetN = Number(params.get("offset") ?? 0);
  if (!Number.isFinite(offsetN) || offsetN < 0) return { error: "offset must be a number, 0 or more" };

  const active = params.get("active_since");
  const joined = params.get("joined_since");
  const activeSince = parseInstant(active, now);
  const joinedSince = parseInstant(joined, now);
  if (active && !activeSince) return { error: "active_since must be like 24h, 7d or an ISO date" };
  if (joined && !joinedSince) return { error: "joined_since must be like 24h, 7d or an ISO date" };

  const minSpentN = Number(params.get("min_spent") ?? 0);
  if (!Number.isFinite(minSpentN) || minSpentN < 0) return { error: "min_spent must be a number, 0 or more" };

  const tier = params.get("tier");
  if (tier && !(FAN_TIERS as readonly string[]).includes(tier)) {
    return { error: `tier must be one of ${FAN_TIERS.join(", ")}` };
  }
  return {
    sort: sortRaw as FanSort,
    offset: Math.min(MAX_FAN_OFFSET, Math.floor(offsetN)),
    activeSince,
    joinedSince,
    minSpent: Math.floor(minSpentN),
    tier: tier || null,
    buyersOnly: params.get("buyers") === "1" || params.get("buyers") === "true",
  };
}

// ── payments ─────────────────────────────────────────────────────────────────
export const DEFAULT_PAYMENT_LIMIT = 200;
export const MAX_PAYMENT_LIMIT = 1000;
/** How far back a single request may reach. Wider windows belong to /revenue. */
export const MAX_PAYMENT_WINDOW_DAYS = 90;

export type PaymentCursor = { t: string; i: string };

export type PaymentQuery = {
  since: string;
  until: string;
  limit: number;
  cursor: PaymentCursor | null;
  feature: string | null;
  kind: string | null;
  minStars: number;
  includeRefunds: boolean;
};

const WORD_RE = /^[a-z0-9_]{1,40}$/;
const ID_RE = /^[A-Za-z0-9:_.=-]{1,300}$/;

export function encodeCursor(c: PaymentCursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

/** The cursor is spliced into a PostgREST filter string, so both halves are
 *  validated against a strict shape, whether a caller handed them to us or we
 *  are about to mint them from a row. */
export function cursorAt(t: unknown, i: unknown): PaymentCursor | null {
  if (typeof t !== "string" || typeof i !== "string") return null;
  if (!ISO_RE.test(t) || !ID_RE.test(i)) return null;
  return { t, i };
}

export function decodeCursor(raw: string): PaymentCursor | null {
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    if (typeof v !== "object" || v === null) return null;
    const { t, i } = v as Record<string, unknown>;
    return cursorAt(t, i);
  } catch {
    return null;
  }
}

export function parsePaymentQuery(params: URLSearchParams, now = Date.now()): PaymentQuery | QueryError {
  const until = params.has("until") ? parseInstant(params.get("until"), now) : new Date(now).toISOString();
  if (!until) return { error: "until must be like 1h, 7d or an ISO date" };
  const since = params.has("since") ? parseInstant(params.get("since"), now) : new Date(now - 86_400_000).toISOString();
  if (!since) return { error: "since must be like 1h, 7d or an ISO date" };
  if (Date.parse(since) >= Date.parse(until)) return { error: "since must be earlier than until" };
  const floor = now - MAX_PAYMENT_WINDOW_DAYS * 86_400_000;
  const sinceClamped = Date.parse(since) < floor ? new Date(floor).toISOString() : since;

  const limitN = Number(params.get("limit") ?? DEFAULT_PAYMENT_LIMIT);
  const limit = Number.isFinite(limitN) && limitN > 0 ? Math.min(MAX_PAYMENT_LIMIT, Math.floor(limitN)) : DEFAULT_PAYMENT_LIMIT;

  let cursor: PaymentCursor | null = null;
  const cursorRaw = params.get("cursor");
  if (cursorRaw) {
    cursor = decodeCursor(cursorRaw);
    if (!cursor) return { error: "cursor is not one this API issued" };
  }
  const feature = params.get("feature");
  if (feature && !WORD_RE.test(feature)) return { error: "feature must be a short lowercase word" };
  const kind = params.get("kind");
  if (kind && !WORD_RE.test(kind)) return { error: "kind must be a short lowercase word" };
  const minN = Number(params.get("min_stars") ?? 0);
  if (!Number.isFinite(minN) || minN < 0) return { error: "min_stars must be a number, 0 or more" };

  return {
    since: sinceClamped,
    until,
    limit,
    cursor,
    feature: feature || null,
    kind: kind || null,
    minStars: Math.floor(minN),
    includeRefunds: params.get("refunds") !== "0" && params.get("refunds") !== "false",
  };
}
