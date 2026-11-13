/**
 * Child process for tests/rules/G02-client-denial-refused.test.ts, via planCRouteChild in ./plan-c-fixtures.ts. Not a test file
 * (the rules glob is *.test.*). Needs --experimental-test-module-mocks, so the outer file still runs under plain
 * `node --import tsx --test`.
 * Rules it holds to:
 *  - It drives the REAL route handlers under app/api/onlyfans-controls/accounts/[accountId]/plan-c/ -> planCGate ->
 *    authorizeOnlyFansRead -> isAuthed / planCOwnerActor -> plan-c-route -> plan-c-backend, with the real browser client in front.
 *  - Replaced, and only these: `next/headers` (no Next request scope offline; it hands back the operator session cookie, or none)
 *    and the `import "server-only"` line of lib/onlyfans/plan-c-owner.ts (Next's bundler makes it a no-op; the real core is
 *    re-exported). The wire is a fake `fetch`: the owner-session RPCs answer as Supabase would for a valid named owner, and the
 *    backend's pilot-scope scopes this actor to MOCK_ACCOUNT only (403 for anything else).
 *  - Any POST that reaches the backend is counted and answered 502, so a regression that sends upstream shows as posts > 0
 *    (`scope` alone acks it, so its in-scope control can succeed).
 *  - Synthetic values only. Prints one JSON line: { outcome, keys, posts, status }, or for `scope` { [accountId]: { status, outcome, posts } }.
 * Usage: plan-c-route.child.ts <client-refused | client-denied | scope>
 *  client-refused the browser client, signed in, STOPs a conversation of another account
 *  client-denied  the browser client with NO session approves a draft
 *  scope          G05-plan-c-gate-scope: signed in, STOP on MOCK_ACCOUNT and on "of-b" straight through the route
 */
import { mock } from "node:test";
import { NextRequest } from "next/server";
import { planCOwnerActor } from "../../lib/onlyfans/plan-c-owner-core";
import { SESSION_COOKIE } from "../../lib/session";
import { createCommandKeyStore, createPlanCClient } from "../../lib/onlyfans/plan-c-client";
import { CONVERSATION, KEY, MOCK_ACCOUNT, PLAN_C_SCHEMA, parsedDraft } from "./plan-c-fixtures";

const OWNER_SESSION = `owner_${"1".repeat(64)}`, DASH = "https://dash.fixture.invalid";

async function main(scenario: string) {
  Object.assign(process.env, { SUPABASE_URL: "https://supabase.fixture.invalid", SUPABASE_SERVICE_KEY: "fixture-service-key",
    ONLYFANS_API_BASE_URL: "https://backend.fixture.invalid", ONLYFANS_CONTROL_TOKEN: "synthetic-control-token" });
  const session = scenario === "client-denied" ? undefined : OWNER_SESSION;
  mock.module(new URL("../../lib/onlyfans/plan-c-owner.ts", import.meta.url).href, { namedExports: { planCOwnerActor } });
  mock.module("next/headers", { namedExports: {
    cookies: async () => ({ get: (name: string) => name === SESSION_COOKIE && session ? { name, value: session } : undefined, getAll: () => [], has: () => false }),
    headers: async () => new Headers(),
  } });
  const posts: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input)), method = init.method ?? "GET";
    if (url.host === "supabase.fixture.invalid") {
      if (url.pathname.endsWith("/dashboard_owner_session_verify")) return Response.json(true);
      if (url.pathname.endsWith("/dashboard_plan_c_owner_identity")) return Response.json("11111111-1111-4111-8111-111111111111");
      return Response.json(null, { status: 404 });
    }
    const m = /^\/onlyfans\/control\/v2\/accounts\/([^/]+)\/(.*)$/.exec(url.pathname);
    if (!m) return Response.json({ ok: false }, { status: 404 });
    const accountId = decodeURIComponent(m[1]), rest = decodeURIComponent(m[2]);
    if (method === "GET" && rest === "pilot-scope")
      return accountId === MOCK_ACCOUNT ? Response.json({ ok: true, accountId, config: { authorization_mode: "supervised" } }) : Response.json({ ok: false, code: "out_of_scope" }, { status: 403 });
    if (method === "POST") {
      posts.push(`${accountId} ${rest}`);
      if (scenario !== "scope") return Response.json({ ok: false }, { status: 502 });
      const body = JSON.parse(String(init.body)), [, target, action] = rest.split("/");
      return Response.json({ schemaVersion: PLAN_C_SCHEMA, ok: true, accountId, conversationId: target, action, commandKey: body.commandKey, recordedRevision: 8, replayed: false });
    }
    return Response.json({ ok: false }, { status: 404 });
  }) as typeof fetch;

  const conversations = await import("../../app/api/onlyfans-controls/accounts/[accountId]/plan-c/conversations/[conversationId]/[action]/route");
  const drafts = await import("../../app/api/onlyfans-controls/accounts/[accountId]/plan-c/drafts/[requestId]/[generation]/[action]/route");
  const headers = { origin: DASH, "sec-fetch-site": "same-origin", "content-type": "application/json" };
  let lastStatus = 0;
  /** What the browser's fetch reaches: the dashboard's own route handler, exactly as Next would call it. */
  const routeFetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), DASH), path = decodeURIComponent(url.pathname);
    const request = new NextRequest(url, { method: init.method, headers, body: init.body as string });
    let m = /^\/api\/onlyfans-controls\/accounts\/([^/]+)\/plan-c\/conversations\/([^/]+)\/([^/]+)$/.exec(path);
    const response = m ? await conversations.POST(request, { params: Promise.resolve({ accountId: m[1], conversationId: m[2], action: m[3] }) })
      : (m = /^\/api\/onlyfans-controls\/accounts\/([^/]+)\/plan-c\/drafts\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(path))
        ? await drafts.POST(request, { params: Promise.resolve({ accountId: m[1], requestId: m[2], generation: m[3], action: m[4] }) })
        : new Response(null, { status: 404 });
    lastStatus = response.status;
    return response;
  }) as typeof fetch;

  if (scenario === "scope") {
    const out: Record<string, { status: number; outcome: unknown; posts: number }> = {};
    for (const accountId of [MOCK_ACCOUNT, "of-b"]) {
      const before = posts.length, conversationId = `${accountId}:1`;
      const response = await routeFetch(`/api/onlyfans-controls/accounts/${accountId}/plan-c/conversations/${encodeURIComponent(conversationId)}/stop`,
        { method: "POST", body: JSON.stringify({ commandKey: KEY, expectedRevision: 7 }) });
      const body = await response.json() as Record<string, unknown>;
      out[accountId] = { status: response.status, outcome: body.outcome, posts: posts.length - before };
    }
    return out;
  }
  const keys = createCommandKeyStore(), client = createPlanCClient({ accountId: MOCK_ACCOUNT, fetchImpl: routeFetch, keys });
  const result = scenario === "client-refused" ? await client.conversationCommand(`of-b:${CONVERSATION.split(":")[1]}`, "stop", 7)
    : scenario === "client-denied" ? await client.approveDraft(parsedDraft()) : null;
  if (!result) throw new Error(`unknown scenario ${scenario}`);
  return { outcome: result.ok ? "recorded" : result.outcome, keys: keys.size(), posts: posts.length, status: lastStatus };
}
main(process.argv[2] ?? "").then(out => process.stdout.write(JSON.stringify(out) + "\n"));
