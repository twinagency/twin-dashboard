/**
 * The fake wire and identity setup shared by the W1 lane 5 children tests/rules/controls-route.child.ts and
 * tests/rules/controls-page.child.ts (same approach as lane 4's core-route.child.ts and lane 1's plan-c-gate-scope.child.ts,
 * copied, not imported across branches). Not a test file (the rules glob is *.test.*).
 * Everything the children drive is REAL code: route handlers, pages, requireOnlyFansRead -> isAuthed -> verifyOwnerSession, the
 * real planCOwnerActor core, agencyScopedFetch and the engine / Plan C / read backends. Replaced by `installWire()`, and only these:
 *  - `next/headers`: no Next request scope offline. cookies() hands back the synthetic operator session cookie or none.
 *  - `lib/view-as-banner.ts` getViewAsBannerInfo: a real view-as needs a signed cookie plus a DB lookup; here always none.
 *  - `lib/onlyfans/plan-c-owner.ts`: its `import "server-only"` line (Next's bundler makes it a no-op); the real core is re-exported.
 *  - `*.css` requires (Next's bundler handles them): empty modules.
 * Agency identity is set with the real `withDashboardAccess` scope that getDashboardAccess reads first (not a mock); the internal
 * operator is `withDashboardAccess(null)` plus a session cookie the fake owner-session RPC verifies.
 * The wire is a fake `fetch`: Supabase owner-session RPCs (verify -> true; named-owner identity -> a UUID or null per `state.owner`)
 * and the OnlyFans backend at https://backend.fixture.invalid (agency preflight of-agency.v2; reads answer the contract fixtures in
 * tests/contracts/fixtures; account of-a is bound to `state.accountCreator`, by default CHAT_AGENCY's clone; writes are recorded and acknowledged; `state.upstream` makes every backend answer an error carrying
 * SENTINEL). Only `*.fixture.invalid` hosts and obviously synthetic credentials. Synthetic values only.
 */
import { mock } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { planCOwnerActor } from "../../lib/onlyfans/plan-c-owner-core";
import { SESSION_COOKIE } from "../../lib/session";
import { withDashboardAccess } from "../../lib/dashboard-access";
import { LYNQ_MANAGEMENT_AGENCY_ID } from "../../lib/agency-management-policy";
import type { AgencyIdentity } from "../../lib/agency-identity";
import { PLAN_C_SCHEMA } from "../../lib/onlyfans/plan-c";
import { NAMED_OWNER, SENTINEL, type Call, type UpstreamStatus } from "./controls-fixtures";

export const DASH = "https://dash.fixture.invalid", BACKEND = "https://backend.fixture.invalid", SUPABASE = "https://supabase.fixture.invalid";
export const REQUEST_ID = "12345678-1234-4234-8234-123456789abc";
/** The fan of the pilot conversation the Plan C scenarios use (`<account>:<fan>`). */
export const PLAN_C_FAN = "900000000001";
export const CHAT_AGENCY: AgencyIdentity = { id: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222",
  name: "Synthetic Agency", cloneIds: ["33333333-3333-4333-8333-333333333333"], canManage: false, canChat: true };
/** Same agency, different member: a different grant actor (`agency-user:<agency>:<user>`). */
export const CHAT_AGENCY_2: AgencyIdentity = { ...CHAT_AGENCY, userId: "44444444-4444-4444-8444-444444444444" };
export const MANAGER_AGENCY: AgencyIdentity = { ...CHAT_AGENCY, id: LYNQ_MANAGEMENT_AGENCY_ID, canManage: true, canChat: true };
/** Same-origin JSON headers the dashboard's own browser code sends. */
export const SAME_ORIGIN: Record<string, string> = { origin: DASH, "sec-fetch-site": "same-origin", "content-type": "application/json" };
export const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`../contracts/fixtures/${name}.json`, import.meta.url), "utf8"));
const OPERATIONS = { schemaVersion: "of-operations.v3", accountId: "of-a", asOf: "2026-10-18T00:00:00Z",
  modelCosts: { day: "2026-10-18", unit: "usd_millicents", spentMillicents: 7, capPerProviderMillicents: 10000, calls: 1, unresolvedCalls: 1, providers: 1 },
  providerConnectionVerified: false, reasons: ["delivery_unresolved"], intake: { pending: 3, quarantined: 0 },
  planning: { generating: 0, ready: 1, unknown: 0, refused: 0, stale: 0 }, work: { waiting: 2, claimed: 1, blocked: 0, oldestWaitingAgeSeconds: 8 },
  delivery: { queued: 1, dispatching: 0, unknown: 1, acceptedAwaitingProjection: 0, retainedUnresolvedReceipts: 1 },
  runtime: { registered: true, enabled: true, recoveryRequired: false, lastCompleteSyncAt: null },
  policy: { revision: 2, enabled: true, usedUnits: 2, limitUnits: 5, nextDispatchAt: null } };

export const state: { session?: string; owner: "uuid" | "null"; upstream: UpstreamStatus | null; drafts: "ok" | "502"; scope: "ok" | "502" | "403"; accountCreator: string } =
  { owner: "uuid", upstream: null, drafts: "ok", scope: "ok", accountCreator: CHAT_AGENCY.cloneIds[0] };
/** Every backend call (Supabase excluded) and every backend POST body, in order. */
export const calls: Call[] = [];
export const posts: Array<{ path: string; body: Record<string, unknown> }> = [];
export const since = (before: number) => calls.slice(before);
/** Run `fn` as `access` (null = internal operator) with `session` as the dashboard session cookie. */
export const acting = <T>(access: AgencyIdentity | null, session: string | undefined, fn: () => Promise<T>) => { state.session = session; return withDashboardAccess(access, fn); };

/** The backend's answer for a path already stripped of the agency prefix. */
function backendAnswer(method: string, path: string, body: Record<string, unknown> | null, agencyHeaders: Record<string, string>): Response {
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers: agencyHeaders });
  if (state.upstream !== null) return new Response(JSON.stringify({ ok: false, error: SENTINEL, detail: `${SENTINEL} at upstream` }),
    { status: state.upstream, statusText: SENTINEL, headers: { ...agencyHeaders, "content-type": "application/json", "x-upstream-detail": SENTINEL } });
  if (method === "GET" && path === "/onlyfans/api/v1/status") return json({ ok: true });
  if (method === "GET" && path === "/onlyfans/api/v1/accounts") return json({ schemaVersion: "of-preview.v2",
    accounts: [{ accountId: "of-a", binding: { creatorId: state.accountCreator, creatorName: "Synthetic Creator", handle: "synthetic" } }] });
  if (method === "GET" && path === "/onlyfans/api/v1/accounts/of-a/operations") return json({ schemaVersion: "of-preview.v2", operations: OPERATIONS });
  if (method === "GET" && /\/engine-status$/.test(path)) return json(fixture("engine-status-live"));
  if (method === "GET" && /\/engine\/catalogue$/.test(path)) return json(fixture("engine-catalogue"));
  if (method === "GET" && /\/engine\/unresolved$/.test(path)) return json(fixture("engine-unresolved-live"));
  let m = /^\/onlyfans\/control\/v1\/accounts\/([^/]+)\/conversations\/([^/]+)\/requests\/([^/]+)$/.exec(path);
  if (m && method === "POST" && body) {
    const status = { request_handover: "handover_pending", accept_handover: "handover_accepted", complete: "completed", decline: "declined", mark_reconciled: "reconciled" }[String(body.action)];
    return json({ schemaVersion: "of-engine-operator.v1", ok: true, accountId: decodeURIComponent(m[1]), conversationId: decodeURIComponent(m[2]),
      requestId: decodeURIComponent(m[3]), action: body.action, commandKey: body.commandKey, status, recordedRevision: Number(body.expectedRevision) + 1,
      owner: "operator", nextStep: "none", replayed: false });
  }
  m = /^\/onlyfans\/control\/v2\/accounts\/([^/]+)\/(.*)$/.exec(path);
  if (m) {
    const accountId = decodeURIComponent(m[1]), rest = decodeURIComponent(m[2]);
    if (method === "GET" && rest === "pilot-scope") return state.scope !== "ok" ? json({ ok: false }, Number(state.scope)) : json({ ok: true, accountId, config: { authorization_mode: "supervised" } });
    if (method === "GET" && rest === "drafts") return state.drafts === "502" ? json({ ok: false }, 502) : json({ schemaVersion: PLAN_C_SCHEMA, ok: true, accountId, drafts: [] });
    // One unresolved send on a pilot conversation, so a mounted Plan C console knows that conversation without any draft.
    if (method === "GET" && rest === "unresolved") return json({ schemaVersion: PLAN_C_SCHEMA, ok: true, accountId, items: [{ id: "unk-1",
      kind: "unknown_send", owner: "operator", nextStep: "reconcile", conversationId: `${accountId}:${PLAN_C_FAN}`, conversationRevision: 7 }] });
    if (method === "POST" && body) return json({ schemaVersion: PLAN_C_SCHEMA, ok: true, accountId, commandKey: body.commandKey, recordedRevision: 8, replayed: false });
  }
  return json({ ok: false }, 404);
}

function installWire() {
  Object.assign(process.env, { SUPABASE_URL: SUPABASE, SUPABASE_SERVICE_KEY: "synthetic-service-key", ONLYFANS_API_BASE_URL: BACKEND,
    ONLYFANS_API_TOKEN: "synthetic-api-token", ONLYFANS_CONTROL_TOKEN: "synthetic-control-token" });
  delete process.env.ONLYFANS_PLAN_C_ACCOUNT;
  Object.assign(globalThis, { React });
  createRequire(import.meta.url).extensions[".css"] = module => { module.exports = {}; };
  mock.module("next/headers", { namedExports: {
    cookies: async () => ({ get: (name: string) => name === SESSION_COOKIE && state.session ? { name, value: state.session } : undefined, getAll: () => [], has: () => false }),
    headers: async () => new Headers(),
  } });
  mock.module(new URL("../../lib/view-as-banner.ts", import.meta.url).href, { namedExports: { getViewAsBannerInfo: async () => null } });
  mock.module(new URL("../../lib/onlyfans/plan-c-owner.ts", import.meta.url).href, { namedExports: { planCOwnerActor } });
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input)), method = init.method ?? "GET";
    if (url.origin === SUPABASE) {
      if (url.pathname.endsWith("/dashboard_owner_session_verify")) return Response.json(true);
      if (url.pathname.endsWith("/dashboard_plan_c_owner_identity")) return Response.json(state.owner === "uuid" ? NAMED_OWNER : null);
      return Response.json(null, { status: 404 });
    }
    if (url.origin !== BACKEND) return Response.json({ ok: false }, { status: 404 });
    const agency = url.pathname.startsWith("/onlyfans/agency/v1/");
    const path = agency ? "/onlyfans" + url.pathname.slice("/onlyfans/agency/v1".length) : url.pathname;
    calls.push({ method, path: url.pathname, agency, scoped: new Headers(init.headers).has("X-OnlyFans-Agency-Scope") });
    const body = method === "POST" ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
    if (body) posts.push({ path, body });
    return backendAnswer(method, path, body, agency ? { "X-OnlyFans-Access-Version": "of-agency.v2" } : {});
  }) as typeof fetch;
}

/** Install the wire, run the scenario named by argv[2] (each entry imports only what it needs) and print its result as one JSON line. */
export function runChild<S>(scenarios: { [K in keyof S]: () => Promise<S[K]> }): void {
  installWire();
  const name = process.argv[2] ?? "";
  const known = (value: string): value is Extract<keyof S, string> => Object.hasOwn(scenarios, value);
  if (!known(name)) throw new Error(`unknown scenario ${name}`);
  scenarios[name]().then(out => process.stdout.write(JSON.stringify(out) + "\n", () => process.exit(0)));
}
