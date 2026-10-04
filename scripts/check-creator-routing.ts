import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { CREATOR_SESSION_COOKIE, creatorCookieOptions, signCreatorSession } from "../lib/creator-session";
import { creatorRequestUrl } from "../lib/creator-origin";
import {
  CREATOR_PORTAL_COOKIE,
  creatorLoginPath,
  creatorPortalForIdentity,
  creatorPublicPortal,
  isCreatorPublicPath,
  LINK_CREATOR_LOGIN_PATH,
  LINK_CREATOR_SIGNUP_PATH,
  safeCreatorNext,
  shouldRedirectAuthenticatedCreatorEntry,
} from "../lib/creator-routing";

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
    const forwardedHostRequest = new Request(origin + "/creator-auth/login", { headers: { "x-forwarded-host": "attacker.example", "x-forwarded-proto": "http" } });
    assert.equal(creatorRequestUrl(forwardedHostRequest, LINK_CREATOR_LOGIN_PATH).origin, origin, "creator redirects ignore untrusted forwarded hosts");
    const token = await signCreatorSession(accountId, userId);
    const request = (path: string, cookie = "") => new NextRequest(origin + path, { headers: cookie ? { cookie } : undefined });

    for (const path of ["/creator-management", "/creator-management/disposable-fixture"]) {
      const denied = await middleware(request(path, `${CREATOR_SESSION_COOKIE}=${token}`));
      assert.equal(denied.status, 403, "creator-only sessions cannot enter management list/detail");
    }
    const tetherEntry = await middleware(request("/creator/tether/login"));
    assert.equal(tetherEntry.status, 200);
    assert.equal(tetherEntry.cookies.get(CREATOR_PORTAL_COOKIE)?.value, "tether");
    assert.equal(tetherEntry.cookies.get(CREATOR_PORTAL_COOKIE)?.httpOnly, true);
    assert.equal(tetherEntry.cookies.get(CREATOR_PORTAL_COOKIE)?.secure, true);
    assert.equal(tetherEntry.cookies.get(CREATOR_PORTAL_COOKIE)?.sameSite, "lax");

    const linkEntry = await middleware(request(LINK_CREATOR_LOGIN_PATH));
    assert.equal(linkEntry.status, 200);
    assert.equal(linkEntry.cookies.get(CREATOR_PORTAL_COOKIE)?.value, "link");
    assert.ok((linkEntry.cookies.get(CREATOR_PORTAL_COOKIE)?.maxAge || 0) > creatorCookieOptions().maxAge, "Link presentation affinity must survive an expired creator session");
    assert.equal(creatorPublicPortal(LINK_CREATOR_SIGNUP_PATH), "link");
    assert.equal(isCreatorPublicPath("/creator/link/forgot-password"), true);
    assert.equal(isCreatorPublicPath("/creator/link/reset-password"), true);
    assert.equal(safeCreatorNext(LINK_CREATOR_LOGIN_PATH), "/creator", "a public Link auth page is never a protected next destination");

    const portalOnly = `${CREATOR_PORTAL_COOKIE}=tether`;
    const protectedResponse = await middleware(request("/creator", portalOnly));
    assert.equal(protectedResponse.status, 307);
    assert.equal(protectedResponse.headers.get("location"), origin + "/creator/tether/login?next=%2Fcreator");
    assert.equal(protectedResponse.headers.get("x-middleware-request-x-creator-audience"), null, "portal cookie must not authenticate");

    const linkPortalOnly = `${CREATOR_PORTAL_COOKIE}=link`;
    const linkProtectedResponse = await middleware(request("/creator", linkPortalOnly));
    assert.equal(linkProtectedResponse.status, 307);
    assert.equal(linkProtectedResponse.headers.get("location"), origin + "/creator/link/login?next=%2Fcreator");
    assert.equal(linkProtectedResponse.headers.get("x-middleware-request-x-creator-audience"), null, "Link portal cookie must not authenticate");

    const genericResponse = await middleware(request("/creator"));
    assert.equal(genericResponse.headers.get("location"), origin + "/creator/login?next=%2Fcreator");

    const explicitTwinEntry = await middleware(request("/creator/login", linkPortalOnly));
    assert.equal(explicitTwinEntry.status, 200);
    assert.equal(explicitTwinEntry.cookies.get(CREATOR_PORTAL_COOKIE)?.value, "twin", "an explicit Twin route must clear stale Link presentation affinity");

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

    const signedInTetherSignup = await middleware(request("/creator/tether/signup", `${CREATOR_SESSION_COOKIE}=${token}`));
    assert.equal(signedInTetherSignup.headers.get("location"), origin + "/creator", "same-portal Tether signup returns an authenticated creator to the workspace");

    const tetherToLinkSignup = await middleware(request(LINK_CREATOR_SIGNUP_PATH, `${CREATOR_SESSION_COOKIE}=${token}`));
    assert.equal(tetherToLinkSignup.status, 200, "a Tether session must not hijack an explicit LYNQ signup link");
    assert.equal(tetherToLinkSignup.headers.get("location"), null);
    assert.equal(tetherToLinkSignup.cookies.get(CREATOR_PORTAL_COOKIE)?.value, "link");
    assert.equal(tetherToLinkSignup.cookies.get(CREATOR_SESSION_COOKIE)?.value, "", "crossing from Tether to LYNQ clears the old creator session");
    assert.equal(tetherToLinkSignup.headers.get("x-middleware-request-x-creator-audience"), null);

    const tetherToLinkLogin = await middleware(request(LINK_CREATOR_LOGIN_PATH, `${CREATOR_SESSION_COOKIE}=${token}`));
    assert.equal(tetherToLinkLogin.status, 200, "a Tether session must not hijack an explicit LYNQ login link");
    assert.equal(tetherToLinkLogin.headers.get("location"), null);
    assert.equal(tetherToLinkLogin.cookies.get(CREATOR_SESSION_COOKIE)?.value, "");

    agencyName = "LYNQ";
    const crossBrandTetherSignup = await middleware(request("/creator/tether/signup", `${CREATOR_SESSION_COOKIE}=${token}`));
    assert.equal(crossBrandTetherSignup.status, 200, "a LYNQ session must not hijack an explicit Tether signup link");
    assert.equal(crossBrandTetherSignup.headers.get("location"), null);
    assert.equal(crossBrandTetherSignup.cookies.get(CREATOR_PORTAL_COOKIE)?.value, "tether");
    assert.equal(crossBrandTetherSignup.cookies.get(CREATOR_SESSION_COOKIE)?.value, "", "crossing from LYNQ to Tether clears the old creator session");
    assert.equal(crossBrandTetherSignup.headers.get("x-middleware-request-x-creator-audience"), null);

    const crossBrandTetherLogin = await middleware(request("/creator/tether/login", `${CREATOR_SESSION_COOKIE}=${token}`));
    assert.equal(crossBrandTetherLogin.status, 200, "a LYNQ session must not hijack an explicit Tether login link");
    assert.equal(crossBrandTetherLogin.headers.get("location"), null);
    assert.equal(crossBrandTetherLogin.cookies.get(CREATOR_PORTAL_COOKIE)?.value, "tether");
    assert.equal(crossBrandTetherLogin.cookies.get(CREATOR_SESSION_COOKIE)?.value, "");

    const crossBrandTetherReset = await middleware(request("/creator/tether/reset-password", `${CREATOR_SESSION_COOKIE}=${token}`));
    assert.equal(crossBrandTetherReset.status, 200, "Tether password recovery must not retain a LYNQ creator session");
    assert.equal(crossBrandTetherReset.cookies.get(CREATOR_SESSION_COOKIE)?.value, "");

    const liveLinkResponse = await middleware(request(LINK_CREATOR_LOGIN_PATH, `${CREATOR_SESSION_COOKIE}=${token}`));
    assert.equal(liveLinkResponse.headers.get("location"), origin + "/creator");
    assert.equal(liveLinkResponse.cookies.get(CREATOR_PORTAL_COOKIE)?.value, "link");

    const liveLinkSignupResponse = await middleware(request(LINK_CREATOR_SIGNUP_PATH, `${CREATOR_SESSION_COOKIE}=${token}`));
    assert.equal(liveLinkSignupResponse.headers.get("location"), origin + "/creator", "same-portal LYNQ signup returns an authenticated creator to the workspace");

    assert.equal(shouldRedirectAuthenticatedCreatorEntry("/creator/tether/signup", { name: "LYNQ" }), false);
    assert.equal(shouldRedirectAuthenticatedCreatorEntry("/creator/tether/login", { name: "LYNQ" }), false);
    assert.equal(shouldRedirectAuthenticatedCreatorEntry(LINK_CREATOR_LOGIN_PATH, { name: "LYNQ" }), true);
    assert.equal(shouldRedirectAuthenticatedCreatorEntry(LINK_CREATOR_SIGNUP_PATH, { name: "LYNQ" }), true);

    agencyName = "Twin";
    assert.equal(creatorLoginPath({ name: "Twin", agencyId: "74b03b70-397e-49ab-841f-8adb8241d87d" }, "twin"), LINK_CREATOR_LOGIN_PATH, "verified LYNQ agency id wins over display branding");
    assert.equal(creatorPortalForIdentity({ name: "LYNQ", agencyId: "fixture-agency" }, "tether"), "link", "verified LYNQ database identity wins over a stale presentation cookie");
    assert.equal(creatorLoginPath({ name: "Twin" }, "link"), "/creator/login", "verified identity wins over presentation cookie");
    assert.equal(creatorLoginPath({ name: "Tether" }, "twin"), "/creator/tether/login", "verified Tether identity wins over presentation cookie");
    assert.equal(creatorLoginPath({ name: "LYNQ" }, "tether"), LINK_CREATOR_LOGIN_PATH, "verified LYNQ identity wins over presentation cookie");
    assert.equal(creatorLoginPath(null, "link"), LINK_CREATOR_LOGIN_PATH);
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

    console.log("CREATOR ROUTING PASSED: cross-brand entry isolation, same-brand redirects, portal affinity, stale-cookie recovery and presentation-only access isolation.");
  } finally {
    globalThis.fetch = oldFetch;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
