import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { webcrypto, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { invitationStatus } from "../lib/creator-invitation-state";
import { creatorApplicationState } from "../lib/creator-application-state";

const active = { active: true, expires_at: null, max_uses: 1, uses: 0 };
assert.equal(invitationStatus(active, true), "valid");
assert.equal(invitationStatus(null, true), "invalid");
assert.equal(invitationStatus(null, true, true), "unavailable");
assert.equal(invitationStatus({ ...active, uses: 1 }, true), "exhausted");
assert.equal(invitationStatus({ ...active, expires_at: new Date(0).toISOString() }, true), "expired");
assert.equal(invitationStatus(active, false), "disabled");
assert.equal(invitationStatus({ ...active, active: false }, true), "disabled");
for (const state of [null, undefined, "draft"]) assert.equal(creatorApplicationState(state, new Date().toISOString()).submitted, false, "a draft/skip must never become submitted from a timestamp or profile");
assert.equal(creatorApplicationState("submitted").label, "Submitted");
assert.equal(creatorApplicationState("reviewing").label, "Under review");
assert.equal(creatorApplicationState("approved").label, "Approved");

let invite = "valid", moxyHost = false, existing: unknown = null, reconciliation: unknown = null;
let reconciliationError: unknown = null, queries = 0, created = 0, deleted = 0;
let results: any[] = [], args: any[] = [], cookieWrites = 0;
const db = {
  from: (table: string) => {
    queries++;
    let reconciliationQuery = false;
    const chain: any = {
      select: () => chain, ilike: () => chain,
      eq: (key: string) => { reconciliationQuery ||= key === "auth_user_id"; return chain; },
      single: async () => ({ data: { id: "moxy-agency" }, error: null }),
      maybeSingle: async () => ({ data: reconciliationQuery ? reconciliation : existing, error: reconciliationQuery ? reconciliationError : null }),
    };
    return chain;
  },
  rpc: async (_name: string, input: unknown) => { args.push(input); return results.shift(); },
  auth: { admin: {
    createUser: async () => { created++; return { data: { user: { id: "auth-fixture" } }, error: null }; },
    deleteUser: async () => { deleted++; return { error: null }; },
  } },
};
const dependencies: Record<string, any> = {
  "@/lib/creator-email": { exactCaseInsensitiveEmailPattern: (s: string) => s },
  "@/lib/creator-invite-agency": { lookupCreatorInvitation: async () => ({ status: invite, agency: null }) },
  "@/lib/form-origin": { trustedFormOrigin: (r: Request) => r.headers.get("origin") === "https://test.example", isLynqHost: () => moxyHost, trustedMiniAppCreatorSignup: () => false },
  "node:crypto": { randomUUID }, "next/server": { NextResponse },
  "next/headers": { cookies: async () => ({ set: () => { cookieWrites++; }, delete: () => {} }) },
  "@/lib/supabase-service": { serviceClient: () => db },
  "@/lib/creator-session": { CREATOR_SESSION_COOKIE: "creator", creatorCookieOptions: () => ({}), signCreatorSession: async () => "synthetic-session" },
  "@/lib/creator-origin": { creatorRequestUrl: (r: Request, path: string) => new URL(path, r.url) },
  "@/lib/agency-session": { AGENCY_REFRESH_COOKIE: "agency-refresh" },
  "@/lib/agency-policy": { AGENCY_COOKIE: "agency" }, "@/lib/agency-brand": { AGENCY_PORTAL_COOKIE: "agency-brand" },
  "@/lib/session": { SESSION_COOKIE: "admin" }, "@/lib/clone-scope": { CLONE_SCOPE_COOKIE: "clone" },
  "@/lib/partner-portals": { TETHER_PORTAL: { id: "tether-agency" } },
  "@/lib/creator-routing": { TETHER_CREATOR_SIGNUP_PATH: "/creator/tether/signup" },
  "@/lib/flirt-onboarding": { flirtOnboardingOptional: () => true },
  "../../../deployment/flirt-live-twin.cjs": { ID: "flirt-agency" },
};
const output = ts.transpileModule(readFileSync("app/creator-auth/signup/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports: any = {};
vm.runInNewContext(`(function(require,exports){${output}\n})`, { crypto: webcrypto, TextEncoder, console: { error: () => {} } })((name: string) => {
  if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
  return dependencies[name];
}, exports);
const request = (code = "ABCD234567", origin = "https://test.example") => new Request("https://test.example/creator-auth/signup", {
  method: "POST", headers: { origin, accept: "application/json" },
  body: new URLSearchParams({ display_name: "Disposable test", email: "fixture@example.com", password: "synthetic-password", agency_code: code }),
});
function reset() { invite = "valid"; existing = null; reconciliation = null; reconciliationError = null; queries = created = deleted = cookieWrites = 0; results = []; args = []; }
async function main() {
  reset(); assert.equal((await exports.POST(request("", "https://evil.example"))).status, 403); assert.equal(queries + created, 0);
  for (const state of ["invalid", "expired", "exhausted", "disabled", "unavailable"]) {
    reset(); invite = state;
    const response = await exports.POST(request());
    assert.equal((await response.json()).error, `invite_${state}`); assert.equal(created, 0);
  }
  reset(); existing = { id: "existing", auth_user_id: "owner" };
  assert.equal((await (await exports.POST(request())).json()).error, "exists"); assert.equal(created, 0);
  reset(); results = [{ data: null, error: { message: "network" } }, { data: "account-fixture", error: null }];
  assert.equal((await exports.POST(request())).status, 200); assert.equal(args.length, 2); assert.deepEqual(args[0], args[1]); assert.equal(deleted, 0); assert.equal(cookieWrites, 1);
  reset(); results = [{ error: { message: "invite_exhausted" } }, { error: { message: "invite_exhausted" } }];
  assert.equal((await (await exports.POST(request())).json()).error, "invite_exhausted"); assert.equal(deleted, 1); assert.equal(cookieWrites, 0);
  reset(); results = [{ error: { message: "lost_response" } }, { error: { message: "lost_response" } }]; reconciliation = { id: "committed-account" };
  assert.equal((await (await exports.POST(request())).json()).error, "incomplete"); assert.equal(deleted, 0, "a committed registration must never lose its auth user");
  reset(); results = [{ error: { message: "network" } }, { error: { message: "network" } }]; reconciliationError = { message: "network" };
  assert.equal((await exports.POST(request())).status, 503); assert.equal(deleted, 0, "unknown transaction outcome must retain identity for reconciliation");
  console.log("Invitation outcomes, draft/status interpretation, signup origin, duplicate, lost-response retry and safe Auth cleanup checks passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
