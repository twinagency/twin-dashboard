// Shared wire fakes for the G19 route tests (tests/rules/G19-*.test.ts). Not a test file: the name must never match *.test.*.
//
// Only the wire is faked: globalThis.fetch answers PostgREST / Storage / Telegram / OpenRouter / FX shapes from a
// per-test responder and records every call. The routes and libs under test run unmodified. Any request the responder
// does not answer is recorded in `unexpected` and rejected; withWire asserts `unexpected` is empty after every request.
// Nothing here reaches a network, a database or localhost: Supabase points at a reserved .invalid host.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { withDashboardAccess, type DashboardAccess } from "../../lib/dashboard-access";
import type { AgencyIdentity } from "../../lib/agency-identity";
import type { CreatorDashboardIdentity } from "../../lib/creator-dashboard-identity";
import { hashKey } from "../../lib/api-tenant";

process.env.SUPABASE_URL = "https://supabase.invalid";
// Fixture markers, not credentials. No code path under test validates the format of either value.
process.env.SUPABASE_SERVICE_KEY = "TEST-FIXTURE-NOT-A-SECRET-service-key";

export const SUPABASE_HOST = "supabase.invalid";
export const TELEGRAM_HOST = "api.telegram.org";
// Telegram token shape (<id>:<secret>) on purpose; no route under test checks the format, the colon is just realism.
export const BOT_TOKEN = "0:TEST_FIXTURE_NOT_A_TOKEN";
// UUID-shaped on purpose: the agency transport (lib/agency-query.ts scopeReadUrl) refuses non-UUID clone ids, which
// would make every agency read fail for the wrong reason.
export const CLONE_A = "0aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const CLONE_B = "0bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const AGENCY_ID = "0ccccccc-cccc-4ccc-8ccc-cccccccccccc";

// ── identities ───────────────────────────────────────────────────────────────

/** A read-only agency login assigned exactly `cloneIds`. */
export const agency = (cloneIds: string[] = [CLONE_A]): AgencyIdentity =>
  ({ id: AGENCY_ID, name: "Synthetic Agency", cloneIds });

/** A creator login linked to `cloneIds`, in the exact shape lib/creator-dashboard-identity.ts:12 builds. */
export const creator = (cloneIds: string[] = [CLONE_A]): CreatorDashboardIdentity => ({
  id: "0ddddddd-dddd-4ddd-8ddd-dddddddddddd", name: "Synthetic Creator", cloneIds, kind: "creator",
  accountId: "0ddddddd-dddd-4ddd-8ddd-dddddddddddd", userId: "0eeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  creatorName: "Synthetic Creator", onboarded: true, readOnly: false, agencyId: null,
} satisfies CreatorDashboardIdentity);

/**
 * Runs `fn` under a dashboard identity (null = internal admin) by injecting it straight into the AsyncLocalStorage
 * lib/dashboard-access.ts reads. This BYPASSES cookie, session and middleware resolution entirely: tests using it
 * (including C1/C2) prove the downstream ownership checks for a given identity, not that a request's session is bound
 * to the right identity.
 */
export const as = <T>(access: DashboardAccess, fn: () => T): T => withDashboardAccess(access, fn);

// ── the fetch stub ───────────────────────────────────────────────────────────

export type Call = { method: string; url: URL; body: string | null; headers: Headers };
export type Responder = (call: Call) => Response | undefined | Promise<Response | undefined>;

export type FetchStub = {
  calls: Call[];
  unexpected: string[];
  /** Calls whose host is `host` (and whose path matches `path`, when given). */
  to(host: string, path?: RegExp): Call[];
  restore(): void;
};

/** Replaces globalThis.fetch until restore(). Throwing from `answer` simulates a network failure. */
export function stubFetch(answer: Responder): FetchStub {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  const unexpected: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const body = typeof init?.body === "string" ? init.body : null;
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const call = { method, url, body, headers };
    calls.push(call);
    const res = await answer(call);
    if (!res) {
      unexpected.push(`${method} ${url.href}`);
      throw new Error(`UNEXPECTED FETCH in test stub: ${method} ${url.href}`);
    }
    return res;
  }) as typeof fetch;
  return {
    calls,
    unexpected,
    to: (host, path) => calls.filter(c => c.url.hostname === host && (!path || path.test(c.url.pathname))),
    restore: () => { globalThis.fetch = original; },
  };
}

/** The first responder that answers wins. */
export const anyOf = (...responders: Responder[]): Responder => async call => {
  for (const r of responders) { const res = await r(call); if (res) return res; }
  return undefined;
};

/**
 * Installs `responder`, runs `fn`, lets fire-and-forget work (last_used_at PATCH, system_logs insert) settle inside the
 * stub, asserts nothing unexpected was fetched, and restores the real fetch, whatever `fn` did.
 */
export async function withWire<T>(responder: Responder, fn: (stub: FetchStub) => Promise<T>): Promise<T> {
  const stub = stubFetch(responder);
  try {
    const out = await fn(stub);
    await new Promise(r => setImmediate(r));
    assert.deepEqual(stub.unexpected, [], "a request reached the wire that the test does not answer");
    return out;
  } finally { stub.restore(); }
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

/** A PostgREST error body (500 is not in postgrest-js's retry list, so it answers once). */
export const pgError = (status = 500) =>
  json({ code: "XX000", message: "synthetic database failure", details: null, hint: null }, status);

// ── PostgREST ────────────────────────────────────────────────────────────────

/** True when the call is a PostgREST request for `table`, carrying every given filter (e.g. { id: `eq.${id}` }). */
export const isRest = (c: Call, table: string, filters: Record<string, string> = {}) =>
  c.url.hostname === SUPABASE_HOST && c.url.pathname === `/rest/v1/${table}`
  && Object.entries(filters).every(([k, v]) => c.url.searchParams.getAll(k).includes(v));

/** True when the call's select list names `column` (or is `*`), however the rest of the list is written. */
export const selects = (c: Call, column: string) => {
  const select = c.url.searchParams.get("select") ?? "*";
  return select === "*" || splitTop(select).map(s => s.trim()).includes(column);
};

type Row = Record<string, unknown>;
const NON_FILTERS = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);
/** Splits on commas outside parentheses, braces and double quotes. */
function splitTop(s: string): string[] {
  const out: string[] = []; let depth = 0, quoted = false, cur = "";
  for (const ch of s) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && (ch === "(" || ch === "{")) depth++;
    if (!quoted && (ch === ")" || ch === "}")) depth--;
    if (!quoted && depth === 0 && ch === ",") { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}
const unquote = (v: string) => v.replace(/^"(.*)"$/, "$1");
/** One PostgREST condition on one row; null = an operator this fake does not support. */
function matches(row: Row, column: string, condition: string): boolean | null {
  if (condition.startsWith("not.")) { const m = matches(row, column, condition.slice(4)); return m === null ? null : !m; }
  const value = row[column];
  if (condition.startsWith("eq.")) return value != null && String(value) === condition.slice(3);
  if (condition === "is.null") return value == null;
  if (condition.startsWith("in.(") && condition.endsWith(")")) return value != null && splitTop(condition.slice(4, -1)).map(unquote).includes(String(value));
  if (condition.startsWith("cs.")) {
    let want: Row;
    try { want = JSON.parse(condition.slice(3)) as Row; } catch { return null; } // array/range literals: unsupported
    if (!want || typeof want !== "object" || Array.isArray(want)) return null;
    return !!value && typeof value === "object" && Object.entries(want).every(([k, v]) => (value as Row)[k] === v);
  }
  return null;
}
/** A flat select list projects the row; an embedded select (with parentheses) or * returns the stored row whole. */
function project(row: Row, select: string | null): Row {
  if (!select || select === "*" || select.includes("(")) return row;
  return Object.fromEntries(select.split(",").map(c => c.trim()).map(c => [c, row[c]]));
}
/**
 * Answers a PostgREST GET from in-memory `rows`: applies every eq / in / is / not / cs filter in the query string
 * (including the `and=(col.op.value,...)` the agency transport appends), then `offset` and `limit`, projects a flat
 * select list, and honours the single-object Accept header (`application/vnd.pgrst.object+json`: exactly one row is
 * answered as an object, 0 or many as 406 PGRST116). `order` is not applied: callers pass rows already in order.
 * An unsupported filter answers undefined (recorded as unexpected), never "match everything".
 */
export function table(rows: Row[], call: Call): Response | undefined {
  let out = rows;
  for (const [key, condition] of call.url.searchParams) {
    if (NON_FILTERS.has(key)) continue;
    const parts = key === "and" && condition.startsWith("(") && condition.endsWith(")")
      ? splitTop(condition.slice(1, -1)).map(p => { const dot = p.indexOf("."); return [p.slice(0, dot), p.slice(dot + 1)] as const; })
      : [[key, condition] as const];
    for (const [column, cond] of parts) {
      if (matches({}, column, cond) === null) return undefined;
      out = out.filter(r => matches(r, column, cond));
    }
  }
  const offset = Number(call.url.searchParams.get("offset") ?? 0);
  const limit = call.url.searchParams.get("limit");
  out = out.slice(offset, limit == null ? undefined : offset + Number(limit)).map(r => project(r, call.url.searchParams.get("select")));
  if ((call.headers.get("accept") ?? "").includes("application/vnd.pgrst.object+json")) {
    return out.length === 1 ? json(out[0])
      : json({ code: "PGRST116", details: `The result contains ${out.length} rows`, hint: null, message: "JSON object requested, multiple (or no) rows returned" }, 406);
  }
  return json(out);
}

/** The service-role bot_token read lib/clone-credentials.ts cloneBotToken makes, for the given clone(s), all with `token`. */
export const botTokenRead = (clones: string | string[], token = BOT_TOKEN): Responder => c =>
  isRest(c, "clones") && c.method === "GET" && selects(c, "bot_token")
    ? table([clones].flat().map(id => ({ id, bot_token: token })), c) : undefined;

/**
 * The public-API key wire withModelKey touches (lib/api-tenant.ts): the api_keys lookup by sha256 for `key` (any other
 * presented key finds nothing), the fire-and-forget last_used_at PATCH, and the system_logs insert on a denial.
 * withWire settles the fire-and-forget calls.
 */
export const modelKeyWire = (key: string, row: { id: string; clone_id: string | null; scope: string; label: string }): Responder => c => {
  if (isRest(c, "api_keys") && c.method === "GET") return table([{ ...row, key_hash: hashKey(key), revoked_at: null }], c);
  if (isRest(c, "api_keys") && c.method === "PATCH") return new Response(null, { status: 204 });
  if (isRest(c, "system_logs") && c.method === "POST") return new Response(null, { status: 201 });
  return undefined;
};

// ── Telegram / Storage ───────────────────────────────────────────────────────

/** True when the call is a Telegram Bot API request for `method` (e.g. "getFile"). */
export const isTelegram = (c: Call, method: string) => c.url.hostname === TELEGRAM_HOST && c.url.pathname.endsWith(`/${method}`);

/** A healthy Telegram for a voice note: getFile answers a file_path, the file download answers `bytes`. */
export const telegramFile = (bytes: Uint8Array): Responder => c => {
  if (isTelegram(c, "getFile")) return json({ ok: true, result: { file_id: c.url.searchParams.get("file_id"), file_path: `voice/${c.url.searchParams.get("file_id")}.oga` } });
  if (c.url.hostname === TELEGRAM_HOST && /^\/file\/bot[^/]+\/voice\//.test(c.url.pathname)) return new Response(bytes as Uint8Array<ArrayBuffer>, { status: 200, headers: { "content-type": "application/octet-stream" } });
  return undefined;
};

export const SIGN_PATH = /^\/storage\/v1\/object\/sign\//;

// ── modules ──────────────────────────────────────────────────────────────────

const requireHere = createRequire(import.meta.url);
/**
 * A fresh instance of a route module (repo-relative path), for routes with a module-level cache. tsx loads the repo's
 * .ts files as CommonJS, so the module is dropped from require.cache and loaded again; its dependencies stay shared.
 */
export function freshModule<T>(repoPath: string): T {
  const file = requireHere.resolve(`../../${repoPath}`);
  delete requireHere.cache[file];
  return requireHere(file) as T;
}

/**
 * Loads a route module that a valid fix may delete (repo-relative path, no extension). null ONLY when the route file
 * itself does not resolve; once it resolves it is required with no catch, so a broken import inside the route fails
 * the test loudly instead of reading as "route deleted". The specifier is not a literal, so tsc does not resolve it.
 */
export function optionalModule<T>(repoPath: string): T | null {
  let file: string;
  try { file = requireHere.resolve(`../../${repoPath}`); } catch { return null; }
  return requireHere(file) as T;
}
