/**
 * Shared harness for the W6 app-creator-management-plus8 known-red tests (docs/review/W6/app-creator-management-plus8.md).
 * Copied from W5 app-actions-plus5 (tests/known-red/W5-app-actions-plus5-harness.ts on rwl/W5-app-actions-plus5), adapted.
 * Not a test file. Import it FIRST from a test file (it installs the fetch guard before any client exists).
 *
 * Real server actions, real auth (lib/internal-admin.ts, lib/session.ts, lib/dashboard-access.ts); fakes only at the wire:
 * - Network: globalThis.fetch is replaced with a deny-all stub; only the fake PostgREST below (127.0.0.1:<port>)
 *   is reachable, anything else throws and is recorded in `blockedFetches`.
 * - PostgREST: an HTTP server on 127.0.0.1:<port 0>; SUPABASE_URL points at it (supabaseAdmin is lazy).
 *   Every request is recorded in `calls`. Tables are a small in-memory store: GET filters rows (eq/neq/in/is),
 *   PATCH merges into matching rows, POST inserts or upserts (on_conflict). `/rpc/*` is recorded only, answers null.
 * - Identity: a real legacy admin session token from lib/session.ts `signSession()` (stateless HMAC branch:
 *   NODE_ENV "test", DASHBOARD_SERVER_ADMIN_SESSIONS unset) with an obviously fake DASHBOARD_SESSION_SECRET.
 *   verifySessionToken does not touch the database on this branch. No agency/creator/view-as cookie, so
 *   getDashboardAccess() resolves null (internal admin) through its real code path; no withDashboardAccess seam.
 * - DECLARED BYPASS (`inAction`): Next's workAsyncStorage/workUnitAsyncStorage are entered with a minimal fake
 *   `request` store in the `action` phase so `cookies()` (serving the cookie header given) and `revalidatePath`
 *   (needs a truthy `incrementalCache`; records into `pendingRevalidatedTags`) work outside a real request.
 *   Framework internals only; no repo module is mocked.
 */
import "./W6-app-creator-management-plus8-als";
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

(process.env as Record<string, string>).NODE_ENV = "test";
delete process.env.DASHBOARD_SERVER_ADMIN_SESSIONS;
delete process.env.DASHBOARD_ALLOW_LEGACY_ADMIN_SESSIONS;
process.env.DASHBOARD_SESSION_SECRET = "fake-session-secret-for-tests-only-not-real";

export type Row = Record<string, unknown>;
export type WireCall = { method: string; path: string; query: URLSearchParams; body: any; prefer: string };

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function matches(row: Row, query: URLSearchParams): boolean {
  for (const [key, raw] of query) {
    if (RESERVED.has(key)) continue;
    const dot = raw.indexOf(".");
    const op = raw.slice(0, dot), arg = raw.slice(dot + 1);
    const v = row[key];
    if (op === "eq" && String(v) !== arg) return false;
    if (op === "neq" && String(v) === arg) return false;
    if (op === "is" && arg === "null" && v != null) return false;
    if (op === "in" && !arg.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, "")).includes(String(v))) return false;
  }
  return true;
}

export async function startFakePostgrest() {
  const calls: WireCall[] = [];
  let tables: Record<string, Row[]> = {};
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const u = new URL(req.url ?? "/", "http://127.0.0.1");
      let body: any = raw;
      try { body = raw ? JSON.parse(raw) : undefined; } catch { /* keep raw */ }
      const method = req.method ?? "GET";
      const prefer = String(req.headers.prefer ?? "");
      calls.push({ method, path: u.pathname, query: u.searchParams, body, prefer });
      const table = u.pathname.replace(/^\/rest\/v1\//, "");
      let status = 200;
      let payload: unknown = [];
      if (table.startsWith("rpc/")) {
        payload = null;
      } else {
        const rows = (tables[table] ??= []);
        if (method === "GET" || method === "HEAD") {
          payload = rows.filter((r) => matches(r, u.searchParams)).map((r) => ({ ...r }));
        } else if (method === "PATCH") {
          const hit = rows.filter((r) => matches(r, u.searchParams));
          for (const r of hit) Object.assign(r, body);
          payload = hit.map((r) => ({ ...r }));
        } else if (method === "POST") {
          const conflict = (u.searchParams.get("on_conflict") ?? "").split(",").filter(Boolean);
          const merge = /resolution=merge-duplicates/.test(prefer);
          const out: Row[] = [];
          for (const incoming of (Array.isArray(body) ? body : [body]) as Row[]) {
            const existing = merge && conflict.length ? rows.find((r) => conflict.every((c) => r[c] === incoming[c])) : undefined;
            if (existing) Object.assign(existing, incoming);
            else rows.push({ ...incoming });
            out.push({ ...(existing ?? incoming) });
          }
          status = 201;
          payload = out;
        } else if (method === "DELETE") {
          const keep = rows.filter((r) => !matches(r, u.searchParams));
          payload = rows.filter((r) => matches(r, u.searchParams));
          tables[table] = keep;
        }
      }
      // supabase-js .maybeSingle()/.single() may ask for one object.
      if (String(req.headers.accept ?? "").includes("vnd.pgrst.object") && Array.isArray(payload)) payload = payload[0] ?? null;
      res.writeHead(status, { "content-type": "application/json" });
      res.end(payload === null ? "null" : JSON.stringify(payload));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  fakePort = String((server.address() as AddressInfo).port);
  process.env.SUPABASE_URL = `http://127.0.0.1:${fakePort}`;
  process.env.SUPABASE_SERVICE_KEY = "fake-service-key-for-tests";
  return {
    calls,
    /** Replace every table with deep copies of `seed`; clears recorded calls. */
    seed(seed: Record<string, Row[]>) {
      calls.length = 0;
      tables = Object.fromEntries(Object.entries(seed).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))]));
    },
    rows: (table: string): Row[] => (tables[table] ?? []).map((r) => ({ ...r })),
    writes: (table: string) => calls.filter((c) => c.method !== "GET" && c.method !== "HEAD" && c.path === `/rest/v1/${table}`),
    rpcs: () => calls.filter((c) => c.path.startsWith("/rest/v1/rpc/")),
    close: () => new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}

import { workAsyncStorage } from "next/dist/server/app-render/work-async-storage.external";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { RequestCookies } from "next/dist/server/web/spec-extension/cookies";
import { SESSION_COOKIE, signSession } from "../../lib/session";

/** A valid internal-admin cookie header, signed by the repo's own signSession(). */
export async function adminCookieHeader(): Promise<string> {
  return `${SESSION_COOKIE}=${await signSession()}`;
}

/** Run fn as if inside a Next server action request; cookies() reads `cookieHeader`. */
export async function inAction<T>(cookieHeader: string, fn: () => Promise<T>) {
  const headers = new Headers({ cookie: cookieHeader });
  const cookies = new RequestCookies(headers);
  const workStore = { route: "/creator-management/[id]", forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, incrementalCache: {} } as any;
  const unit = { type: "request", phase: "action", headers, cookies, userspaceMutableCookies: cookies } as any;
  const result = await workAsyncStorage.run(workStore, () => workUnitAsyncStorage.run(unit, fn));
  return { result, revalidated: (workStore.pendingRevalidatedTags ?? []) as string[] };
}

/** Outcome of one action call: whether it threw, and with what. */
export async function attempt(cookieHeader: string, fn: () => Promise<unknown>) {
  try {
    const { revalidated } = await inAction(cookieHeader, fn);
    return { threw: null as Error | null, revalidated };
  } catch (error) {
    return { threw: error as Error, revalidated: [] as string[] };
  }
}

export function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}
