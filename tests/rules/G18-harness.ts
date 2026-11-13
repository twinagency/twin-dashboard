/**
 * Shared harness for the W4 api-ai-assistant-plus2 tests (docs/review/W4/api-ai-assistant-plus2.md).
 * Not a test file (no `.test.` in the name). Import it FIRST, before anything else, from a test file.
 *
 * Real route handlers + real server actions; fakes only at wire boundaries:
 * - Network: importing this file replaces globalThis.fetch with a deny-all stub. The ONLY reachable targets are
 *   the fake PostgREST servers this harness started (127.0.0.1:<their port>); every other host or port THROWS
 *   (recorded in `blockedFetches`). Nothing passes through to the real network.
 * - PostgREST: an HTTP server on 127.0.0.1:<port 0>, SUPABASE_URL points at it (the admin client is lazy, so it
 *   must be set before the first query). Every request is recorded (method, table, query, body, prefer).
 *   Reply order: (1) a filter on a uuid column (FAKE_UUID_COLUMNS) whose eq/in operand is not a uuid answers
 *   HTTP 400 code 22P02, like Postgres; (2) the per-test `respond` hook; (3) a generic stateful per-table store
 *   (`seed`/`rows`): GET/HEAD honour eq, neq, gt, gte, lt, lte, like, ilike, is, in, cs filters (incl. `col->k`,
 *   `col->>k` json paths), `order` (stable sort, Postgres null placement), `limit`, `offset`, plain-column
 *   `select`; POST inserts (fills `id` + `created_at` if absent; merge-duplicates upsert on `on_conflict`/id);
 *   PATCH/DELETE apply the same filters to the matched rows. `Prefer: return=representation` returns the
 *   affected rows, `count=exact` sets Content-Range, vnd.pgrst.object needs exactly one row (else 406).
 *   `or=(...)`/`and=(...)` logic trees (nested and()/or()) are emulated too. Not emulated, answered LOUDLY (HTTP 400
 *   PGRST100 / 404 PGRST202, never a silent []): `not.` filters, other ops, RPC calls, embedded resources in `select` (embeds are dropped from the row).
 * - OpenRouter: `stubOpenRouter` layers openrouter.ai (SSE replies scripted per turn) over the deny-all stub.
 * DECLARED BYPASS: Next's workAsyncStorage is entered with a minimal fake store so revalidatePath /
 * revalidateTag work outside a request (framework internals, not service code). Outside a request
 * getDashboardAccess() returns null = internal admin (lib/dashboard-access.ts).
 * Nothing real is reachable: SUPABASE_SERVICE_KEY / OPENROUTER_API_KEY are obvious fakes.
 */
import { AsyncLocalStorage } from "node:async_hooks";
(globalThis as any).AsyncLocalStorage = AsyncLocalStorage;
import { randomUUID } from "node:crypto";
import http from "node:http";

// ── deny-all network (installed at import, before any client captures fetch) ──
const realFetch = globalThis.fetch;
const fakePorts = new Set<string>();
export const blockedFetches: string[] = [];
const hrefOf = (input: any) => (typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
const denyAllFetch = (async (input: any, init?: any) => {
  const u = new URL(hrefOf(input));
  if (u.hostname === "127.0.0.1" && fakePorts.has(u.port)) return realFetch(input, init);
  blockedFetches.push(u.origin);
  throw new Error(`blocked in test: ${u.origin} (only the harness fakes on 127.0.0.1 are reachable)`);
}) as typeof fetch;
globalThis.fetch = denyAllFetch;

export type WireCall = {
  method: string;
  table: string;
  url: string;
  query: URLSearchParams;
  accept: string;
  prefer: string;
  rawBody: string;
  body: any;
};
export type Reply = { status?: number; body?: unknown; headers?: Record<string, string> };
export type Responder = (c: WireCall) => Reply | undefined;
type Row = Record<string, any>;

export type FakePostgrest = {
  url: string;
  calls: WireCall[];
  /** Per-test reply logic, consulted before the store; return undefined to fall through to the store. */
  respond: (fn: Responder) => void;
  /** Replace a table's rows in the store (copies them; array order = the "physical" base order). */
  seed: (table: string, rows: Row[]) => void;
  /** Live rows of a table in the store. */
  rows: (table: string) => Row[];
  /** Clears calls, responder and every table. */
  reset: () => void;
  close: () => Promise<void>;
  writes: (method: string, table: string) => WireCall[];
};

/** Columns Postgres types as uuid in the tables these tests touch: a non-uuid eq/in operand is a 22P02 error. */
export const FAKE_UUID_COLUMNS = new Set(["id", "clone_id", "conversation_id", "user_id"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

class Unsupported extends Error {}

function pgList(arg: string): string[] {
  const inner = arg.replace(/^[({]/, "").replace(/[)}]$/, "");
  const out: string[] = [];
  for (const m of inner.matchAll(/"((?:[^"\\]|\\.)*)"|([^,]+)/g)) out.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, "$1") : m[2].trim());
  return out;
}

function getPath(row: Row, col: string): unknown {
  const parts = col.split(/(->>|->)/);
  let v: any = row[parts[0]];
  for (let i = 1; i < parts.length; i += 2) {
    const key = parts[i + 1];
    if (v === null || v === undefined || typeof v !== "object") return null;
    v = Array.isArray(v) ? v[Number(key)] : v[key];
    if (parts[i] === "->>" && v !== null && v !== undefined) v = typeof v === "object" ? JSON.stringify(v) : String(v);
  }
  return v === undefined ? null : v;
}

const asText = (v: unknown) => (v !== null && typeof v === "object" ? JSON.stringify(v) : String(v));
function cmp(a: unknown, b: string): number {
  const na = Number(a), nb = Number(b);
  if (typeof a !== "string" && !Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  const sa = asText(a);
  return sa < b ? -1 : sa > b ? 1 : 0;
}
function likeToRegex(p: string, flags: string): RegExp {
  let re = "";
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === "\\" && i + 1 < p.length) re += p[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    else if (ch === "%" || ch === "*") re += ".*";
    else if (ch === "_") re += ".";
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, flags);
}
function contains(have: unknown, want: unknown): boolean {
  if (Array.isArray(want)) return Array.isArray(have) && want.every((w) => have.some((h) => contains(h, w)));
  if (want !== null && typeof want === "object") {
    return have !== null && typeof have === "object" && !Array.isArray(have)
      && Object.entries(want).every(([k, w]) => contains((have as Row)[k], w));
  }
  return have === want || (have !== null && have !== undefined && String(have) === String(want));
}
function matchOne(v: unknown, op: string, arg: string): boolean {
  switch (op) {
    case "eq": return v !== null && asText(v) === arg;
    case "neq": return v !== null && asText(v) !== arg;
    case "gt": return v !== null && cmp(v, arg) > 0;
    case "gte": return v !== null && cmp(v, arg) >= 0;
    case "lt": return v !== null && cmp(v, arg) < 0;
    case "lte": return v !== null && cmp(v, arg) <= 0;
    case "like": return v !== null && likeToRegex(arg, "").test(asText(v));
    case "ilike": return v !== null && likeToRegex(arg, "i").test(asText(v));
    case "is": return arg === "null" ? v === null : arg === "true" ? v === true : arg === "false" ? v === false : (() => { throw new Unsupported(`is.${arg}`); })();
    case "in": return v !== null && pgList(arg).includes(asText(v));
    case "cs": {
      let want: unknown;
      try { want = JSON.parse(arg); } catch { want = pgList(arg); }
      if (Array.isArray(want) && Array.isArray(v) && want.every((w) => typeof w === "string")) return want.every((w) => v.some((h) => String(h) === w));
      return contains(v, want);
    }
    default: throw new Unsupported(`filter op "${op}"`);
  }
}
type Filter = (row: Row) => boolean;
function leaf(col: string, expr: string): Filter {
  const dot = expr.indexOf(".");
  const op = dot < 0 ? expr : expr.slice(0, dot);
  if (op === "not") throw new Unsupported("not. filter");
  const arg = dot < 0 ? "" : expr.slice(dot + 1);
  return (row) => matchOne(getPath(row, col), op, arg);
}
/** or=(a.eq.1,b.is.null) / and=(...), nested and(...)/or(...) terms; not. stays unsupported. */
function logic(kind: string, list: string): Filter {
  const terms = topLevelTokens(list.replace(/^\(/, "").replace(/\)$/, "")).map((t): Filter => {
    const m = t.match(/^(and|or)(\(.*\))$/);
    if (m) return logic(m[1], m[2]);
    const dot = t.indexOf(".");
    if (dot < 0 || t.startsWith("not.")) throw new Unsupported(`${kind} term ${t}`);
    return leaf(t.slice(0, dot), t.slice(dot + 1));
  });
  return kind === "and" ? (row) => terms.every((f) => f(row)) : (row) => terms.some((f) => f(row));
}
function filtersOf(q: URLSearchParams): Filter[] {
  const out: Filter[] = [];
  for (const [k, v] of q) {
    if (RESERVED.has(k)) continue;
    if (k.startsWith("not.")) throw new Unsupported(`${k} filter`);
    out.push(k === "or" || k === "and" ? logic(k, v) : leaf(k, v));
  }
  return out;
}
const matches = (row: Row, f: Filter[]) => f.every((p) => p(row));

function sortRows(rows: Row[], order: string | null): Row[] {
  if (!order) return rows;
  const keys = order.split(",").map((s) => {
    const [col, ...mods] = s.split(".");
    const desc = mods.includes("desc");
    const nullsFirst = mods.includes("nullsfirst") ? true : mods.includes("nullslast") ? false : desc;
    return { col, desc, nullsFirst };
  });
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      for (const k of keys) {
        const va = getPath(a.r, k.col), vb = getPath(b.r, k.col);
        if (va === null && vb === null) continue;
        if (va === null) return k.nullsFirst ? -1 : 1;
        if (vb === null) return k.nullsFirst ? 1 : -1;
        const c = cmp(va, asText(vb));
        if (c !== 0) return k.desc ? -c : c;
      }
      return a.i - b.i;
    })
    .map((x) => x.r);
}
function topLevelTokens(select: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of select) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function project(rows: Row[], select: string | null): Row[] {
  if (!select || select.trim() === "*") return rows.map((r) => structuredClone(r));
  const toks = topLevelTokens(select);
  return rows.map((r) => {
    const o: Row = {};
    for (const t of toks) {
      if (t === "*") Object.assign(o, structuredClone(r));
      const m = t.match(/^(?:([a-z_][a-z0-9_]*):)?([a-z_][a-z0-9_]*)(?:::[a-z_]+)?$/i);
      if (m) o[m[1] ?? m[2]] = structuredClone(r[m[2]] ?? null);
      // embeds (`x(...)`) are not emulated: dropped
    }
    return o;
  });
}

export async function startFakePostgrest(): Promise<FakePostgrest> {
  const calls: WireCall[] = [];
  const tables = new Map<string, Row[]>();
  const tbl = (t: string) => { if (!tables.has(t)) tables.set(t, []); return tables.get(t)!; };
  let responder: Responder = () => undefined;

  const store = (c: WireCall): Reply => {
    if (c.table.startsWith("rpc/")) return { status: 404, body: { code: "PGRST202", message: `fake PostgREST: rpc ${c.table} not emulated` } };
    const representation = c.prefer.includes("return=representation");
    const select = c.query.get("select");
    const filters = filtersOf(c.query);
    const rows = tbl(c.table);
    const countHeader = (n: number, from = 0, len = n) =>
      c.prefer.includes("count=") ? { "content-range": len ? `${from}-${from + len - 1}/${n}` : `*/${n}` } : undefined;
    if (c.method === "GET" || c.method === "HEAD") {
      const hit = sortRows(rows.filter((r) => matches(r, filters)), c.query.get("order"));
      const offset = Number(c.query.get("offset") ?? 0);
      const limit = c.query.has("limit") ? Number(c.query.get("limit")) : Infinity;
      const page = hit.slice(offset, offset + limit);
      return { status: 200, body: c.method === "HEAD" ? undefined : project(page, select), headers: countHeader(hit.length, offset, page.length) };
    }
    if (c.method === "POST") {
      const incoming = (Array.isArray(c.body) ? c.body : [c.body]).filter((r) => r && typeof r === "object");
      const upsert = c.prefer.includes("resolution=merge-duplicates");
      const keys = (c.query.get("on_conflict") ?? "id").split(",");
      const out: Row[] = [];
      for (const r of incoming) {
        const hit = upsert ? rows.find((x) => keys.every((k) => r[k] !== undefined && asText(x[k]) === asText(r[k]))) : undefined;
        if (hit) { Object.assign(hit, structuredClone(r)); out.push(hit); continue; }
        const row = { id: randomUUID(), created_at: new Date().toISOString(), ...structuredClone(r) };
        rows.push(row);
        out.push(row);
      }
      return { status: 201, body: representation ? project(out, select) : undefined, headers: countHeader(out.length) };
    }
    if (c.method === "PATCH" || c.method === "DELETE") {
      const hit = rows.filter((r) => matches(r, filters));
      if (c.method === "PATCH") for (const r of hit) Object.assign(r, structuredClone(c.body ?? {}));
      else tables.set(c.table, rows.filter((r) => !hit.includes(r)));
      return representation
        ? { status: 200, body: project(hit, select), headers: countHeader(hit.length) }
        : { status: 204, headers: countHeader(hit.length) };
    }
    return { status: 405, body: { code: "PGRST100", message: `fake PostgREST: method ${c.method}` } };
  };

  const srv = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const u = new URL(req.url ?? "/", "http://127.0.0.1");
      let body: any = undefined;
      try { body = raw ? JSON.parse(raw) : undefined; } catch { body = raw; }
      const call: WireCall = {
        method: req.method ?? "GET",
        table: u.pathname.replace(/^\/rest\/v1\//, ""),
        url: req.url ?? "",
        query: u.searchParams,
        accept: String(req.headers.accept ?? ""),
        prefer: String(req.headers.prefer ?? ""),
        rawBody: raw,
        body,
      };
      calls.push(call);
      let reply: Reply | undefined;
      try {
        for (const [col, v] of call.query) {
          const op = v.slice(0, v.indexOf("."));
          if (!FAKE_UUID_COLUMNS.has(col) || (op !== "eq" && op !== "in")) continue;
          const bad = (op === "eq" ? [v.slice(3)] : pgList(v.slice(3))).find((x) => !UUID.test(x));
          if (bad !== undefined) reply = { status: 400, body: { code: "22P02", message: `invalid input syntax for type uuid: "${bad}"`, details: null, hint: null } };
        }
        reply ??= responder(call) ?? store(call);
      } catch (e) {
        reply = e instanceof Unsupported
          ? { status: 400, body: { code: "PGRST100", message: `fake PostgREST does not emulate ${e.message}; extend the harness` } }
          : { status: 500, body: { message: String(e) } };
      }
      let out = reply.body;
      const status = reply.status ?? 200;
      const headers: Record<string, string> = { ...(reply.headers ?? {}) };
      if (status < 300 && call.accept.includes("vnd.pgrst.object") && Array.isArray(out)) {
        if (out.length !== 1) {
          res.writeHead(406, { "content-type": "application/json" });
          res.end(JSON.stringify({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }));
          return;
        }
        out = out[0];
      }
      if (out === undefined || status === 204) { res.writeHead(status, headers); res.end(); return; }
      res.writeHead(status, { ...headers, "content-type": "application/json" });
      res.end(JSON.stringify(out));
    });
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const port = String((srv.address() as any).port);
  fakePorts.add(port);
  const url = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_KEY = "test-service-key-not-real";
  process.env.OPENROUTER_API_KEY = "test-not-real";
  return {
    url,
    calls,
    respond: (fn) => { responder = fn; },
    seed: (table, rows) => { tables.set(table, rows.map((r) => structuredClone(r))); },
    rows: (table) => tbl(table),
    reset: () => { calls.length = 0; responder = () => undefined; tables.clear(); },
    close: () => new Promise<void>((r) => { fakePorts.delete(port); srv.close(() => r()); }),
    writes: (method, table) => calls.filter((c) => c.method === method && c.table === table),
  };
}

/** Run fn inside a minimal Next work store (DECLARED BYPASS, see header). */
export async function inWorkStore<T>(fn: () => Promise<T>): Promise<T> {
  const { workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external.js");
  const store = { route: "/test", incrementalCache: {}, pendingRevalidatedTags: [], pendingRevalidates: {}, pendingRevalidateWrites: [] };
  return (workAsyncStorage as any).run(store, fn);
}

export function jsonRequest(path: string, body: unknown): any {
  return new Request(`http://127.0.0.1${path}`, {
    method: "POST",
    // Same-origin like the real dashboard fetch, so an Origin-check fix (F33) keeps these callers green.
    headers: { "content-type": "application/json", origin: "http://127.0.0.1" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** A request with explicit method/headers (e.g. Origin, Content-Type) for the origin checks. */
export function request(path: string, opts: { method?: string; headers?: Record<string, string>; body?: unknown }): any {
  const { method = "POST", headers = {}, body } = opts;
  return new Request(`http://127.0.0.1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

// ── OpenRouter wire stub (SSE, the format lib/openrouter.ts orChatWithToolsStream parses) ──
export type OrTurn = { text?: string; toolCalls?: { name: string; args: Record<string, unknown> }[] };

function sseFor(turn: OrTurn): string {
  const ev = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
  let s = "";
  if (turn.text) s += ev({ choices: [{ delta: { content: turn.text } }] });
  (turn.toolCalls ?? []).forEach((tc, i) => {
    s += ev({ choices: [{ delta: { tool_calls: [{ index: i, id: `call_${i}`, type: "function", function: { name: tc.name, arguments: JSON.stringify(tc.args) } }] } }] });
  });
  s += ev({ choices: [{ delta: {}, finish_reason: turn.toolCalls?.length ? "tool_calls" : "stop" }] });
  s += "data: [DONE]\n\n";
  return s;
}

/** Scripted turns, in order; past the script every turn is an empty "stop". `requests` = bodies sent upstream.
 * Everything that is not openrouter.ai still goes through the deny-all stub. */
export function stubOpenRouter(turns: OrTurn[]): { requests: any[]; restore: () => void } {
  const requests: any[] = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    if (new URL(hrefOf(input)).hostname === "openrouter.ai") {
      requests.push(JSON.parse(String(init?.body ?? "{}")));
      const turn = turns[requests.length - 1] ?? {};
      return new Response(sseFor(turn), { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    return denyAllFetch(input, init);
  }) as typeof fetch;
  return { requests, restore: () => { globalThis.fetch = denyAllFetch; } };
}

/** Drain an SSE Response into its parsed `data:` events. */
export async function readSse(res: Response): Promise<any[]> {
  const text = await res.text();
  return text
    .split("\n\n")
    .map((b) => b.split("\n").find((l) => l.startsWith("data:")))
    .filter((l): l is string => !!l)
    .map((l) => JSON.parse(l.slice(5).trim()));
}

export const CLONE = { id: "11111111-1111-4111-8111-111111111111", name: "Test Clone", slug: "test-clone" };
export const OTHER_CLONE = { id: "22222222-2222-4222-8222-222222222222", name: "Other Clone", slug: "other-clone" };
export const FAN_ID = "33333333-3333-4333-8333-333333333333";
