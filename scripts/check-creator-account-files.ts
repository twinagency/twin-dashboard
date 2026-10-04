import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { configureFlirtOfflineEnv } from "./flirt-offline-env";
import { identity, ID } from "../deployment/flirt-live-twin.cjs";
import { withDashboardAccess } from "../lib/dashboard-access";
import { GET as reviewFile } from "../app/agency/creators/file/route";

async function main() {
  configureFlirtOfflineEnv();
  Object.assign(process.env, {
    NODE_ENV: "production", FLIRT_LIVE_TWIN_ENABLED: "true",
    FLIRT_SUPABASE_PROJECT_REF: "lkmfwpqegjluirfusnaw",
    SUPABASE_URL: "https://lkmfwpqegjluirfusnaw.supabase.co",
  });
  const origin = process.env.DASHBOARD_PUBLIC_ORIGIN!;
  const account = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const fileId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const other = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const validPath = `creators/${account}/content/video.mp4`;
  let file: any = { bucket: "onboarding-content", storage_path: validPath, storage_transfer_status: "verified", original_name: "video.mp4" };
  let fileError = false, signError = false, assignmentError = false;
  let fileReads = 0, signed = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "lkmfwpqegjluirfusnaw.supabase.co", "file review must never use Twin");
    const method = init?.method || "GET";
    let result: unknown = [];
    switch (url.pathname) {
      case "/rest/v1/partner_agencies": result = { id: ID, name: "FLIRT" }; break;
      case "/rest/v1/agency_creators": result = []; break;
      case "/rest/v1/creator_agency_assignments":
        assert.equal(url.searchParams.get("agency_id"), `eq.${ID}`);
        if (assignmentError) return new Response(JSON.stringify({ message: "unavailable" }), { status: 503 });
        result = url.searchParams.get("creator_account_id") === `eq.${account}` ? { creator_account_id: account } : null;
        break;
      case "/rest/v1/creator_files":
        assert.equal(method, "GET");
        assert.equal(url.searchParams.get("creator_account_id"), `eq.${account}`, "account predicate is mandatory");
        fileReads++;
        if (fileError) return new Response(JSON.stringify({ message: "unavailable" }), { status: 503 });
        result = url.searchParams.get("id") === `eq.${fileId}` ? file : null;
        break;
      default:
        assert.ok(url.pathname.startsWith("/storage/v1/object/sign/"), `Unexpected request ${url.pathname}`);
        assert.equal(method, "POST", "only a temporary signing request may write");
        assert.deepEqual(JSON.parse(String(init?.body)), { expiresIn: 900 });
        assert.equal(url.pathname, `/storage/v1/object/sign/${file.bucket}/${file.storage_path}`);
        signed++;
        if (signError) return new Response(JSON.stringify({ message: "unavailable" }), { status: 503 });
        result = { signedURL: `/object/sign/${file.bucket}/${file.storage_path}?token=synthetic-test-token` };
        break;
    }
    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  };
  const req = (fields: Record<string, string> = {}) => new NextRequest(origin + "/agency/creators/file?" + new URLSearchParams({ account, file: fileId, ...fields }));
  const status = async (wanted: number, fields: Record<string, string> = {}) => {
    const response = await reviewFile(req(fields));
    assert.equal(response.status, wanted);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    return response;
  };
  try {
    assert.equal((await withDashboardAccess(null, () => reviewFile(req()))).status, 401);
    await withDashboardAccess(identity(), async () => {
      await status(404, { account: "invalid" });
      await status(404, { file: "invalid" });
      await status(404, { account: other });
      assert.equal(fileReads, 0, "unassigned accounts never reach file lookup");
      await status(404, { file: other });
      assert.equal(signed, 0, "foreign file cannot be signed");

      // No application, approval or creator_clone_links lookup is mocked: review
      // must work for an assigned applicant who has no bot link or approval.
      const preview = await status(307);
      assert.ok(preview.headers.get("location")!.startsWith("https://lkmfwpqegjluirfusnaw.supabase.co/storage/v1/object/sign/onboarding-content/"));
      assert.equal(new URL(preview.headers.get("location")!).searchParams.has("download"), false);
      const download = await status(307, { download: "1" });
      assert.equal(new URL(download.headers.get("location")!).searchParams.get("download"), "video.mp4");
      file.bucket = "voice-samples"; await status(307); file.bucket = "onboarding-content";
      const signedBeforeDenials = signed;

      file.storage_transfer_status = "pending"; await status(409); file.storage_transfer_status = "verified";
      file.bucket = "private"; await status(404); file.bucket = "onboarding-content";
      const invalidPaths = [
        `creators/${other}/content/video.mp4`,
        `creators/${account}/../${other}/video.mp4`,
        `creators/${account}/./video.mp4`,
        `creators/${account}/%2e%2e/${other}/video.mp4`,
        `creators/${account}/..\\${other}/video.mp4`,
        `creators/${account}/video.mp4?another=path`,
        `creators/${account}/video.mp4#fragment`,
        `creators/${account}/`,
      ];
      for (const path of invalidPaths) {
        file.storage_path = path;
        const denied = await reviewFile(req());
        assert.equal(denied.status, 404, `unsafe path must be rejected: ${path}`);
      }
      assert.equal(signed, signedBeforeDenials, "invalid files never reach signing");
      file.storage_path = validPath;
      fileError = true; await status(503); fileError = false;
      signError = true; await status(503); signError = false;
      assignmentError = true; await status(503); assignmentError = false;
      file = null; await status(404);
    });
  } finally { globalThis.fetch = original; }
  console.log("CREATOR ACCOUNT FILE REVIEW PASSED: assigned-account and exact-file checks, local private signing, previews/downloads without approval or bot link, unsafe paths denied, failures closed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
