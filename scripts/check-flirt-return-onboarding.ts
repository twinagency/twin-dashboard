import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { configureFlirtOfflineEnv } from "./flirt-offline-env";
import { CREATOR_SESSION_COOKIE, signCreatorSession } from "../lib/creator-session";

async function main() {
  configureFlirtOfflineEnv();
  Object.assign(process.env, { FLIRT_SUPABASE_PROJECT_REF: "lkmfwpqegjluirfusnaw", SUPABASE_URL: "https://lkmfwpqegjluirfusnaw.supabase.co" });
  const accountId = "22222222-2222-4222-8222-222222222222";
  const userId = "11111111-1111-4111-8111-111111111111";
  const origin = "https://dashboard.flirt.example";
  let application = { id: accountId, status: "submitted", answers: {} as Record<string,string>, updated_at: "2026-01-01T00:00:00.000Z" };
  const files: Record<string,any>[] = [];
  const stored: string[] = [];
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    assert.ok(["lkmfwpqegjluirfusnaw.supabase.co", "abcdefghijklmnopqrst.supabase.co"].includes(url.hostname), "No real network calls in this test");
    if (url.pathname.startsWith("/storage/v1/object/")) {
      assert.ok(url.pathname.startsWith(`/storage/v1/object/onboarding-content/creators/${accountId}/`));
      assert.equal(req.method, "POST");
      stored.push(url.pathname);
      return json({ Key: url.pathname }, 200);
    }
    const table = url.pathname.replace("/rest/v1/", "");
    if (req.method === "GET") {
      if (table === "creator_accounts") {
        assert.equal(url.searchParams.get("id"), `eq.${accountId}`);
        return json({ id: accountId, auth_user_id: userId, account_status: "applicant", source: "twin", display_name: "Offline fixture" });
      }
      assert.equal(url.searchParams.get("creator_account_id"), `eq.${accountId}`);
      if (table === "creator_applications") return json(application);
      if (table === "creator_files") return json(files);
      if (["creator_onboarding_progress", "creator_agency_assignments", "creator_clone_links"].includes(table)) return json(null);
      throw new Error(`Unexpected table ${table}`);
    }
    const raw = await req.json();
    const body = Array.isArray(raw) ? raw[0] : raw;
    if (req.method === "PATCH") {
      assert.equal(table, "creator_applications");
      assert.equal(url.searchParams.get("creator_account_id"), `eq.${accountId}`);
      assert.equal(url.searchParams.get("status"), `eq.${application.status}`);
      if (url.searchParams.get("updated_at") !== `eq.${application.updated_at}`) return json(null);
      assert.equal(body.status, undefined, "Returning does not change review or approval");
      application = { ...application, ...body };
      return json(application);
    }
    assert.equal(req.method, "POST");
    assert.equal(body.creator_account_id, accountId, "Ignore any posted foreign account ID");
    if (table === "creator_files") { files.push(body); return json(body, 201); }
    if (table === "creator_onboarding_progress") return json(body, 201);
    throw new Error(`Unexpected write to ${table}`);
  };
  try {
    const { POST: upload } = await import("../app/creator-auth/upload/route");
    const { POST: draft } = await import("../app/creator-auth/onboarding/draft/route");
    const token = await signCreatorSession(accountId, userId);
    const { middleware } = await import("../middleware");
    const dashboardRequest = () => new NextRequest(`${origin}/creator`, { headers: { cookie: `${CREATOR_SESSION_COOKIE}=${token}` } });
    application.status = "draft";
    assert.equal((await middleware(dashboardRequest())).headers.get("x-middleware-next"), "1", "FLIRT routing must allow draft creators to their own dashboard");
    const anonymousDashboard = await middleware(new NextRequest(`${origin}/creator`));
    assert.ok(anonymousDashboard.headers.get("location")?.includes("/creator/login"), "Draft access still requires authentication");
    const photo = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOs1nVmYGBgYmBgYGBgAAALZgDvHS4cXQAAAABJRU5ErkJggg==", "base64");
    const postUpload = async (authenticated = true, bytes = photo, accept = "application/json") => {
      const form = new FormData();
      form.set("kind", "content_sfw_image");
      form.set("creator_account_id", "foreign-account");
      form.append("files", new Blob([bytes], { type: "image/png" }), "sample.png");
      return upload(new NextRequest(`${origin}/creator-auth/upload`, { method: "POST", headers: { origin, accept, ...(authenticated ? { cookie: `${CREATOR_SESSION_COOKIE}=${token}` } : {}) }, body: form }));
    };
    assert.equal((await postUpload(false)).status, 401);
    assert.equal(stored.length, 0);
    for (const status of ["draft", "submitted", "reviewing", "approved"]) {
      application.status = status;
      const result = await postUpload();
      assert.equal(result.status, 200, `Upload after ${status}`);
      const saved = await result.json();
      assert.equal(saved.status, "content_saved");
      assert.match(saved.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, "Diagnostics expose only a generated request identifier");
      assert.equal(result.headers.get("X-Upload-Request-Id"), saved.requestId, "Response and logs use the same request identifier");
      assert.equal(saved.stage, "progress", "Saved response follows storage and metadata completion");
      assert.ok(Number.isSafeInteger(saved.elapsedMs) && saved.elapsedMs >= 0, "Elapsed time is a finite non-negative duration, not a fixed timing expectation");
      assert.deepEqual(Object.keys(saved).sort(), ["elapsedMs", "requestId", "stage", "status"], "Public diagnostics must not disclose account IDs, object paths or storage errors");
      const revision = application.updated_at;
      const save = await draft(new NextRequest(`${origin}/creator-auth/onboarding/draft`, { method: "POST", headers: { origin, cookie: `${CREATOR_SESSION_COOKIE}=${token}`, "content-type": "application/json" }, body: JSON.stringify({ section: "personal-contact", answers: { full_name: "Returned creator" }, revision, creator_account_id: "foreign-account" }) }));
      assert.equal(save.status, 200, `Autosave after ${status}`);
      assert.equal(application.status, status);
      assert.equal(application.answers.full_name, "Returned creator");
      const merged = await draft(new NextRequest(`${origin}/creator-auth/onboarding/draft`, { method: "POST", headers: { origin, cookie: `${CREATOR_SESSION_COOKIE}=${token}`, "content-type": "application/json" }, body: JSON.stringify({ section: "quick-family", answers: { tattoos_piercings: "Returned appearance" }, revision: application.updated_at }) }));
      assert.equal(merged.status, 200, `Merged profile autosave after ${status}`);
      assert.equal(application.answers.tattoos_piercings, "Returned appearance");
      assert.equal(application.answers.full_name, "Returned creator", "Other pages remain saved");
      for (const [section, answers] of [["quick-style", { texting_style: "Removed style" }], ["goals-replies", { reply_goodnight: "Removed reply" }], ["collaboration-boundaries", { monetisation: "Removed pricing" }]] as const) {
        const removed = await draft(new NextRequest(`${origin}/creator-auth/onboarding/draft`, { method: "POST", headers: { origin, cookie: `${CREATOR_SESSION_COOKIE}=${token}`, "content-type": "application/json" }, body: JSON.stringify({ section, answers, revision: application.updated_at }) }));
        assert.equal(removed.status, 400, "Removed fields cannot return through old section names");
      }
    }
    assert.equal(files.length, 4);
    assert.ok(files.every(file => file.storage_transfer_status === "verified"));
    assert.equal((await postUpload(true, Buffer.from("not a real image"))).status, 400);
    assert.equal(files.length, 4, "Invalid media cannot create a file record");
    const traditional = await postUpload(true, photo, "text/html");
    assert.equal(traditional.status, 303, "Non-JavaScript form contract is retained");
    application.status = "rejected";
    assert.equal((await postUpload()).status, 409);
    Object.assign(process.env, { FLIRT_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst", SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co" });
    application.status = "draft";
    assert.ok((await middleware(dashboardRequest())).headers.get("location")?.includes("/creator/onboarding"), "Strict runtimes still require onboarding before dashboard access");
    application.status = "submitted";
    assert.equal((await postUpload()).status, 409, "Strict runtimes keep submitted uploads locked");
    assert.equal(files.length, 5);
    console.log("FLIRT RETURN ONBOARDING PASSED: verified uploads and autosave after submission, JSON/form responses, invalid media rejection, ownership and unchanged strict/rejected locks.");
  } finally { globalThis.fetch = oldFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

