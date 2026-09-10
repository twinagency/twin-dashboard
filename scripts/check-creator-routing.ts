import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { CREATOR_SESSION_COOKIE, signCreatorSession } from "../lib/creator-session";
import { CREATOR_PORTAL_COOKIE, creatorLoginPath } from "../lib/creator-routing";

const origin = "https://dashboard.tgaiclone.xyz";
const accountId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const cloneId = "33333333-3333-4333-8333-333333333333";

async function main() {
  Object.assign(process.env, {
    NODE_ENV: "production",
    SUPABASE_URL: "https://creator-routing.test.supabase.co",
    SUPABASE_SERVICE_KEY: "offline-routing-fixture",
    CREATOR_SESSION_SECRET: "offline-creator-routing-secret",
    DASHBOARD_PASSWORD: "offline-admin-secret",
  });

  const oldFetch = globalThis.fetch;
  let accountExists = true;
  let agencyName = "Tether";
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.hostname, "creator-routing.test.supabase.co", "routing test must remain offline");
    let body: unknown;
    switch (url.pathname) {
      case "/rest/v1/creator_accounts":
        body = accountExists ? { id: accountId, auth_user_id: userId, display_name: "Fixture Creator", account_status: "active" } : null;
        break;
      case "/rest/v1/creator_applications":
        body = { status: "submitted" };
        break;
      case "/rest/v1/creator_agency_assignments":
        body = { agency_id: "fixture-agency", partner_agencies: { name: agencyName, active: true } };
        break;
      case "/rest/v1/creator_clone_links":
        body = { clone_id: cloneId, clones: { id: cloneId, name: "Fixture Creator" } };
        break;
      default:
        throw new Error(`Unexpected database resource ${url.pathname}`);
    }
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  };

  try {
    const token = await signCreatorSession(accountId, userId);
    const request = (path: string, cookie = "") => new NextRequest(origin + path, { headers: cookie ? { cookie } : undefined });

    const tetherEntry = await middleware(request("/creator/tether/login"));
    assert.equal(tetherEntry.status, 200);
    assert.equal(tetherEntry.cookies.get(CREATOR_PORTAL_COOKIE)?.value, "tether");
    assert.equal(tetherEntry.cookies.get(CREATOR_PORTAL_COOKIE)?.httpOnly, true);
    assert.equal(tetherEntry.cookies.get(CREATOR_PORTAL_COOKIE)?.secure, true);
    assert.equal(tetherEntry.cookies.get(CREATOR_PORTAL_COOKIE)?.sameSite, "lax");

    const portalOnly = `${CREATOR_PORTAL_COOKIE}=tether`;
    const protectedResponse = await middleware(request("/creator", portalOnly));
    assert.equal(protectedResponse.status, 307);
    assert.equal(protectedResponse.headers.get("location"), origin + "/creator/tether/login?next=%2Fcreator");
    assert.equal(protectedResponse.headers.get("x-middleware-request-x-creator-audience"), null, "portal cookie must not authenticate");

    const genericResponse = await middleware(request("/creator"));
    assert.equal(genericResponse.headers.get("location"), origin + "/creator/login?next=%2Fcreator");

    const explicitTwinEntry = await middleware(request("/creator/login", portalOnly));
    assert.equal(explicitTwinEntry.status, 200);
    assert.equal(explicitTwinEntry.cookies.get(CREATOR_PORTAL_COOKIE)?.value, "twin", "an explicit Twin route must clear stale Tether presentation affinity");

    accountExists = false;
    const staleResponse = await middleware(request("/creator/tether/login", `${CREATOR_SESSION_COOKIE}=${token}`));
    assert.equal(staleResponse.status, 200, "a stale signed session must not bounce away from Tether login");
    assert.equal(staleResponse.headers.get("location"), null);
    assert.equal(staleResponse.cookies.get(CREATOR_PORTAL_COOKIE)?.value, "tether");
    assert.equal(staleResponse.cookies.get(CREATOR_SESSION_COOKIE)?.value, "");

    accountExists = true;
    const liveResponse = await middleware(request("/creator/tether/login", `${CREATOR_SESSION_COOKIE}=${token}`));
    assert.equal(liveResponse.headers.get("location"), origin + "/creator");
    assert.equal(liveResponse.cookies.get(CREATOR_PORTAL_COOKIE)?.value, "tether");

    agencyName = "Twin";
    assert.equal(creatorLoginPath({ name: "Twin" }, "tether"), "/creator/login", "verified identity wins over presentation cookie");
    assert.equal(creatorLoginPath({ name: "Tether" }, "twin"), "/creator/tether/login", "verified Tether identity wins over presentation cookie");
    assert.equal(creatorLoginPath(null, "tether"), "/creator/tether/login");
    assert.equal(creatorLoginPath(null, "forged-value"), "/creator/login");

    const fallbackFiles = [
      "lib/creator-dashboard.ts",
      "app/creator/onboarding/page.tsx",
      "app/creator-auth/onboarding/route.ts",
      "app/creator-auth/upload/route.ts",
      "app/creator-auth/logout/route.ts",
    ];
    for (const file of fallbackFiles) {
      const source = readFileSync(file, "utf8");
      assert.match(source, /creatorLoginPath/, `${file} must use the shared branded fallback`);
      assert.doesNotMatch(source, /redirect\("\/creator\/login"\)|creatorRequestUrl\(req, "\/creator\/login"\)/, `${file} retains a hard-coded Twin fallback`);
    }

    console.log("CREATOR ROUTING PASSED: Tether portal affinity, live-identity checks, stale-cookie recovery, generic fallback and presentation-only access isolation.");
  } finally {
    globalThis.fetch = oldFetch;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
