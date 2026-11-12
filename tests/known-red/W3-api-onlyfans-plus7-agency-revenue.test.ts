// KNOWN RED (W3 api-onlyfans-plus7 findings D-C1 = codex-da DA2; REVIEW.md inv 7 "Isolation: a new route is added to the allowlist
// deliberately"). Two levels:
//  - Predicate: the real lib/onlyfans/agency-scope.ts agencyOnlyFansRequest, which middleware.ts:266 uses to admit agency users to
//    /onlyfans pages.
//  - Route level: the real middleware.ts `middleware(req)` under NODE_ENV=production, no DASHBOARD_NO_AUTH, no TWIN_APP_MODE, for a GET
//    with only the agency access cookie (lib/agency-policy.ts AGENCY_COOKIE). Real: renewAgencySession (no refresh cookie, so
//    "unchanged" with no network, lib/agency-session.ts:55), activeViewAs (no view-as cookie), lib/agency-identity.ts agencyIdentity
//    and agencyIdentityById, staffCreatorIds, agencyCanManage, agencyOnlyFansRequest, agencyDashboardPath. Bypass (the session lookup's
//    boundary): lib/supabase-service.ts serviceClient() returns an in-memory fake (tests/helpers/W3-api-onlyfans-plus7-harness.ts mocks
//    it to `state.db`; its other mocks and its env are inert here) answering auth.getUser(token) with one synthetic user, one active
//    agency_memberships row (creator_scope all), one active partner_agencies row ("Synthetic Agency", not Twin Technologies, Moxy or a
//    partner preview) and one agency_creators row. The fetch stub records any network call; none is expected.
//    Admitted = middleware answered NextResponse.next() (x-middleware-next: 1), refused = 403 "Administrator access required"
//    (middleware.ts:273, because agencyDashboardPath does not list /onlyfans/revenue either). Roles differ only in can_manage; for
//    a non-partner agency agencyCanManage (agency-management-policy.ts:6-8) is false, so ofManage is false for both and GET page
//    admission does not depend on it.
// Trace: agency-scope.ts:52 page regex lists overview|accounts|inbox|content|sales|settings|campaigns|operations|launch but not revenue,
// so an agency user (manager or reader) gets 403 on /onlyfans/revenue, while lib/channel-nav.ts:111 advertises it in the shared nav
// (components/Sidebar.tsx:287 renders channel.nav unfiltered) and
// app/onlyfans/revenue/page.tsx:10 reads it with requireOnlyFansRead({ agency: true }) (agency-scoped backend), like overview.
// Fixed looks like `revenue` in that page list (GET/HEAD), i.e. /onlyfans/revenue admitted exactly like /onlyfans/overview. (If the owner
// instead decides revenue is internal-only, the fix is hiding the nav entry for agency users and this test needs a TEST-CHANGE.)
// Team's Claude owns the fix. Not wired into npm scripts or init.sh. Runs with plain commands (the file re-runs itself under
// --experimental-test-module-mocks, see ensureModuleMocks):
//   node --import tsx --test --test-name-pattern='^control' tests/known-red/W3-api-onlyfans-plus7-agency-revenue.test.ts   (green)
//   node --import tsx --test --test-skip-pattern='^control' tests/known-red/W3-api-onlyfans-plus7-agency-revenue.test.ts   (red, ERR_ASSERTION)
// Synthetic values only; the agency access token is generated per run (randomUUID).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before, beforeEach } from "node:test";
import { NextRequest } from "next/server";
import { agencyOnlyFansRequest } from "../../lib/onlyfans/agency-scope";
import { AGENCY_COOKIE } from "../../lib/agency-policy";
import { ONLYFANS_CHANNEL } from "../../lib/channel-nav";
import { ORIGIN, calls, ensureModuleMocks, reset, state } from "../helpers/W3-api-onlyfans-plus7-harness";

const roles = [["manager", true], ["reader", false]] as const;
const AGENCY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd", USER = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", CREATOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REVISION = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const TOKEN = `a-${randomUUID()}`;
let canManage = false;
const lookups: string[] = [];

/** serviceClient() fake: just the reads lib/agency-identity.ts agencyIdentity + agencyIdentityById make. */
function fakeDb() {
  const rows: Record<string, Array<Record<string, unknown>>> = {
    agency_memberships: [{ user_id: USER, active: true, agency_id: AGENCY, can_manage: canManage, can_chat: false, creator_scope: "all", creator_ids: [], creator_access_revision: REVISION }],
    partner_agencies: [{ id: AGENCY, active: true, name: "Synthetic Agency" }],
    agency_creators: [{ agency_id: AGENCY, clone_id: CREATOR }],
  };
  return {
    auth: { getUser: async (token: string) => { lookups.push("auth.getUser"); return token === TOKEN ? { data: { user: { id: USER } }, error: null } : { data: { user: null }, error: { message: "invalid" } }; } },
    from(table: string) {
      lookups.push(table);
      const filters: Array<[string, unknown]> = [];
      const result = () => ({ data: (rows[table] ?? []).filter(row => filters.every(([k, v]) => row[k] === v)), error: null });
      const q: Record<string, unknown> = {
        select: () => q, eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
        maybeSingle: async () => { const r = result(); return { ...r, data: r.data[0] ?? null }; },
        then: (a: (v: unknown) => unknown, b: (e: unknown) => unknown) => Promise.resolve(result()).then(a, b),
      };
      return q;
    },
  };
}

type Middleware = (req: NextRequest) => Promise<Response>;
async function visit(path: string) {
  const { middleware } = await import(new URL("../../middleware.ts", import.meta.url).href) as { middleware: Middleware };
  const response = await middleware(new NextRequest(`${ORIGIN}${path}`, { headers: { cookie: `${AGENCY_COOKIE}=${TOKEN}` } }));
  return { status: response.status, admitted: response.headers.get("x-middleware-next") === "1" };
}

if (ensureModuleMocks(import.meta.url, { controls: 2, rest: 4 })) {
  const ENV = ["NODE_ENV", "DASHBOARD_NO_AUTH", "TWIN_APP_MODE"] as const;
  const saved = Object.fromEntries(ENV.map(k => [k, process.env[k]]));
  before(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.DASHBOARD_NO_AUTH; delete process.env.TWIN_APP_MODE;
  });
  after(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else (process.env as Record<string, string | undefined>)[k] = saved[k]; } });
  beforeEach(() => { reset(); lookups.length = 0; });

  test("control: agency managers and readers may open /onlyfans/overview, and the shared OnlyFans nav lists /onlyfans/revenue", () => {
    for (const [, manage] of roles) assert.equal(agencyOnlyFansRequest("/onlyfans/overview", "GET", false, manage), true);
    const hrefs = ONLYFANS_CHANNEL.nav.map(item => item.href);
    assert.ok(hrefs.includes("/onlyfans/revenue"), "the nav advertises the revenue page");
  });

  test("control: through the real middleware, an agency manager and reader are admitted to /onlyfans/overview after a real identity lookup", async () => {
    for (const [role, manage] of roles) {
      canManage = manage; state.db = fakeDb(); lookups.length = 0;
      const overview = await visit("/onlyfans/overview");
      assert.deepEqual(overview, { status: 200, admitted: true }, `/onlyfans/overview was not admitted for an agency ${role}`);
      assert.ok(lookups.includes("auth.getUser") && lookups.includes("agency_memberships"), "the agency session was resolved through agencyIdentity");
      const elsewhere = await visit("/onlyfans/plan-c");
      assert.equal(elsewhere.status, 403, `an unlisted OnlyFans page was not refused for an agency ${role}, so admission is not vacuous`);
    }
    assert.equal(calls.length, 0, "the middleware made no network call");
  });

  for (const [role, manage] of roles) {
    test(`D-C1: an agency ${role} is admitted to /onlyfans/revenue exactly like /onlyfans/overview`, () => {
      assert.equal(agencyOnlyFansRequest("/onlyfans/revenue", "GET", false, manage), agencyOnlyFansRequest("/onlyfans/overview", "GET", false, manage),
        `/onlyfans/revenue is refused for an agency ${role} although the nav links it`);
    });

    test(`D-C1: through the real middleware, an agency ${role} is admitted to /onlyfans/revenue exactly like /onlyfans/overview`, async () => {
      canManage = manage; state.db = fakeDb();
      const overview = await visit("/onlyfans/overview");
      const revenue = await visit("/onlyfans/revenue");
      assert.deepEqual(revenue, overview, `the middleware answered /onlyfans/revenue ${revenue.status} for an agency ${role} although the nav links it`);
    });
  }
}
