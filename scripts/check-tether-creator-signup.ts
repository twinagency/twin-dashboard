import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TETHER_PORTAL } from "../lib/partner-portals";
import { exactCaseInsensitiveEmailPattern } from "../lib/creator-email";
import {
  parseTetherCreatorSignup,
  tetherCreatorAccountRow,
  tetherCreatorAssignmentRow,
  TETHER_CREATOR_SIGNUP_ACTION,
} from "../lib/tether-creator-signup";

const component = readFileSync("components/CreatorSignupScreen.tsx", "utf8");
const route = readFileSync("app/creator-auth/tether/signup/route.ts", "utf8");
const genericRoute = readFileSync("app/creator-auth/signup/route.ts", "utf8");

assert.equal(TETHER_CREATOR_SIGNUP_ACTION, "/creator-auth/tether/signup");
assert.match(component, /const directAgencySignup = tether \|\| link;/);
assert.match(component, /const signupAction = tether \? TETHER_CREATOR_SIGNUP_ACTION : link \? LINK_CREATOR_SIGNUP_ACTION : "\/creator-auth\/signup";/);
assert.match(component, /<form action=\{signupAction\} method="post"/);
// Still gated behind !directAgencySignup. Inside that gate the field now
// branches on whether the visitor arrived on a resolved agency invite.
assert.match(component, /\{!directAgencySignup && \(invited[\s\S]*?name="agency_code"/);
// and it must not appear anywhere outside that gate.
assert.equal(component.split('name="agency_code"').length - 1, 2);
assert.match(component, /\{!directAgencySignup && <input type="hidden" name="portal" value="twin" \/>\}/);
assert.doesNotMatch(route, /form\.get\(["'](?:portal|agency_code|agency_id)["']\)/);
assert.doesNotMatch(route, /creator_agency_codes|claim_creator_agency_code/);
assert.match(route, /auth\.auth\.signUp\(/);
assert.doesNotMatch(route, /email_confirm\s*:\s*true|auth\.admin\.createUser/);
assert.match(route, /created\.user\.identities\?\.length === 0/);
assert.match(route, /if \(existing\) return redirectWithError\(req, "exists"\)/);
assert.match(route, /\.ilike\("email", exactCaseInsensitiveEmailPattern\(input\.email\)\)/);
assert.match(genericRoute, /claim_creator_agency_code/);
assert.equal(exactCaseInsensitiveEmailPattern("creator%_box@example.com"), "creator\\%\\_box@example.com");

const form = new FormData();
form.set("display_name", "  Tether Applicant  ");
form.set("email", "  CREATOR@EXAMPLE.COM  ");
form.set("password", "correct-horse-battery-staple");
form.set("portal", "evil");
form.set("agency_id", "attacker-controlled");
form.set("agency_code", "reusable-secret");
const parsed = parseTetherCreatorSignup(form);
assert.deepEqual(parsed, {
  displayName: "Tether Applicant",
  email: "creator@example.com",
  password: "correct-horse-battery-staple",
});

const account = tetherCreatorAccountRow(parsed!, "11111111-1111-4111-8111-111111111111");
assert.equal(account.account_status, "applicant");
assert.equal(account.source, "agency_invite");
assert.equal(Object.hasOwn(account, "agency_id"), false);

const assignment = tetherCreatorAssignmentRow("22222222-2222-4222-8222-222222222222", "2026-09-11T00:00:00.000Z");
assert.equal(assignment.agency_id, TETHER_PORTAL.id);
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
  assert.equal(parseTetherCreatorSignup(fd), null);
}

async function checkPendingConfirmationRoute() {
  const oldFetch = globalThis.fetch;
  Object.assign(process.env, {
    NODE_ENV: "production",
    DASHBOARD_PUBLIC_ORIGIN: "https://dashboard.tgaiclone.xyz",
    SUPABASE_URL: "https://tether-signup-test.supabase.co",
    SUPABASE_SERVICE_KEY: "offline-service-key",
    SUPABASE_PUBLISHABLE_KEY: "offline-publishable-key",
  });
  const calls: Array<{ url: URL; method: string; body: unknown; apiKey: string | null }> = [];
  const userId = "33333333-3333-4333-8333-333333333333";
  const accountId = "44444444-4444-4444-8444-444444444444";
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.hostname !== "tether-signup-test.supabase.co") throw new Error(`Unexpected host ${url.hostname}`);
    const text = ["GET", "HEAD"].includes(request.method) ? "" : await request.clone().text();
    let body: unknown = text;
    try { body = text ? JSON.parse(text) : null; } catch { /* keep non-JSON request text */ }
    calls.push({ url, method: request.method, body, apiKey: request.headers.get("apikey") });

    if (url.pathname === "/rest/v1/creator_accounts" && request.method === "GET") return json(null);
    if (url.pathname === "/auth/v1/signup") {
      return json({
        user: {
          id: userId,
          aud: "authenticated",
          role: "authenticated",
          email: "creator@example.com",
          email_confirmed_at: null,
          phone: "",
          confirmed_at: null,
          last_sign_in_at: null,
          app_metadata: { provider: "email", providers: ["email"] },
          user_metadata: { display_name: "Tether Applicant" },
          identities: [{ identity_id: userId, id: userId, user_id: userId, identity_data: { email: "creator@example.com" }, provider: "email", created_at: "2026-09-11T00:00:00.000Z", updated_at: "2026-09-11T00:00:00.000Z", last_sign_in_at: null }],
          created_at: "2026-09-11T00:00:00.000Z",
          updated_at: "2026-09-11T00:00:00.000Z",
          is_anonymous: false,
        },
        session: null,
      });
    }
    if (url.pathname === "/rest/v1/creator_accounts" && request.method === "POST") return json({ id: accountId }, 201);
    if (["/rest/v1/creator_onboarding_progress", "/rest/v1/creator_agency_assignments"].includes(url.pathname) && request.method === "POST") return json(null, 201);
    throw new Error(`Unexpected request ${request.method} ${url.pathname}`);
  };

  try {
    const { POST } = await import("../app/creator-auth/tether/signup/route");
    const body = new FormData();
    body.set("display_name", "Tether Applicant");
    body.set("email", "creator@example.com");
    body.set("password", "correct-horse-battery-staple");
    body.set("portal", "evil");
    body.set("agency_id", "attacker-controlled");
    body.set("agency_code", "reusable-secret");
    const response = await POST(new Request("https://dashboard.tgaiclone.xyz/creator-auth/tether/signup", { method: "POST", headers: { origin: "https://dashboard.tgaiclone.xyz" }, body }));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "https://dashboard.tgaiclone.xyz/creator/tether/signup?status=check_email");
    assert.equal(response.headers.has("set-cookie"), false, "Unconfirmed signup must not receive a creator session");

    const authCall = calls.find((call) => call.url.pathname === "/auth/v1/signup");
    assert.ok(authCall);
    assert.equal(authCall.apiKey, "offline-publishable-key");
    assert.deepEqual(authCall.body, {
      email: "creator@example.com",
      password: "correct-horse-battery-staple",
      data: { display_name: "Tether Applicant" },
      gotrue_meta_security: {},
      code_challenge: null,
      code_challenge_method: null,
    });
    assert.equal(authCall.url.searchParams.get("redirect_to"), "https://dashboard.tgaiclone.xyz/creator/tether/login");

    const accountCall = calls.find((call) => call.url.pathname === "/rest/v1/creator_accounts" && call.method === "POST");
    assert.deepEqual(accountCall?.body, {
      auth_user_id: userId,
      email: "creator@example.com",
      display_name: "Tether Applicant",
      account_status: "applicant",
      source: "agency_invite",
    });
    const assignmentCall = calls.find((call) => call.url.pathname === "/rest/v1/creator_agency_assignments");
    assert.deepEqual(assignmentCall?.body, {
      creator_account_id: accountId,
      agency_id: TETHER_PORTAL.id,
      assignment_source: "direct",
      assigned_at: (assignmentCall?.body as { assigned_at: string }).assigned_at,
    });
    assert.equal(calls.some((call) => /agency_codes|claim_creator/.test(call.url.pathname)), false);
  } finally {
    globalThis.fetch = oldFetch;
  }
}

checkPendingConfirmationRoute().then(() => {
  console.log("TETHER CREATOR SIGNUP PASSED: dedicated public application route, confirmed-email gate, server-owned Tether assignment, applicant-only account and unchanged generic agency-code flow.");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
