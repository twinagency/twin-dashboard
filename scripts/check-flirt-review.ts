import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { configureFlirtOfflineEnv } from "./flirt-offline-env";
import { identity, ID, CLONES } from "../deployment/flirt-live-twin.cjs";
import { withDashboardAccess } from "../lib/dashboard-access";
import { flirtOperatorAgencyPath } from "../lib/flirt-onboarding-policy";
import { agencyRequestAllowed } from "../lib/agency-policy";
import { POST as review } from "../app/agency/creators/review/route";

async function main() {
  configureFlirtOfflineEnv();
  Object.assign(process.env, { NODE_ENV: "production", FLIRT_LIVE_TWIN_ENABLED: "true", FLIRT_SUPABASE_PROJECT_REF: "lkmfwpqegjluirfusnaw", SUPABASE_URL: "https://lkmfwpqegjluirfusnaw.supabase.co" });
  const origin = process.env.DASHBOARD_PUBLIC_ORIGIN!;
  const account = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const app = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  let appStatus: string | null = "submitted";
  const writes: { table: string; body: any; filter: string }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "lkmfwpqegjluirfusnaw.supabase.co", "review must never reach Twin");
    const method = init?.method || "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    let result: unknown = [];
    switch (url.pathname) {
      case "/rest/v1/partner_agencies": result = { id: ID, name: "FLIRT" }; break;
      case "/rest/v1/agency_creators": result = []; break;
      case "/rest/v1/creator_agency_assignments": result = url.searchParams.get("creator_account_id") === `eq.${account}` ? { creator_account_id: account } : null; break;
      case "/rest/v1/creator_applications":
        if (method === "PATCH") { writes.push({ table: "app", body, filter: url.searchParams.get("id")! }); result = [{ id: app }]; }
        else result = appStatus ? { id: app, status: appStatus } : null;
        break;
      case "/rest/v1/creator_accounts": writes.push({ table: "account", body, filter: url.searchParams.get("id")! }); result = [{ id: account }]; break;
      default: throw new Error(`Unexpected ${url.pathname}`);
    }
    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  };
  const req = (fields: Record<string, string>, o = origin) => new NextRequest(origin + "/agency/creators/review", { method: "POST", headers: { origin: o }, body: new URLSearchParams(fields) });
  try {
    assert.equal((await withDashboardAccess(null, () => review(req({ creator_account_id: account, decision: "approve" })))).status, 401);
    await withDashboardAccess(identity(), async () => {
      assert.equal((await review(req({ creator_account_id: account, decision: "approve" }, "https://evil.example"))).status, 403);
      assert.equal((await review(req({ creator_account_id: CLONES[0], decision: "approve" }))).status, 403, "unassigned account");
      assert.match((await review(req({ creator_account_id: account, decision: "delete" }))).headers.get("location")!, /result=error$/);
      assert.equal(writes.length, 0);
      const ok = await review(req({ creator_account_id: account, decision: "approve" }));
      assert.match(ok.headers.get("location")!, /result=reviewed$/);
      assert.deepEqual(writes.map((w) => [w.table, w.body.status ?? w.body.account_status]), [["app", "approved"], ["account", "approved"]]);
      writes.length = 0;
      await review(req({ creator_account_id: account, decision: "reject" }));
      assert.deepEqual(writes.map((w) => w.body.status ?? w.body.account_status), ["rejected", "rejected"]);
      writes.length = 0; appStatus = "draft";
      assert.match((await review(req({ creator_account_id: account, decision: "approve" }))).headers.get("location")!, /result=error$/, "drafts cannot be approved");
      appStatus = null;
      assert.match((await review(req({ creator_account_id: account, decision: "approve" }))).headers.get("location")!, /result=error$/, "no application");
      assert.equal(writes.length, 0);
    });
    assert.equal(flirtOperatorAgencyPath("/agency/creators/review"), true);
    assert.equal(agencyRequestAllowed("/agency/creators/review", "POST", false), true);
    assert.equal(agencyRequestAllowed("/agency/creators/review", "POST", true), false);
  } finally { globalThis.fetch = original; }
  console.log("FLIRT REVIEW PASSED: approve/reject/reviewing are origin-checked, assigned-creator-only, local-database-only and need a submitted application");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
