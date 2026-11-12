/**
 * Child process for tests/known-red/plan-c-gate-no-account-scope.test.ts (finding 3) and
 * tests/known-red/plan-c-client-denial-unconfirmed.test.ts (finding 5). Lives in tests/rules beside its fixtures (no import back
 * into tests/known-red); the rules glob `*.test.*` does not run it. Needs --experimental-test-module-mocks, so the outer files
 * still run under plain `node --import tsx --test`. Drives the REAL route handlers under
 * app/api/onlyfans-controls/accounts/[accountId]/plan-c/ -> planCGate -> requireOnlyFansRead -> isAuthed / planCOwnerActor ->
 * plan-c-route -> plan-c-backend.
 * Replaced, and only these: `next/headers` (no Next request scope offline; it hands back the operator session cookie, or none) and
 * the `import "server-only"` line of lib/onlyfans/plan-c-owner.ts (Next's bundler makes it a no-op; the real core is re-exported).
 * Everything else is real code; the wire is a fake `fetch`: the owner-session RPCs answer as Supabase would for a valid named
 * owner, and the backend's pilot-scope says this actor is scoped to MOCK_ACCOUNT only (403 for anything else).
 * Usage: plan-c-gate-scope.child.ts <scope | client-refused | client-denied>. Prints one JSON line. Synthetic values only.
 *  scope          STOP on MOCK_ACCOUNT and on "of-b" through the route: { [accountId]: { status, outcome, posts } }
 *  client-refused the browser client, signed in, STOPs a conversation of another account: { outcome, keys, posts, status }
 *  client-denied  the browser client with NO session approves a draft: { outcome, keys, posts, status }
 *  edit           signed in, raw POSTs to the real draft edit route (text-only control, then object/number parts):
 *                 { [case]: { status, posts } }; a handler that throws is recorded as status 500, what Next answers for it.
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
      const body = JSON.parse(String(init.body)), [kind, target, action] = rest.split("/");
      return Response.json({ schemaVersion: PLAN_C_SCHEMA, ok: true, accountId, ...(kind === "conversations" ? { conversationId: target, action } : { requestId: target }),
        commandKey: body.commandKey, recordedRevision: 8, replayed: false });
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
  if (scenario === "edit") {
    const draft = parsedDraft(), url = `/api/onlyfans-controls/accounts/${MOCK_ACCOUNT}/plan-c/drafts/${draft.requestId}/${draft.generation}/edit`;
    const cases: Record<string, unknown[]> = {
      "text-only control": ["New text one", "New text two"],
      "object part with a price": [{ text: "New text", priceCents: 100 }, "ok"],
      "object part with a product": ["ok", { text: "New text", productId: "other" }],
      "number part": ["ok", 300],
    };
    const out: Record<string, { status: number; posts: number }> = {};
    for (const [name, parts] of Object.entries(cases)) {
      const before = posts.length;
      let status: number;
      try { status = (await routeFetch(url, { method: "POST", body: JSON.stringify({ expectedVersion: draft.draftVersion, commandKey: KEY, parts }) })).status; }
      catch { status = 500; }
      out[name] = { status, posts: posts.length - before };
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
