import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  linkCreatorAccountRow,
  linkCreatorAssignmentRow,
  LINK_CREATOR_SIGNUP_ACTION,
  parseLinkCreatorSignup,
} from "../lib/link-creator-signup";
import { LYNQ_PORTAL, TETHER_PORTAL } from "../lib/partner-portals";
import {
  CREATOR_PORTAL_COOKIE,
  LINK_CREATOR_LOGIN_PATH,
  LINK_CREATOR_SIGNUP_PATH,
  normalizeCreatorPublicPortal,
} from "../lib/creator-routing";
import { ZANE_DEMO_ACCOUNT_ID } from "../lib/creator-demo-policy";
import { exactCaseInsensitiveEmailPattern } from "../lib/creator-email";

const routeSource = readFileSync("app/creator-auth/link/signup/route.ts", "utf8");

assert.equal(LINK_CREATOR_SIGNUP_ACTION, "/creator-auth/link/signup");
assert.equal(LYNQ_PORTAL.id, "74b03b70-397e-49ab-841f-8adb8241d87d");
assert.equal(TETHER_PORTAL.id, "95b1f78a-1eb2-43d2-84f3-630c2a125ee6", "Tether portal remains unchanged");
assert.equal(ZANE_DEMO_ACCOUNT_ID, "36311e0c-3b1a-4aad-aa97-ed40e32cb31d", "Zane remains the protected demo account");
assert.doesNotMatch(routeSource, /form\.get\(["'](?:portal|agency_code|agency_id|clone_id)["']\)/);
assert.doesNotMatch(routeSource, /creator_agency_codes|claim_creator_agency_code|\.update\(|\.upsert\(/);
assert.match(routeSource, /auth\.auth\.signUp\(/);
assert.doesNotMatch(routeSource, /email_confirm\s*:\s*true|auth\.admin\.createUser/);
assert.match(routeSource, /created\.user\.identities\?\.length === 0/);
assert.match(routeSource, /if \(existing\) return redirectWithError\(req, "exists"\)/);
assert.match(routeSource, /\.ilike\("email", exactCaseInsensitiveEmailPattern\(input\.email\)\)/);
assert.doesNotMatch(routeSource, new RegExp(ZANE_DEMO_ACCOUNT_ID));
assert.equal(normalizeCreatorPublicPortal("link"), "link");
assert.equal(normalizeCreatorPublicPortal("tether"), "tether");
assert.equal(normalizeCreatorPublicPortal("lynq"), "twin", "unrecognised form values cannot select a partner portal");
assert.equal(exactCaseInsensitiveEmailPattern("CREATOR+100%_TEST\\BOX@example.com"), "CREATOR+100\\%\\_TEST\\\\BOX@example.com");

const form = new FormData();
form.set("display_name", "  Link Applicant  ");
form.set("email", "  CREATOR@EXAMPLE.COM  ");
form.set("password", "correct-horse-battery-staple");
form.set("portal", "tether");
form.set("agency_id", TETHER_PORTAL.id);
form.set("agency_code", "attacker-controlled");
form.set("clone_id", "demo-zane");
const parsed = parseLinkCreatorSignup(form);
assert.deepEqual(parsed, {
  displayName: "Link Applicant",
  email: "creator@example.com",
  password: "correct-horse-battery-staple",
});

const account = linkCreatorAccountRow(parsed!, "11111111-1111-4111-8111-111111111111");
assert.equal(account.account_status, "applicant");
assert.equal(account.source, "agency_invite");
assert.equal(Object.hasOwn(account, "agency_id"), false);

const assignment = linkCreatorAssignmentRow("22222222-2222-4222-8222-222222222222", "2026-09-11T00:00:00.000Z");
assert.equal(assignment.agency_id, LYNQ_PORTAL.id);
assert.equal(assignment.assignment_source, "direct");
assert.equal(Object.hasOwn(assignment, "clone_id"), false);
assert.equal(Object.hasOwn(assignment, "user_id"), false);

for (const invalid of [
  ["", "creator@example.com", "password1"],
  ["Creator", "invalid", "password1"],
  ["Creator", "creator@example.com", "short"],
  ["x".repeat(121), "creator@example.com", "password1"],
] as const) {
  const fd = new FormData();
  fd.set("display_name", invalid[0]);
  fd.set("email", invalid[1]);
  fd.set("password", invalid[2]);
  assert.equal(parseLinkCreatorSignup(fd), null);
}

type Call = { url: URL; method: string; body: unknown; apiKey: string | null };

async function checkRoute() {
  const oldFetch = globalThis.fetch;
  const oldError = console.error;
  Object.assign(process.env, {
    NODE_ENV: "production",
    DASHBOARD_PUBLIC_ORIGIN: "https://dashboard.tgaiclone.xyz",
    SUPABASE_URL: "https://link-signup-test.supabase.co",
    SUPABASE_SERVICE_KEY: "offline-service-key",
    SUPABASE_PUBLISHABLE_KEY: "offline-publishable-key",
    CREATOR_SESSION_SECRET: "offline-creator-session-secret",
  });

  const calls: Call[] = [];
  const userId = "33333333-3333-4333-8333-333333333333";
  const accountId = "44444444-4444-4444-8444-444444444444";
  let scenario: "pending" | "existing" | "assignment_failure" = "pending";
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
  const authUser = {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email: "creator@example.com",
    email_confirmed_at: null,
    phone: "",
    confirmed_at: null,
    last_sign_in_at: null,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { display_name: "Link Applicant" },
    identities: [{
      identity_id: userId,
      id: userId,
      user_id: userId,
      identity_data: { email: "creator@example.com" },
      provider: "email",
      created_at: "2026-09-11T00:00:00.000Z",
      updated_at: "2026-09-11T00:00:00.000Z",
      last_sign_in_at: null,
    }],
    created_at: "2026-09-11T00:00:00.000Z",
    updated_at: "2026-09-11T00:00:00.000Z",
    is_anonymous: false,
  };

  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.hostname, "link-signup-test.supabase.co", "Link signup tests remain offline");
    const text = ["GET", "HEAD"].includes(request.method) ? "" : await request.clone().text();
    let body: unknown = text;
    try { body = text ? JSON.parse(text) : null; } catch { /* retain non-JSON request body */ }
    calls.push({ url, method: request.method, body, apiKey: request.headers.get("apikey") });

    if (url.pathname === "/rest/v1/creator_accounts" && request.method === "GET") {
      return json(scenario === "existing" ? { id: "existing-account" } : null);
    }
    if (url.pathname === "/auth/v1/signup") return json({ user: authUser, session: null });
    if (url.pathname === "/rest/v1/creator_accounts" && request.method === "POST") return json({ id: accountId }, 201);
    if (url.pathname === "/rest/v1/creator_onboarding_progress" && request.method === "POST") return json(null, 201);
    if (url.pathname === "/rest/v1/creator_agency_assignments" && request.method === "POST") {
      return scenario === "assignment_failure"
        ? json({ code: "fixture_failure", message: "fixture assignment failed" }, 409)
        : json(null, 201);
    }
    if (url.pathname === "/rest/v1/creator_accounts" && request.method === "DELETE") return new Response(null, { status: 204 });
    if (url.pathname === `/auth/v1/admin/users/${userId}` && request.method === "DELETE") return json({ user: authUser });
    throw new Error(`Unexpected request ${request.method} ${url.pathname}`);
  };
  console.error = () => undefined;

  try {
    const { POST } = await import("../app/creator-auth/link/signup/route");
    const requestBody = () => {
      const body = new FormData();
      body.set("display_name", "Link Applicant");
      body.set("email", "creator@example.com");
      body.set("password", "correct-horse-battery-staple");
      body.set("portal", "tether");
      body.set("agency_id", TETHER_PORTAL.id);
      body.set("agency_code", "attacker-controlled");
      body.set("clone_id", "demo-zane");
      return body;
    };
    const request = () => new Request("https://dashboard.tgaiclone.xyz/creator-auth/link/signup", {
      method: "POST",
      headers: { origin: "https://dashboard.tgaiclone.xyz" },
      body: requestBody(),
    });

    const pending = await POST(request());
    assert.equal(pending.status, 303);
    assert.equal(pending.headers.get("location"), `https://dashboard.tgaiclone.xyz${LINK_CREATOR_SIGNUP_PATH}?status=check_email`);
    assert.match(pending.headers.get("set-cookie") || "", new RegExp(`${CREATOR_PORTAL_COOKIE}=link`));
    assert.doesNotMatch(pending.headers.get("set-cookie") || "", /twin_creator_session=/, "Unconfirmed signup receives no creator session");

    const authCall = calls.find((call) => call.url.pathname === "/auth/v1/signup");
    assert.ok(authCall);
    assert.equal(authCall.apiKey, "offline-publishable-key");
    assert.equal(authCall.url.searchParams.get("redirect_to"), `https://dashboard.tgaiclone.xyz${LINK_CREATOR_LOGIN_PATH}`);
    assert.deepEqual(authCall.body, {
      email: "creator@example.com",
      password: "correct-horse-battery-staple",
      data: { display_name: "Link Applicant" },
      gotrue_meta_security: {},
      code_challenge: null,
      code_challenge_method: null,
    });
    const lookupCall = calls.find((call) => call.url.pathname === "/rest/v1/creator_accounts" && call.method === "GET");
    assert.equal(lookupCall?.url.searchParams.get("email"), "ilike.creator@example.com");

    const accountCall = calls.find((call) => call.url.pathname === "/rest/v1/creator_accounts" && call.method === "POST");
    assert.deepEqual(accountCall?.body, {
      auth_user_id: userId,
      email: "creator@example.com",
      display_name: "Link Applicant",
      account_status: "applicant",
      source: "agency_invite",
    });
    const assignmentCall = calls.find((call) => call.url.pathname === "/rest/v1/creator_agency_assignments");
    assert.deepEqual(assignmentCall?.body, {
      creator_account_id: accountId,
      agency_id: LYNQ_PORTAL.id,
      assignment_source: "direct",
      assigned_at: (assignmentCall?.body as { assigned_at: string }).assigned_at,
    });
    assert.equal(calls.some((call) => /agency_codes|claim_creator/.test(call.url.pathname)), false);
    assert.equal(JSON.stringify(calls).includes(ZANE_DEMO_ACCOUNT_ID), false);

    calls.length = 0;
    scenario = "existing";
    const duplicate = await POST(request());
    assert.equal(duplicate.status, 303);
    assert.equal(duplicate.headers.get("location"), `https://dashboard.tgaiclone.xyz${LINK_CREATOR_SIGNUP_PATH}?error=exists`);
    assert.deepEqual(calls.map((call) => `${call.method} ${call.url.pathname}`), ["GET /rest/v1/creator_accounts"], "Existing email is never taken over or reassigned");

    calls.length = 0;
    scenario = "assignment_failure";
    const failed = await POST(request());
    assert.equal(failed.status, 303);
    assert.equal(failed.headers.get("location"), `https://dashboard.tgaiclone.xyz${LINK_CREATOR_SIGNUP_PATH}?error=failed`);
    const operations = calls.map((call) => `${call.method} ${call.url.pathname}`);
    assert.ok(operations.includes("DELETE /rest/v1/creator_accounts"));
    assert.ok(operations.includes(`DELETE /auth/v1/admin/users/${userId}`));
    assert.ok(operations.indexOf("DELETE /rest/v1/creator_accounts") < operations.indexOf(`DELETE /auth/v1/admin/users/${userId}`), "Partial account row is removed before its Auth user");
    const deleteAccount = calls.find((call) => call.method === "DELETE" && call.url.pathname === "/rest/v1/creator_accounts");
    assert.equal(deleteAccount?.url.searchParams.get("id"), `eq.${accountId}`);
    assert.equal(deleteAccount?.url.searchParams.get("auth_user_id"), `eq.${userId}`);
    assert.equal(JSON.stringify(calls).includes(ZANE_DEMO_ACCOUNT_ID), false);

    const { POST: loginPOST } = await import("../app/creator-auth/login/route");
    const invalidLogin = new FormData();
    invalidLogin.set("portal", "link");
    invalidLogin.set("next", LINK_CREATOR_LOGIN_PATH);
    const loginResponse = await loginPOST(new Request("https://dashboard.tgaiclone.xyz/creator-auth/login", {
      method: "POST",
      body: invalidLogin,
    }));
    assert.equal(loginResponse.status, 303);
    assert.equal(loginResponse.headers.get("location"), `https://dashboard.tgaiclone.xyz${LINK_CREATOR_LOGIN_PATH}?error=1&next=%2Fcreator`);
    assert.match(loginResponse.headers.get("set-cookie") || "", new RegExp(`${CREATOR_PORTAL_COOKIE}=link`));
  } finally {
    globalThis.fetch = oldFetch;
    console.error = oldError;
  }
}

checkRoute().then(() => {
  console.log("LINK CREATOR SIGNUP PASSED: dedicated confirmed-email flow, server-owned LYNQ assignment, duplicate refusal, exact rollback and Zane/Tether isolation.");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
