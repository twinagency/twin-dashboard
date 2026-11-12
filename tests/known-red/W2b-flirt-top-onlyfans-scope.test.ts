// Known-red tests for review lane W2b-flirt-top-onlyfans (diff d7f744ec..f883dafb).
// Findings:
//   F1/F3 (blocker): the Flirt agency workspace is chosen by display NAME (usesFlirtAgencyWorkspace),
//          used as a server gate in lib/agency-overview.ts and lib/clone-scope.ts, while the data
//          bridge is keyed by agency id.
//   F2 (high): Top OnlyFans manage rights come from a hard-coded login email plus a different
//          login's Twin row (lib/agency-identity.ts), not the signed-in member's own role.
//   F4 (high, data-risk): voidPayout (lib/payouts/server.ts) filters only id + clone_id, never
//          recorded_by, so a Top OnlyFans manager can void a Johnny entry the FLIRT owner recorded.
// Run:
//   nice -n 10 node --experimental-test-module-mocks --import tsx --test tests/known-red/W2b-flirt-top-onlyfans-scope.test.ts
// Each test: CONTROL assertions pass today; ONE RED assertion fails today because of the finding.
// Offline only: globalThis.fetch is replaced at module top, before any test runs, and is never
// restored. It answers only the synthetic FLIRT host and intercepts the pinned live-Twin host; any
// other URL throws, and every write throws except a PATCH to Twin telegram_creator_payouts (F4).
// next/headers is replaced with node:test mock.module (cookies()/headers() have no request scope
// offline), the same idea as scripts/check-internal-admin.ts and scripts/check-payouts.cjs.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import * as live from "../../deployment/flirt-live-twin.cjs";

const LOCAL_HOST = "lkmfwpqegjluirfusnaw.supabase.co"; // FLIRT ref configuration() requires; intercepted, never reached
const TWIN_HOST = `${live.PROJECT}.supabase.co`;       // pinned live-Twin target; intercepted, never reached
const TOP: string = live.TOP_ONLYFANS_AGENCY_ID;
const JOHNNY: string = live.JOHNNY_COCO_CLONE_ID;
const TWIN_MANAGER_LOGIN = "toponlyfanstwin@dashboard.tgaiclone.xyz"; // the other login lib/agency-identity.ts reads

Object.assign(process.env, {
  NODE_ENV: "production",
  FLIRT_BACKEND_ENABLED: "true",
  FLIRT_SUPABASE_PROJECT_REF: "lkmfwpqegjluirfusnaw",
  SUPABASE_URL: `https://${LOCAL_HOST}`,
  SUPABASE_SERVICE_KEY: "sb_secret_synthetic_test_only",
  DASHBOARD_PUBLIC_ORIGIN: "https://dashboard.flirt.example",
  DASHBOARD_SESSION_SECRET: "synthetic-operator-secret-for-offline-checks-only",
  CREATOR_SESSION_SECRET: "synthetic-creator-secret-for-offline-checks-only",
  DASHBOARD_PASSWORD: "synthetic-admin-password",
  FLIRT_LIVE_TWIN_ENABLED: "true",
  FLIRT_LIVE_TWIN_URL: `https://${TWIN_HOST}`,
  FLIRT_LIVE_TWIN_SERVICE_KEY: "sb_secret_synthetic_test_only_live_twin",
});

// Request context for next/headers.
let jar: Record<string, string> = {};
let requestHeaders = new Headers();
mock.module("next/headers", {
  namedExports: {
    cookies: async () => ({ get: (name: string) => (name in jar ? { name, value: jar[name] } : undefined) }),
    headers: async () => requestHeaders,
  },
});

type Payout = { id: string; clone_id: string; recorded_by: string; voided_at: string | null };
type State = {
  email: string;
  agencyId: string;
  agencyName: string;
  localCanManage?: boolean;
  localCreators: string[];
  twinAssignment: boolean;
  twinRoles: Record<string, boolean>; // Twin agency_memberships.can_manage keyed by the email query param
  twinClones?: { id: string; name: string; intake: unknown }[];
  twinFans?: number;
  payouts?: Payout[];
};
let state: State;
let calls: string[] = [];
let writes: string[] = [];
const json = (body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...extra } });
const eqParam = (url: URL, key: string) => url.searchParams.get(key)?.replace(/^eq\./, "");

function matchesPayout(url: URL, row: Payout): boolean {
  // Honour every PostgREST filter the URL carries; unknown filters fail closed.
  for (const [key, value] of url.searchParams) {
    if (key === "select") continue;
    if (key === "id") { if (value !== `eq.${row.id}`) return false; continue; }
    if (key === "recorded_by") { if (value !== `eq.${row.recorded_by}`) return false; continue; }
    if (key === "voided_at") { if (value !== "is.null" || row.voided_at !== null) return false; continue; }
    if (key === "clone_id") {
      const m = /^in\.\((.*)\)$/.exec(value) ?? /^eq\.(.*)$/.exec(value);
      if (!m || !m[1].split(",").map(s => s.replace(/"/g, "")).includes(row.clone_id)) return false;
      continue;
    }
    throw new Error(`offline test: unhandled payout filter ${key}=${value}`);
  }
  return true;
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  calls.push(`${url.hostname}${url.pathname}`);
  if (url.hostname === TWIN_HOST && method === "PATCH" && url.pathname === "/rest/v1/telegram_creator_payouts") {
    writes.push(`${method} ${url.pathname}?${url.searchParams}`);
    const body = await request.json() as Partial<Payout>;
    const hit = (state.payouts ?? []).filter(row => matchesPayout(url, row));
    for (const row of hit) Object.assign(row, { voided_at: body.voided_at ?? "synthetic-voided" });
    return json(hit.map(row => ({ id: row.id })));
  }
  if (!["GET", "HEAD"].includes(method)) throw new Error(`offline test: write blocked ${method} ${url.hostname}${url.pathname}`);
  if (url.hostname === LOCAL_HOST) {
    if (url.pathname === "/auth/v1/user") return json({ id: "synthetic-user", email: state.email, aud: "authenticated" });
    if (url.pathname === "/rest/v1/agency_memberships") {
      // The member's own local row. can_manage is returned whatever the select asks for.
      const row: Record<string, unknown> = { agency_id: state.agencyId };
      if (state.localCanManage !== undefined) row.can_manage = state.localCanManage;
      return json([row]);
    }
    if (url.pathname === "/rest/v1/partner_agencies") return json([{ id: state.agencyId, name: state.agencyName }]);
    if (url.pathname === "/rest/v1/agency_creators") return json(state.localCreators.map(clone_id => ({ clone_id })));
  }
  if (url.hostname === TWIN_HOST) {
    if (url.pathname === "/rest/v1/agency_creators") return json(state.twinAssignment ? [{ clone_id: JOHNNY, partner_agencies: { active: true } }] : []);
    if (url.pathname === "/rest/v1/agency_memberships") {
      const email = eqParam(url, "email");
      return json(email && email in state.twinRoles ? [{ can_manage: state.twinRoles[email] }] : []);
    }
    if (url.pathname === "/rest/v1/clones") return json(state.twinClones ?? []);
    if (url.pathname === "/rest/v1/users") return json([], { "content-range": `*/${state.twinFans ?? 0}` });
  }
  throw new Error(`offline test: unrecognised URL ${method} ${url.hostname}${url.pathname}`);
}) as typeof fetch;

// The package is CommonJS, so top-level await is unavailable; product modules are imported
// inside each test, which is still after the env, fake fetch and next/headers mock are set.
const load = async () => ({
  ...(await import("../../lib/agency-identity")),
  ...(await import("../../lib/agency-management-policy")),
  ...(await import("../../lib/dashboard-access")),
  ...(await import("../../lib/agency-overview")),
  ...(await import("../../lib/clone-scope")),
  ...(await import("../../lib/payouts/server")),
});

const topState = (over: Partial<State> = {}): State => ({
  email: "tanner@toponlyfansagency.com", agencyId: TOP, agencyName: "Top OnlyFans Agency",
  localCanManage: true, localCreators: [], twinAssignment: true,
  twinRoles: { "tanner@toponlyfansagency.com": true, [TWIN_MANAGER_LOGIN]: true }, ...over,
});
const OTHER = "11111111-2222-4333-8444-555555555555"; // neither TOP_ONLYFANS_AGENCY_ID nor the FLIRT live ID
const CLONE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLONE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const reset = () => { calls = []; writes = []; jar = {}; requestHeaders = new Headers(); };

test("F2: Top OnlyFans manage rights follow the signed-in member's own role", async () => {
  const { agencyIdentity, agencyCanManage } = await load();

  // CONTROL 1: tanner, own local role and own Twin role both managing -> can manage.
  reset();
  state = topState();
  const manager = await agencyIdentity("synthetic-agency-token");
  assert.ok(manager, "control: tanner resolves");
  assert.deepEqual(manager.cloneIds, [JOHNNY]);
  assert.equal(manager.dataSource, "twin-live");
  assert.equal(agencyCanManage(manager), true, "control: tanner with a managing role can manage");
  assert.ok(calls.includes(`${TWIN_HOST}/rest/v1/agency_memberships`), "control: Twin agency_memberships was read (intercepted)");

  // CONTROL 2: another member whose own roles are both non-managing -> cannot manage.
  reset();
  state = topState({ email: "someone.else@toponlyfansagency.com", localCanManage: false,
    twinRoles: { "someone.else@toponlyfansagency.com": false, [TWIN_MANAGER_LOGIN]: true } });
  assert.equal(agencyCanManage(await agencyIdentity("synthetic-agency-token")), false, "control: non-managing member cannot manage");

  // CONTROL 3: no Twin assignment -> no identity.
  reset();
  state = topState({ twinAssignment: false });
  assert.equal(await agencyIdentity("synthetic-agency-token"), null, "control: missing Twin assignment refuses");

  // CONTROL 4: live flag disabled -> no identity, and the Twin host is never contacted.
  reset();
  state = topState();
  process.env.FLIRT_LIVE_TWIN_ENABLED = "false";
  try {
    assert.equal(await agencyIdentity("synthetic-agency-token"), null, "control: disabled live flag refuses");
  } finally { process.env.FLIRT_LIVE_TWIN_ENABLED = "true"; }
  assert.ok(calls.includes(`${LOCAL_HOST}/rest/v1/partner_agencies`), "control: flag-off path reached partner_agencies");
  assert.equal(calls.filter(c => c.startsWith(TWIN_HOST)).length, 0, "control: flag-off path made no Twin call");

  // RED: tanner's OWN local can_manage is false and tanner's OWN Twin role is false; only the
  // separate toponlyfanstwin login is a manager. Today manage still resolves true.
  reset();
  state = topState({ localCanManage: false,
    twinRoles: { "tanner@toponlyfansagency.com": false, [TWIN_MANAGER_LOGIN]: true } });
  const demoted = await agencyIdentity("synthetic-agency-token");
  assert.ok(demoted, "control: demoted tanner still resolves read-only");
  assert.equal(agencyCanManage(demoted), false, "F2: manage must follow the signed-in member's own role, not a hard-coded email");
});

test("F1/F3: Flirt agency workspace gate in getAgencyOverview must be id-based, not name-based", async () => {
  // Identities come from the real agencyIdentity() over the faked wire, installed with
  // withDashboardAccess (the seam lib/dashboard-access.ts exports for scripts/check-*.ts).
  const { agencyIdentity, withDashboardAccess, getAgencyOverview } = await load();
  assert.notEqual(OTHER, TOP);
  assert.notEqual(OTHER, live.ID);

  // CONTROL (positive): the real TOP identity passes the gate and gets Johnny's overview.
  reset();
  state = { ...topState(), twinClones: [{ id: JOHNNY, name: "Johnny Coco", intake: {} }], twinFans: 5 };
  const top = await agencyIdentity("synthetic-agency-token");
  assert.ok(top, "control: TOP resolves");
  const topOverview = await withDashboardAccess(top, () => getAgencyOverview());
  assert.deepEqual(topOverview.creators.map(c => [c.id, c.totalFans]), [[JOHNNY, 5]], "control: TOP gets Johnny's overview");
  assert.equal(topOverview.audience.total, 5);
  assert.ok(calls.includes(`${TWIN_HOST}/rest/v1/clones`), "control: overview read Johnny from Twin (intercepted)");

  // CONTROL: an unrelated agency with an ordinary name is denied.
  reset();
  state = { email: "owner@some-agency.example", agencyId: OTHER, agencyName: "Some Agency", localCreators: [], twinAssignment: false, twinRoles: {} };
  const plain = await agencyIdentity("synthetic-agency-token");
  assert.ok(plain, "control: unrelated agency resolves");
  assert.equal(plain.id, OTHER);
  await assert.rejects(withDashboardAccess(plain, () => getAgencyOverview()), /Agency overview access denied/, "control: Some Agency is denied");

  // RED: the same unrelated agency id, renamed "Top OnlyFans Agency", passes the gate today.
  reset();
  state = { ...state, agencyName: "Top OnlyFans Agency" };
  const lookalike = await agencyIdentity("synthetic-agency-token");
  assert.ok(lookalike, "control: lookalike agency resolves");
  assert.equal(lookalike.id, OTHER, "control: lookalike keeps its own non-TOP id");
  assert.notEqual(lookalike.dataSource, "twin-live", "control: lookalike is not on the live bridge");
  let outcome: string;
  try {
    outcome = `returned ${JSON.stringify(await withDashboardAccess(lookalike, () => getAgencyOverview()))}`;
  } catch (error) {
    outcome = error instanceof Error ? error.message : String(error);
  }
  assert.match(outcome, /Agency overview access denied/, "F1/F3: workspace gate must be id-based, not name-based");
});

test("F1/F3: Flirt agency workspace gate in getCloneScope must be id-based, not name-based", async () => {
  const { agencyIdentity, withDashboardAccess, getCloneScope, CLONE_SCOPE_COOKIE } = await load();
  // On /revenue the workspace branch ignores the clone cookie (returns the URL header selection or
  // null); a non-workspace agency keeps its cookie selection.

  // CONTROL (positive): real TOP identity on /revenue with no overview header -> workspace "All" (null).
  reset();
  state = topState();
  const top = await agencyIdentity("synthetic-agency-token");
  assert.ok(top, "control: TOP resolves");
  jar = { [CLONE_SCOPE_COOKIE]: JOHNNY };
  requestHeaders = new Headers({ "x-pathname": "/revenue" });
  assert.equal(await withDashboardAccess(top, () => getCloneScope()), null, "control: TOP uses the workspace scope");

  // CONTROL: unrelated "Some Agency" with two creators keeps its cookie selection.
  reset();
  state = { email: "owner@some-agency.example", agencyId: OTHER, agencyName: "Some Agency", localCreators: [CLONE_A, CLONE_B], twinAssignment: false, twinRoles: {} };
  const plain = await agencyIdentity("synthetic-agency-token");
  assert.ok(plain, "control: unrelated agency resolves");
  jar = { [CLONE_SCOPE_COOKIE]: CLONE_A };
  requestHeaders = new Headers({ "x-pathname": "/revenue" });
  assert.equal(await withDashboardAccess(plain, () => getCloneScope()), CLONE_A, "control: Some Agency keeps its selection");

  // RED: the same agency id renamed "Top OnlyFans Agency" is switched onto the workspace branch.
  reset();
  state = { ...state, agencyName: "Top OnlyFans Agency" };
  const lookalike = await agencyIdentity("synthetic-agency-token");
  assert.ok(lookalike, "control: lookalike agency resolves");
  assert.equal(lookalike.id, OTHER);
  jar = { [CLONE_SCOPE_COOKIE]: CLONE_A };
  requestHeaders = new Headers({ "x-pathname": "/revenue" });
  assert.equal(await withDashboardAccess(lookalike, () => getCloneScope()), CLONE_A, "F1/F3: clone-scope workspace gate must be id-based, not name-based");
});

test("F4: an agency must not void payout entries another tenant recorded on a shared clone", async () => {
  const { agencyIdentity, withDashboardAccess, requirePayoutViewer, voidPayout } = await load();
  const FLIRT_ACTOR = `agency:${live.ID}`; // actor lib/payouts/access.ts gives the FLIRT owner's live identity
  const TOP_ACTOR = `agency:${TOP}`;
  assert.ok(live.CLONES.includes(JOHNNY), "control: Johnny is also in the FLIRT owner's clones (shared ledger)");
  const OWN = "c0000000-0000-4000-8000-000000000001";
  const OTHER_CLONE_ROW = "c0000000-0000-4000-8000-000000000002";
  const FLIRT_ROW = "c0000000-0000-4000-8000-000000000003";
  const ZOEY = "4fff7866-c7e9-4af2-926a-36e727c0a77f"; // a FLIRT clone outside TOP's scope

  reset();
  state = { ...topState(), payouts: [
    { id: OWN, clone_id: JOHNNY, recorded_by: TOP_ACTOR, voided_at: null },
    { id: OTHER_CLONE_ROW, clone_id: ZOEY, recorded_by: FLIRT_ACTOR, voided_at: null },
    { id: FLIRT_ROW, clone_id: JOHNNY, recorded_by: FLIRT_ACTOR, voided_at: null },
  ] };
  const top = await agencyIdentity("synthetic-agency-token");
  assert.ok(top, "control: TOP resolves");
  const viewer = await withDashboardAccess(top, () => requirePayoutViewer());
  assert.equal(viewer.actor, TOP_ACTOR, "control: viewer built by lib/payouts/access.ts");
  assert.equal(viewer.canManage, true, "control: TOP manager can manage payouts");
  assert.deepEqual(viewer.cloneIds, [JOHNNY]);

  // CONTROL: TOP voids its own Johnny entry.
  assert.deepEqual(await voidPayout(viewer, { id: OWN, reason: "synthetic correction" }), { id: OWN }, "control: own entry voids");
  assert.equal(writes.length, 1, "control: one intercepted PATCH");

  // CONTROL: a non-Johnny row is refused by the clone_id filter.
  await assert.rejects(voidPayout(viewer, { id: OTHER_CLONE_ROW, reason: "synthetic correction" }), /unavailable or already voided/, "control: out-of-scope clone refused");
  assert.equal(state.payouts![1].voided_at, null);

  // RED: the FLIRT owner's Johnny entry must be refused. Today it is voided.
  let outcome: string;
  try {
    outcome = `voided ${JSON.stringify(await voidPayout(viewer, { id: FLIRT_ROW, reason: "synthetic correction" }))}`;
  } catch (error) {
    outcome = `refused: ${error instanceof Error ? error.message : String(error)}`;
  }
  assert.match(outcome, /^refused/, "F4: an agency must not void payout entries another tenant recorded on a shared clone");
});
