/**
 * Child process for the G06 route tests in tests/rules/ (W3 lane lib-onlyfans-2). Spawned under
 * --experimental-test-module-mocks; the `*.test.*` glob does not run it. Pattern: W1's
 * tests/rules/core-route.child.ts (64622d30), adapted.
 * Drives the REAL handlers engagementSettings / engagementActions in lib/onlyfans/launch/b-native-routes.ts and
 * accountControls in lib/onlyfans/launch/account-controls-route.ts through bGate -> requireOnlyFansRead -> isAuthed ->
 * verifyOwnerSession, and the real native configuration/control transports (configuredNative*Backend ->
 * createBackendTransport); and the conversation-controls POST route
 * (app/api/onlyfans-controls/accounts/[accountId]/conversations/[conversationId]/route.ts) for a synthetic agency
 * chatter (canChat, not canManage), which is refused before any backend call. Replaced, and only these:
 *  - `next/headers`: no Next request scope offline. cookies() hands back a synthetic operator session.
 *  - `lib/view-as-banner.ts`: a real view-as needs a signed cookie plus a DB lookup; here always "not viewing as".
 *  - `lib/onlyfans/plan-c-owner.ts`: its `import "server-only"` line (RISKS D3; Next's bundler makes it a no-op).
 *    Replaced by the real core; these routes never reach it on the paths driven here.
 * The wire is a fake `fetch` at *.invalid origins: the Supabase owner-session verify RPC answers true; the OnlyFans
 * configuration/control backend answers per scenario and every call is recorded; POST acks echo the request's
 * commandKey (absent when the request carried none). Synthetic values only.
 * Usage: W3-lib-onlyfans-2-route.child.ts <scenario>. Prints one JSON line (RouteRun).
 */
import { mock } from "node:test";
import { NextRequest } from "next/server";
import { namedOwnerActor } from "../../lib/onlyfans/plan-c-owner-core";
import { SESSION_COOKIE } from "../../lib/session";
import { withDashboardAccess } from "../../lib/dashboard-access";

export type Scenario = "settings-read" | "settings-extra-field" | "refresh" | "cancel-confirmed" | "cancel-not-requested"
  | "account-stop-401" | "account-stop-403" | "controls-non-manager" | "account-stop-bare" | "account-stop-bare-unread" | "account-pause-bare"
  | "account-resume-bare" | "account-stop-stale" | "account-pause" | "account-stop-bare-signed-out" | "account-stop-bare-chatter";
export type RouteRun = { status: number; body: Record<string, unknown>; calls: { method: string; path: string; body: unknown }[] };

const DASH = "https://dash.fixture.invalid", BACKEND = "https://backend.fixture.invalid", SUPABASE = "https://supabase.fixture.invalid";
const ACCOUNT = "of-a", ACTION_ID = "12345678-1234-4234-8234-123456789abc";
const CONFIG = `/onlyfans/configuration/v1/accounts/${ACCOUNT}`;
const CONTROL = `/onlyfans/control/v1/accounts/${ACCOUNT}/control`;
const UUID = (n: number) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
// AgencyIdentity (lib/agency-identity.ts) of a chatter: chat capability, no management.
const CHATTER = { id: UUID(2), name: "Synthetic agency", cloneIds: [UUID(3)], userId: UUID(4), canManage: false, canChat: true };
// Built at runtime so no literal in this file is session shaped; matches /^owner_[a-f0-9]{64}$/ (lib/owner-auth.ts).
const SESSION = ["owner", "1".repeat(64)].join("_");

const POLICY = { enabled: true, offers: true, follow_ups: true, reengagement: false, offer_delay_hours: 24, follow_up_delay_hours: 24,
  reengage_delay_hours: 168, expiry_hours: 24, fan_daily_limit: 1, fan_weekly_limit: 2, account_hourly_limit: 5, account_daily_limit: 20,
  unpaid_cooldown_hours: 48, repeat_item_days: 30, follow_up_text: "Synthetic follow up", reengage_text: "Synthetic hello" };
const envelope = { schemaVersion: "of-configuration.v3", ok: true, accountId: ACCOUNT };
const action = (status: string, cancelRequested: boolean) => ({ actionId: ACTION_ID, kind: "follow_up", status, reason: null, fanId: "101",
  dueAt: "2026-11-12T10:00:00.000Z", expiresAt: "2026-11-13T10:00:00.000Z", intentId: null, cancelRequested });

async function main(scenario: Scenario): Promise<RouteRun> {
  Object.assign(process.env, { SUPABASE_URL: SUPABASE, SUPABASE_SERVICE_KEY: "synthetic-service-key", ONLYFANS_API_BASE_URL: BACKEND,
    ONLYFANS_API_TOKEN: "synthetic-api", ONLYFANS_CONTROL_TOKEN: "synthetic-control", ONLYFANS_CONFIGURATION_TOKEN: "synthetic-configuration" });
  mock.module("next/headers", { namedExports: {
    cookies: async () => ({ get: (name: string) => name === SESSION_COOKIE && scenario !== "account-stop-bare-signed-out" ? { name, value: SESSION } : undefined, getAll: () => [], has: () => false }),
    headers: async () => new Headers(),
  } });
  mock.module(new URL("../../lib/view-as-banner.ts", import.meta.url).href, { namedExports: { getViewAsBannerInfo: async () => null } });
  mock.module(new URL("../../lib/onlyfans/plan-c-owner.ts", import.meta.url).href, { namedExports: { namedOwnerActor } });

  const calls: RouteRun["calls"] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input)), method = init.method ?? "GET";
    if (url.origin === SUPABASE)
      return url.pathname.endsWith("/dashboard_owner_session_verify") ? Response.json(true) : Response.json(null, { status: 404 });
    if (url.origin !== BACKEND) return Response.json({ ok: false }, { status: 404 });
    const body = init.body === undefined ? null : JSON.parse(String(init.body)) as unknown;
    calls.push({ method, path: url.pathname, body });
    if (method === "GET" && url.pathname === `${CONFIG}/engagement`)
      return Response.json({ ...envelope, engagementVersion: "of-engagement.v1", revision: 3, bindingCurrent: true, settings: POLICY,
        // Two unknown top-level fields with distinct names: a fix that strips one known name still leaks the other.
        // (An unknown key INSIDE `settings` is already refused: validPolicy, native.ts:527, wants exactly 16 keys -> 503.)
        ...(scenario === "settings-extra-field" ? { internalNote: "x", backendOnlyHint: "y" } : {}) });
    // G07a: every STOP is pinned by the route to the fingerprint it reads now ("e"), never the one a client holds ("f").
    if (method === "GET" && url.pathname === `/onlyfans/api/v1/accounts/${ACCOUNT}/readiness`)
      return scenario !== "account-stop-bare-unread" ? Response.json({ schemaVersion: "of-preview.v2", ok: true, accountId: ACCOUNT,
        readiness: { accountControl: { fingerprint: "e".repeat(64) } } }) : Response.json({ ok: false }, { status: 503 });
    if (method === "POST" && url.pathname === CONTROL && ["account-stop-bare", "account-stop-stale", "account-pause"].includes(scenario))
      return Response.json({ schemaVersion: "of-controls.v1", ok: true, accountId: ACCOUNT, command: { recorded: true, commandKey: (body as { commandKey: string }).commandKey } });
    if (method === "POST" && url.pathname === CONTROL && (scenario === "account-stop-401" || scenario === "account-stop-403"))
      return Response.json({ ok: false, error: "synthetic upstream answer" }, { status: scenario === "account-stop-401" ? 401 : 403 });
    const m = new RegExp(`^${CONFIG}/engagement/actions/([a-f0-9-]{36})/(cancel|refresh)$`).exec(url.pathname);
    if (method === "POST" && m && m[1] === ACTION_ID) {
      const a = scenario === "refresh" ? action("queued", false)
        : scenario === "cancel-confirmed" ? action("cancelled", true)
        : action("accepted", false); // cancel-not-requested: same action, transport-accepted, no cancellation recorded
      const key = body && typeof body === "object" ? (body as Record<string, unknown>).commandKey : undefined;
      return Response.json({ ...envelope, ...(key === undefined ? {} : { commandKey: key }), engagementVersion: "of-engagement.v1", action: a });
    }
    return Response.json({ ok: false }, { status: 404 });
  }) as typeof fetch;

  const { engagementSettings, engagementActions } = await import("../../lib/onlyfans/launch/b-native-routes");
  const headers = { origin: DASH, "sec-fetch-site": "same-origin", "content-type": "application/json" };
  let response: Response;
  if (scenario.startsWith("account-")) {
    const { accountControls } = await import("../../lib/onlyfans/launch/account-controls-route");
    const bare = scenario.includes("-bare"), verb = scenario.split("-")[1];
    const request = new NextRequest(`${DASH}/api/onlyfans-launch/automation/accounts/${ACCOUNT}/emergency-stop`, { method: "POST", headers,
      body: JSON.stringify({ action: verb === "stop" ? "emergency_stop" : verb, ...(bare ? {} : { expectedFingerprint: "f".repeat(64) }), reason: "synthetic check" }) });
    response = await withDashboardAccess(scenario === "account-stop-bare-chatter" ? CHATTER : null, () => accountControls(request, ACCOUNT, true));
  } else if (scenario === "controls-non-manager") {
    const { POST } = await import("../../app/api/onlyfans-controls/accounts/[accountId]/conversations/[conversationId]/route");
    const request = new NextRequest(`${DASH}/api/onlyfans-controls/accounts/${ACCOUNT}/conversations/conv-1`, { method: "POST", headers,
      body: JSON.stringify({ action: "pause_automation", expectedRevision: 1 }) });
    response = await withDashboardAccess(CHATTER, () => POST(request, { params: Promise.resolve({ accountId: ACCOUNT, conversationId: "conv-1" }) }));
  } else if (scenario === "settings-read" || scenario === "settings-extra-field") {
    const request = new NextRequest(`${DASH}/api/onlyfans-launch/automation/accounts/${ACCOUNT}/settings`, { headers });
    response = await withDashboardAccess(null, () => engagementSettings(request, ACCOUNT));
  } else {
    const request = new NextRequest(`${DASH}/api/onlyfans-launch/automation/accounts/${ACCOUNT}/follow-ups`, { method: "POST", headers,
      body: JSON.stringify({ action: scenario === "refresh" ? "refresh" : "cancel", actionId: ACTION_ID }) });
    response = await withDashboardAccess(null, () => engagementActions(request, ACCOUNT, true));
  }
  return { status: response.status, body: (await response.json()) as Record<string, unknown>, calls };
}

main((process.argv[2] ?? "") as Scenario).then(out => process.stdout.write(JSON.stringify(out) + "\n"));
