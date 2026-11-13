// G28 support, copied from tests/known-red/W5-app-ai-plus3-harness.ts (origin/jaka/fix-sweep-20261112); only import paths changed.
/**
 * Shared harness for the W5 app-ai-plus3 server-action known-red tests (adapted from the app-actions-plus5 lane harness).
 * Not a test file. Import it FIRST from a test file (it installs the fetch guard before any client exists).
 * Run with `TSX_TSCONFIG_PATH=scripts/tsconfig.json` (the repo's own `server-only` stub mapping, as `tsx --tsconfig scripts/tsconfig.json`).
 *
 * Real server actions; fakes only at the wire:
 * - Network: globalThis.fetch is replaced with a deny-all stub; only the fake Supabase below (127.0.0.1:<port>) is
 *   reachable, anything else throws and is recorded in `blockedFetches`.
 * - Supabase: one HTTP server on 127.0.0.1:<port 0> answers both PostgREST (/rest/v1/*) and Storage (/storage/v1/*).
 *   SUPABASE_URL points at it (serviceClient() is lazy). Every request is recorded; replies come from the per-test
 *   `respond` hook, else `[]` (200). Replies may carry headers (supabase-js reads head+count from `content-range`).
 * - Identity: `asAdmin` uses the repo's own seam `withDashboardAccess(null, ...)` (lib/dashboard-access.ts) for the
 *   non-agency half, and a REAL session token from lib/session.ts `signSession()` under a fake DASHBOARD_SESSION_SECRET
 *   for the `isAuthed()` half (lib/auth.ts -> cookies() -> verifySessionToken).
 * - DECLARED BYPASS (`asAdmin`): Next's workAsyncStorage/workUnitAsyncStorage are entered with a minimal fake
 *   `request` store in phase "action" (cookies jar holding the session cookie, an empty incrementalCache so
 *   revalidatePath() records instead of throwing). Framework internals only; no product module is mocked.
 */
import "./G28-als";
import "../support/server-only-shim";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { workAsyncStorage } from "next/dist/server/app-render/work-async-storage.external";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { RequestCookies } from "next/dist/server/web/spec-extension/cookies";
import { withDashboardAccess } from "../../lib/dashboard-access";
import { SESSION_COOKIE, signSession } from "../../lib/session";

const realFetch = globalThis.fetch;
let fakePort = "";
export const blockedFetches: string[] = [];
globalThis.fetch = (async (input: any, init?: any) => {
  const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (fakePort && u.hostname === "127.0.0.1" && u.port === fakePort) return realFetch(input, init);
  blockedFetches.push(u.origin);
  throw new Error(`blocked in test: ${u.origin}`);
}) as typeof fetch;

export type WireCall = { method: string; path: string; query: URLSearchParams; body: any };
export type Reply = { status?: number; body?: unknown; headers?: Record<string, string> };

export async function startFakeSupabase() {
  const calls: WireCall[] = [];
  let responder: (c: WireCall) => Reply | undefined = () => undefined;
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const u = new URL(req.url ?? "/", "http://127.0.0.1");
      let body: any = raw;
      try { body = raw ? JSON.parse(raw) : undefined; } catch { /* keep raw */ }
      const call: WireCall = { method: req.method ?? "GET", path: u.pathname, query: u.searchParams, body };
      calls.push(call);
      const reply = responder(call) ?? { status: 200, body: [] };
      let payload = reply.body ?? [];
      if (String(req.headers.accept ?? "").includes("vnd.pgrst.object") && Array.isArray(payload)) payload = payload[0] ?? null;
      res.writeHead(reply.status ?? 200, { "content-type": "application/json", ...(reply.headers ?? {}) });
      res.end(payload === null ? "null" : JSON.stringify(payload));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  fakePort = String((server.address() as AddressInfo).port);
  process.env.SUPABASE_URL = `http://127.0.0.1:${fakePort}`;
  process.env.SUPABASE_SERVICE_KEY = "fake-service-key-for-tests";
  return {
    calls,
    respond(fn: (c: WireCall) => Reply | undefined) { responder = fn; },
    reset() { calls.length = 0; responder = () => undefined; },
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

/** Run a server action as the internal admin: no agency/creator access, plus a valid (locally signed) admin session cookie. */
export async function asAdmin<T>(fn: () => Promise<T>): Promise<T> {
  delete process.env.DASHBOARD_SERVER_ADMIN_SESSIONS;
  process.env.DASHBOARD_SESSION_SECRET = "fake-session-secret-for-tests";
  const token = await signSession();
  const jar = new RequestCookies(new Headers({ cookie: `${SESSION_COOKIE}=${token}` }));
  const workStore = { route: "/ai-models", forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, incrementalCache: {} } as any;
  const unit = { type: "request", phase: "action", headers: new Headers(), cookies: jar, userspaceMutableCookies: jar } as any;
  return withDashboardAccess(null, () => workAsyncStorage.run(workStore, () => workUnitAsyncStorage.run(unit, fn)));
}

/** Settle a promise into "resolved" or the rejection message, so a test can assert on the outcome. */
export const outcome = (p: Promise<unknown>) => p.then(() => "resolved", (e: unknown) => `rejected: ${e instanceof Error ? e.message : String(e)}`);
