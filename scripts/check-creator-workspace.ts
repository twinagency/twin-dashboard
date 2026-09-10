import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { signCreatorSession, CREATOR_SESSION_COOKIE } from "../lib/creator-session";
import { creatorDashboardIdentity } from "../lib/creator-dashboard-identity";
import { CREATOR_DASHBOARD_NAV, CREATOR_AUDIENCE_HEADER, assertCreatorQuery, creatorApiAllowed } from "../lib/creator-dashboard-policy";
import { creatorIdentityPatch, CREATOR_IDENTITY_COLUMNS } from "../lib/creator-identity-fields";
import { scopeReadUrl, redactAgencyData } from "../lib/agency-query";
import { accessCacheKey, withDashboardAccess } from "../lib/dashboard-access";
import { guardDashboardAction } from "../lib/agency-management";
import { agencyCanManage } from "../lib/agency-management-policy";

const account = "11111111-1111-4111-8111-111111111111";
const user = "22222222-2222-4222-8222-222222222222";
const own = "33333333-3333-4333-8333-333333333333";
const other = "44444444-4444-4444-8444-444444444444";
const origin = "https://dashboard.tgaiclone.xyz";
async function main() {
  Object.assign(process.env, { NODE_ENV: "production", SUPABASE_URL: "https://creator-offline.supabase.co", SUPABASE_SERVICE_KEY: "offline-fixture-only", CREATOR_SESSION_SECRET: "offline-creator-secret-not-for-production", DASHBOARD_PASSWORD: "offline-admin-secret" });
  const oldFetch = globalThis.fetch;
  let archived = false, mismatched = false, onboarded = true, linked = true, databaseError = false;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname !== "creator-offline.supabase.co") throw new Error("No live requests in offline creator tests");
    if (databaseError) return new Response(JSON.stringify({ message: "offline database unavailable" }), { status: 503, headers: { "content-type": "application/json" } });
    let body: unknown;
    switch (url.pathname) {
      case "/rest/v1/creator_accounts":
        assert.equal(url.searchParams.get("id"), `eq.${account}`);
        body = { id: account, auth_user_id: mismatched ? other : user, display_name: "Fixture Creator", account_status: archived ? "archived" : "active" }; break;
      case "/rest/v1/creator_applications":
        assert.equal(url.searchParams.get("creator_account_id"), `eq.${account}`);
        body = { status: onboarded ? "submitted" : "draft" }; break;
      case "/rest/v1/creator_agency_assignments":
        assert.equal(url.searchParams.get("creator_account_id"), `eq.${account}`);
        body = { agency_id: "fixture-agency", partner_agencies: { name: "Tether", active: true } }; break;
      case "/rest/v1/creator_clone_links":
        assert.equal(url.searchParams.get("creator_account_id"), `eq.${account}`);
        body = linked ? { clone_id: own, clones: { id: own, name: "Fixture Creator" } } : null; break;
      default: throw new Error(`Unexpected database resource ${url.pathname}`);
    }
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  };
  try {
    const token = await signCreatorSession(account, user);
    const request = (path: string, method = "GET", extra: Record<string, string> = {}, cookie = `${CREATOR_SESSION_COOKIE}=${token}`) => new NextRequest(origin + path, { method, headers: { cookie, ...extra } });
    const identity = await creatorDashboardIdentity(token);
    assert.ok(identity);
    assert.deepEqual(identity.cloneIds, [own]);
    assert.equal(identity.id, `creator:${account}`);
    assert.equal(agencyCanManage(identity), false);
    assert.notEqual(accessCacheKey(identity), accessCacheKey(null));
    assert.notEqual(accessCacheKey(identity), accessCacheKey({ ...identity, id: "another-creator" }));
    assert.deepEqual(CREATOR_DASHBOARD_NAV.map(item => item.label), ["Earnings", "PPVs", "Business", "Info", "Logs", "Edit"]);
    for (const item of CREATOR_DASHBOARD_NAV) {
      const response = await middleware(request(item.href));
      assert.equal(response.status, 200, item.href);
      assert.equal(response.headers.get(`x-middleware-request-${CREATOR_AUDIENCE_HEADER}`), "creator");
    }
    for (const path of ["/creator/edit?tab=config", "/creator/edit?tab=identity&tab=money", "/creator/edit?sub=advanced", `/creator?clone=${other}`, `/api/dashboard?clone=${own}&clone=${other}`, "/users", "/settings", "/agency-admin", "/crm/inbox", `/clones/${other}?tab=identity`, "/api/models", "/api/compile"]) {
      assert.equal((await middleware(request(path))).status, 403, path);
    }
    for (const path of ["/creator", "/creator/edit", "/api/dashboard", "/clones/" + own]) assert.equal((await middleware(request(path, "POST", { origin, "next-action": "forged-action" }))).status, 403, path);
    for (const path of ["/api/dashboard?clone=" + own, "/api/dashboard/day-insight?clone=" + own, "/api/media-sign?path=" + own + "/fixture.jpg", "/api/fx", "/api/business-account?cloneId=" + own]) {
      const response = await middleware(request(path));
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get(`x-middleware-request-${CREATOR_AUDIENCE_HEADER}`), "creator");
    }
    // An existing operator cookie cannot turn a creator-page API read into a fleet read.
    const mixed = await middleware(request("/api/dashboard", "GET", { referer: origin + "/creator" }, `${CREATOR_SESSION_COOKIE}=${token}; twin_agency_access=unrelated-operator-cookie`));
    assert.equal(mixed.headers.get(`x-middleware-request-${CREATOR_AUDIENCE_HEADER}`), "creator");
    assert.equal((await middleware(request("/api/dashboard", "GET", { referer: origin + "/creator" }, ""))).status, 403);
    const publicResponse = await middleware(request("/tether", "GET", { [CREATOR_AUDIENCE_HEADER]: "creator", "x-pathname": "/creator" }, ""));
    assert.equal(publicResponse.headers.get(`x-middleware-request-${CREATOR_AUDIENCE_HEADER}`), null, "Caller header must be stripped");
    assert.equal(publicResponse.headers.get("x-middleware-request-x-pathname"), "/tether");
    assert.equal((await middleware(request("/revenue?period=1W"))).headers.get("location"), origin + "/creator?period=1W");
    assert.equal((await middleware(request("/creator-auth/identity", "POST", { origin: "https://evil.example" }))).status, 403);
    assert.equal((await middleware(request("/creator-auth/identity", "POST", { origin }))).status, 200);
    for (const table of ["clones", "photos", "videos", "photo_bundles", "users", "star_transactions", "system_logs"]) {
      const result = scopeReadUrl(new URL(`https://creator-offline.supabase.co/rest/v1/${table}?select=*&or=(clone_id.eq.${other})`), identity);
      assert.ok(result.url.searchParams.get("and")?.includes(own), table);
    }
    await withDashboardAccess(identity, async () => {
      for (const action of ["app/clones/actions.ts#updateClone", "app/clones/actions.ts#setStatus", "app/settings/actions.ts#save", "app/media/actions.ts#updateCategoryPricing", "app/users/actions.ts#setCredits"]) await assert.rejects(guardDashboardAction(action, [own, new FormData()]));
    });
    const fd = new FormData();
    fd.set("name", "Updated identity"); fd.set("hair_color", "Brown"); fd.set("hobbies", JSON.stringify(["Hiking", "Hiking"])); fd.set("tattoos", "false");
    for (const key of ["clone_id", "auth_user_id", "bot_token", "text_model", "starting_credits", "credit_pack_price_stars", "ai_mode", "status", "strict_minor_gate", "category_pricing", "intake"]) fd.set(key, "FORGED");
    const patch = creatorIdentityPatch(fd, { name: "Before", intake: { appearance: { chart_color: "#123456" } } });
    assert.deepEqual(patch, { name: "Updated identity", hair_color: "Brown", hobbies: ["Hiking"], tattoos: false });
    assert.equal(CREATOR_IDENTITY_COLUMNS.includes("bot_token" as any), false);
    assert.equal(CREATOR_IDENTITY_COLUMNS.includes("starting_credits" as any), false);
    const invalid = new FormData(); invalid.set("hobbies", '{"price":1}'); assert.throws(() => creatorIdentityPatch(invalid, {}));
    invalid.delete("hobbies"); invalid.set("double_text_level", "FORGED"); assert.throws(() => creatorIdentityPatch(invalid, {}));
    assert.throws(() => assertCreatorQuery(new URLSearchParams(`clone=${own}&clone_id=${other}`), [own]));
    assert.equal(creatorApiAllowed("/api/dashboard", "POST", false), false);
    assert.equal((redactAgencyData({ bot_token: "not-public" }) as any).bot_token, null);
    linked = false;
    const empty = await creatorDashboardIdentity(token); assert.ok(empty); assert.deepEqual(empty.cloneIds, []);
    assert.ok(scopeReadUrl(new URL("https://creator-offline.supabase.co/rest/v1/clones"), empty).url.searchParams.get("and")?.includes("00000000-0000-0000-0000-000000000000"));
    assert.equal((await middleware(request("/api/dashboard?clone=" + own))).status, 403);
    linked = true; onboarded = false;
    assert.equal((await middleware(request("/creator"))).headers.get("location"), origin + "/creator/onboarding");
    assert.equal((await middleware(request("/api/dashboard"))).status, 403);
    onboarded = true; archived = true; assert.equal(await creatorDashboardIdentity(token), null);
    archived = false; mismatched = true; assert.equal(await creatorDashboardIdentity(token), null);
    mismatched = false; databaseError = true; assert.equal(await creatorDashboardIdentity(token), null);
    databaseError = false; assert.equal(await creatorDashboardIdentity("invalid.signature"), null);
    const source = readFileSync("app/creator/page.tsx", "utf8");
    assert.match(source, /<RevenueDashboard/); assert.match(source, /<RevenueTooltipFix/);
    assert.doesNotMatch(source, /RevenueTrend|aggregateTrend|metric\(/);
    assert.match(readFileSync("components/CreatorWorkspaceShell.tsx", "utf8"), /<IntelligenceCoreIcon size=\{64\}/);
    assert.doesNotMatch(readFileSync("components/CreatorIdentityEditor.tsx", "utf8"), /<ConfigSections|<CloneForm|fetch\("\/api\/models/);
    console.log("CREATOR WORKSPACE PASSED: live earnings component, six routes, onboarding, single/no-clone isolation, cache keys, mixed cookies, forged headers, denied settings/actions and identity-only patch.");
  } finally { globalThis.fetch = oldFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
