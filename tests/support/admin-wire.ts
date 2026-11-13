/**
 * Wire-level fake for driving app/api/admin/v1/* route handlers offline. Replaces globalThis.fetch with an
 * in-memory PostgREST + Telegram Bot API responder, so the real supabase-js clients (lib/supabase.ts,
 * lib/supabase-service.ts) and lib/posting's tg() run unchanged: fake the wire, not the service.
 *
 * Fails loud rather than admitting: an unmodelled filter operator, an embedded select, an upsert with no declared
 * key, an unmodelled RPC, storage, or any non-fake host answers an error, and fetch after restore() throws.
 * Lenient on purpose in one place: the fake has no schema, so a column a fixture row lacks reads as null.
 * Test files import ./admin-route-env FIRST (env + shims), then this.
 */
import { FAKE_ADMIN_KEY, FAKE_SUPABASE } from "./admin-route-env";
import * as nodeModule from "node:module";

export { FAKE_ADMIN_KEY };
export type Row = Record<string, unknown>;
export type Call = { method: string; url: URL; table: string | null; body: unknown; headers: Headers };
export type WireOpts = {
  tables?: Record<string, Row[]>;
  /** Primary / unique key per table, used by upserts without on_conflict and to reject duplicate inserts. */
  keys?: Record<string, string[]>;
  /** Column defaults the database would generate on insert (e.g. clones.id). Nothing is generated otherwise. */
  defaults?: Record<string, () => Row>;
  rpc?: Record<string, (args: Record<string, unknown>) => unknown>;
  /** Bot API method -> response body. `ok:false` bodies are sent with HTTP error_code (default 400), as Telegram does. */
  telegram?: (method: string, body: Record<string, unknown>) => unknown;
  http?: (url: URL) => Response | undefined;
  override?: (call: Call) => Response | undefined | Promise<Response | undefined>;
};

const noNetwork = (async (input: RequestInfo | URL) => {
  throw new Error(`fake wire: network after restore (${typeof input === "string" ? input : input instanceof URL ? input.href : input.url})`);
}) as typeof fetch;
globalThis.fetch = noNetwork; // nothing in a test process reaches the network, wire installed or not

const json = (v: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(v === undefined ? null : JSON.stringify(v), { status, headers: { "content-type": "application/json", ...extra } });

class Unmodelled extends Error {}

function cmp(a: unknown, b: string): number {
  const na = Number(a), nb = Number(b);
  if (typeof a !== "boolean" && a !== "" && b !== "" && Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  const sa = String(a);
  return sa < b ? -1 : sa > b ? 1 : 0;
}

/** Splits on top-level commas, ignoring commas inside (...) and "...". */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, quoted = false, cur = "";
  for (const ch of s) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === "(") depth++;
    if (!quoted && ch === ")") depth--;
    if (!quoted && ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}
const unquote = (s: string) => s.replace(/^"(.*)"$/, "$1");
const inner = (s: string) => s.slice(s.indexOf("(") + 1, s.lastIndexOf(")"));

/** One PostgREST operator expression ("eq.5", "not.in.(a,b)", "cs.{...}") against one column value. */
function evalExpr(v: unknown, expr: string): boolean {
  if (expr.startsWith("not.")) return !evalExpr(v, expr.slice(4));
  const dot = expr.indexOf(".");
  const op = dot < 0 ? expr : expr.slice(0, dot), val = expr.slice(dot + 1);
  const present = v !== null && v !== undefined;
  switch (op) {
    case "eq": return present && String(v) === unquote(val);
    case "neq": return present && String(v) !== unquote(val);
    case "gt": return present && cmp(v, unquote(val)) > 0;
    case "gte": return present && cmp(v, unquote(val)) >= 0;
    case "lt": return present && cmp(v, unquote(val)) < 0;
    case "lte": return present && cmp(v, unquote(val)) <= 0;
    case "is":
      if (val === "null") return !present;
      if (val === "true" || val === "false") return v === (val === "true");
      throw new Unmodelled(`is.${val}`);
    case "in": return present && splitTop(inner(val)).map(unquote).includes(String(v));
    case "like":
    case "ilike": {
      const re = new RegExp("^" + unquote(val).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[%*]/g, ".*").replace(/_/g, ".") + "$", op === "ilike" ? "i" : "");
      return present && re.test(String(v));
    }
    case "cs": {
      let want: unknown;
      try { want = JSON.parse(val); } catch { want = undefined; }
      if (want && typeof want === "object" && !Array.isArray(want)) {
        const have = (v && typeof v === "object" ? v : {}) as Row;
        return Object.entries(want as Row).every(([k, x]) => JSON.stringify(have[k]) === JSON.stringify(x));
      }
      if (/^\{.*\}$/.test(val) && Array.isArray(v)) return splitTop(val.slice(1, -1)).map(unquote).every((x) => v.map(String).includes(x));
      throw new Unmodelled(`cs.${val}`);
    }
    default: throw new Unmodelled(op);
  }
}

/** A logic-tree term inside or=(...) / and=(...): "col.op.val", "and(...)", "or(...)", "not.and(...)". */
function evalTerm(row: Row, term: string): boolean {
  const logic = /^(not\.)?(and|or)\(/.exec(term);
  if (logic) {
    const terms = splitTop(inner(term));
    const r = logic[2] === "and" ? terms.every((t) => evalTerm(row, t)) : terms.some((t) => evalTerm(row, t));
    return logic[1] ? !r : r;
  }
  const dot = term.indexOf(".");
  if (dot < 0) throw new Unmodelled(term);
  return evalExpr(row[term.slice(0, dot)], term.slice(dot + 1));
}

const NON_FILTER = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

/** The one row matcher, used for reads, counts, updates and deletes. */
function matches(row: Row, url: URL): boolean {
  return [...url.searchParams].every(([k, v]) => {
    if (NON_FILTER.has(k)) return true;
    const logic = /^(not\.)?(and|or)$/.exec(k);
    if (logic) return evalTerm(row, `${logic[1] ?? ""}${logic[2]}${v}`);
    return evalExpr(row[k], v);
  });
}

function ordered(rows: Row[], url: URL): Row[] {
  const order = url.searchParams.get("order");
  if (!order) return rows;
  const keys = order.split(",").map((o) => {
    const [col, ...mods] = o.split(".");
    const desc = mods.includes("desc");
    return { col, desc, nullsFirst: mods.includes("nullsfirst") ? true : mods.includes("nullslast") ? false : desc };
  });
  return [...rows].sort((a, b) => {
    for (const k of keys) {
      const an = a[k.col] == null, bn = b[k.col] == null;
      if (an || bn) { if (an && bn) continue; return (an ? -1 : 1) * (k.nullsFirst ? 1 : -1); }
      const c = cmp(a[k.col], String(b[k.col]));
      if (c !== 0) return k.desc ? -c : c;
    }
    return 0;
  });
}

function project(row: Row, select: string | null): Row {
  if (!select || select === "*") return { ...row };
  const out: Row = {};
  for (const raw of splitTop(select)) {
    if (raw.includes("(")) throw new Unmodelled("embed");
    if (raw === "*") { Object.assign(out, row); continue; }
    const part = raw.replace(/::[\w ]+/g, "");
    const [alias, col] = part.includes(":") ? part.split(":") : [part, part];
    out[alias] = row[col] ?? null;
  }
  return out;
}

async function readBody(input: RequestInfo | URL, init?: RequestInit): Promise<unknown> {
  const b = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
  if (b == null) return undefined;
  if (typeof b === "string") { try { return JSON.parse(b); } catch { return b; } }
  if (b instanceof FormData) { const o: Record<string, unknown> = {}; for (const [k, v] of b) o[k] = typeof v === "string" ? v : `<file ${v.size}b>`; return o; }
  return "<binary>";
}

export function installWire(opts: WireOpts = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [t, rows] of Object.entries(opts.tables ?? {})) tables[t] = rows.map((r) => ({ ...r }));
  const calls: Call[] = [];
  let pending = 0;

  async function handle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const body = await readBody(input, init);
    const rest = url.origin === FAKE_SUPABASE && url.pathname.startsWith("/rest/v1/") ? url.pathname.slice("/rest/v1/".length) : null;
    const call: Call = { method, url, table: rest, body, headers };
    calls.push(call);
    const o = await opts.override?.(call);
    if (o) return o;
    if (url.hostname === "api.telegram.org") {
      const m = url.pathname.split("/").pop() ?? "";
      const r = (opts.telegram?.(m, (body ?? {}) as Record<string, unknown>)
        ?? { ok: false, error_code: 400, description: `Bad Request: fake telegram method ${m} not modelled` }) as { ok?: boolean; error_code?: number };
      return json(r, r.ok === false ? (r.error_code ?? 400) : 200);
    }
    if (url.origin !== FAKE_SUPABASE) return opts.http?.(url) ?? json({ error: `fake wire: no route to ${url.host}` }, 404);
    if (!rest) return json({ statusCode: "400", error: "fake", message: `fake wire: ${url.pathname} not modelled` }, 400);
    if (rest.startsWith("rpc/")) {
      const fn = rest.slice(4), h = opts.rpc?.[fn];
      return h ? json(h((body ?? {}) as Record<string, unknown>)) : json({ code: "PGRST202", message: `fake: rpc ${fn} not modelled` }, 404);
    }
    const t = (tables[rest] ??= []);
    const single = (headers.get("accept") ?? "").includes("vnd.pgrst.object");
    const prefer = headers.get("prefer") ?? "";
    const select = url.searchParams.get("select");
    const respond = (rows: Row[], total: number, status: number, offset = 0) => {
      const projected = rows.map((r) => project(r, select));
      const range = { "content-range": `${projected.length ? `${offset}-${offset + projected.length - 1}` : "*"}/${prefer.includes("count=") ? total : "*"}` };
      if (method === "HEAD") return new Response(null, { status, headers: range });
      if (single) return projected.length === 1 ? json(projected[0], status, range)
        : json({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `${projected.length} rows` }, 406);
      if (method !== "GET" && !prefer.includes("return=representation")) return new Response(null, { status: status === 200 ? 204 : status });
      return json(projected, status, range);
    };
    try {
      if (method === "GET" || method === "HEAD") {
        const hit = ordered(t.filter((r) => matches(r, url)), url);
        const offset = Number(url.searchParams.get("offset") ?? 0), limit = url.searchParams.get("limit");
        return respond(hit.slice(offset, limit === null ? undefined : offset + Number(limit)), hit.length, 200, offset);
      }
      if (method === "POST") {
        const items = (Array.isArray(body) ? body : [body]) as Row[];
        const resolution = /resolution=(merge|ignore)-duplicates/.exec(prefer)?.[1];
        const onConflict = (url.searchParams.get("on_conflict") ?? "").split(",").filter(Boolean);
        const keys = onConflict.length ? onConflict : opts.keys?.[rest];
        if (resolution && !keys) return json({ code: "PGRST100", message: `fake: upsert on ${rest} needs on_conflict or WireOpts.keys` }, 400);
        const out: Row[] = [];
        for (const item of items) {
          const row = { ...(opts.defaults?.[rest]?.() ?? {}), ...item };
          const existing = keys ? t.find((r) => keys.every((k) => r[k] !== undefined && r[k] === row[k])) : undefined;
          if (existing && !resolution) return json({ code: "23505", message: `duplicate key value violates unique constraint on ${rest}` }, 409);
          if (existing && resolution === "ignore") continue;
          if (existing) { Object.assign(existing, item); out.push(existing); continue; }
          t.push(row); out.push(row);
        }
        return respond(out, out.length, 201);
      }
      if (method === "PATCH") {
        const hit = t.filter((r) => matches(r, url));
        for (const r of hit) Object.assign(r, body as Row);
        return respond(hit, hit.length, 200);
      }
      if (method === "DELETE") {
        const hit = t.filter((r) => matches(r, url));
        tables[rest] = t.filter((r) => !hit.includes(r));
        return respond(hit, hit.length, 200);
      }
      return json({ code: "PGRST100", message: `fake: method ${method} not modelled` }, 405);
    } catch (e) {
      if (e instanceof Unmodelled) return json({ code: "PGRST100", message: `fake: ${e.message} not modelled` }, 400);
      throw e;
    }
  }

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    pending++;
    try { return await handle(input, init); } finally { pending--; }
  }) as typeof fetch;

  return {
    calls,
    tables,
    /** Back to "no network": any later fetch throws. */
    restore: () => { globalThis.fetch = noNetwork; },
    /** Resolves once no fake request is in flight and none has started for several event-loop turns, so
     *  fire-and-forget writes (logAdminWrite, logActAs) have landed before a test inspects `calls`. */
    idle: async () => {
      let quiet = 0, seen = calls.length;
      for (let i = 0; quiet < 5; i++) {
        if (i > 5000) throw new Error("fake wire: never went idle");
        await new Promise((r) => setImmediate(r));
        if (pending === 0 && calls.length === seen) quiet++;
        else { quiet = 0; seen = calls.length; }
      }
    },
    rest: (table: string, method?: string) => calls.filter((c) => c.table === table && (!method || c.method === method)),
    telegram: (m?: string) => calls.filter((c) => c.url.hostname === "api.telegram.org" && (!m || c.url.pathname.endsWith(`/${m}`))),
  };
}
export type Wire = ReturnType<typeof installWire>;

/** A Request that passes both admin gates: the fake key, no XFF, Host localhost (lib/api-auth.ts checkNetwork). */
export function adminRequest(path: string, init: { method?: string; json?: unknown; form?: FormData; headers?: Record<string, string> } = {}): Request {
  const headers: Record<string, string> = { authorization: `Bearer ${FAKE_ADMIN_KEY}`, host: "localhost", ...init.headers };
  if (init.json !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost${path}`, {
    method: init.method ?? (init.json !== undefined || init.form ? "POST" : "GET"),
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.form,
  });
}

type Handler = (req: Request) => Response | Promise<Response>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JsonBody = any;
/** Calls a route handler and parses its JSON body (null for an empty body). */
export async function callJson(handler: Handler, req: Request): Promise<{ status: number; body: JsonBody }> {
  const res = await handler(req);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

/** Runs a handler inside a minimal Next work store, as Next does for every route request, so server actions
 *  that call revalidatePath/revalidateTag (createCloneRow, uploadPhoto) behave as they do when served. */
export function inNextRoute<T>(route: string, fn: () => T): T {
  const { workAsyncStorage } = nodeModule.createRequire(import.meta.url)("next/dist/server/app-render/work-async-storage.external.js");
  return workAsyncStorage.run({ route, incrementalCache: {} } as never, fn);
}

/** The revenue rollup RPCs (lib/rollup.ts, migration 120) answering "no rows", so getAnalytics runs on the ledger alone. */
export const EMPTY_ROLLUP_RPCS: Record<string, () => unknown> = {
  ...Object.fromEntries(["revenue_usage_rollup", "revenue_clone_user_stats", "revenue_clone_user_stats_window", "revenue_fan_spend_stats",
    "revenue_fan_tiers", "revenue_conversation_funnel", "revenue_paywall_stats", "revenue_active_chat_buyers"].map((f) => [f, () => []])),
  revenue_messaged_fans: () => 0,
  revenue_all_time_stars: () => 0,
};

export const CLONE_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_CLONE_ID = "22222222-2222-4222-8222-222222222222";
export const AGENCY_ID = "abababab-abab-4bab-8bab-abababababab";
export const fakeClone = (extra: Row = {}): Row => ({ id: CLONE_ID, slug: "fake-clone", name: "Fake Clone", status: "active", bot_token: "123456:" + "x".repeat(20), ...extra });

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const sale = (id: string, cloneId: string, stars: number) =>
  ({ id, clone_id: cloneId, amount_stars: stars, paid_at: daysAgo(1), kind: "photo", feature: "photo", telegram_id: 5, invoice_payload: `fake-payload-${id}`, imported_from: null });

/** Wire for GET /api/admin/v1/act-as/revenue: one 1000-star sale on CLONE_ID, which AGENCY_ID owns. Options add the
 *  cuts (platform / agency-creator %), a second clone the agency does NOT own with its own 500-star sale, and an AI
 *  cost row from the usage rollup (so a leak of cost would have a value to leak). */
export function actAsWire(o: { platformCutPct?: number; agencyCreatorCutPct?: number; otherClone?: boolean; costRollup?: boolean } = {}): WireOpts {
  return {
    tables: {
      clones: [fakeClone({ created_at: "2026-01-01T00:00:00Z" }),
        ...(o.otherClone ? [fakeClone({ id: OTHER_CLONE_ID, slug: "other-clone", name: "Other Clone", created_at: "2026-01-02T00:00:00Z" })] : [])],
      star_transactions: [sale("t1", CLONE_ID, 1000), ...(o.otherClone ? [sale("t2", OTHER_CLONE_ID, 500)] : [])],
      platform_cuts: o.platformCutPct == null ? [] : [{ clone_id: CLONE_ID, cut_pct: o.platformCutPct }],
      agency_creator_cuts: o.agencyCreatorCutPct == null ? [] : [{ clone_id: CLONE_ID, cut_pct: o.agencyCreatorCutPct }],
      partner_agencies: [{ id: AGENCY_ID, name: "Fake Agency", active: true }],
      agency_creators: [{ agency_id: AGENCY_ID, clone_id: CLONE_ID }],
      chat_history: [],
      usage_events: o.costRollup ? [{ id: "e1", clone_id: CLONE_ID, cost_usd: 3.5, created_at: new Date().toISOString() }] : [],
    },
    rpc: o.costRollup ? { ...EMPTY_ROLLUP_RPCS, revenue_usage_rollup: () => [{ clone_id: CLONE_ID, cost_usd: 3.5, events: 1 }] } : EMPTY_ROLLUP_RPCS,
  };
}
