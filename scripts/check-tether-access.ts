import { configureFlirtOfflineEnv } from "./flirt-offline-env";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as login, GET as loginEntry } from "../app/tether/auth/route";
import { POST as logout } from "../app/agency/logout/route";
import { middleware } from "../middleware";
import { SESSION_COOKIE } from "../lib/session";
import { AGENCY_COOKIE, agencyRequestAllowed, scopeAgencyClones, isAgencyPath } from "../lib/agency-policy";
import { portalLoginPath, pathAgencyName, agencyLoginPath } from "../lib/agency-brand";
import { TETHER_PORTAL as portal, JESS_KATE_PORTAL } from "../lib/partner-portals";
import { agencyCanManage, LYNQ_MANAGEMENT_AGENCY_ID } from "../lib/agency-management-policy";
import { withDashboardAccess, accessCacheKey } from "../lib/dashboard-access";
import { scopeReadUrl } from "../lib/agency-query";
import { scopeAgencyWrite } from "../lib/agency-write";

const origin = "https://dashboard.flirt.example";
// Offline fixtures only: never assign production creators or issue live tokens.
const first = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const second = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const other = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const user = "11111111-1111-1111-1111-111111111111";
const email = "operator@tether.test";

async function main() {
  Object.assign(process.env, { NODE_ENV: "production", SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", SUPABASE_SERVICE_KEY: "sb_secret_synthetic_test_only", DASHBOARD_PASSWORD: "offline-admin-password" });
  configureFlirtOfflineEnv();
  const oldFetch = globalThis.fetch;
  let active = true, agencyActive = true, wrongUser = false, wrongAgency = false, tokenRequests = 0;
  let assigned = [first];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    let body: unknown;
    if (url.pathname === "/auth/v1/token") {
      tokenRequests++;
      const credentials = JSON.parse(String(init?.body));
      assert.equal(credentials.email, email);
      if (credentials.password !== "offline-partner-password") return new Response(JSON.stringify({ message: "Invalid credentials" }), { status: 400, headers: { "content-type": "application/json" } });
      body = { access_token: "tether-token", refresh_token: "fixture-refresh", expires_in: 3600, token_type: "bearer", user: { id: wrongUser ? "different-user" : user } };
    } else if (url.pathname === "/auth/v1/user") body = { id: user };
    else if (url.pathname === "/auth/v1/logout") body = {};
    else if (url.pathname === "/rest/v1/agency_memberships") {
      assert.equal(url.searchParams.get("active"), "eq.true");
      if (url.searchParams.get("select") === "agency_id") {
        assert.equal(url.searchParams.get("user_id"), `eq.${user}`);
        body = active ? { agency_id: wrongAgency ? LYNQ_MANAGEMENT_AGENCY_ID : portal.id } : null;
      } else {
        assert.equal(url.searchParams.get("agency_id"), `eq.${portal.id}`);
        body = active && url.searchParams.get("email") === `eq.${email}` ? { user_id: user, email } : null;
      }
    } else if (url.pathname === "/rest/v1/partner_agencies") {
      assert.equal(url.searchParams.get("active"), "eq.true");
      body = agencyActive ? { id: wrongAgency ? LYNQ_MANAGEMENT_AGENCY_ID : portal.id, name: portal.name } : null;
    } else if (url.pathname === "/rest/v1/agency_creators") {
      assert.equal(url.searchParams.get("agency_id"), `eq.${wrongAgency ? LYNQ_MANAGEMENT_AGENCY_ID : portal.id}`);
      body = assigned.map(clone_id => ({ clone_id }));
    } else throw new Error(`Unexpected request ${url.pathname}`);
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  };
  const request = (values: Record<string, string> = {}, source = origin, headers: Record<string, string> = {}) => new NextRequest(origin + portal.loginPath + "/auth", {
    method: "POST", headers: { origin: source, accept: "application/json", ...headers },
    body: new URLSearchParams({ email, password: "offline-partner-password", ...values }),
  });
  try {
    assert.equal(portalLoginPath(portal.slug), portal.loginPath);
    assert.equal(pathAgencyName(portal.loginPath), portal.name);
    assert.equal(agencyLoginPath(portal.name), portal.loginPath);
    assert.equal(isAgencyPath("/tether-spoof"), false);
    assert.equal(agencyRequestAllowed("/tether/auth", "POST", false), true);
    assert.equal(agencyRequestAllowed("/tether/auth", "POST", true), false);
    assert.equal(agencyRequestAllowed("/tether/arbitrary-write", "POST", false), false);
    assert.equal(loginEntry(new NextRequest(origin + "/tether/auth")).headers.get("location"), origin + portal.loginPath);
    for (const cookie of ["", "twin_agency_access=stale; twin_agency_portal=moxy", "twin_agency_access=stale; twin_agency_portal=lynq"]) {
      assert.equal((await middleware(new NextRequest(origin + portal.loginPath, { headers: { cookie } }))).status, 200);
      assert.equal((await middleware(new NextRequest(origin + portal.loginPath, { method: "POST", headers: { cookie, "next-action": "forged" } }))).status, 403);
    }
    assert.equal((await login(request({}, "https://evil.example"))).status, 403);
    assert.equal((await login(request({}, origin, { "next-action": "forged" }))).status, 403);
    assert.equal(tokenRequests, 0);
    const invalidCases: Record<string, string>[] = [{ email: "" }, { email: "not-an-email" }, { email: "not-a-member@tether.test" }, { password: "" }, { password: "x".repeat(257) }];
    for (const values of invalidCases) assert.equal((await login(request(values))).status, 401);
    assert.equal(tokenRequests, 0);
    assert.equal((await login(request({ password: "wrong-password" }))).status, 401);
    const ok = await login(request({ email: "  OPERATOR@TETHER.TEST  ", agency: LYNQ_MANAGEMENT_AGENCY_ID, clone: other, next: "/settings" }));
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ok: true });
    assert.equal(ok.cookies.get(AGENCY_COOKIE)?.value, "tether-token");
    assert.equal(ok.cookies.get(SESSION_COOKIE)?.value, "");
    assert.equal(ok.cookies.get("clone_scope")?.value, first);
    assert.equal(ok.cookies.get("twin_agency_portal")?.value, portal.slug);
    assert.equal(ok.cookies.get(AGENCY_COOKIE)?.secure, true);
    assert.equal(ok.cookies.get(AGENCY_COOKIE)?.httpOnly, true);
    assert.equal(ok.cookies.get(AGENCY_COOKIE)?.sameSite, "strict");
    const htmlLogin = await login(request({}, origin, { accept: "text/html" }));
    assert.equal(htmlLogin.status, 303);
    assert.equal(htmlLogin.headers.get("location"), origin + "/revenue");
    active = false;
    const before = tokenRequests;
    assert.equal((await login(request())).status, 401);
    assert.equal(tokenRequests, before);
    active = true;
    for (const set of [(x: boolean) => wrongUser = x, (x: boolean) => wrongAgency = x, (x: boolean) => agencyActive = !x]) {
      set(true); assert.equal((await login(request())).status, 401); set(false);
    }
    assigned = [];
    assert.equal((await login(request())).status, 401);
    assigned = [first, second];
    const pair = await login(request());
    assert.equal(pair.status, 200);
    assert.equal(pair.cookies.get("clone_scope")?.value, "");
    const cookie = `${AGENCY_COOKIE}=tether-token; twin_agency_portal=${portal.slug}; clone_scope=${other}`;
    for (const path of ["/revenue", "/analytics", "/clones", "/users", "/media", "/flows", "/business", `/clones/${first}`, `/clones/${second}`]) assert.equal((await middleware(new NextRequest(origin + path, { headers: { cookie } }))).status, 200);
    for (const path of ["/settings", "/agency-admin", "/api-access", `/clones/${other}`, `/revenue?clone=${other}`, `/users?cloneId=${other}`]) assert.equal((await middleware(new NextRequest(origin + path, { headers: { cookie } }))).status, 403);
    assert.equal((await middleware(new NextRequest(origin + `/clones/${other}`, { method: "POST", headers: { cookie, origin, "next-action": "forged" } }))).status, 403);
    active = false;
    assert.equal((await middleware(new NextRequest(origin + "/revenue", { headers: { cookie } }))).headers.get("location"), origin + portal.loginPath);
    active = true;
    const identity = { id: portal.id, name: portal.name, cloneIds: [first, second] };
    assert.equal(agencyCanManage(identity), true);
    assert.equal(agencyCanManage({ id: "not-approved", name: portal.name } as any), false);
    assert.equal(agencyCanManage({ id: LYNQ_MANAGEMENT_AGENCY_ID }), true);
    assert.equal(agencyCanManage({ id: JESS_KATE_PORTAL.id }), true);
    assert.equal(agencyCanManage({ id: "bc670215-110b-4ea0-8f5c-af3dfe21d253" }), false);
    assert.deepEqual(scopeAgencyClones(identity.cloneIds), [first, second]);
    assert.deepEqual(scopeAgencyClones(identity.cloneIds, second), [second]);
    assert.throws(() => scopeAgencyClones(identity.cloneIds, other));
    assert.notEqual(accessCacheKey(identity), accessCacheKey({ id: LYNQ_MANAGEMENT_AGENCY_ID, name: "LYNQ", cloneIds: [first, second] }));
    await withDashboardAccess(identity, async () => {
      for (const table of ["clones", "users", "star_transactions", "photos", "videos", "chat_history"]) {
        const { url } = scopeReadUrl(new URL(`https://abcdefghijklmnopqrst.supabase.co/rest/v1/${table}?select=*&or=(clone_id.eq.${other})`), identity);
        assert.ok(url.searchParams.get("and")?.includes(first));
        assert.ok(url.searchParams.get("and")?.includes(second));
      }
      const own = new URL(`https://abcdefghijklmnopqrst.supabase.co/rest/v1/clones?id=eq.${first}`);
      assert.ok((await scopeAgencyWrite(own, "PATCH", { starting_credits: 10 }, identity)).searchParams.get("and")?.includes(first));
      await assert.rejects(scopeAgencyWrite(new URL(`https://abcdefghijklmnopqrst.supabase.co/rest/v1/clones?id=eq.${other}`), "PATCH", { starting_credits: 10 }, identity));
    });
    const exit = await logout(new NextRequest(origin + "/agency/logout", { method: "POST", headers: { cookie, origin } }));
    assert.equal(exit.headers.get("location"), origin + portal.loginPath);
    assert.equal(exit.cookies.get(AGENCY_COOKIE)?.value, "");
  } finally {
    globalThis.fetch = oldFetch;
  }
  console.log("Tether: member-only login, one/two-creator scope, management, cross-agency denial, cache separation, revocation and logout passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
