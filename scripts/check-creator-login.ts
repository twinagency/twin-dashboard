import { configureFlirtOfflineEnv } from "./flirt-offline-env";
import assert from "node:assert/strict";
import { CREATOR_PORTAL_COOKIE } from "../lib/creator-routing";
import { CREATOR_SESSION_COOKIE } from "../lib/creator-session";
import { LYNQ_PORTAL, TETHER_PORTAL } from "../lib/partner-portals";

type Scenario = "lynq" | "tether" | "paused" | "inactive_agency" | "orphan_invite" | "invalid";

async function main() {
  Object.assign(process.env, {
    NODE_ENV: "production",
    DASHBOARD_PUBLIC_ORIGIN: "https://dashboard.flirt.example",
    SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
    SUPABASE_SERVICE_KEY: "offline-login-fixture",
    CREATOR_SESSION_SECRET: "offline-login-session-secret",
  });

  configureFlirtOfflineEnv();

  const oldFetch = globalThis.fetch;
  const userId = "11111111-1111-4111-8111-111111111111";
  const accountId = "22222222-2222-4222-8222-222222222222";
  let scenario: Scenario = "lynq";
  const requests: string[] = [];
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.hostname, "abcdefghijklmnopqrst.supabase.co", "creator login test must remain offline");
    requests.push(`${request.method} ${url.pathname}`);

    if (url.pathname === "/auth/v1/token") {
      if (scenario === "invalid") return json({ error: "invalid_grant", error_description: "Invalid login credentials" }, 400);
      return json({
        access_token: "offline-access-token",
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "offline-refresh-token",
        user: { id: userId, aud: "authenticated", role: "authenticated", email: "creator@example.test", app_metadata: {}, user_metadata: {} },
      });
    }

    if (url.pathname === "/rest/v1/creator_accounts") {
      if (url.searchParams.has("auth_user_id")) {
        return json({ id: accountId, account_status: scenario === "paused" ? "paused" : "active" });
      }
      return json({
        id: accountId,
        auth_user_id: userId,
        display_name: "Fixture Creator",
        account_status: "active",
        source: scenario === "orphan_invite" ? "agency_invite" : "twin",
      });
    }

    if (url.pathname === "/rest/v1/creator_applications") return json({ status: "submitted" });
    if (url.pathname === "/rest/v1/creator_clone_links") return json(null);
    if (url.pathname === "/rest/v1/creator_agency_assignments") {
      if (scenario === "orphan_invite") return json(null);
      const tether = scenario === "tether";
      return json({
        agency_id: tether ? TETHER_PORTAL.id : LYNQ_PORTAL.id,
        partner_agencies: { name: tether ? TETHER_PORTAL.name : LYNQ_PORTAL.name, active: scenario !== "inactive_agency" },
      });
    }
    throw new Error(`Unexpected offline request ${request.method} ${url.pathname}`);
  };

  const makeRequest = (portal = "link") => {
    const form = new FormData();
    form.set("email", "creator@example.test");
    form.set("password", "fixture-password");
    form.set("portal", portal);
    form.set("next", "/creator");
    return new Request("https://dashboard.flirt.example/creator-auth/login", {
      method: "POST",
      headers: {
        origin: "https://dashboard.flirt.example",
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "http",
      },
      body: form,
    });
  };

  try {
    const { POST } = await import("../app/creator-auth/login/route");

    scenario = "lynq";
    const lynq = await POST(makeRequest("twin"));
    assert.equal(lynq.status, 303);
    assert.equal(lynq.headers.get("location"), "https://dashboard.flirt.example/creator");
    assert.equal(lynq.cookies.get(CREATOR_PORTAL_COOKIE)?.value, "link", "verified LYNQ assignment replaces a stale public-brand hint");
    assert.ok(lynq.cookies.get(CREATOR_SESSION_COOKIE)?.value, "verified LYNQ login receives a creator session");

    scenario = "tether";
    const tether = await POST(makeRequest("link"));
    assert.equal(tether.cookies.get(CREATOR_PORTAL_COOKIE)?.value, "tether", "verified Tether assignment remains Tether branded");
    assert.ok(tether.cookies.get(CREATOR_SESSION_COOKIE)?.value);

    for (scenario of ["paused", "inactive_agency", "orphan_invite", "invalid"] as const) {
      requests.length = 0;
      const denied = await POST(makeRequest("link"));
      assert.equal(denied.status, 303, scenario);
      const location = new URL(denied.headers.get("location")!);
      assert.equal(location.origin, "https://dashboard.flirt.example", `${scenario} cannot influence the redirect host`);
      assert.equal(location.pathname, "/creator/link/login", scenario);
      assert.equal(location.searchParams.get("error"), "1", scenario);
      assert.equal(denied.cookies.get(CREATOR_PORTAL_COOKIE)?.value, "link", scenario);
      assert.equal(denied.cookies.get(CREATOR_SESSION_COOKIE), undefined, `${scenario} receives no creator session`);
    }

    console.log("CREATOR LOGIN PASSED: verified Link/Tether branding, paused and incomplete-account denial, canonical redirects and no denied-session cookie.");
  } finally {
    globalThis.fetch = oldFetch;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
