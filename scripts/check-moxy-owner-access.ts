import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { agencyIdentity, agencyIdentityById } from "../lib/agency-identity";
import { agencyCanManage, MOXY_MANAGEMENT_AGENCY_ID, LYNQ_MANAGEMENT_AGENCY_ID } from "../lib/agency-management-policy";
import { JESS_KATE_PORTAL, TETHER_PORTAL, TOP_ONLYFANS_AGENCY } from "../lib/partner-portals";
import { withDashboardAccess, accessCacheKey } from "../lib/dashboard-access";
import { dashboardFetch } from "../lib/agency-fetch";
import { requireManagedClone, guardDashboardAction } from "../lib/agency-management";
import { __setViewerTermsOverrideForTests } from "../lib/platform-cut";

const assigned = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const other = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const agencyOther = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const origin = "https://dashboard.lynqai.co";
const supabase = "https://moxy-owner-test.supabase.co";
async function main() {
  Object.assign(process.env, { NODE_ENV: "production", SUPABASE_URL: supabase, SUPABASE_SERVICE_KEY: "offline-test-key" });
  __setViewerTermsOverrideForTests(async () => ({ starMult: 1, usdPerStar: 0.013 }));
  let canManage: unknown = false, memberActive = true, signedInAgency = MOXY_MANAGEMENT_AGENCY_ID;
  const calls: { url: URL; method: string; body: any }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)), method = (init?.method || "GET").toUpperCase();
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, method, body });
    let out: unknown = [];
    if (url.pathname === "/auth/v1/user") {
      // User-editable claims must not grant any permission.
      out = { id: "verified-user", user_metadata: { canManage: true, can_manage: true, role: "owner", agency_id: MOXY_MANAGEMENT_AGENCY_ID } };
    } else if (url.pathname === "/rest/v1/agency_memberships") {
      assert.equal(url.searchParams.get("user_id"), "eq.verified-user");
      assert.equal(url.searchParams.get("active"), "eq.true");
      assert.equal(url.searchParams.get("select"), "agency_id,can_manage");
      out = memberActive ? { agency_id: signedInAgency, can_manage: canManage } : null;
    } else if (url.pathname === "/rest/v1/partner_agencies") {
      assert.equal(url.searchParams.get("active"), "eq.true");
      out = { id: signedInAgency, name: "Moxy" };
    } else if (url.pathname === "/rest/v1/agency_creators") {
      assert.equal(url.searchParams.get("agency_id"), `eq.${signedInAgency}`);
      out = [{ clone_id: assigned }];
    } else if (url.pathname === "/rest/v1/clones" && method === "GET") {
      out = [{ id: assigned, name: "Assigned creator", bot_token: "must-be-redacted" }];
    } else if (url.pathname.startsWith("/rest/v1/") || url.pathname.startsWith("/storage/v1/")) out = [];
    else throw new Error(`Unexpected request ${url.pathname}`);
    return new Response(JSON.stringify(out), { headers: { "content-type": "application/json" } });
  };
  const headers = {
    cookie: "twin_agency_access=verified-token; twin_agency_portal=moxy; canManage=true; can_manage=true; role=owner",
    origin, host: "dashboard.lynqai.co", "next-action": "known-action-id", "x-can-manage": "true",
  };
  const request = (path: string, method = "POST", extra: Record<string, string> = {}) =>
    new NextRequest(origin + path, { method, headers: { ...headers, ...extra } });
  try {
    const readonly = await agencyIdentity("verified-token");
    assert.deepEqual(readonly, { id: MOXY_MANAGEMENT_AGENCY_ID, name: "Moxy", cloneIds: [assigned] });
    assert.equal(agencyCanManage(readonly), false, "spoofed Auth metadata does not grant management");
    assert.equal((await middleware(request("/users"))).status, 403, "cookies/headers cannot promote read-only Moxy");
    canManage = "true";
    assert.equal((await agencyIdentity("verified-token"))?.canManage, undefined, "permission must be boolean true");
    canManage = true;
    const owner = await agencyIdentity("verified-token");
    assert.ok(owner);
    assert.equal(owner.canManage, true);
    assert.equal(agencyCanManage(owner), true);
    assert.equal((await agencyIdentityById(MOXY_MANAGEMENT_AGENCY_ID))?.canManage, undefined, "view-as keeps existing default");
    assert.notEqual(accessCacheKey(owner), accessCacheKey(readonly), "permission-dependent reads never share cache keys");
    assert.equal(accessCacheKey(readonly), `agency:${MOXY_MANAGEMENT_AGENCY_ID}:${assigned}`, "read-only cache keys preserved");
    for (const path of ["/users", "/flows", "/media", `/clones/${assigned}`])
      assert.equal((await middleware(request(path))).status, 200, path);
    for (const path of ["/settings", "/agency-admin", "/api-access", "/tracker", "/clones/new", `/clones/${other}`])
      assert.equal((await middleware(request(path))).status, 403, path);
    assert.equal((await middleware(request("/users", "POST", { origin: "https://evil.example" }))).status, 403);
    assert.equal((await middleware(new NextRequest(origin + `/clones/${other}`, { headers: { cookie: headers.cookie } }))).status, 403);
    assert.equal((await middleware(new NextRequest(origin + "/api/models", { headers: { cookie: headers.cookie } }))).status, 403, "Moxy private-model restriction remains");

    // Every Moxy membership is denied the whole CRM subtree, on either host.
    for (const permission of [false, true]) {
      canManage = permission;
      for (const host of ["https://dashboard.lynqai.co", "https://dashboard.tgaiclone.xyz"]) {
        for (const path of ["/crm", "/crm/inbox", "/crm/fans", "/crm/campaigns", "/crm/team", "/crm/platforms", "/crm/future"]) {
          for (const method of ["GET", "HEAD", "POST"]) {
            assert.equal((await middleware(new NextRequest(host + path, { method, headers: { cookie: headers.cookie } }))).status, 403, `Moxy CRM denied: ${permission} ${method} ${path}`);
          }
        }
      }
    }
    canManage = true;

    await withDashboardAccess(owner, async () => {
      await requireManagedClone(assigned);
      await assert.rejects(requireManagedClone(other));
      await guardDashboardAction("app/clones/actions.ts#toggleClonePause", [assigned, true]);
      await assert.rejects(guardDashboardAction("app/clones/actions.ts#toggleClonePause", [other, true]));
      for (const action of ["app/settings/actions.ts#saveApiKeys", "app/clones/actions.ts#createCloneRow", "app/clones/actions.ts#deleteClone", "app/api-access/actions.ts#issueKeyAction"])
        await assert.rejects(guardDashboardAction(action, []));

      const url = supabase + "/rest/v1/clones?id=eq." + assigned;
      assert.equal((await dashboardFetch(url, { method: "PATCH", body: JSON.stringify({ status: "paused" }) })).status, 200);
      assert.ok(calls.at(-1)?.url.searchParams.get("and")?.includes(assigned), "allowed mutation remains creator-scoped");
      const before = calls.length;
      for (const payload of [{ bot_token: "forbidden" }, { strict_minor_gate: false }])
        assert.equal((await dashboardFetch(url, { method: "PATCH", body: JSON.stringify(payload) })).status, 403);
      assert.equal((await dashboardFetch(supabase + "/rest/v1/photos", { method: "POST", body: JSON.stringify({ clone_id: other, storage_path: `${other}/photos/image.jpg` }) })).status, 403);
      assert.equal((await dashboardFetch(supabase + "/rest/v1/app_settings", { method: "PATCH", body: JSON.stringify({ value: "forbidden" }) })).status, 403);
      assert.equal(calls.length, before, "forbidden writes never reach Supabase");
      const listed = await dashboardFetch(supabase + "/rest/v1/clones?select=*");
      assert.equal((await listed.json())[0].bot_token, null);
      assert.ok(calls.at(-1)?.url.searchParams.get("and")?.includes(assigned));
      assert.equal((await dashboardFetch(supabase + `/storage/v1/object/media/${other}/photos/image.jpg`, { method: "POST" })).status, 403);
    });
    await withDashboardAccess(readonly, async () => {
      await assert.rejects(requireManagedClone(assigned));
      assert.equal((await dashboardFetch(supabase + "/rest/v1/clones?id=eq." + assigned, { method: "PATCH", body: JSON.stringify({ status: "paused" }) })).status, 403);
    });
    memberActive = false;
    assert.equal(await agencyIdentity("verified-token"), null);
    assert.equal((await middleware(request("/users"))).status, 307, "revocation stops management immediately");
    memberActive = true;
    signedInAgency = agencyOther;
    assert.equal(agencyCanManage(await agencyIdentity("verified-token")), false, "same flag on unrelated agency never enables management");
    assert.equal((await middleware(request("/users"))).status, 403);
    signedInAgency = TOP_ONLYFANS_AGENCY.id;
    canManage = false;
    assert.equal(agencyCanManage(await agencyIdentity("verified-token")), false);
    canManage = true;
    const topOwner = await agencyIdentity("verified-token");
    assert.ok(topOwner && agencyCanManage(topOwner));
    assert.equal((await middleware(request(`/clones/${assigned}`))).status, 200);
    assert.equal((await middleware(request(`/clones/${other}`))).status, 403);
    assert.equal((await middleware(request("/agency-admin"))).status, 403);
    await withDashboardAccess(topOwner, async () => {
      await guardDashboardAction("app/clones/actions.ts#toggleClonePause", [assigned, true]);
      await assert.rejects(guardDashboardAction("app/clones/actions.ts#toggleClonePause", [other, true]));
      await assert.rejects(guardDashboardAction("app/settings/actions.ts#saveApiKeys", []));
    });
    for (const id of [LYNQ_MANAGEMENT_AGENCY_ID, JESS_KATE_PORTAL.id, TETHER_PORTAL.id])
      assert.equal(agencyCanManage({ id }), true, "existing managers remain unchanged");
    assert.equal(agencyCanManage({ id: MOXY_MANAGEMENT_AGENCY_ID }), false);
  } finally {
    globalThis.fetch = original;
    __setViewerTermsOverrideForTests(null);
  }
  console.log("MOXY OWNER ACCESS PASSED: server-owned permission, scoped mutations, unchanged readers, spoofing/CSRF/revocation defenses, private settings and separate cache keys");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
