/**
 * Shared harness for the W5 app-actions-plus5 known-red tests (docs/review/W5/app-actions-plus5.md).
 * Not a test file. Import it FIRST from a test file (it installs the fetch guard before any client exists).
 *
 * Real route handlers; fakes only at the wire:
 * - Network: globalThis.fetch is replaced with a deny-all stub; only the fake PostgREST below (127.0.0.1:<port>)
 *   is reachable, anything else throws and is recorded in `blockedFetches`.
 * - PostgREST: an HTTP server on 127.0.0.1:<port 0>; SUPABASE_URL points at it (serviceClient() is lazy).
 *   Every request is recorded; replies come from the per-test `respond` hook, else `[]` (200).
 * - Identity: the agency session is supplied with the repo's own seam `withDashboardAccess` (lib/dashboard-access.ts),
 *   not by mocking a module. Nothing real is reachable: SUPABASE_SERVICE_KEY is an obvious fake.
 * - DECLARED BYPASS (`inRequest`): Next's workAsyncStorage/workUnitAsyncStorage are entered with a minimal fake
 *   `request` store so a server component's `headers()` works outside a real request (framework internals only).
 */
import "../support/W5-next-als";
import http from "node:http";
import type { AddressInfo } from "node:net";

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
export type Reply = { status?: number; body?: unknown };

export async function startFakePostgrest() {
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
      // supabase-js .maybeSingle()/.single() ask for one object.
      if (String(req.headers.accept ?? "").includes("vnd.pgrst.object") && Array.isArray(payload)) payload = payload[0] ?? null;
      res.writeHead(reply.status ?? 200, { "content-type": "application/json" });
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

export const ORIGIN = "http://dashboard.test";
/** A same-origin form POST the route's trustedFormOrigin accepts (DASHBOARD_PUBLIC_ORIGIN = ORIGIN). */
export function formPost(path: string, fields: Record<string, string>) {
  process.env.DASHBOARD_PUBLIC_ORIGIN = ORIGIN;
  const body = new URLSearchParams(fields);
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

import { workAsyncStorage } from "next/dist/server/app-render/work-async-storage.external";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
/** Run fn as if inside a Next dynamic request (headers() returns `requestHeaders`). */
export function inRequest<T>(requestHeaders: Record<string, string>, fn: () => T): T {
  const workStore = { route: "/test", forceStatic: false, dynamicShouldError: false, isStaticGeneration: false } as any;
  const unit = { type: "request", phase: "render", headers: new Headers(requestHeaders) } as any;
  return workAsyncStorage.run(workStore, () => workUnitAsyncStorage.run(unit, fn));
}
