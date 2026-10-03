import assert from "node:assert/strict";
import { configureFlirtOfflineEnv } from "./flirt-offline-env";
import { ID } from "../deployment/flirt-live-twin.cjs";
import { POST as signup } from "../app/creator-auth/signup/route";

// A FLIRT creator who signs up without an agency code ("joining FLIRT directly")
// must be assigned to the FLIRT agency, or no operator screen can list them.
async function main() {
  configureFlirtOfflineEnv();
  Object.assign(process.env, { NODE_ENV: "production", FLIRT_SUPABASE_PROJECT_REF: "lkmfwpqegjluirfusnaw", SUPABASE_URL: "https://lkmfwpqegjluirfusnaw.supabase.co" });
  const origin = process.env.DASHBOARD_PUBLIC_ORIGIN!;
  const account = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const calls: { path: string; method: string; body: any }[] = [];
  const original = globalThis.fetch;
  const quiet = console.error;
  console.error = () => undefined;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String((input as Request).url ?? input));
    assert.equal(url.hostname, "lkmfwpqegjluirfusnaw.supabase.co", "signup must never reach Twin");
    const method = init?.method || "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ path: url.pathname, method, body });
    let result: unknown = [];
    if (url.pathname === "/auth/v1/admin/users") result = { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", email: body?.email, user_metadata: {}, app_metadata: {}, aud: "authenticated", created_at: new Date().toISOString() };
    else if (url.pathname === "/rest/v1/creator_accounts" && method === "POST") result = [{ id: account }];
    else if (url.pathname === "/rest/v1/creator_accounts") result = [];
    return new Response(JSON.stringify(result), { status: method === "POST" && url.pathname !== "/rest/v1/creator_onboarding_progress" ? 201 : 200, headers: { "content-type": "application/json" } });
  };
  try {
    const res = await signup(new Request(origin + "/creator-auth/signup", {
      method: "POST", headers: { origin },
      body: new URLSearchParams({ display_name: "Direct Creator", email: "direct@example.com", password: "long-enough-pass" }),
    }));
    // next/headers cookies() has no request scope in an offline script, so the
    // route fails (and rolls back) right after the writes asserted below.
    assert.equal(res.status, 303);
    const assignment = calls.find((c) => c.path === "/rest/v1/creator_agency_assignments");
    assert.ok(assignment, "direct signup must create an agency assignment");
    assert.equal(assignment!.body.agency_id, ID);
    assert.equal(assignment!.body.assignment_source, "direct");
  } finally { globalThis.fetch = original; console.error = quiet; }
  console.log("FLIRT DIRECT SIGNUP PASSED: code-less signup is assigned to the FLIRT agency");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
