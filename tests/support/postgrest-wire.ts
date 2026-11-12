/**
 * In-memory PostgREST fake at the wire (globalThis.fetch). The real lib code and the real supabase-js client run
 * unchanged; only the HTTP transport is replaced. First used by W4 lane lib-analytics-data-plus4.
 * - Every request to a host other than FAKE_HOST throws (and is recorded in `foreign`): no network, ever.
 * - Routing is method + path ("GET /rest/v1/clones", "POST /rest/v1/rpc/<fn>"); handlers are per test.
 * - Filters are parsed once into WireRequest.filters. `rowsReply` applies eq/neq/gt/gte/lt/lte/in/is, `not.` (NULL
 *   never matches a negated operator except `not.is`) and `or=(...)`, sorts by simple `col.asc|desc[.nullsfirst|
 *   nullslast]` order lists, slices by the Range header or offset/limit (selectAllRows paging), caps every reply at
 *   PostgREST's max-rows (1000) and answers HEAD/count=exact with a Content-Range. Any other operator or order, or a
 *   column with `(` or `->`, THROWS; a throwing handler or an unmodelled route answers 599 and is recorded in
 *   `unmodelled`. No select projection: rows come back whole.
 * - `useWire(serve)` resets and registers the file's routes in one beforeEach, and after every test waits for
 *   fire-and-forget writes, then throws a plain Error (a crash, not a red) if `unmodelled` or `foreign` is non-empty.
 *   `restore()` never reinstates real fetch: the fake stays installed and refuses everything until the process exits.
 *   maybeSingle is resolved client side from the array reply.
 * Credentials are built at runtime; nothing token shaped is a literal here.
 */
import { createHash, randomBytes } from "node:crypto";
import { after, afterEach, beforeEach } from "node:test";

export const FAKE_HOST = "fake-supabase.test";
export const FAKE_URL = `http://${FAKE_HOST}`;
/** Fixed report clock shared by the W4 tests: 2026-11-12 16:00 in Sydney. */
export const NOW = Date.parse("2026-11-12T05:00:00Z");
export const CLONE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

export type WireFilter =
  | { column: string; op: string; value: string; negate: boolean }
  | { column: "or"; op: "or"; value: string; negate: boolean; any: WireFilter[] };

export type WireRequest = {
  method: string;
  url: URL;
  /** "/rest/v1/<table>" or "/rest/v1/rpc/<fn>" */
  path: string;
  headers: Headers;
  body: unknown;
  range: { from: number; to: number } | null;
  filters: WireFilter[];
};
export type WireReply = { status?: number; body?: unknown; headers?: Record<string, string> };
export type WireHandler = (req: WireRequest) => WireReply | Promise<WireReply>;

export type Wire = {
  requests: WireRequest[];
  unmodelled: string[];
  foreign: string[];
  /** route = "<METHOD> <path>", e.g. "GET /rest/v1/clones". A later `on` for the same route replaces it. */
  on(route: string, handler: WireHandler): void;
  calls(route: string): WireRequest[];
  reset(): void;
  restore(): void;
};

export function setFakeEnv(): void {
  process.env.SUPABASE_URL = FAKE_URL;
  process.env.SUPABASE_SERVICE_KEY = "svc-" + "x".repeat(20);
}

const RESERVED = new Set(["select", "order", "limit", "offset", "columns", "on_conflict"]);
const KNOWN_OPS = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "or"]);

function parseOne(column: string, raw: string): WireFilter {
  let rest = raw;
  let negate = false;
  if (rest.startsWith("not.")) {
    negate = true;
    rest = rest.slice(4);
  }
  const dot = rest.indexOf(".");
  return dot < 0 ? { column, op: rest, value: "", negate } : { column, op: rest.slice(0, dot), value: rest.slice(dot + 1), negate };
}

/** Split "a.gt.0,b.in.(1,2)" on top-level commas. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

export function parseFilters(url: URL): WireFilter[] {
  const filters: WireFilter[] = [];
  for (const [key, raw] of url.searchParams) {
    if (RESERVED.has(key)) continue;
    if (key === "or") {
      const inner = raw.replace(/^\(/, "").replace(/\)$/, "");
      const any = splitTop(inner).map((part) => {
        const dot = part.indexOf(".");
        return parseOne(part.slice(0, dot), part.slice(dot + 1));
      });
      filters.push({ column: "or", op: "or", value: raw, negate: false, any });
    } else filters.push(parseOne(key, raw));
  }
  return filters;
}

function checkOps(filters: readonly WireFilter[]): void {
  for (const f of filters) {
    if (f.column.includes("(") || f.column.includes("->")) throw new Error(`wire fake: unmodelled filter column ${f.column}`);
    if (!KNOWN_OPS.has(f.op)) throw new Error(`wire fake: unmodelled filter operator ${f.column}=${f.negate ? "not." : ""}${f.op}`);
    if ("any" in f) checkOps(f.any);
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
function compare(a: unknown, b: string): number {
  const as = String(a);
  if (DATE_RE.test(as) && DATE_RE.test(b)) return Date.parse(as) - Date.parse(b);
  if (as.trim() !== "" && b.trim() !== "" && Number.isFinite(Number(as)) && Number.isFinite(Number(b))) return Number(as) - Number(b);
  return as < b ? -1 : as > b ? 1 : 0;
}

/** PostgREST max-rows on Supabase's default config. */
const MAX_ROWS = 1000;

type OrderTerm = { column: string; desc: boolean; nullsFirst: boolean };
function parseOrder(raw: string | null): OrderTerm[] {
  if (!raw) return [];
  return raw.split(",").map((term) => {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)(?:\.(asc|desc))?(?:\.(nullsfirst|nullslast))?$/.exec(term);
    if (!m) throw new Error(`wire fake: unmodelled order ${raw}`);
    const desc = m[2] === "desc";
    // PostgREST defaults: asc -> nulls last, desc -> nulls first.
    const nullsFirst = m[3] ? m[3] === "nullsfirst" : desc;
    return { column: m[1], desc, nullsFirst };
  });
}
function sortRows<T extends Record<string, unknown>>(rows: T[], order: OrderTerm[]): T[] {
  if (!order.length) return rows;
  return rows.map((row, i) => ({ row, i })).sort((x, y) => {
    for (const o of order) {
      const a = x.row[o.column];
      const b = y.row[o.column];
      if (a == null || b == null) {
        if (a == null && b == null) continue;
        return (a == null) === o.nullsFirst ? -1 : 1;
      }
      const c = compare(a, String(b));
      if (c !== 0) return o.desc ? -c : c;
    }
    return x.i - y.i;
  }).map((e) => e.row);
}

/** Split an in.(...) list on top-level unquoted commas and unquote each item. */
function inList(raw: string): string[] {
  const inner = raw.replace(/^\(/, "").replace(/\)$/, "");
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "\\" && quoted && i + 1 < inner.length) {
      cur += inner[++i];
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function matches(row: Record<string, unknown>, f: WireFilter): boolean {
  let hit: boolean;
  if ("any" in f) hit = f.any.some((g) => matches(row, g));
  else {
    const v = row[f.column];
    // NULL satisfies no comparison, negated or not; only `is` (and so `not.is`) speaks about NULL.
    if (v == null && f.op !== "is") return false;
    switch (f.op) {
      case "is":
        hit = f.value === "null" ? v == null : f.value === "true" ? v === true : f.value === "false" ? v === false : v === undefined;
        break;
      case "in":
        hit = inList(f.value).some((item) => compare(v, item) === 0);
        break;
      case "eq":
        hit = v != null && compare(v, f.value) === 0;
        break;
      case "neq":
        hit = v != null && compare(v, f.value) !== 0;
        break;
      case "gt":
        hit = v != null && compare(v, f.value) > 0;
        break;
      case "gte":
        hit = v != null && compare(v, f.value) >= 0;
        break;
      case "lt":
        hit = v != null && compare(v, f.value) < 0;
        break;
      case "lte":
        hit = v != null && compare(v, f.value) <= 0;
        break;
      default:
        throw new Error(`wire fake: unmodelled filter operator ${f.op}`);
    }
  }
  return f.negate ? !hit : hit;
}

function parseRange(url: URL, headers: Headers): { from: number; to: number } | null {
  const h = headers.get("range");
  const m = h ? /^(\d+)-(\d+)$/.exec(h.trim()) : null;
  if (m) return { from: Number(m[1]), to: Number(m[2]) };
  const offset = url.searchParams.get("offset");
  const limit = url.searchParams.get("limit");
  if (limit != null) {
    const from = Number(offset ?? 0);
    return { from, to: from + Number(limit) - 1 };
  }
  return null;
}

export function installWire(): Wire {
  setFakeEnv();
  let closed = false;
  const handlers = new Map<string, WireHandler>();
  const wire: Wire = {
    requests: [],
    unmodelled: [],
    foreign: [],
    on(route, handler) {
      handlers.set(route, handler);
    },
    calls(route) {
      return wire.requests.filter((r) => `${r.method} ${r.path}` === route);
    },
    reset() {
      handlers.clear();
      wire.requests.length = 0;
      wire.unmodelled.length = 0;
      wire.foreign.length = 0;
    },
    restore() {
      // Real fetch is never reinstated: a late fire-and-forget write must hit a refusing fake, not the network.
      closed = true;
    },
  };

  const fail = (line: string) => {
    wire.unmodelled.push(line);
    return new Response(JSON.stringify({ message: `wire fake: unmodelled ${line}`, code: "FAKE_UNMODELLED" }), {
      status: 599,
      headers: { "content-type": "application/json" },
    });
  };

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href);
    if (closed) {
      wire.foreign.push(href);
      throw new Error(`wire fake: closed, refused ${href}`);
    }
    if (url.host !== FAKE_HOST) {
      wire.foreign.push(href);
      throw new Error(`wire fake: refused non-fake host ${url.host}`);
    }
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    let body: unknown = null;
    if (typeof init?.body === "string" && init.body !== "") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const req: WireRequest = {
      method, url, path: url.pathname, headers, body, range: parseRange(url, headers), filters: parseFilters(url),
    };
    wire.requests.push(req);
    const handler = handlers.get(`${method} ${url.pathname}`);
    if (!handler) return fail(`${method} ${url.pathname}${url.search}`);
    let reply: WireReply;
    try {
      reply = await handler(req);
    } catch (e) {
      return fail(`${method} ${url.pathname}${url.search}: ${e instanceof Error ? e.message : String(e)}`);
    }
    const status = reply.status ?? 200;
    const noBody = method === "HEAD" || status === 204 || reply.body === undefined;
    return new Response(noBody ? null : JSON.stringify(reply.body), {
      status,
      headers: { "content-type": "application/json", ...(reply.headers ?? {}) },
    });
  }) as typeof fetch;

  return wire;
}

/** A plain Error, not an assertion: an unclean wire is a broken harness ("crashed"), never a finding ("still red"). */
export function assertWireClean(wire: Wire): void {
  if (wire.unmodelled.length) throw new Error(`wire fake: request(s) the fake did not model: ${wire.unmodelled.join(" | ")}`);
  if (wire.foreign.length) throw new Error(`wire fake: request(s) to a non-fake host: ${wire.foreign.join(" | ")}`);
}

/**
 * installWire + (reset, then the file's routes) before each test + settle and clean-wire check after each test +
 * settle and close at the end.
 */
export function useWire(serve?: (wire: Wire) => void): Wire {
  const wire = installWire();
  beforeEach(() => {
    wire.reset();
    serve?.(wire);
  });
  afterEach(async () => {
    await settle();
    assertWireClean(wire);
  });
  after(async () => {
    await settle();
    wire.restore();
  });
  return wire;
}

/** Serve a fixed row set as PostgREST would: apply the filters, honour the range, answer count=exact with Content-Range. */
export function rowsReply(rows: readonly Record<string, unknown>[]): WireHandler {
  return (req) => {
    checkOps(req.filters);
    const order = parseOrder(req.url.searchParams.get("order"));
    const hit = sortRows(rows.filter((row) => req.filters.every((f) => matches(row, f))), order);
    const total = hit.length;
    const r = req.range;
    // max-rows: an unpaged read, or a range wider than 1000, gets at most 1000 rows, as PostgREST would answer.
    const from = r ? r.from : 0;
    const to = r ? Math.min(r.to, from + MAX_ROWS - 1) : MAX_ROWS - 1;
    const slice = hit.slice(from, to + 1);
    const headers: Record<string, string> = {};
    if (/count=exact/.test(req.headers.get("prefer") ?? "")) {
      headers["content-range"] = slice.length ? `${from}-${from + slice.length - 1}/${total}` : `*/${total}`;
    }
    return { status: 200, body: slice, headers };
  };
}

export const pgError = (status: number, code: string, message: string): WireReply => ({
  status,
  body: { code, message, details: null, hint: null },
});

/** True when an error came from the fake itself (unmodelled request), not from the code under test. */
export const isFakeError = (e: unknown) => /FAKE_UNMODELLED|wire fake/.test(e instanceof Error ? e.message : String(e));

/** Throws a plain Error (a crash, not a red) when a rejection came from the fake rather than the code under test. */
export function refuseFakeError(e: unknown): void {
  if (isFakeError(e)) throw new Error(`harness: rejection caused by the wire fake, not the code under test: ${String(e)}`);
}

/** Lets fire-and-forget writes (`void supabaseAdmin...then()`) reach the fake before a test counts them. */
export async function settle(ms = 25): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// ── analytics (lib/analytics-data.ts getAnalytics) ───────────────────────────
/**
 * Everything getAnalytics reads, with empty/zero answers. Found by running it against the fail-loud fake and reading
 * the unmodelled list. Override any route with wire.on() afterwards.
 */
export function serveAnalyticsDefaults(wire: Wire, ledger: readonly Record<string, unknown>[] = []): void {
  wire.on("GET /rest/v1/clones", rowsReply([]));
  wire.on("GET /rest/v1/star_transactions", rowsReply(ledger));
  wire.on("GET /rest/v1/paywall_hits", rowsReply([]));
  wire.on("GET /rest/v1/users", rowsReply([]));
  wire.on("HEAD /rest/v1/users", rowsReply([]));
  wire.on("POST /rest/v1/rpc/revenue_messaged_fans", () => ({ body: 0 }));
  wire.on("POST /rest/v1/rpc/revenue_active_chat_buyers", () => ({ body: 0 }));
  wire.on("POST /rest/v1/rpc/revenue_paywall_stats", () => ({ body: [] }));
  wire.on("POST /rest/v1/rpc/revenue_fan_spend_stats", () => ({ body: [] }));
  wire.on("POST /rest/v1/rpc/revenue_fan_tiers", () => ({ body: [] }));
  wire.on("POST /rest/v1/rpc/revenue_conversation_funnel", () => ({ body: [] }));
  wire.on("POST /rest/v1/rpc/revenue_usage_rollup", () => ({ body: [] }));
}

/** One one-star ledger row; distinct telegram_id per n so lib/star-dedupe.ts keeps every row. */
export function oneStarRow(n: number, paidAt: string, cloneId: string | null = null): Record<string, unknown> {
  return {
    id: `tx-${String(n).padStart(6, "0")}`,
    clone_id: cloneId,
    amount_stars: 1,
    paid_at: paidAt,
    kind: "credits",
    feature: "credits",
    telegram_id: 1_000_000 + n,
    invoice_payload: null,
    imported_from: null,
  };
}

export function oneStarLedger(n: number, paidAt: string, cloneId: string | null = null) {
  return Array.from({ length: n }, (_, i) => oneStarRow(i, paidAt, cloneId));
}

// ── public API keys (lib/api-tenant.ts, lib/api-public-route.ts) ─────────────
export const newModelKey = () => randomBytes(32).toString("base64url");
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** An api_keys row as migrations 103/127 shape it, hashed independently of lib/api-tenant.ts. */
export function modelKeyRow(key: string, scope: "clone" | "fleet", id = `key-${scope}`): Record<string, unknown> {
  return { id, clone_id: scope === "clone" ? CLONE : null, scope, label: scope, key_hash: sha256(key), revoked_at: null };
}

/** api_keys lookup (filtered by key_hash/revoked_at), last_used_at PATCH, system_logs insert. */
export function serveModelKeys(wire: Wire, rows: readonly Record<string, unknown>[]): void {
  wire.on("GET /rest/v1/api_keys", rowsReply(rows));
  wire.on("PATCH /rest/v1/api_keys", () => ({ status: 204 }));
  wire.on("POST /rest/v1/system_logs", () => ({ status: 201 }));
}

/** One request to a withModelKey route with `Authorization: Bearer <key>`. */
export function bearerCall<R>(route: (req: Request) => Promise<R>, key: string, qs = "", path = "/api/v1/x"): Promise<R> {
  return route(new Request(`http://localhost${path}${qs}`, { headers: { authorization: `Bearer ${key}` } }));
}
