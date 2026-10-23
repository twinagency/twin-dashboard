import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { middleware } from "../middleware";
import { POST as saveCreatorOnboarding } from "../app/creator-auth/onboarding/route";
import { POST as uploadCreatorOnboarding } from "../app/creator-auth/upload/route";
import { signCreatorSession, CREATOR_SESSION_COOKIE } from "../lib/creator-session";
import { creatorAccountStatusAllowsAccess, creatorDashboardIdentity } from "../lib/creator-dashboard-identity";
import { CREATOR_DASHBOARD_NAV, CREATOR_AUDIENCE_HEADER, assertCreatorQuery, creatorApiAllowed } from "../lib/creator-dashboard-policy";
import {
  assertCreatorIdentityForm,
  creatorIdentityPatch,
  CREATOR_IDENTITY_ARRAYS,
  CREATOR_IDENTITY_BOOLS,
  CREATOR_IDENTITY_COLUMNS,
  CREATOR_IDENTITY_FORM_KEYS,
  CREATOR_IDENTITY_FORM_MARKERS,
  CREATOR_IDENTITY_TEXT,
} from "../lib/creator-identity-fields";
import { INTAKE_FIELD_KEYS } from "../lib/intake";
import { scopeReadUrl, redactAgencyData } from "../lib/agency-query";
import { accessCacheKey, withDashboardAccess } from "../lib/dashboard-access";
import { guardDashboardAction } from "../lib/agency-management";
import { agencyCanManage, LYNQ_MANAGEMENT_AGENCY_ID } from "../lib/agency-management-policy";
import { TETHER_PORTAL } from "../lib/partner-portals";
import { creatorImageDecodes } from "../lib/creator-image-validation";

const account = "11111111-1111-4111-8111-111111111111";
const user = "22222222-2222-4222-8222-222222222222";
const own = "33333333-3333-4333-8333-333333333333";
const other = "44444444-4444-4444-8444-444444444444";
const origin = "https://dashboard.tgaiclone.xyz";

function jpegWithDimensions(input: Uint8Array, width: number, height: number) {
  const result = Buffer.from(input);
  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  for (let index = 0; index < result.length - 8; index += 1) {
    if (result[index] !== 0xff || !startOfFrameMarkers.has(result[index + 1])) continue;
    result.writeUInt16BE(height, index + 5);
    result.writeUInt16BE(width, index + 7);
    return result;
  }
  throw new Error("Generated JPEG had no start-of-frame marker");
}

async function main() {
  for (const status of ["applicant", "approved", "active"]) assert.equal(creatorAccountStatusAllowsAccess(status), true);
  for (const status of ["paused", "rejected", "archived", "unexpected", null]) assert.equal(creatorAccountStatusAllowsAccess(status), false);
  Object.assign(process.env, { NODE_ENV: "production", SUPABASE_URL: "https://creator-offline.supabase.co", SUPABASE_SERVICE_KEY: "offline-fixture-only", CREATOR_SESSION_SECRET: "offline-creator-secret-not-for-production", DASHBOARD_PASSWORD: "offline-admin-secret" });
  const oldFetch = globalThis.fetch;
  let accountExists = true, accountStatus = "active", accountSource = "twin", mismatched = false, onboarded = true, linked = true, databaseError = false;
  let assignmentExists = true, agencyId: string = TETHER_PORTAL.id, agencyName: string = TETHER_PORTAL.name, agencyActive = true;
  const writes: Array<{ method: string; path: string; body: string }> = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.hostname !== "creator-offline.supabase.co") throw new Error("No live requests in offline creator tests");
    if (databaseError) return new Response(JSON.stringify({ message: "offline database unavailable" }), { status: 503, headers: { "content-type": "application/json" } });
    if (!["GET", "HEAD"].includes(request.method)) {
      writes.push({ method: request.method, path: url.pathname, body: await request.clone().text() });
      return new Response(null, { status: 201, headers: { "content-type": "application/json" } });
    }
    let body: unknown;
    switch (url.pathname) {
      case "/rest/v1/creator_accounts":
        assert.equal(url.searchParams.get("id"), `eq.${account}`);
        body = accountExists ? { id: account, auth_user_id: mismatched ? other : user, display_name: "Fixture Creator", account_status: accountStatus, source: accountSource } : null; break;
      case "/rest/v1/creator_applications":
        assert.equal(url.searchParams.get("creator_account_id"), `eq.${account}`);
        body = { status: onboarded ? "submitted" : "draft" }; break;
      case "/rest/v1/creator_files":
        assert.equal(url.searchParams.get("creator_account_id"), `eq.${account}`);
        body = []; break;
      case "/rest/v1/creator_agency_assignments":
        assert.equal(url.searchParams.get("creator_account_id"), `eq.${account}`);
        body = assignmentExists ? { agency_id: agencyId, partner_agencies: { name: agencyName, active: agencyActive } } : null; break;
      case "/rest/v1/creator_clone_links":
        assert.equal(url.searchParams.get("creator_account_id"), `eq.${account}`);
        body = linked ? { clone_id: own, clones: { id: own, name: "Fixture Creator" } } : null; break;
      default: throw new Error(`Unexpected database resource ${url.pathname}`);
    }
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  };
  try {
    const imageFixture = { create: { width: 1024, height: 1024, channels: 3 as const, background: "#789abc" } };
    const validJpeg = await sharp(imageFixture).jpeg().toBuffer();
    const validPng = await sharp(imageFixture).png().toBuffer();
    const validWebp = await sharp(imageFixture).webp().toBuffer();
    const validGif = await sharp(imageFixture).gif().toBuffer();
    assert.equal(await creatorImageDecodes(validJpeg, "image/jpeg"), true);
    assert.equal(await creatorImageDecodes(validPng, "image/png"), true);
    assert.equal(await creatorImageDecodes(validWebp, "image/webp"), true);
    assert.equal(await creatorImageDecodes(validGif, "image/gif"), true);
    assert.equal(await creatorImageDecodes(validJpeg, "image/png"), false, "MIME mismatches must fail image validation");
    const truncatedJpeg = validJpeg.subarray(0, Math.floor(validJpeg.length * 0.95));
    assert.equal((await sharp(truncatedJpeg).metadata()).format, "jpeg", "Truncated regression fixture must still pass a header-only metadata check");
    assert.equal(await creatorImageDecodes(truncatedJpeg, "image/jpeg"), false, "A metadata-valid truncated image must fail a real decode");
    const oversizedPixelsJpeg = jpegWithDimensions(validJpeg, 6000, 5000);
    const oversizedMetadata = await sharp(oversizedPixelsJpeg, { limitInputPixels: false }).metadata();
    assert.deepEqual([oversizedMetadata.width, oversizedMetadata.height], [6000, 5000]);
    assert.equal(await creatorImageDecodes(oversizedPixelsJpeg, "image/jpeg"), false, "Images over the pixel budget must fail before decoding");

    const token = await signCreatorSession(account, user);
    const request = (path: string, method = "GET", extra: Record<string, string> = {}, cookie = `${CREATOR_SESSION_COOKIE}=${token}`) => new NextRequest(origin + path, { method, headers: { cookie, ...extra } });
    for (const path of ["/creator-auth/uploads", "/creator-auth/files", `/creator-auth/files/${account}/access`]) {
      const allowed = await middleware(request(path));
      assert.equal(allowed.headers.get("x-middleware-next"), "1", "Gallery/status handlers must run their own creator check, including unfinished accounts");
      assert.equal((await middleware(request(path, "POST", { origin }))).status, 403);
    }
    assert.equal((await middleware(request(`/creator-auth/files/${account}`, "DELETE", { origin }))).headers.get("x-middleware-next"), "1");
    assert.equal((await middleware(request(`/creator-auth/files/${account}`, "DELETE", { origin: "https://attacker.invalid" }))).status, 403);
    const identity = await creatorDashboardIdentity(token);
    assert.ok(identity);
    assert.deepEqual(identity.cloneIds, [own]);
    assert.equal(identity.id, `creator:${account}`);
    assert.equal(identity.agencyId, TETHER_PORTAL.id);
    assert.equal(identity.name, TETHER_PORTAL.name);
    assert.equal(agencyCanManage(identity), false);
    assert.notEqual(accessCacheKey(identity), accessCacheKey(null));
    assert.notEqual(accessCacheKey(identity), accessCacheKey({ ...identity, id: "another-creator" }));
    assert.deepEqual(CREATOR_DASHBOARD_NAV, [
      { href: "/creator", label: "Earnings", icon: "EarningsCombo" },
      { href: "/creator/payouts", label: "Payouts", icon: "Payouts" },
      { href: "/creator/ppvs", label: "Pay Per View", icon: "Media" },
      { href: "/creator/business", label: "Business", icon: "Bot" },
      { href: "/creator/info", label: "Info", icon: "Info" },
      { href: "/creator/logs", label: "Logs", icon: "Logs" },
      { href: "/creator/edit", label: "Edit", icon: "Dials" },
    ]);
    assert.equal(CREATOR_DASHBOARD_NAV.length, 7);
    assert.equal(new Set(CREATOR_DASHBOARD_NAV.map(item => item.href)).size, 7);
    for (const item of CREATOR_DASHBOARD_NAV) {
      const response = await middleware(request(item.href));
      assert.equal(response.status, 200, item.href);
      assert.equal(response.headers.get(`x-middleware-request-${CREATOR_AUDIENCE_HEADER}`), "creator");
    }
    for (const path of ["/creator/edit?tab=config", "/creator/edit?tab=identity&tab=money", "/creator/edit?sub=advanced", `/creator?clone=${other}`, `/api/dashboard?clone=${own}&clone=${other}`, "/users", "/settings", "/agency-admin", "/crm/inbox", `/clones/${other}?tab=identity`, "/api/models", "/api/compile"]) {
      assert.equal((await middleware(request(path))).status, 403, path);
    }
    for (const path of ["/creator", "/creator/edit", "/api/payouts", "/api/dashboard", "/clones/" + own]) assert.equal((await middleware(request(path, "POST", { origin, "next-action": "forged-action" }))).status, 403, path);
    for (const path of ["/api/payouts?cloneId=" + own, "/api/dashboard?clone=" + own, "/api/dashboard/day-insight?clone=" + own, "/api/media-sign?path=" + own + "/fixture.jpg", "/api/fx", "/api/business-account?cloneId=" + own]) {
      const response = await middleware(request(path));
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get(`x-middleware-request-${CREATOR_AUDIENCE_HEADER}`), "creator");
    }
    // An existing operator cookie cannot turn a creator-page API read into a fleet read.
    const mixed = await middleware(request("/api/dashboard", "GET", { referer: origin + "/creator" }, `${CREATOR_SESSION_COOKIE}=${token}; twin_agency_access=unrelated-operator-cookie`));
    assert.equal(mixed.headers.get(`x-middleware-request-${CREATOR_AUDIENCE_HEADER}`), "creator");
    assert.equal((await middleware(request("/api/dashboard", "GET", { referer: origin + "/creator" }, ""))).status, 403);
    const publicResponse = await middleware(request("/tether", "GET", { [CREATOR_AUDIENCE_HEADER]: "creator", "x-pathname": "/creator" }, ""));
    assert.equal(publicResponse.headers.get(`x-middleware-request-${CREATOR_AUDIENCE_HEADER}`), null, "Caller header must be stripped");
    assert.equal(publicResponse.headers.get("x-middleware-request-x-pathname"), "/tether");
    assert.equal((await middleware(request("/revenue?period=1W"))).headers.get("location"), origin + "/creator?period=1W");
    assert.equal((await middleware(request("/creator-auth/identity", "POST", { origin: "https://evil.example" }))).status, 403);
    assert.equal((await middleware(request("/creator-auth/identity", "POST", { origin }))).status, 200);
    for (const table of ["clones", "photos", "videos", "photo_bundles", "users", "star_transactions", "system_logs"]) {
      const result = scopeReadUrl(new URL(`https://creator-offline.supabase.co/rest/v1/${table}?select=*&or=(clone_id.eq.${other})`), identity);
      assert.ok(result.url.searchParams.get("and")?.includes(own), table);
    }
    await withDashboardAccess(identity, async () => {
      for (const action of ["app/clones/actions.ts#updateClone", "app/clones/actions.ts#setStatus", "app/settings/actions.ts#save", "app/media/actions.ts#updateCategoryPricing", "app/users/actions.ts#setCredits"]) await assert.rejects(guardDashboardAction(action, [own, new FormData()]));
    });
    const fd = new FormData();
    fd.set("revision", "fixture-revision"); fd.set("name", "Updated identity"); fd.set("hair_color", "Brown"); fd.set("hobbies", JSON.stringify(["Hiking", "Hiking"])); fd.set("tattoos", "false");
    assert.doesNotThrow(() => assertCreatorIdentityForm(fd));
    const patch = creatorIdentityPatch(fd, { name: "Before", intake: { appearance: { chart_color: "#123456" } } });
    assert.deepEqual(patch, { name: "Updated identity", hair_color: "Brown", hobbies: ["Hiking"], tattoos: false });

    const allowedFormKeys = new Set<string>(CREATOR_IDENTITY_FORM_KEYS);
    const personaFactsSource = readFileSync("components/clone/PersonaFactsFields.tsx", "utf8");
    const emittedPersonaKeys = [...new Set([...personaFactsSource.matchAll(/name="([^"]+)"/g)].map(match => match[1]))];
    for (const key of emittedPersonaKeys) assert.ok(allowedFormKeys.has(key), `PersonaFactsFields emits an unapproved key: ${key}`);
    for (const key of INTAKE_FIELD_KEYS) assert.ok(allowedFormKeys.has(`intake_${key}`), `IntakeFields emits an unapproved key: intake_${key}`);

    const completeIdentity = new FormData();
    for (const key of CREATOR_IDENTITY_FORM_KEYS) {
      let value = "Fixture value";
      if (key === "revision") value = "fixture-revision";
      else if (key === "persona_facts") value = "1";
      else if (key === "_imperfection_toggle") value = "true";
      else if (key === "date_of_birth") value = "2000-01-01";
      else if (key === "wake_time" || key === "sleep_time") value = "08:30";
      else if (["lowercase_level", "punctuation_drop_level", "typo_level", "double_text_level"].includes(key)) value = "sometimes";
      else if (CREATOR_IDENTITY_ARRAYS.includes(key as (typeof CREATOR_IDENTITY_ARRAYS)[number])) value = JSON.stringify(["Fixture"]);
      else if (CREATOR_IDENTITY_BOOLS.includes(key as (typeof CREATOR_IDENTITY_BOOLS)[number])) value = "true";
      else if (key === "career_start_year") value = "2020";
      else if (key === "socials") value = JSON.stringify([{ platform: "instagram", handle: "@fixture", followers: "100" }]);
      else if (key === "daily_blocks") value = JSON.stringify([{ time: "08:30", activity: "Gym" }]);
      completeIdentity.set(key, value);
    }
    assert.doesNotThrow(() => assertCreatorIdentityForm(completeIdentity));
    const completePatch = creatorIdentityPatch(completeIdentity, { name: "Before", intake: { appearance: { chart_color: "#123456" } } });
    for (const key of [...CREATOR_IDENTITY_TEXT, ...CREATOR_IDENTITY_ARRAYS, ...CREATOR_IDENTITY_BOOLS, "career_start_year", "socials", "daily_blocks"]) {
      assert.ok(Object.hasOwn(completePatch, key), `Valid identity field was not persisted: ${key}`);
    }
    assert.ok(Object.hasOwn(completePatch, "intake"));
    for (const marker of CREATOR_IDENTITY_FORM_MARKERS) assert.equal(Object.hasOwn(completePatch, marker), false);

    for (const key of ["clone_id", "auth_user_id", "bot_token", "text_model", "starting_credits", "credit_pack_price_stars", "ai_mode", "status", "strict_minor_gate", "category_pricing", "intake"]) {
      const forged = new FormData();
      forged.set("revision", "fixture-revision");
      forged.set("name", "Safe identity");
      forged.set(key, "FORGED");
      assert.throws(() => assertCreatorIdentityForm(forged), /Unsupported identity field/);
    }
    const duplicated = new FormData();
    duplicated.append("revision", "first");
    duplicated.append("revision", "second");
    assert.throws(() => assertCreatorIdentityForm(duplicated), /supplied once/);
    assert.equal(CREATOR_IDENTITY_COLUMNS.includes("bot_token" as any), false);
    assert.equal(CREATOR_IDENTITY_COLUMNS.includes("starting_credits" as any), false);
    const invalid = new FormData(); invalid.set("hobbies", '{"price":1}'); assert.throws(() => creatorIdentityPatch(invalid, {}));
    invalid.delete("hobbies"); invalid.set("double_text_level", "FORGED"); assert.throws(() => creatorIdentityPatch(invalid, {}));
    assert.throws(() => assertCreatorQuery(new URLSearchParams(`clone=${own}&clone_id=${other}`), [own]));
    assert.equal(creatorApiAllowed("/api/dashboard", "POST", false), false);
    assert.equal((redactAgencyData({ bot_token: "not-public" }) as any).bot_token, null);
    linked = false;
    const empty = await creatorDashboardIdentity(token); assert.ok(empty); assert.deepEqual(empty.cloneIds, []);
    assert.ok(scopeReadUrl(new URL("https://creator-offline.supabase.co/rest/v1/clones"), empty).url.searchParams.get("and")?.includes("00000000-0000-0000-0000-000000000000"));
    assert.equal((await middleware(request("/api/dashboard?clone=" + own))).status, 403);
    // A creator already linked to a live clone is onboarded by definition: the
    // twin exists and its intake is done, so the questionnaire must not reappear.
    linked = true; onboarded = false;
    assert.equal((await middleware(request("/creator"))).headers.get("location"), null);
    // Onboarding still gates a brand-new account that has no clone yet.
    linked = false;
    assert.equal((await middleware(request("/creator"))).headers.get("location"), origin + "/creator/onboarding");
    assert.equal((await middleware(request("/api/dashboard"))).status, 403);
    linked = true; onboarded = true;

    // Keep legitimate pre-launch and approved creator states usable (including
    // the existing demo/onboarding flows) while denying paused/terminal states.
    accountStatus = "applicant"; assert.ok(await creatorDashboardIdentity(token));
    accountStatus = "approved"; assert.ok(await creatorDashboardIdentity(token));
    accountStatus = "active";

    // Brand and agency context come from the current active assignment, while
    // the synthetic creator identity must never gain LYNQ management powers.
    agencyId = LYNQ_MANAGEMENT_AGENCY_ID; agencyName = "LYNQ";
    const lynqIdentity = await creatorDashboardIdentity(token);
    assert.ok(lynqIdentity);
    assert.equal(lynqIdentity.agencyId, LYNQ_MANAGEMENT_AGENCY_ID);
    assert.equal(lynqIdentity.name, "LYNQ");
    assert.equal(lynqIdentity.id, `creator:${account}`);
    assert.equal(agencyCanManage(lynqIdentity), false);

    accountSource = "agency_invite"; assignmentExists = false;
    assert.equal(await creatorDashboardIdentity(token), null, "an incomplete direct-agency signup cannot fall back to Twin access");
    accountSource = "twin"; assignmentExists = true;

    const actionRequest = (path: string, body: Record<string, string>) => new NextRequest(origin + path, {
      method: "POST",
      headers: { cookie: `${CREATOR_SESSION_COOKIE}=${token}`, origin },
      body: new URLSearchParams(body),
    });
    onboarded = false;
    writes.length = 0;
    const allowedOnboarding = await withDashboardAccess(null, () => saveCreatorOnboarding(actionRequest("/creator-auth/onboarding", { action: "skip_voice" })));
    assert.equal(allowedOnboarding.status, 303);
    const onboardingReturn = new URL(allowedOnboarding.headers.get("location")!);
    assert.equal(onboardingReturn.searchParams.get("status"), "voice_skipped");
    assert.equal(onboardingReturn.searchParams.get("step"), "voice");
    assert.equal(onboardingReturn.hash, "#step-result");
    assert.equal(writes.length, 1);
    assert.equal(writes[0].path, "/rest/v1/creator_onboarding_progress");
    assert.equal(JSON.parse(writes[0].body).creator_account_id, account);

    const postUpload = async (form: FormData) => withDashboardAccess(null, () => uploadCreatorOnboarding(new NextRequest(origin + "/creator-auth/upload", {
      method: "POST",
      headers: { cookie: `${CREATOR_SESSION_COOKIE}=${token}`, origin },
      body: form,
    })));
    const assertRejectedUpload = async (kind: string, file: File, message: string) => {
      const form = new FormData();
      form.set("kind", kind);
      form.set("files", file);
      writes.length = 0;
      const response = await postUpload(form);
      assert.equal(new URL(response.headers.get("location")!).searchParams.get("status"), "upload_wrong_type", message);
      assert.deepEqual(writes, [], `${message}: invalid media must not reach Storage or database writes`);
      return form;
    };
    const invalidUploadForm = await assertRejectedUpload(
      "content_sfw_image",
      new File([new Uint8Array([0xff, 0xd8, 0xff, ...new Array(125).fill(0)])], "fake.jpg", { type: "image/jpeg" }),
      "A fake JPEG prefix must not count as verified media",
    );
    await assertRejectedUpload("content_sfw_image", new File([Uint8Array.from(truncatedJpeg)], "truncated.jpg", { type: "image/jpeg" }), "A truncated JPEG must not count as verified media");
    await assertRejectedUpload("content_sfw_image", new File([Uint8Array.from(oversizedPixelsJpeg)], "pixel-bomb.jpg", { type: "image/jpeg" }), "An image above the pixel limit must not count as verified media");
    for (const [extension, mime] of [["heic", "image/heic"], ["heif", "image/heif"]] as const) {
      const heif = Buffer.alloc(128);
      heif.write("ftyp", 4, "ascii");
      heif.write(extension, 8, "ascii");
      await assertRejectedUpload("content_sfw_image", new File([Uint8Array.from(heif)], `unsupported.${extension}`, { type: mime }), `${extension.toUpperCase()} must be rejected until the production decoder supports it`);
    }
    const fakeVideo = Buffer.alloc(2048);
    fakeVideo.writeUInt32BE(24, 0);
    fakeVideo.write("ftyp", 4, "ascii");
    fakeVideo.write("isom", 8, "ascii");
    fakeVideo.write("moov", 64, "ascii");
    fakeVideo.write("mdat", 128, "ascii");
    fakeVideo.write("vide", 192, "ascii");
    await assertRejectedUpload("content_sfw_video", new File([Uint8Array.from(fakeVideo)], "fake.mp4", { type: "video/mp4" }), "Marker strings alone must not pass video validation");

    onboarded = true;
    writes.length = 0;
    const lockedOnboarding = await withDashboardAccess(null, () => saveCreatorOnboarding(actionRequest("/creator-auth/onboarding", { action: "skip_voice" })));
    assert.equal(new URL(lockedOnboarding.headers.get("location")!).searchParams.get("status"), "application_locked");
    assert.deepEqual(writes, [], "a submitted application must not accept onboarding mutations");
    const lockedUpload = await withDashboardAccess(null, () => uploadCreatorOnboarding(new NextRequest(origin + "/creator-auth/upload", {
      method: "POST",
      headers: { cookie: `${CREATOR_SESSION_COOKIE}=${token}`, origin },
      body: invalidUploadForm,
    })));
    assert.equal(lockedUpload.status, 409);
    assert.deepEqual(writes, [], "a submitted application must not accept direct upload mutations");

    async function assertStaleSessionCannotWrite(label: string) {
      for (const [path, body, handler] of [
        ["/creator-auth/onboarding", { action: "skip_voice" }, saveCreatorOnboarding],
        ["/creator-auth/upload", { kind: "content" }, uploadCreatorOnboarding],
      ] as const) {
        writes.length = 0;
        const response = await withDashboardAccess(null, () => handler(actionRequest(path, body)));
        assert.equal(response.status, 303, `${label}: ${path}`);
        assert.equal(new URL(response.headers.get("location")!).pathname, "/creator/login", `${label}: ${path}`);
        assert.deepEqual(writes, [], `${label}: ${path} performed a write`);
      }
    }

    accountStatus = "paused";
    assert.equal(await creatorDashboardIdentity(token), null);
    await assertStaleSessionCannotWrite("paused account");
    accountStatus = "archived";
    assert.equal(await creatorDashboardIdentity(token), null);
    accountStatus = "rejected";
    assert.equal(await creatorDashboardIdentity(token), null);
    accountStatus = "unexpected";
    assert.equal(await creatorDashboardIdentity(token), null, "unknown statuses must fail closed");
    accountStatus = "active"; accountExists = false;
    await assertStaleSessionCannotWrite("deleted account");
    accountExists = true; mismatched = true;
    assert.equal(await creatorDashboardIdentity(token), null);
    await assertStaleSessionCannotWrite("stale auth ownership");
    mismatched = false; agencyActive = false;
    assert.equal(await creatorDashboardIdentity(token), null);
    await assertStaleSessionCannotWrite("inactive LYNQ assignment");
    agencyActive = true; databaseError = true; assert.equal(await creatorDashboardIdentity(token), null);
    databaseError = false; assert.equal(await creatorDashboardIdentity("invalid.signature"), null);
    const source = readFileSync("app/creator/page.tsx", "utf8");
    assert.match(source, /<RevenueDashboard/); assert.match(source, /<RevenueTooltipFix/);
    assert.doesNotMatch(source, /RevenueTrend|aggregateTrend|metric\(/);
    const identityRouteSource = readFileSync("app/creator-auth/identity/route.ts", "utf8");
    assert.ok(identityRouteSource.indexOf("assertCreatorIdentityForm(fd)") < identityRouteSource.indexOf("const db = serviceClient()"), "Forged fields must be rejected before the write client is created");
    for (const route of ["app/creator-auth/onboarding/route.ts", "app/creator-auth/upload/route.ts"]) {
      const routeSource = readFileSync(route, "utf8");
      assert.match(routeSource, /creatorDashboardIdentity/, `${route} must revalidate current creator state`);
      assert.doesNotMatch(routeSource, /verifyCreatorSession/, `${route} must not authorize from the signed cookie alone`);
      const formParseCall = route.endsWith("upload/route.ts") ? "boundedFormData(req)" : "req.formData()";
      assert.ok(routeSource.indexOf("creatorDashboardIdentity") < routeSource.indexOf(formParseCall), `${route} must authorize before parsing or writing form data`);
    }
    const shellSource = readFileSync("components/CreatorWorkspaceShell.tsx", "utf8");
    assert.match(shellSource, /<DashboardAccessProvider agencyName=\{agencyName\} audience="creator">/);
    for (const sharedComponent of ["Sidebar", "MobileMenu", "TopBar", "MainShell"]) {
      assert.match(shellSource, new RegExp(`<${sharedComponent}\\b`), `${sharedComponent} must come from the shared dashboard shell`);
    }
    assert.doesNotMatch(shellSource, /CREATOR_DASHBOARD_NAV|IntelligenceCoreIcon|function Navigation|function WorkspaceTopBar/, "Creator shell must not fork shared navigation or core markup");

    const sidebarSource = readFileSync("components/Sidebar.tsx", "utf8");
    assert.match(sidebarSource, /const CREATOR_LINKS:[\s\S]*?= CREATOR_DASHBOARD_NAV\.map/);
    assert.match(sidebarSource, /const usesBrandedCore = isCreator \|\| isJessKate \|\| isTether;/);
    assert.match(sidebarSource, /data-creator-core=\{isCreator \? "hero" : undefined\}[\s\S]*?<IntelligenceCoreIcon size=\{64\} \/>[\s\S]*?AI Intelligence Core/,
      "Creator and Tether must share the exact 64px intelligence-core block");
    assert.match(sidebarSource, /<nav aria-label=\{isCreator \? "Creator navigation" : "Main navigation"\}/);
    assert.match(sidebarSource, /\{isCreator \? null :[\s\S]*?More/);
    assert.match(sidebarSource, /showAssistant && !isAgency && !isCreator/);

    const topBarSource = readFileSync("components/TopBar.tsx", "utf8");
    assert.match(topBarSource, /locked=\{isCreator\}/);
    assert.match(topBarSource, /fallbackName=\{creatorName\}/);
    const switcherSource = readFileSync("components/CloneSwitcher.tsx", "utf8");
    assert.match(switcherSource, /if \(locked\)[\s\S]*?aria-label=\{`Creator account: \$\{name\}`\}/);
    assert.doesNotMatch(switcherSource.match(/if \(locked\)[\s\S]*?\n  \}/)?.[0] ?? "", /<button|All creators/,
      "Locked creator chip must be a fixed, noninteractive identity");
    assert.match(readFileSync("components/MainShell.tsx", "utf8"), /!isAgency && !isCreator && pathname !== "\/jarvis"/);
    const creatorEditorSource = readFileSync("components/CreatorIdentityEditor.tsx", "utf8");
    assert.doesNotMatch(creatorEditorSource, /<ConfigSections|<CloneForm|fetch\("\/api\/models/);
    assert.doesNotMatch(creatorEditorSource, /LockKeyhole|\["Configuration","Monetization","Advanced","View"\]/);
    console.log("CREATOR WORKSPACE PASSED: shared Tether shell, exact six-route creator navigation, locked creator chip, 64px shared core, no admin assistant, live earnings, onboarding, single/no-clone isolation, cache keys, mixed cookies, forged headers, denied settings/actions and identity-only patch.");
  } finally { globalThis.fetch = oldFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
