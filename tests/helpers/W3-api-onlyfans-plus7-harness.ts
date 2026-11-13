// W3 lane api-onlyfans-plus7 shared route harness. Drives the REAL route handlers under app/api/onlyfans*/** offline over a fake wire.
// Shape copied from rwl/W1-app-onlyfans-content-config:tests/helpers/w1-content-config-route-harness.ts (not imported across branches).
// Replaced (module mocks, every one declared here; a test file may add more and must declare them in its own header):
//  - `lib/onlyfans/route.ts`: it cannot be imported for real offline (plan-c-owner is server-only, the session stack reads cookies and
//    Supabase). The mock carries route.ts's full runtime export surface; requestId/denialResponse/readResponse/badRequest are verbatim
//    copies, and requireOnlyFansRead keeps route.ts's capability arithmetic verbatim (canManage/canChat from the grant, the write gate).
//    `routeMockDrift()` reads route.ts's source and reports export, requestId-pattern or capability-line drift; `call()` asserts it
//    before a route is imported, so drift is an ERR_ASSERTION, never a link crash. The identity it returns is `state.identity`:
//    the internal operator (no grant, actor `op-session:sha256(session cookie)`, exactly as route.ts derives it) unless a test sets a grant.
//    With a grant, its transport is the REAL `agencyScopedFetch(grant, configuredBackendPurpose("API"), fetch)` (route.ts:68-71,76; 503
//    agency_unavailable when no API purpose), so agency requests take the real /onlyfans/agency/v1 path, preflight and chat path rule.
//    Not mirrored: route.ts:52-53 deriving the grant from the agency identity; a test sets the derived grant directly.
//    Its backend is the REAL `configuredOnlyFansBackend(transport)` over the fake wire unless a test sets `state.backend`.
//  - `next/headers`: no Next request scope offline. cookies() returns `state.session` as the dashboard session cookie.
//  - `server-only`: an empty `server-only` package on a throwaway NODE_PATH dir (Next's bundler makes it a no-op; it is not installed here).
//  - `lib/supabase-service.ts`: serviceClient() returns `state.db` (a test's in-memory fake) and throws when none is set.
// Real: every route handler, lib/onlyfans-connections/*, lib/onlyfans/connection-creators.ts, vault-route.ts, every backend factory,
// lib/session.ts verifySessionToken (the cookie is a real non-production session minted by signSession() with a synthetic secret),
// lib/form-origin.ts, lib/dashboard-access.ts (`call()` runs the handler inside withDashboardAccess(state.access)).
// Wire: globalThis.fetch is a recording stub. Only https://backend.invalid (OnlyFans backend, every purpose),
// https://signin.invalid (sign-in service) and https://supabase.invalid (SUPABASE_URL, e.g. signed storage URLs) answer, through
// `upstream(responder)`; any other URL throws and is recorded as `stray`.
// The wire plays an agency-capable service under /onlyfans/agency/v1/: it answers the preflight (PREFLIGHT, bearer = the API token,
// scope header required) itself, and stamps X-OnlyFans-Access-Version (v2 when the scope JSON has canChat, else v1) on every scoped
// answer from the responder. Preflights are recorded in `calls` like any other wire call; `servicePath(call)` strips the agency prefix.
// Declared limit: that stamp mirrors the client's own version rule (lib/onlyfans/agency-scope.ts:20, canChat present -> v2, else v1),
// so the fake service always agrees with the dashboard and a client/server access-version mismatch cannot be caught here; it is
// LIVE-CHECK territory (the real agency service's answer to a scoped preflight).
// Env (restored after the file): one distinct synthetic token per purpose (a shared token reads as unconfigured), DASHBOARD_PUBLIC_ORIGIN
// = ORIGIN so trustedFormOrigin accepts our Origin, DASHBOARD_SESSION_SECRET synthetic. Synthetic values only; every token and the
// session secret is generated per run (`t-<randomUUID>`, 38 chars, so the 32-char minimums hold), so nothing token shaped is committed.
// Module mocks need --experimental-test-module-mocks; `ensureModuleMocks` re-runs the file with it when absent (W1 pattern).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, join } from "node:path";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import test, { after, mock } from "node:test";
import { NextRequest, NextResponse } from "next/server";
import { AGENCY_ACCESS_HEADER, AGENCY_ACCESS_VERSION, AGENCY_CHAT_ACCESS_VERSION, AGENCY_SCOPE_HEADER, agencyScopedFetch } from "../../lib/onlyfans/agency-scope";
import { configuredBackendPurpose } from "../../lib/onlyfans/backend-transport";

export const ORIGIN = "http://dash.test";
export const BACKEND = "https://backend.invalid";
export const SIGNIN = "https://signin.invalid";
export const SUPABASE = "https://supabase.invalid";

export type Call = { url: string; path: string; method: string; headers: Headers; body: unknown; signal: AbortSignal | null };
export type Responder = (call: Call) => Response | Promise<Response>;
type Grant = { creatorIds: string[]; actor: string; canManage: boolean; canChat?: boolean };
type Identity = { grant: Grant | null };

/** Mutable per-test state. `reset()` puts it back to the internal operator with no fakes. */
export const state: { identity: Identity; session: string | undefined; backend: unknown; db: unknown; access: unknown } =
  { identity: { grant: null }, session: undefined, backend: undefined, db: undefined, access: null };
/** The internal operator's actor for the current session cookie, derived exactly as route.ts does (valid after the first `call`). */
export const operatorActor = () => `op-session:${createHash("sha256").update(state.session ?? "").digest("hex")}`;
export function reset() { state.identity = { grant: null }; state.backend = undefined; state.db = undefined; state.access = null; upstream(); }

// ── Fake wire ──
export const calls: Call[] = [];
export const stray: string[] = [];
let respond: Responder = () => Response.json({}, { status: 200 });
/** Sets what the fake backend answers and clears the call log. */
export function upstream(responder: Responder = () => Response.json({}, { status: 200 })) { respond = responder; calls.length = 0; stray.length = 0; }
const AGENCY_PREFIX = "/onlyfans/agency/v1/";
/** The agency transport's preflight path (lib/onlyfans/agency-scope.ts agencyScopedFetch). */
export const PREFLIGHT = AGENCY_PREFIX + "api/v1/status";
/** The service path a scoped call stands for: `/onlyfans/agency/v1/x` -> `/onlyfans/x`; unscoped paths unchanged. */
export const servicePath = (c: Call) => c.path.startsWith(AGENCY_PREFIX) ? "/onlyfans/" + c.path.slice(AGENCY_PREFIX.length) : c.path;
async function agencyService(call: Call): Promise<Response> {
  const scope = call.headers.get(AGENCY_SCOPE_HEADER);
  let version: string | null = null;
  try { version = Object.hasOwn(JSON.parse(scope ?? "") as object, "canChat") ? AGENCY_CHAT_ACCESS_VERSION : AGENCY_ACCESS_VERSION; } catch { /* unscoped */ }
  if (!version) return Response.json({ ok: false, code: "agency_scope_required" }, { status: 403 });
  if (call.path === PREFLIGHT) return call.headers.get("authorization") === `Bearer ${process.env.ONLYFANS_API_TOKEN}`
    ? Response.json({ ok: true }, { headers: { [AGENCY_ACCESS_HEADER]: version } }) : Response.json({ ok: false }, { status: 401 });
  const answer = await respond(call);
  const headers = new Headers(answer.headers); headers.set(AGENCY_ACCESS_HEADER, version);
  return new Response(answer.body, { status: answer.status, statusText: answer.statusText, headers });
}
const recordingFetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = String(input);
  if (![BACKEND, SIGNIN, SUPABASE].some(origin => url.startsWith(origin + "/"))) { stray.push(url); throw new TypeError("harness: no network outside the fake wire"); }
  const raw = init.body;
  let body: unknown = null;
  if (typeof raw === "string") { try { body = JSON.parse(raw); } catch { body = raw; } } else if (raw != null) body = raw;
  const call: Call = { url, path: new URL(url).pathname, method: init.method ?? "GET", headers: new Headers(init.headers), body, signal: init.signal ?? null };
  calls.push(call);
  return url.startsWith(BACKEND + AGENCY_PREFIX) ? agencyService(call) : respond(call);
}) as typeof fetch;

// ── route.ts mock (verbatim copies; keep in step with lib/onlyfans/route.ts) ──
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Data-Mode": "live" } as const;
export const REQUEST_ID = /^[A-Za-z0-9._:-]{1,64}$/;
type Denial = { ok: false; status: number; state: string; code: string; error: string };
const denialResponse = (denial: Denial) => NextResponse.json({ ok: false, state: denial.state, code: denial.code, error: denial.error },
  { status: denial.status, headers: PRIVATE_HEADERS });
/** Lines of route.ts's requireOnlyFansRead the mock reproduces; drift if any is gone. */
const CAPABILITY_LINES = [
  "const canManage = grant ? grant.canManage : true;",
  "const canChat = canManage || grant?.canChat === true;",
  'if (options.write && !(options.capability === "chat" ? canChat : canManage)) return { ok: false, status: 403, state: "denied", code: "agency_read_only", error: "Your team access is read-only." };',
  'const purpose = configuredBackendPurpose("API");',
  "const scopedFetch = grant && purpose ? agencyScopedFetch(grant, purpose) : fetch;",
  'if (grant && !purpose) return { ok: false, status: 503, state: "unavailable", code: "agency_unavailable", error: "Scoped agency access is not configured." };',
  'const actor = grant?.actor ?? (token ? `op-session:${createHash("sha256").update(token).digest("hex")}` : null);',
  "return { auth, backend: configuredOnlyFansBackend(scopedFetch), fetch: scopedFetch, actor, pilotActor, canManage, canChat };",
];
let realBackend: ((fetchImpl?: typeof fetch) => unknown) | null = null;
// G05 adaptation: route.ts now splits the gate into authorizeOnlyFansRead (returns the denial) + requireOnlyFansRead (wraps it).
const authorizeOnlyFansRead = async (options: { agency?: boolean; write?: boolean; capability?: "chat" | "manage"; pilotIdentity?: boolean } = {}) => {
  const grant = options.agency ? state.identity.grant : null;
  const canManage = grant ? grant.canManage : true;
  const canChat = canManage || grant?.canChat === true;
  if (options.write && !(options.capability === "chat" ? canChat : canManage)) return { ok: false, status: 403, state: "denied", code: "agency_read_only", error: "Your team access is read-only." };
  const purpose = configuredBackendPurpose("API");
  // route.ts passes no fetchImpl, so agencyScopedFetch's default (the global fetch at call time) is this same wire.
  const scopedFetch = grant && purpose ? agencyScopedFetch(grant, purpose, globalThis.fetch) : globalThis.fetch;
  if (grant && !purpose) return { ok: false, status: 503, state: "unavailable", code: "agency_unavailable", error: "Scoped agency access is not configured." };
  const token = state.session;
  const actor = grant?.actor ?? (token ? `op-session:${createHash("sha256").update(token).digest("hex")}` : null);
  return { auth: { operatorSession: true, agency: !!grant, viewAs: false, ...(grant ? { agencyGrant: grant } : {}) },
    backend: state.backend !== undefined ? state.backend : realBackend!(scopedFetch), fetch: scopedFetch, actor, pilotActor: null, canManage, canChat };
};
const routeMock = {
  authorizeOnlyFansRead,
  PRIVATE_HEADERS,
  denialResponse,
  requireOnlyFansRead: async (options: { agency?: boolean; write?: boolean; capability?: "chat" | "manage"; pilotIdentity?: boolean } = {}) => {
    const ctx = await authorizeOnlyFansRead(options);
    return "ok" in ctx ? denialResponse(ctx as Denial) : ctx;
  },
  readResponse: (result: { ok: boolean; body?: unknown } & Partial<Denial>) => result.ok
    ? NextResponse.json(result.body, { status: 200, headers: PRIVATE_HEADERS }) : denialResponse(result as Denial),
  requestId: (value: string | null | undefined) => { const trimmed = (value ?? "").trim(); return REQUEST_ID.test(trimmed) ? trimmed : null; },
  badRequest: (error: string) => NextResponse.json({ ok: false, state: "error", code: "invalid_request", error }, { status: 400, headers: PRIVATE_HEADERS }),
};

/** Differences between this mock and lib/onlyfans/route.ts (runtime exports, requestId pattern, capability/transport lines) or the session
 * cookie name the next/headers mock reads from lib/session.ts. Empty = in step. */
export function routeMockDrift(): string[] {
  const source = readFileSync(new URL("../../lib/onlyfans/route.ts", import.meta.url), "utf8");
  const exported = [...source.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+(\w+)/gm)].map(m => m[1]).sort();
  const mocked = Object.keys(routeMock).sort();
  const pattern = /export function requestId[\s\S]*?(\/\^[^\n]*?\$\/)\.test/.exec(source)?.[1] ?? "(not found)";
  return [
    ...exported.filter(name => !mocked.includes(name)).map(name => `route.ts exports ${name}, the mock does not`),
    ...mocked.filter(name => !exported.includes(name)).map(name => `the mock exports ${name}, route.ts does not`),
    ...(pattern === String(REQUEST_ID) ? [] : [`requestId pattern ${pattern} != harness ${String(REQUEST_ID)}`]),
    ...CAPABILITY_LINES.filter(line => !source.includes(line)).map(line => `route.ts no longer contains: ${line}`),
    ...(SESSION_COOKIE ? [] : ['lib/session.ts no longer has `export const SESSION_COOKIE = "<name>"`; the next/headers mock cannot name the cookie']),
  ];
}

const OWNED = (k: string) => k.startsWith("ONLYFANS_") || ["DASHBOARD_PUBLIC_ORIGIN", "DASHBOARD_EXTRA_ORIGINS", "DASHBOARD_SESSION_SECRET",
  "DASHBOARD_SERVER_ADMIN_SESSIONS", "SUPABASE_URL"].includes(k);
function install(extra?: () => void) {
  const saved = Object.fromEntries(Object.keys(process.env).filter(OWNED).map(k => [k, process.env[k]]));
  for (const k of Object.keys(process.env).filter(OWNED)) delete process.env[k];
  const t = () => `t-${randomUUID()}`;
  Object.assign(process.env, {
    ONLYFANS_API_BASE_URL: BACKEND, ONLYFANS_API_TOKEN: t(), ONLYFANS_CONTROL_TOKEN: t(),
    ONLYFANS_CONFIGURATION_TOKEN: t(), ONLYFANS_CAMPAIGN_TOKEN: t(),
    ONLYFANS_CONTENT_TOKEN: t(), ONLYFANS_CONNECTION_TOKEN: t(),
    ONLYFANS_SIGNIN_BASE_URL: SIGNIN, ONLYFANS_SIGNIN_TOKEN: t(),
    DASHBOARD_PUBLIC_ORIGIN: ORIGIN, DASHBOARD_SESSION_SECRET: t(), SUPABASE_URL: SUPABASE,
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = recordingFetch;
  // `server-only` is not installed outside Next's bundler (scripts/tsconfig.json maps it to scripts/server-only.ts for the same reason).
  // These .ts files load as CommonJS under tsx, and the test runner's module-mock loader holds its own resolver reference, so the
  // marker is made resolvable instead: a throwaway NODE_PATH dir (os tmpdir, removed after) holding an empty `server-only` package.
  const shim = mkdtempSync(join(tmpdir(), "w3-server-only-"));
  mkdirSync(join(shim, "server-only"));
  writeFileSync(join(shim, "server-only", "index.js"), "// empty marker (Next maps server-only to an empty module on the server)\n");
  const nodePath = process.env.NODE_PATH;
  process.env.NODE_PATH = [shim, nodePath].filter(Boolean).join(delimiter);
  (Module as unknown as { _initPaths: () => void })._initPaths();
  const mocks = [
    mock.module(new URL("../../lib/onlyfans/route.ts", import.meta.url).href, { namedExports: routeMock }),
    mock.module("next/headers", { namedExports: {
      cookies: async () => ({ get: (name: string) => name === SESSION_COOKIE && state.session ? { name, value: state.session } : undefined, getAll: () => [], has: () => false }),
      headers: async () => new Headers(),
    } }),
    mock.module(new URL("../../lib/supabase-service.ts", import.meta.url).href, { namedExports: {
      serviceClient: () => { if (!state.db) throw new Error("harness: no fake db set"); return state.db; },
    } }),
  ];
  extra?.();
  after(() => {
    for (const m of mocks) m.restore();
    if (nodePath === undefined) delete process.env.NODE_PATH; else process.env.NODE_PATH = nodePath;
    (Module as unknown as { _initPaths: () => void })._initPaths();
    rmSync(shim, { recursive: true, force: true });
    globalThis.fetch = originalFetch;
    for (const k of Object.keys(process.env).filter(OWNED)) delete process.env[k];
    Object.assign(process.env, saved);
  });
}
let readied: Promise<void> | undefined;
/** Lazy async setup (no top-level await in these CJS-compiled tests): the real session cookie and the real read backend factory. */
export function ready(): Promise<void> {
  return readied ??= (async () => {
    const { signSession } = await import("../../lib/session");
    ({ configuredOnlyFansBackend: realBackend } = await import("../../lib/onlyfans/backend") as { configuredOnlyFansBackend: (f?: typeof fetch) => unknown });
    state.session = await signSession();
  })();
}
// next/headers mock needs the cookie name before lib/session is imported; it is a plain constant there.
// Not found = drift (routeMockDrift reports it, so `call()` fails on ERR_ASSERTION instead of every session silently reading as absent).
const SESSION_COOKIE: string | null = /export const SESSION_COOKIE = "([^"]+)"/.exec(readFileSync(new URL("../../lib/session.ts", import.meta.url), "utf8"))?.[1] ?? null;

/**
 * Call at the top of a test file: `if (ensureModuleMocks(import.meta.url, { controls, rest })) { ...tests... }`.
 * With module mocks available it installs the mocks above (plus `extra`, which may call mock.module) and returns true. Without
 * (init.sh's plain `node --import tsx --test`), it defines up to two tests that re-run the file under --experimental-test-module-mocks
 * and returns false: "control: …" re-runs `^control` (must all pass, at least `controls`), the other re-runs the rest (must all pass,
 * at least `rest`). A failed re-run fails with ERR_ASSERTION only if the child failed on an assertion; a crash, timeout or vacuous
 * run fails with a plain Error. Copied from the W1 lane 6 harness.
 */
export function ensureModuleMocks(url: string, expected: { controls: number; rest: number }, extra?: () => void): boolean {
  if (typeof mock.module === "function") { install(extra); return true; }
  const file = fileURLToPath(url), name = basename(file);
  const inherited: string[] = [];
  for (let i = 0; i < process.execArgv.length; i++) {
    const arg = process.execArgv[i];
    if (/^(?:--import|--require|-r|--loader|--experimental-loader)$/.test(arg) && i + 1 < process.execArgv.length) inherited.push(arg, process.execArgv[++i]);
    else if (/^(?:--import|--require|--loader|--experimental-loader)=/.test(arg)) inherited.push(arg);
  }
  const rerun = (pattern: string, min: number) => () => {
    const { NODE_TEST_CONTEXT: _context, ...env } = process.env;
    const child = spawnSync(process.execPath, [...inherited, "--experimental-test-module-mocks", "--test", "--test-reporter=spec", pattern, file],
      { env, encoding: "utf8", timeout: 120_000 });
    const out = `${child.stdout ?? ""}${child.stderr ?? ""}`;
    const ran = Number(/^ℹ tests (\d+)/m.exec(out)?.[1] ?? 0), passed = Number(/^ℹ pass (\d+)/m.exec(out)?.[1] ?? 0);
    if (child.status === 0 && ran >= min && passed === ran) return;
    process.stdout.write(out);
    const failed = [...new Set([...out.matchAll(/^\s*✖ (.+?) \(\d/gm)].map(m => m[1]))].join(" | ");
    if (out.includes("ERR_ASSERTION")) throw new assert.AssertionError({ message: `${name} under --experimental-test-module-mocks (${pattern}): ${failed}` });
    throw new Error(`${name} re-run did not assert (status ${child.status}, signal ${child.signal}, tests ${ran}/${min}+, pass ${passed}); output above`);
  };
  if (expected.controls) test(`control: ${name} controls pass under --experimental-test-module-mocks`, rerun("--test-name-pattern=^control", expected.controls));
  if (expected.rest) test(`${name} tests pass under --experimental-test-module-mocks`, rerun("--test-skip-pattern=^control", expected.rest));
  return false;
}

/**
 * Calls a real route handler: `call("onlyfans/accounts/[accountId]/operations", { accountId: "of-a" })`.
 * POST when a body is given (JSON unless `contentType` says otherwise), else `method` (default GET). Same-origin browser headers.
 * Catch-all params are arrays: `{ path: ["a", "b"] }` fills `[...path]` / `[[...path]]` with `a/b`.
 */
export async function call(template: string, params: Record<string, string | string[]>, options: { body?: unknown; query?: string; method?: string;
  headers?: Record<string, string>; contentType?: string } = {}) {
  assert.deepEqual(routeMockDrift(), [], "the route.ts mock no longer matches lib/onlyfans/route.ts; update the harness");
  await ready();
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");
  const mod = await import(new URL(`../../app/api/${template}/route.ts`, import.meta.url).href) as Record<string, unknown>;
  const handler = mod[method] as ((request: NextRequest, context: { params: Promise<Record<string, string | string[]>> }) => Promise<Response>) | undefined;
  assert.ok(handler, `${template} has no ${method} handler`);
  const path = "/api/" + template.replace(/\[\[?(?:\.\.\.)?(\w+)\]?\]/g, (_, key: string) => {
    const value = params[key]; if (value === undefined) return ""; return Array.isArray(value) ? value.join("/") : value;
  }).replace(/\/+$/, "") + (options.query ?? "");
  const headers: Record<string, string> = { "sec-fetch-site": "same-origin", origin: ORIGIN, ...options.headers };
  const body = options.body === undefined ? undefined : typeof options.body === "string" || options.body instanceof Uint8Array ? options.body as BodyInit : JSON.stringify(options.body);
  if (body !== undefined) headers["content-type"] = options.contentType ?? "application/json";
  const request = new NextRequest(ORIGIN + path, { method, headers, ...(body === undefined ? {} : { body }) });
  const { withDashboardAccess } = await import("../../lib/dashboard-access");
  return withDashboardAccess(state.access as never, () => handler(request, { params: Promise.resolve(params) }));
}
