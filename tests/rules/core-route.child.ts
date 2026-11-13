/**
 * Child process for the W1 lane 4 (lib-onlyfans-core) route tests: tests/known-red/core-d6-chat-mark-reconciled.test.ts (F1),
 * tests/rules/G04-core-memory-correction-key.test.ts (F2), tests/rules/core-request-command-key.test.ts (CH3) and
 * tests/rules/core-pilot-actor-gate.test.ts (CH2). Spawned by tests/rules/core-fixtures.ts under --experimental-test-module-mocks;
 * the rules glob `*.test.*` does not run it.
 * Drives the REAL handlers: app/api/onlyfans-controls/accounts/[accountId]/conversations/[conversationId]/requests/[requestId]/route.ts
 * POST, app/api/onlyfans-launch/memory/accounts/[accountId]/fans/[fanId]/route.ts PATCH (memoryFan), and requireOnlyFansRead
 * (lib/onlyfans/route.ts), through the real agency-scope transport, engine-operator / native-configuration backends,
 * isAuthed -> verifyOwnerSession, and the real planCOwnerActor core.
 * Replaced, and only these:
 *  - `next/headers`: no Next request scope offline. cookies() hands back the synthetic operator session cookie or none.
 *  - `lib/view-as-banner.ts` getViewAsBannerInfo: a real view-as needs a signed cookie plus a DB lookup; here a flag.
 *  - `lib/onlyfans/plan-c-owner.ts`: its `import "server-only"` line (Next's bundler makes it a no-op). Replaced by the real
 *    core (plan-c-owner-core.ts) wrapped in a call counter, so "never called" is measured.
 * Agency identity is set with the real `withDashboardAccess` scope that getDashboardAccess reads first (not a mock).
 * The wire is a fake `fetch`: Supabase owner-session RPCs (verify -> true; named-owner identity -> a scripted queue of a UUID or
 * a 503) and the OnlyFans backend (agency preflight answers of-agency.v2; request and correction POSTs are recorded and acked).
 * Usage: core-route.child.ts <d6 | keys | memory-stable | memory-flap | pilot>. Prints one JSON line. Synthetic values only.
 */
import { mock } from "node:test";
import { NextRequest, NextResponse } from "next/server";
import { namedOwnerActor as realNamedOwner, planCOwnerActor as realOwnerActor } from "../../lib/onlyfans/plan-c-owner-core";
import { SESSION_COOKIE } from "../../lib/session";
import { withDashboardAccess } from "../../lib/dashboard-access";
import { LYNQ_MANAGEMENT_AGENCY_ID } from "../../lib/agency-management-policy";
import type { AgencyIdentity } from "../../lib/agency-identity";
import { NAMED_OWNER, OWNER_SESSION, type CoreScenarios } from "./core-fixtures";

const DASH = "https://dash.fixture.invalid", BACKEND = "https://backend.fixture.invalid", SUPABASE = "https://supabase.fixture.invalid";
const REQUEST_ID = "12345678-1234-4234-8234-123456789abc";
const CHAT_AGENCY: AgencyIdentity = { id: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222",
  name: "Synthetic Agency", cloneIds: ["33333333-3333-4333-8333-333333333333"], canManage: false, canChat: true };
const MANAGER_AGENCY: AgencyIdentity = { ...CHAT_AGENCY, id: LYNQ_MANAGEMENT_AGENCY_ID, canManage: true, canChat: true };

const state: { session?: string; viewAs: boolean; lookups: number; owner: Array<"uuid" | "fail"> } = { viewAs: false, lookups: 0, owner: [] };
type Post = { path: string; body: Record<string, unknown> };
const posts: Post[] = [];

async function main(scenario: string): Promise<unknown> {
  Object.assign(process.env, { SUPABASE_URL: SUPABASE, SUPABASE_SERVICE_KEY: "synthetic-service-key", ONLYFANS_API_BASE_URL: BACKEND,
    ONLYFANS_API_TOKEN: "synthetic-api", ONLYFANS_CONTROL_TOKEN: "synthetic-control", ONLYFANS_CONFIGURATION_TOKEN: "synthetic-configuration" });
  mock.module("next/headers", { namedExports: {
    cookies: async () => ({ get: (name: string) => name === SESSION_COOKIE && state.session ? { name, value: state.session } : undefined, getAll: () => [], has: () => false }),
    headers: async () => new Headers(),
  } });
  mock.module(new URL("../../lib/view-as-banner.ts", import.meta.url).href, { namedExports: {
    getViewAsBannerInfo: async () => state.viewAs ? { name: "Synthetic Agency", kind: "agency" } : null } });
  mock.module(new URL("../../lib/onlyfans/plan-c-owner.ts", import.meta.url).href, { namedExports: {
    planCOwnerActor: (token: string | undefined, fetcher?: typeof fetch) => { state.lookups++; return realOwnerActor(token, fetcher); },
    namedOwnerActor: (token: string | undefined, fetcher?: typeof fetch) => { state.lookups++; return realNamedOwner(token, fetcher); } } });

  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input)), method = init.method ?? "GET";
    if (url.origin === SUPABASE) {
      if (url.pathname.endsWith("/dashboard_owner_session_verify")) return Response.json(true);
      if (url.pathname.endsWith("/dashboard_plan_c_owner_identity"))
        return (state.owner.shift() ?? "fail") === "uuid" ? Response.json(NAMED_OWNER) : Response.json({ message: "unavailable" }, { status: 503 });
      return Response.json(null, { status: 404 });
    }
    const v2 = { headers: { "X-OnlyFans-Access-Version": "of-agency.v2" } };
    if (url.origin !== BACKEND) return Response.json({ ok: false }, { status: 404 });
    if (method === "GET" && url.pathname === "/onlyfans/agency/v1/api/v1/status") return Response.json({ ok: true }, v2);
    if (method !== "POST") return Response.json({ ok: false }, { status: 404, ...v2 });
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    posts.push({ path: url.pathname, body });
    let m = /\/control\/v1\/accounts\/([^/]+)\/conversations\/([^/]+)\/requests\/([^/]+)$/.exec(url.pathname);
    if (m) {
      const status = { request_handover: "handover_pending", accept_handover: "handover_accepted", complete: "completed", decline: "declined", mark_reconciled: "reconciled" }[String(body.action)];
      return Response.json({ schemaVersion: "of-engine-operator.v1", ok: true, accountId: decodeURIComponent(m[1]), conversationId: decodeURIComponent(m[2]),
        requestId: decodeURIComponent(m[3]), action: body.action, commandKey: body.commandKey, status, recordedRevision: Number(body.expectedRevision) + 1,
        owner: "operator", nextStep: "none", replayed: false }, v2);
    }
    m = /\/configuration\/v1\/accounts\/([^/]+)\/history-memory\/fans\/[0-9]+\/corrections$/.exec(url.pathname);
    if (m) return Response.json({ schemaVersion: "of-configuration.v3", ok: true, accountId: decodeURIComponent(m[1]), commandKey: body.commandKey,
      correction: { revision: 2, replayed: false } }, v2);
    return Response.json({ ok: false }, { status: 404, ...v2 });
  }) as typeof fetch;

  const headers = { origin: DASH, "sec-fetch-site": "same-origin", "content-type": "application/json" };

  if (scenario === "d6" || scenario === "keys") {
    const { POST } = await import("../../app/api/onlyfans-controls/accounts/[accountId]/conversations/[conversationId]/requests/[requestId]/route");
    const send = async (access: AgencyIdentity, body: Record<string, unknown>, p = { accountId: "of-a", conversationId: "of-a:42", requestId: REQUEST_ID }) => {
      const before = posts.length;
      const request = new NextRequest(`${DASH}/api/onlyfans-controls/accounts/${p.accountId}/conversations/${encodeURIComponent(p.conversationId)}/requests/${p.requestId}`,
        { method: "POST", headers, body: JSON.stringify(body) });
      const response = await withDashboardAccess(access, () => POST(request, { params: Promise.resolve(p) }));
      const sent = posts.slice(before).filter(x => x.path.includes("/requests/"));
      return { status: response.status, outcome: ((await response.json()) as Record<string, unknown>).outcome, posts: sent.length,
        commandKey: typeof sent[0]?.body.commandKey === "string" ? sent[0].body.commandKey : null };
    };
    const base = { action: "complete", expectedRevision: 3, note: "checked the vault" };
    if (scenario === "d6") return {
      "chat complete simulation": await send(CHAT_AGENCY, base),
      "chat mark_reconciled": await send(CHAT_AGENCY, { ...base, action: "mark_reconciled" }),
      "chat complete live": await send(CHAT_AGENCY, { ...base, environment: "live" }),
      "manager mark_reconciled": await send(MANAGER_AGENCY, { ...base, action: "mark_reconciled" }),
    } satisfies CoreScenarios["d6"];
    const p = { accountId: "of-a", conversationId: "of-a:42", requestId: REQUEST_ID };
    return {
      base: await send(CHAT_AGENCY, base, p),
      "base again": await send(CHAT_AGENCY, base, p),
      "account of-b": await send(CHAT_AGENCY, base, { ...p, accountId: "of-b" }),
      conversation: await send(CHAT_AGENCY, base, { ...p, conversationId: "of-a:43" }),
      request: await send(CHAT_AGENCY, base, { ...p, requestId: "12345678-1234-4234-8234-123456789abd" }),
      action: await send(CHAT_AGENCY, { ...base, action: "decline" }, p),
      revision: await send(CHAT_AGENCY, { ...base, expectedRevision: 4 }, p),
      note: await send(CHAT_AGENCY, { ...base, note: "checked the chat" }, p),
    } satisfies CoreScenarios["keys"];
  }

  if (scenario === "memory-stable" || scenario === "memory-flap") {
    const { PATCH } = await import("../../app/api/onlyfans-launch/memory/accounts/[accountId]/fans/[fanId]/route");
    state.session = OWNER_SESSION;
    state.owner = scenario === "memory-stable" ? ["uuid", "uuid"] : ["uuid", "fail"];
    const body = JSON.stringify({ field: "home_city", operation: "set", value: "Synthetic City", expectedVersion: "a".repeat(64), reason: "fan corrected it" });
    const statuses: number[] = [];
    for (let i = 0; i < 2; i++) {
      const request = new NextRequest(`${DASH}/api/onlyfans-launch/memory/accounts/of-a/fans/101`, { method: "PATCH", headers, body });
      statuses.push((await withDashboardAccess(null, () => PATCH(request, { params: Promise.resolve({ accountId: "of-a", fanId: "101" }) }))).status);
    }
    const sent = posts.filter(x => x.path.endsWith("/corrections"));
    return { statuses, lookups: state.lookups, keys: sent.map(x => x.body.commandKey), actors: sent.map(x => x.body.actor) } satisfies CoreScenarios["memory-stable"];
  }

  if (scenario === "pilot") {
    const { requireOnlyFansRead } = await import("../../lib/onlyfans/route");
    type Options = Parameters<typeof requireOnlyFansRead>[0];
    const run = async (setup: { access: AgencyIdentity | null; session?: string; viewAs?: boolean; owner?: Array<"uuid" | "fail"> }, options: Options) => {
      Object.assign(state, { session: setup.session, viewAs: !!setup.viewAs, owner: [...(setup.owner ?? [])], lookups: 0 });
      const ctx = await withDashboardAccess(setup.access, () => requireOnlyFansRead(options));
      return ctx instanceof NextResponse ? { result: `denied:${ctx.status}`, pilotActor: null, lookups: state.lookups }
        : { result: "ctx", pilotActor: ctx.pilotActor ?? null, lookups: state.lookups };
    };
    return {
      "agency session": await run({ access: CHAT_AGENCY, owner: ["uuid"] }, { agency: true, pilotIdentity: true }),
      "agency identity with operator cookie, plan-c-guard options": await run({ access: CHAT_AGENCY, session: OWNER_SESSION, owner: ["uuid"] }, { agency: false, pilotIdentity: true }),
      "agency identity with operator cookie, agency options": await run({ access: MANAGER_AGENCY, session: OWNER_SESSION, owner: ["uuid"] }, { agency: true, pilotIdentity: true }),
      "view-as": await run({ access: CHAT_AGENCY, session: OWNER_SESSION, viewAs: true, owner: ["uuid"] }, { agency: false, pilotIdentity: true }),
      "operator, lookup fails": await run({ access: null, session: OWNER_SESSION, owner: ["fail"] }, { agency: false, pilotIdentity: true }),
      "operator, lookup resolves": await run({ access: null, session: OWNER_SESSION, owner: ["uuid"] }, { agency: false, pilotIdentity: true }),
      "operator, no pilotIdentity": await run({ access: null, session: OWNER_SESSION, owner: ["uuid"] }, { agency: false }),
    } satisfies CoreScenarios["pilot"];
  }
  throw new Error(`unknown scenario ${scenario}`);
}
main(process.argv[2] ?? "").then(out => process.stdout.write(JSON.stringify(out) + "\n"));
