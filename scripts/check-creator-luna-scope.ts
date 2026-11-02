// Luna Skyee: scoped live creator whose Earnings tab reads her Twin clone AND who can still upload.
// Offline: every Supabase call is answered by an in-process fetch double. Other scoped creators stay read-only.
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { creatorDashboardIdentity } from "../lib/creator-dashboard-identity";
import { creatorShare } from "../lib/creator-share";
import { CREATOR_SESSION_COOKIE, signCreatorSession } from "../lib/creator-session";
import { POST as uploadPOST } from "../app/creator-auth/upload/route";
import { GET as uploadsGET } from "../app/creator-auth/uploads/route";
import { GET as filesGET } from "../app/creator-auth/files/route";
import { POST as foldersPOST } from "../app/creator-auth/content-folders/route";
import { POST as onboardingPOST } from "../app/creator-auth/onboarding/route";
import { readFileSync } from "node:fs";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const live = require("../deployment/flirt-live-twin.cjs");

const origin = "https://flirt-dashboard.example.com";
const userId = "99999999-9999-4999-8999-999999999999";
const LUNA_ACCOUNT = "032d8512-ac99-434a-abea-6b1ac5aa67fc";
const LUNA_CLONE = "4994b010-f976-4cd1-b053-d72986fb455d";
const BROOKE_ACCOUNT = "405303ac-059c-42a5-abef-8628ecb7dd71";

async function main() {
  Object.assign(process.env, {
    NODE_ENV: "production",
    FLIRT_BACKEND_ENABLED: "true",
    FLIRT_SUPABASE_PROJECT_REF: "lkmfwpqegjluirfusnaw",
    SUPABASE_URL: "https://lkmfwpqegjluirfusnaw.supabase.co",
    SUPABASE_SERVICE_KEY: "sb_secret_" + "x".repeat(32),
    DASHBOARD_PUBLIC_ORIGIN: origin,
    DASHBOARD_SESSION_SECRET: "offline-only-dashboard-session-secret-0001",
    CREATOR_SESSION_SECRET: "offline-only-creator-session-secret-0002",
    DASHBOARD_PASSWORD: "offline-only-password-0003",
    FLIRT_LIVE_TWIN_ENABLED: "true",
  });
  // Static contract first: Luna is in the scoped map with the exact source and clone.
  assert.deepEqual(live.scopedCreator(LUNA_ACCOUNT), { cloneId: LUNA_CLONE, name: "Luna Skyee", source: "agency_invite", contentUploads: true });
  assert.equal(live.scopedCreator(BROOKE_ACCOUNT).contentUploads, undefined, "only Luna gets the upload exception");
  assert.equal(live.CLONES.includes(LUNA_CLONE), true, "Luna is on the FLIRT agency list like the other girls");

  const previous = globalThis.fetch;
  const writes: string[] = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.hostname, "lkmfwpqegjluirfusnaw.supabase.co", "test must stay offline");
    if (!["GET", "HEAD"].includes(request.method)) { writes.push(`${request.method} ${url.pathname}`); throw new Error("offline write blocked"); }
    const id = url.searchParams.get("id")?.replace(/^eq\./, "") || "";
    let body: unknown = [];
    if (url.pathname === "/rest/v1/creator_accounts") body = { id, auth_user_id: userId, display_name: "Scoped", account_status: "approved", source: id === LUNA_ACCOUNT ? "agency_invite" : "admin" };
    else if (url.pathname === "/rest/v1/creator_applications") body = { status: "approved", submitted_at: "2026-11-02T00:00:00Z" };
    else if (url.pathname === "/rest/v1/creator_agency_assignments") body = { agency_id: live.ID, partner_agencies: { name: "FLIRT", active: true } };
    else if (url.pathname === "/rest/v1/creator_clone_links") body = null; // Luna's real row has clone_id NULL
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json", "content-range": "0-0/0" } });
  };
  try {
    const lunaToken = await signCreatorSession(LUNA_ACCOUNT, userId);
    const luna = await creatorDashboardIdentity(lunaToken);
    assert.ok(luna, "Luna's login must resolve (source agency_invite, FLIRT assignment, null clone link)");
    // Earnings: the page renders only when cloneIds[0] exists.
    assert.deepEqual(luna.cloneIds, [LUNA_CLONE]);
    assert.equal(luna.creatorName, "Luna Skyee");
    assert.equal(luna.onboarded, true);
    assert.equal(luna.dataSource, "twin-live");
    assert.equal(live.isScopedLiveCreator(luna), true);
    assert.equal(creatorShare(luna), 0.7);
    // Uploads: the broad read-only flag stays, plus the narrow content exception.
    assert.equal(luna.readOnly, true);
    assert.equal(luna.contentUploadsAllowed, true);

    const post = (path: string, token = lunaToken) => new NextRequest(origin + path, { method: "POST", headers: { cookie: `${CREATOR_SESSION_COOKIE}=${token}`, origin, referer: origin + "/creator/onboarding", accept: "application/json" } });
    const get = (path: string) => new NextRequest(origin + path, { headers: { cookie: `${CREATOR_SESSION_COOKIE}=${lunaToken}` } });

    // Content routes admit Luna (any answer except the read-only 403/401 gate).
    const upload = await uploadPOST(post("/creator-auth/upload"));
    assert.notEqual(upload.status, 403, "Luna must not be refused as read-only on upload");
    assert.notEqual(upload.status, 401);
    assert.notEqual((await uploadsGET(get("/creator-auth/uploads"))).status, 401);
    assert.notEqual((await filesGET(get("/creator-auth/files?kind=all_content"))).status, 401);
    assert.notEqual((await foldersPOST(post("/creator-auth/content-folders"))).status, 401);
    // Everything that edits her profile or application stays read-only.
    assert.equal((await onboardingPOST(post("/creator-auth/onboarding"))).status, 403);
    // The content step must not render locked for her; questionnaire and consent keep the full lock.
    const page = readFileSync("app/creator/onboarding/page.tsx", "utf8");
    assert.match(page, /contentLocked = \(creator\.readOnly && !creator\.contentUploadsAllowed\)/);
    assert.match(page, /<CreatorContentIntake locked=\{contentLocked\}/);
    assert.match(page, /locked=\{contentLocked\} optional=\{optional\} \/>/);
    // Identity edits keep the plain read-only gate (no content exception).
    assert.match(readFileSync("app/creator-auth/identity/route.ts", "utf8"), /creator\.readOnly \|\|/);
    assert.doesNotMatch(readFileSync("app/creator-auth/identity/route.ts", "utf8"), /contentUploadsAllowed/);

    // Another scoped creator (Brooke) keeps the original read-only behaviour on every content route.
    const brookeToken = await signCreatorSession(BROOKE_ACCOUNT, userId);
    const brooke = await creatorDashboardIdentity(brookeToken);
    assert.ok(brooke);
    assert.equal(brooke.readOnly, true);
    assert.equal(brooke.contentUploadsAllowed, false);
    assert.equal((await uploadPOST(post("/creator-auth/upload", brookeToken))).status, 403);
    assert.equal((await uploadsGET(new NextRequest(origin + "/creator-auth/uploads", { headers: { cookie: `${CREATOR_SESSION_COOKIE}=${brookeToken}` } }))).status, 401);

    assert.deepEqual(writes, [], "no database write may happen in this check");
    console.log("LUNA SCOPE PASSED: earnings clone resolved (cloneIds[0], 70% share, twin-live), content upload routes admit her, profile/onboarding stay read-only, Brooke unchanged.");
  } finally {
    globalThis.fetch = previous;
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
