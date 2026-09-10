import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CREATOR_NAV, creatorDataResource, scopeCreatorRequestUrl, creatorIdentityTabAllowed } from "../lib/creator-dashboard-policy";
import { creatorIdentityFormAllowed } from "../lib/creator-identity-fields";
import { scopeReadUrl } from "../lib/agency-query";
import { agencyCanManage } from "../lib/agency-management-policy";
import { accessCacheKey } from "../lib/dashboard-access";
import { signCreatorSession } from "../lib/creator-session";
import { resolveCreatorDashboardIdentity } from "../lib/creator-dashboard-access";

const own = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const other = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const account = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const user = "dddddddd-dddd-dddd-dddd-dddddddddddd";
async function main() {
  Object.assign(process.env, { SUPABASE_URL: "https://creator-fixture.supabase.co", SUPABASE_SERVICE_KEY: "offline-key", CREATOR_SESSION_SECRET: "offline-only-creator-fixture-secret" });
  assert.deepEqual(CREATOR_NAV.map(x => x.label), ["Earnings", "PPVs", "Business", "Info", "Logs", "Edit"]);
  for (const path of ["/api/models", "/api/caption", "/api/compile", "/api/users/live", "/api/admin/clones", "/api/dashboard-spoof"]) assert.equal(creatorDataResource(path), undefined);
  assert.equal(creatorDataResource("/api/dashboard"), "dashboard");
  assert.equal(creatorDataResource("/api/dashboard/day-insight"), "day-insight");
  for (const query of ["tab=config", "tab=money", "tab=monetization", "sub=advanced", "tab=identity&tab=config"]) assert.equal(creatorIdentityTabAllowed(new URL(`https://local/creator/edit?${query}`)), false);
  assert.equal(creatorIdentityTabAllowed(new URL("https://local/creator/edit?tab=identity")), true);
  for (const query of [`clone=${other}`, `cloneId=${other}`, `clone_id=${other}`, `clone=${own}&clone=${other}`, `accountId=${other}`]) assert.throws(() => scopeCreatorRequestUrl(new URL(`https://local/api/dashboard?${query}`), own, account));
  assert.equal(scopeCreatorRequestUrl(new URL("https://local/api/dashboard?period=1M"), own, account).searchParams.get("clone"), own);
  assert.equal(scopeCreatorRequestUrl(new URL("https://local/api/dashboard"), null, account).searchParams.has("clone"), false);
  const form = new FormData(); form.set("name", "My identity"); form.set("revision", new Date().toISOString());
  assert.equal(creatorIdentityFormAllowed(form), true);
  for (const key of ["clone_id", "accountId", "status", "bot_token", "text_model", "starting_credits", "star_value", "intake", "agency_id"]) { form.set(key, "forged"); assert.equal(creatorIdentityFormAllowed(form), false); form.delete(key); }
  const identity = { id: `creator:${account}`, name: "Tether", cloneIds: [own] };
  assert.equal(agencyCanManage(identity), false);
  assert.notEqual(accessCacheKey(identity), accessCacheKey({ ...identity, id: "tether-agency" }));
  for (const table of ["clones", "star_transactions", "users", "photos", "videos"]) assert.ok(scopeReadUrl(new URL(`https://local/rest/v1/${table}?select=*&or=(clone_id.eq.${other})`), identity).url.searchParams.get("and")?.includes(own));
  assert.ok(scopeReadUrl(new URL("https://local/rest/v1/clones?select=id"), { ...identity, cloneIds: [] }).url.searchParams.get("and")?.includes("00000000-0000-0000-0000-000000000000"));
  const oldFetch = globalThis.fetch;
  let status = "active", linked = true, validAccount = true;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    let data: unknown;
    if (url.pathname.endsWith("/creator_accounts")) {
      assert.equal(url.searchParams.get("id"), `eq.${account}`);
      assert.equal(url.searchParams.get("auth_user_id"), `eq.${user}`);
      data = validAccount ? { id: account, auth_user_id: user, display_name: "Fixture", account_status: status } : null;
    } else if (url.pathname.endsWith("/creator_clone_links")) {
      assert.equal(url.searchParams.get("creator_account_id"), `eq.${account}`);
      data = linked ? { clone_id: own, clones: { name: "Fixture clone", status: "active" } } : null;
    } else if (url.pathname.endsWith("/creator_agency_assignments")) data = { partner_agencies: { name: "Tether", slug: "tether" } };
    else if (url.pathname.endsWith("/creator_applications")) data = { status: "submitted" };
    else throw new Error(`Unexpected endpoint ${url.pathname}`);
    return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
  };
  try {
    const token = await signCreatorSession(account, user);
    const resolved = await resolveCreatorDashboardIdentity(token);
    assert.equal(resolved?.ready, true); assert.deepEqual(resolved?.cloneIds, [own]); assert.equal(resolved?.id, `creator:${account}`);
    linked = false; assert.deepEqual((await resolveCreatorDashboardIdentity(token))?.cloneIds, []); linked = true;
    status = "archived"; assert.equal(await resolveCreatorDashboardIdentity(token), null); status = "active";
    validAccount = false; assert.equal(await resolveCreatorDashboardIdentity(token), null); validAccount = true;
    assert.equal(await resolveCreatorDashboardIdentity(token + "tampered"), null);
  } finally { globalThis.fetch = oldFetch; }
  const page = readFileSync("app/creator/page.tsx", "utf8");
  assert.ok(page.includes('from "@/components/RevenueDashboard"')); assert.ok(!page.includes("function RevenueTrend"));
  const shell = readFileSync("components/creator/CreatorDashboardShell.tsx", "utf8");
  assert.ok(shell.includes("<IntelligenceCoreIcon size={64}")); assert.ok(shell.includes("<MainShell>"));
  console.log("Creator dashboard: real earnings component, exact six navigation entries, Identity-only writes, fixed clone scope, cache separation, revoked/forged session denial passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
