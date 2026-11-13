/**
 * Route child for the W1 lane 5 (app-onlyfans-controls) tests: tests/known-red/controls-*.test.ts and tests/rules/controls-*.test.ts.
 * Spawned by tests/rules/controls-fixtures.ts under --experimental-test-module-mocks; the rules glob `*.test.*` does not run it.
 * Drives the REAL route handlers under app/api/onlyfans-controls/accounts/[accountId]/ (requests/[requestId], the five Plan C routes)
 * and app/api/onlyfans/accounts/[accountId]/ (engine-status, engine/catalogue, engine/unresolved) over the fake wire and identity
 * setup in tests/rules/controls-wire.ts (see its header for exactly what is replaced).
 * Usage: controls-route.child.ts <requests | agency | plan-c-no-owner | upstream | validation>. Prints one JSON line. Synthetic values only.
 */
import { NextRequest } from "next/server";
import type { AgencyIdentity } from "../../lib/agency-identity";
import { PILOT_ACCOUNT, SENTINEL, SESSION_A, SESSION_B, type Call, type EngineRead, type PlanCRoute, type RequestCase, type RouteCase,
  type RouteScenarios, type UpstreamCase, type UpstreamRoute, type UpstreamStatus } from "./controls-fixtures";
import { CHAT_AGENCY, CHAT_AGENCY_2, DASH, PLAN_C_FAN, REQUEST_ID, SAME_ORIGIN, acting, calls, posts, runChild, since, state } from "./controls-wire";

const p = { accountId: "of-a", conversationId: "of-a:42", requestId: REQUEST_ID };
const requestUrl = `${DASH}/api/onlyfans-controls/accounts/of-a/conversations/${encodeURIComponent(p.conversationId)}/requests/${REQUEST_ID}`;
// VALID_COMMAND names its environment, so a "missing environment -> 400" fix for finding 2 leaves every case but one green.
// Today's client never sends this body: lib/onlyfans/engine-operator-client.ts:11 omits `environment` when it is "simulation",
// so the interim route fix also needs that client line to always send it (else every simulation resolve from the real UI 400s).
// TEST-CHANGE note: the finding-2 fix that drops the browser field (backend stamps the prefix) changes only this line.
const VALID_COMMAND = { action: "complete", expectedRevision: 3, note: "checked the vault", environment: "simulation" };
const { environment: _dropped, ...NO_ENVIRONMENT } = VALID_COMMAND;
const CHAT_NOTE = { ...VALID_COMMAND, note: "checked the chat" };

/** POST the request action through the real route; the raw response plus the backend posts and calls it caused. */
async function postRequest(access: AgencyIdentity | null, session: string | undefined, body: Record<string, unknown> | string,
  headers: Record<string, string> = SAME_ORIGIN) {
  const requests = await import("../../app/api/onlyfans-controls/accounts/[accountId]/conversations/[conversationId]/requests/[requestId]/route");
  const postsBefore = posts.length, callsBefore = calls.length;
  const request = new NextRequest(requestUrl, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
  const response = await acting(access, session, () => requests.POST(request, { params: Promise.resolve(p) }));
  return { response, sent: posts.slice(postsBefore).filter(x => x.path.includes("/requests/")), calls: since(callsBefore) };
}
async function sendRequest(access: AgencyIdentity | null, session: string | undefined, body: Record<string, unknown> | string,
  headers: Record<string, string> = SAME_ORIGIN): Promise<RequestCase> {
  const { response, sent } = await postRequest(access, session, body, headers);
  return { status: response.status, outcome: ((await response.json()) as Record<string, unknown>).outcome, posts: sent.length,
    commandKey: typeof sent[0]?.body.commandKey === "string" ? sent[0].body.commandKey : null,
    evidenceRef: typeof sent[0]?.body.evidenceRef === "string" ? sent[0].body.evidenceRef : null,
    actor: typeof sent[0]?.body.actor === "string" ? sent[0].body.actor : null };
}

/** One handler per engine read, keyed by the ENGINE_READS tuple: a new name without its own entry is a type error. */
const ENGINE_READ_ROUTES: Record<EngineRead, (request: NextRequest) => Promise<Response>> = {
  "engine-status": async request => (await import("../../app/api/onlyfans/accounts/[accountId]/conversations/[conversationId]/engine-status/route"))
    .GET(request, { params: Promise.resolve({ accountId: "of-a", conversationId: "of-a:42" }) }),
  catalogue: async request => (await import("../../app/api/onlyfans/accounts/[accountId]/engine/catalogue/route"))
    .GET(request, { params: Promise.resolve({ accountId: "of-a" }) }),
  unresolved: async request => (await import("../../app/api/onlyfans/accounts/[accountId]/engine/unresolved/route"))
    .GET(request, { params: Promise.resolve({ accountId: "of-a" }) }),
};
const ENGINE_READ_PATHS: Record<EngineRead, string> = {
  "engine-status": `conversations/${encodeURIComponent("of-a:42")}/engine-status`, catalogue: "engine/catalogue", unresolved: "engine/unresolved",
};

/** GET one engine read through the real route. */
async function read(access: AgencyIdentity | null, session: string | undefined, which: EngineRead) {
  const before = calls.length;
  const request = new NextRequest(`${DASH}/api/onlyfans/accounts/of-a/${ENGINE_READ_PATHS[which]}?limit=20`);
  const response = await acting(access, session, () => ENGINE_READ_ROUTES[which](request));
  return { response, calls: since(before) };
}

const PLAN_C_ROOT = `${DASH}/api/onlyfans-controls/accounts/${PILOT_ACCOUNT}/plan-c`;
const PLAN_C_CONVERSATION = `${PILOT_ACCOUNT}:${PLAN_C_FAN}`, PLAN_C_KEY = "a".repeat(64);
const planCPost = (url: string, body: unknown) => new NextRequest(url, { method: "POST", headers: SAME_ORIGIN, body: JSON.stringify(body) });
/** One handler per Plan C route, keyed by the PLAN_C_ROUTES tuple: a new name without its own entry is a type error. */
const PLAN_C_HANDLERS: Record<PlanCRoute, () => Promise<Response>> = {
  drafts: async () => (await import("../../app/api/onlyfans-controls/accounts/[accountId]/plan-c/drafts/route"))
    .GET(new NextRequest(`${PLAN_C_ROOT}/drafts`), { params: Promise.resolve({ accountId: PILOT_ACCOUNT }) }),
  unresolved: async () => (await import("../../app/api/onlyfans-controls/accounts/[accountId]/plan-c/unresolved/route"))
    .GET(new NextRequest(`${PLAN_C_ROOT}/unresolved`), { params: Promise.resolve({ accountId: PILOT_ACCOUNT }) }),
  reconcile: async () => (await import("../../app/api/onlyfans-controls/accounts/[accountId]/plan-c/unresolved/[id]/reconcile/route"))
    .POST(planCPost(`${PLAN_C_ROOT}/unresolved/unk-1/reconcile`, { commandKey: PLAN_C_KEY, evidence: "checked the provider log" }),
      { params: Promise.resolve({ accountId: PILOT_ACCOUNT, id: "unk-1" }) }),
  conversation: async () => (await import("../../app/api/onlyfans-controls/accounts/[accountId]/plan-c/conversations/[conversationId]/[action]/route"))
    .POST(planCPost(`${PLAN_C_ROOT}/conversations/${encodeURIComponent(PLAN_C_CONVERSATION)}/stop`, { commandKey: PLAN_C_KEY, expectedRevision: 7 }),
      { params: Promise.resolve({ accountId: PILOT_ACCOUNT, conversationId: PLAN_C_CONVERSATION, action: "stop" }) }),
  draft: async () => (await import("../../app/api/onlyfans-controls/accounts/[accountId]/plan-c/drafts/[requestId]/[generation]/[action]/route"))
    .POST(planCPost(`${PLAN_C_ROOT}/drafts/${REQUEST_ID}/1/approve`, { commandKey: PLAN_C_KEY, expectedVersion: 1 }),
      { params: Promise.resolve({ accountId: PILOT_ACCOUNT, requestId: REQUEST_ID, generation: "1", action: "approve" }) }),
};

/** Drive one Plan C route as the internal operator (SESSION_A) on the pilot account. */
async function planC(which: PlanCRoute) {
  const before = calls.length;
  const response = await acting(null, SESSION_A, PLAN_C_HANDLERS[which]);
  return { response, calls: since(before) };
}

const routeCase = async (run: Promise<{ response: Response; calls: Call[] }>): Promise<RouteCase> => {
  const { response, calls: seen } = await run;
  return { status: response.status, calls: seen };
};
const planCOwner = async (owner: "uuid" | "null"): Promise<Record<PlanCRoute, RouteCase>> => {
  state.owner = owner;
  return { drafts: await routeCase(planC("drafts")), unresolved: await routeCase(planC("unresolved")),
    reconcile: await routeCase(planC("reconcile")), conversation: await routeCase(planC("conversation")), draft: await routeCase(planC("draft")) };
};

/** Every UPSTREAM_ROUTES route once with the backend answering `code` plus SENTINEL everywhere. */
async function upstreamAt(code: UpstreamStatus): Promise<Record<UpstreamRoute, UpstreamCase>> {
  state.upstream = code;
  const check = async (run: Promise<{ response: Response; calls: Call[] }>): Promise<UpstreamCase> => {
    const { response, calls: seen } = await run;
    const text = `${response.status} ${response.statusText} ${[...response.headers].map(([k, v]) => `${k}: ${v}`).join("\n")} ${await response.text()}`;
    return { status: response.status, leaked: text.includes(SENTINEL), reached: seen.length > 0 };
  };
  return {
    "engine-status": await check(read(null, SESSION_A, "engine-status")),
    catalogue: await check(read(null, SESSION_A, "catalogue")),
    unresolved: await check(read(null, SESSION_A, "unresolved")),
    requests: await check(postRequest(null, SESSION_A, VALID_COMMAND)),
    "plan-c drafts": await check(planC("drafts")),
    "plan-c conversation": await check(planC("conversation")),
  };
}

runChild<RouteScenarios>({
  requests: async () => ({
    valid: await sendRequest(null, SESSION_A, VALID_COMMAND),
    "no environment": await sendRequest(null, SESSION_A, NO_ENVIRONMENT),
    "session A": await sendRequest(null, SESSION_A, CHAT_NOTE),
    "session A again": await sendRequest(null, SESSION_A, CHAT_NOTE),
    "session B": await sendRequest(null, SESSION_B, CHAT_NOTE),
    "agency user 1": await sendRequest(CHAT_AGENCY, undefined, CHAT_NOTE),
    "agency user 2": await sendRequest(CHAT_AGENCY_2, undefined, CHAT_NOTE),
    "foreign origin": await sendRequest(null, SESSION_A, VALID_COMMAND, { ...SAME_ORIGIN, origin: "https://elsewhere.fixture.invalid" }),
    "cross-site": await sendRequest(null, SESSION_A, VALID_COMMAND, { ...SAME_ORIGIN, "sec-fetch-site": "cross-site" }),
    "text/plain": await sendRequest(null, SESSION_A, VALID_COMMAND, { ...SAME_ORIGIN, "content-type": "text/plain" }),
    oversize: await sendRequest(null, SESSION_A, JSON.stringify({ ...VALID_COMMAND, note: "x".repeat(70_000) })),
  }),
  agency: async () => ({
    "engine-status": await routeCase(read(CHAT_AGENCY, undefined, "engine-status")),
    catalogue: await routeCase(read(CHAT_AGENCY, undefined, "catalogue")),
    unresolved: await routeCase(read(CHAT_AGENCY, undefined, "unresolved")),
    requests: await routeCase(postRequest(CHAT_AGENCY, undefined, VALID_COMMAND)),
  }),
  "plan-c-no-owner": async () => ({ "named owner": await planCOwner("uuid"), "no owner": await planCOwner("null") }),
  validation: async () => {
    const { note: _note, ...noNote } = VALID_COMMAND;
    return {
      "note 108 chars": await sendRequest(null, SESSION_A, { ...VALID_COMMAND, note: "x".repeat(108) }),
      "unknown key": await sendRequest(null, SESSION_A, { ...VALID_COMMAND, priority: "high" }),
      "note 109 chars": await sendRequest(null, SESSION_A, { ...VALID_COMMAND, note: "x".repeat(109) }),
      "control char in note": await sendRequest(null, SESSION_A, { ...VALID_COMMAND, note: "checked\u0007the vault" }),
      "note missing on complete": await sendRequest(null, SESSION_A, noNote),
      "expectedRevision -1": await sendRequest(null, SESSION_A, { ...VALID_COMMAND, expectedRevision: -1 }),
      "expectedRevision 2^31-1": await sendRequest(null, SESSION_A, { ...VALID_COMMAND, expectedRevision: 2 ** 31 - 1 }),
      "expectedRevision 3.5": await sendRequest(null, SESSION_A, { ...VALID_COMMAND, expectedRevision: 3.5 }),
      // No note: with one, an unknown action also trips the allowed-keys rule (note is allowed only on resolutions) and the case is vacuous.
      "unknown action": await sendRequest(null, SESSION_A, { action: "purchase", expectedRevision: 3, environment: "simulation" }),
      "environment prod": await sendRequest(null, SESSION_A, { ...VALID_COMMAND, environment: "prod" }),
      "note untrimmed": await sendRequest(null, SESSION_A, { ...VALID_COMMAND, note: " checked the vault" }),
      "note blank": await sendRequest(null, SESSION_A, { ...VALID_COMMAND, note: "" }),
    };
  },
  upstream: async () => ({ 500: await upstreamAt(500), 401: await upstreamAt(401), 403: await upstreamAt(403), 404: await upstreamAt(404), 409: await upstreamAt(409) }),
});
