import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";

/**
 * T34 browser check for automatic content sync, the Save-and-upload flow, conflict review and
 * reconnect states. Consumed by check-onlyfans-http-browser.mjs behind ONLYFANS_TEST_OFFER_IMPORT=1.
 * The real Next page and session are used. The sync proxy API is answered by a stateful synthetic
 * backend registered with page.route, so uploads, lost acknowledgements, conflicts and reconnects are
 * deterministic and no request leaves the harness.
 *
 * Optional environment:
 *   ONLYFANS_TEST_EVIDENCE            directory for synthetic screenshots
 *   ONLYFANS_TEST_READONLY_COOKIE     "name=value" of a read-only team session (enables the read-only scenario)
 */
const CHUNK = 8 * 1024 * 1024;
const H = char => char.repeat(64);
const STAMP = "2026-10-23T01:02:03Z";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const shot = async (page, name) => { if (process.env.ONLYFANS_TEST_EVIDENCE) await page.screenshot({ path: path.join(process.env.ONLYFANS_TEST_EVIDENCE, name), fullPage: true }); };
const fits = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const coverage = (state, detail = null) => ({ state, checkedAt: state === "unsupported" || state === "not_started" ? null : STAMP, detail });
const terms = (priceCents, extra = {}) => ({ priceCents, mediaCount: 2, previewCount: 1, sourceAt: "2026-09-01T12:00:00Z", ...extra });
const conflict = (id, revision) => ({ conflictId: id, itemId: "7", revision, status: "open", createdAt: STAMP, current: terms(1999), source: terms(2500, { lockedText: false }),
  itemFingerprint: H("c"), resolution: null, resolvedAt: null });

function backend() {
  const state = { requests: [], denied: false, unavailable: false, delay: 0, hold: true, loseNext: null, refuseNext: null, connection: false, settingsDone: new Map(), conflictDone: new Set(),
    status: null, conflicts: [], draft: null, extraDrafts: [], ops: [], chunksSeen: [], chunkLost: false, steps: 0 };
  const status = account => ({ enabled: true, status: "active", revision: 3, blockedReason: null, lastIncrementalAt: STAMP, nextIncrementalAt: "2026-10-23T01:07:03Z", lastReconcileAt: STAMP,
    nextReconcileAt: "2026-10-24T01:02:03Z", lastFullReconcileAt: null, coveredThroughMessageId: "123", backlog: 4,
    initial: { jobId: "job-1", status: "running", rowsScanned: 1200, complete: false },
    coverage: { media: coverage("current", `Synthetic media for ${account}`), paidMessages: coverage("partial", "A page limit stopped the last pass."), paidPosts: coverage("unsupported", "Paid-post reading is not verified yet.") },
    openConflicts: 0, uploads: { draft: 0, queued: 1, uploading: 0, verifying: 0, synced: 2, retrying: 0, connectionRequired: 0, needsReview: 0, outcomeUnconfirmed: 0 } });
  state.status = status("acc-a");
  const draftView = draft => ({ ...draft, assets: draft.assets.map(asset => ({ ...asset })) });
  const op = (id, extra = {}) => ({ operationId: id, kind: "sync_now", status: "queued", createdAt: STAMP, updatedAt: STAMP, completedAt: null, coverage: {}, result: {}, lastError: null, retryable: false, draftId: null, assetId: null, ...extra });

  async function handle(route) {
    const request = route.request(), url = new URL(request.url());
    const match = url.pathname.match(/\/accounts\/([^/]+)\/sync\/?(.*)$/), account = decodeURIComponent(match[1]), rest = match[2] ? match[2].split("/") : [];
    const ok = data => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schemaVersion: "of-content-sync.v1", ok: true, accountId: account, data }) });
    const fail = (status, code, outcome = "refused", error = "Backend prose is never shown.") => route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ schemaVersion: "of-content-sync.v1", ok: false, outcome, code, error }) });
    if (state.denied) return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Sign in again." }) });
    if (state.unavailable) return fail(503, "sync_unavailable");
    if (state.delay && rest[0] === "status") await new Promise(resolve => setTimeout(resolve, state.delay));
    const method = request.method();
    const body = method === "POST" && request.headers()["content-type"]?.includes("json") ? request.postDataJSON() : null;
    state.requests.push({ method, path: match[2] + url.search, body, postData: request.postData() });
    const lose = key => { if (state.loseNext === key) { state.loseNext = null; return true; } return false; };
    const refuse = key => { if (state.refuseNext?.key === key) { const { status, code } = state.refuseNext; state.refuseNext = null; return fail(status, code); } return null; };

    if (method === "GET" && rest[0] === "status") return ok(account === "acc-a" ? state.status : status(account));
    if (method === "POST" && rest[0] === "settings") {
      if (!state.settingsDone.has(body.requestId)) { state.status = { ...state.status, enabled: body.enabled, revision: body.expectedRevision + 1 }; state.settingsDone.set(body.requestId, state.status); }
      if (lose("settings")) return route.abort("connectionfailed");
      return ok(state.settingsDone.get(body.requestId));
    }
    if (method === "POST" && rest[0] === "sync") {
      const refused = refuse("sync"); if (refused) return refused;
      return ok(op("op-sync-1"));
    }
    if (method === "GET" && rest[0] === "operations" && rest.length === 2) return ok(op(rest[1], { status: "complete", completedAt: STAMP }));
    if (method === "GET" && rest[0] === "operations") return ok({ items: state.ops, nextCursor: null });
    if (method === "POST" && rest[0] === "operations" && rest[2] === "retry") {
      if (lose("retry")) return route.abort("connectionfailed");
      const target = state.extraDrafts.find(d => d.draftId === state.ops.find(o => o.operationId === rest[1])?.draftId);
      if (target) { target.state = "queued"; target.reason = null; target.assets.forEach(a => { a.state = "queued"; }); target.readiness = { mediaSynced: false, canEnable: false, blockers: ["media_not_synced"] }; }
      return ok(op(rest[1], { kind: "retry", status: "queued", draftId: target?.draftId ?? null }));
    }
    if (method === "GET" && rest[0] === "conflicts") return ok(state.conflicts);
    if (method === "POST" && rest[0] === "conflicts" && rest[2] === "resolve") {
      const refused = refuse("resolve"); if (refused) { state.conflicts = state.conflicts.map(c => ({ ...c, revision: c.revision + 1 })); return refused; }
      state.conflictDone.add(body.requestId);
      const resolved = { ...state.conflicts[0], status: "resolved", resolution: body.resolution, resolvedAt: STAMP };
      state.conflicts = []; state.status = { ...state.status, openConflicts: 0 };
      if (lose("resolve")) return route.abort("connectionfailed");
      return ok({ conflict: resolved, itemId: resolved.itemId });
    }
    if (method === "GET" && rest[0] === "drafts" && rest.length === 1) return ok({ items: [...(state.draft ? [draftView(state.draft)] : []), ...state.extraDrafts.map(draftView)], nextCursor: null });
    if (method === "GET" && rest[0] === "drafts" && rest.length === 2) {
      const draft = state.draft?.draftId === rest[1] ? state.draft : state.extraDrafts.find(d => d.draftId === rest[1]);
      if (!draft) return fail(404, "not_available");
      if (!state.hold && draft === state.draft && ["queued", "uploading", "verifying"].includes(draft.state)) {
        const next = { queued: "uploading", uploading: "verifying", verifying: "synced" }[draft.state];
        draft.state = next; draft.assets.forEach(a => { a.state = next; });
        if (next === "synced") { draft.itemId = "9101"; draft.readiness = { mediaSynced: true, canEnable: true, blockers: [] }; }
      }
      return ok(draftView(draft));
    }
    if (method === "POST" && rest[0] === "drafts" && rest.length === 1) {
      const refused = refuse("draft"); if (refused) return refused;
      state.sizes = Object.fromEntries(body.files.map(file => [file.fileId, file.size]));
      state.draft = { draftId: "dr-new", revision: 1, state: "draft", reason: null, label: body.label, description: body.description, priceCents: body.priceCents, pricingMode: "fixed", itemId: null, enabled: false,
        assets: body.files.map((file, order) => ({ assetId: `as-${order}`, fileId: file.fileId, name: file.name, kind: file.name.endsWith(".mp4") ? "video" : "photo", order,
          freePreview: body.previewFileIds.includes(file.fileId), state: "draft", attempts: 0, lastError: null })),
        readiness: { mediaSynced: false, canEnable: false, blockers: ["media_not_synced"] } };
      return ok(draftView(state.draft));
    }
    if (method === "POST" && rest[0] === "drafts" && rest[2] === "files") {
      const bytes = request.postDataBuffer();
      state.chunksSeen.push({ file: rest[3], index: Number(rest[5]), size: bytes.length, digest: sha(bytes), contentType: request.headers()["content-type"] });
      if (!state.chunkLost && state.loseNext === "chunk" && Number(rest[5]) === 1) { state.chunkLost = true; state.loseNext = null; return route.abort("connectionfailed"); }
      const total = Math.max(1, Math.ceil(state.sizes[rest[3]] / CHUNK));
      return ok({ received: bytes.length, complete: Number(rest[5]) === total - 1 });
    }
    if (method === "POST" && rest[0] === "drafts" && rest[2] === "commit") {
      state.draft.state = "queued"; state.draft.assets.forEach(a => { a.state = "queued"; });
      if (lose("commit")) return route.abort("connectionfailed");
      return ok(draftView(state.draft));
    }
    return fail(404, "not_available");
  }
  return { state, handle, status };
}

export async function checkContentSync(page, context, origin, options = {}) {
  const showOffers = async (targetPage = page) => {
    const tab = targetPage.getByRole("tab", { name: "Offers", exact: true });
    if (await tab.count()) await tab.click();
  };
  const showVault = async (targetPage = page) => {
    const tab = targetPage.getByRole("tab", { name: "Vault", exact: true });
    if (await tab.count()) await tab.click();
  };
  const target = options.path ?? "/onlyfans/content?account=acc-a";
  const { state, handle, status } = backend();
  const external = [];
  const watch = request => { if (!request.url().startsWith(origin + "/") && !request.url().startsWith("data:") && !request.url().startsWith("blob:")) external.push(request.url()); };
  page.on("request", watch);
  await page.route("**/api/onlyfans-content/accounts/*/sync/**", handle);
  await page.route("**/api/onlyfans-content/accounts/*/imports/**", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, outcome: "refused", error: "Offer import is not configured." }) }));
  const open = async () => {
    await page.goto(origin + target, { waitUntil: "networkidle" });
    await showOffers();
    await page.locator("[data-content-sync-status]").waitFor({ timeout: 15000 });
  };
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await open();
    const sync = page.locator("[data-content-sync-status]");

    // Automatic sync status: on, last and next pass, backlog, initial history, and unsupported never looks complete.
    await sync.locator("[data-sync-last]").waitFor();
    assert((await sync.locator("[data-sync-state]").innerText()).startsWith("On"));
    assert.notEqual((await sync.locator("[data-sync-last]").innerText()).trim(), "Not yet");
    assert.notEqual((await sync.locator("[data-sync-next]").innerText()).trim(), "Not scheduled");
    assert.equal((await sync.locator("[data-sync-backlog]").innerText()).trim(), "4");
    assert((await sync.locator("[data-sync-initial]").innerText()).startsWith("In progress, 1,200 messages checked so far"));
    const media = sync.locator('[data-sync-coverage="media"]'), messages = sync.locator('[data-sync-coverage="paidMessages"]'), posts = sync.locator('[data-sync-coverage="paidPosts"]');
    assert.equal(await media.getAttribute("data-state"), "current"); assert((await media.innerText()).includes("Up to date"));
    assert.equal(await messages.getAttribute("data-state"), "partial"); assert((await messages.innerText()).includes("Partly checked"));
    assert.equal(await posts.getAttribute("data-state"), "unsupported");
    const postsText = await posts.innerText();
    assert(postsText.includes("Unsupported") && postsText.includes("Not read yet. This source is not counted as checked."));
    assert(!/up to date|complete|synced/i.test(postsText), "an unsupported source never looks complete");
    assert((await sync.innerText()).includes("It does not switch items on, message fans or publish posts."));
    assert((await sync.locator("[data-sync-upload-count]").allInnerTexts()).includes("Queued: 1"));

    // Turning sync off loses its acknowledgement: the exact request is retried, never a new one.
    state.loseNext = "settings";
    await sync.locator("[data-sync-toggle]").click();
    await sync.locator("[data-sync-notice]").filter({ hasText: "Outcome not confirmed. Retry the same request." }).waitFor();
    assert(await sync.locator("[data-sync-toggle]").isDisabled() && await sync.locator("[data-sync-now]").isDisabled());
    const first = state.requests.filter(r => r.path === "settings").at(-1);
    assert.deepEqual(Object.keys(first.body).sort(), ["enabled", "expectedRevision", "requestId"]);
    assert.equal(first.body.enabled, false); assert.equal(first.body.expectedRevision, 3);
    await sync.locator("[data-sync-retry]").click();
    await sync.locator("[data-sync-state='active']").or(sync.locator("[data-sync-state]").filter({ hasText: "Off" })).first().waitFor();
    const second = state.requests.filter(r => r.path === "settings").at(-1);
    assert.equal(second.postData, first.postData, "the retry is byte-identical");
    await sync.getByRole("button", { name: "Turn on automatic sync", exact: true }).waitFor();
    assert(await sync.locator("[data-sync-now]").isDisabled(), "Sync now needs automatic sync on");
    await sync.getByRole("button", { name: "Turn on automatic sync", exact: true }).click();
    await sync.getByRole("button", { name: "Turn off automatic sync", exact: true }).waitFor();
    assert.equal(state.requests.filter(r => r.path === "settings").at(-1).body.expectedRevision, 4, "a new decision uses the current revision");

    // Sync now: one bounded incremental request, then its own progress.
    await sync.locator("[data-sync-now]").focus(); await page.keyboard.press("Enter");
    await sync.locator("[data-sync-operation]").waitFor({ timeout: 10000 });
    const syncNow = state.requests.filter(r => r.path === "sync").at(-1);
    assert.deepEqual(Object.keys(syncNow.body).sort(), ["kind", "requestId"]); assert.equal(syncNow.body.kind, "incremental");
    await sync.locator('[data-sync-operation="complete"]').waitFor({ timeout: 15000 });

    // Conflict review: side by side, three explicit decisions, expected revision and fingerprint, no hashes on screen.
    state.conflicts = [conflict("cf-1", 2)]; state.status = { ...state.status, openConflicts: 1 };
    await page.reload({ waitUntil: "networkidle" });
    await showOffers();
    const review = page.locator("[data-content-sync-conflicts]");
    await review.locator("[data-sync-conflict]").waitFor({ timeout: 15000 });
    const boxes = review.locator("[data-conflict-terms]");
    assert.equal(await boxes.count(), 2);
    assert((await boxes.nth(0).innerText()).includes("Current CRM terms") && (await boxes.nth(0).innerText()).includes("USD 19.99"));
    assert((await boxes.nth(1).innerText()).includes("Changed source terms") && (await boxes.nth(1).innerText()).includes("USD 25.00"));
    // Measure after layout settles; the status panel above can still be filling in.
    const sideBySide = await page.waitForFunction(() => {
      const [a, b] = [...document.querySelectorAll("[data-content-sync-conflicts] [data-conflict-terms]")].map(n => n.getBoundingClientRect());
      return a && b && b.x > a.x + a.width - 2 && Math.abs(b.y - a.y) < 4;
    }, undefined, { timeout: 5000 }).then(() => true, () => false);
    assert(sideBySide, "terms are shown side by side on desktop");
    assert.deepEqual(await review.locator("[data-conflict-choice]").evaluateAll(nodes => nodes.map(node => node.dataset.conflictChoice)), ["accept_source", "keep_crm", "disable"]);
    for (const label of ["Use new source terms", "Keep CRM terms", "Disable item"]) assert(await review.getByText(label, { exact: true }).count());
    assert(await review.locator("[data-conflict-apply]").isDisabled(), "no decision is assumed");
    assert((await sync.locator("[data-sync-open-conflicts]").innerText()).includes("Needs review: 1 item changed on OnlyFans."));
    await shot(page, "sync-conflicting-source-terms.png");
    const choice = review.locator('[data-conflict-choice="keep_crm"]');
    await choice.focus(); await page.keyboard.press("Space");
    assert(await choice.isChecked());
    state.loseNext = "resolve";
    await review.locator("[data-conflict-apply]").focus(); await page.keyboard.press("Enter");
    await review.locator("[data-conflict-notice]").filter({ hasText: "Outcome not confirmed" }).waitFor();
    const attempt = state.requests.filter(r => r.path === "conflicts/cf-1/resolve").at(-1);
    assert.deepEqual(Object.keys(attempt.body).sort(), ["expectedItemFingerprint", "expectedRevision", "requestId", "resolution"]);
    assert.equal(attempt.body.expectedRevision, 2); assert.equal(attempt.body.expectedItemFingerprint, H("c")); assert.equal(attempt.body.resolution, "keep_crm");
    await review.locator("[data-conflict-retry]").click();
    await review.locator("[data-conflicts-empty]").waitFor({ timeout: 10000 });
    assert.equal(state.requests.filter(r => r.path === "conflicts/cf-1/resolve").at(-1).postData, attempt.postData, "the retry is byte-identical");
    assert((await review.locator("[data-conflict-notice]").innerText()).includes("Keeping the CRM terms."));
    assert(!(await page.locator("body").innerHTML()).includes(H("c")), "no fingerprint is ever rendered");
    // A stale decision is refused and the refreshed terms are read again.
    state.conflicts = [conflict("cf-2", 5)]; state.status = { ...state.status, openConflicts: 1 }; state.refuseNext = { key: "resolve", status: 409, code: "revision_conflict" };
    await page.reload({ waitUntil: "networkidle" });
    await showOffers();
    await review.locator("[data-sync-conflict]").waitFor({ timeout: 15000 });
    await review.locator('[data-conflict-choice="accept_source"]').check();
    await review.locator("[data-conflict-apply]").click();
    await review.locator("[data-conflict-notice]").filter({ hasText: "This item changed. Review the refreshed values before deciding again." }).waitFor();
    await review.locator("[data-sync-conflict]").waitFor();
    state.conflicts = []; state.status = { ...state.status, openConflicts: 0 };

    // Save and upload: hash, create draft, send parts (one lost acknowledgement), commit, follow to synced.
    await showVault();
    const form = page.locator("[data-content-sync-save]");
    await form.locator("[data-sync-save-files]").waitFor({ timeout: 15000 });
    const photo = Buffer.alloc(10, 7), video = Buffer.alloc(CHUNK + 5, 9);
    await form.locator("[data-sync-save-files]").setInputFiles([{ name: "Synthetic photo.png", mimeType: "image/png", buffer: photo }, { name: "Synthetic clip.mp4", mimeType: "video/mp4", buffer: video }]);
    await form.locator("[data-sync-save-file]").nth(1).waitFor();
    assert.equal(await form.locator("[data-sync-save-preview]").count(), 1, "only photos can be free previews");
    assert(await form.locator("[data-sync-save-submit]").isDisabled(), "incomplete forms cannot be saved");
    await form.locator("[data-sync-save-preview='0']").focus(); await page.keyboard.press("Space");
    await form.locator("[data-sync-save-label]").fill("Synthetic bundle");
    await form.locator("[data-sync-save-description]").fill("One approved photo and one approved clip.");
    await form.locator("[data-sync-save-price]").fill("12.50");
    assert(await form.locator("[data-sync-save-submit]").isEnabled());
    assert((await form.innerText()).includes("Price for future messages (USD)"));
    state.loseNext = "chunk";
    const waitCreated = page.waitForRequest(request => request.url().endsWith("/sync/drafts") && request.method() === "POST");
    await form.locator("[data-sync-save-submit]").click();
    const createBody = (await waitCreated).postDataJSON();
    assert.deepEqual(Object.keys(createBody).sort(), ["description", "files", "label", "previewFileIds", "priceCents", "requestId"]);
    assert.equal(createBody.priceCents, 1250);
    assert.deepEqual(createBody.files.map(f => [f.name, f.size, f.sha256]), [["Synthetic photo.png", photo.length, sha(photo)], ["Synthetic clip.mp4", video.length, sha(video)]], "digests are computed in the browser");
    assert.deepEqual(createBody.previewFileIds, [createBody.files[0].fileId]);
    await form.locator("[data-sync-save-retry]").waitFor({ timeout: 30000 });
    assert((await form.locator("[data-sync-save-notice]").innerText()).includes("Transfer not confirmed. Retry sends the same part again."));
    const lostChunk = state.chunksSeen.at(-1);
    assert.equal(lostChunk.index, 1); assert.equal(lostChunk.size, 5); assert.equal(lostChunk.contentType, "application/octet-stream");
    const retryPath = `/api/onlyfans-content/accounts/acc-a/sync/drafts/dr-new/files/${encodeURIComponent(lostChunk.file)}/chunks/${lostChunk.index}`;
    const isRetriedChunk = request => request.method() === "POST" && new URL(request.url()).pathname === retryPath;
    const retryRequest = page.waitForRequest(isRetriedChunk, { timeout: 30000 });
    const retryResponse = page.waitForResponse(response => isRetriedChunk(response.request()), { timeout: 30000 });
    await form.locator("[data-sync-save-retry]").click();
    const [repeatedChunk, confirmedChunk] = await Promise.all([retryRequest, retryResponse]);
    assert.equal(confirmedChunk.status(), 200, "the repeated part is confirmed before checking the upload");
    assert.deepEqual([repeatedChunk.postDataBuffer().length, sha(repeatedChunk.postDataBuffer())], [lostChunk.size, lostChunk.digest], "the actual retry request carries the same bytes");
    const card = form.locator('[data-sync-draft="dr-new"]');
    // The draft card already exists before upload begins. Its queued state,
    // reached after commit, proves the retry finished rather than merely started.
    await card.locator('[data-state="queued"]').first().waitFor({ timeout: 30000 });
    const retried = state.chunksSeen.at(-1);
    assert.deepEqual([retried.index, retried.size, retried.digest], [lostChunk.index, lostChunk.size, lostChunk.digest], "only the unconfirmed part is sent again, unchanged");
    assert.deepEqual(state.chunksSeen.map(c => [c.index, c.size]), [[0, 10], [0, CHUNK], [1, 5], [1, 5]]);
    assert.equal(state.requests.filter(r => r.path === "drafts" && r.method === "POST").length, 1, "one draft, however many retries");
    const queuedText = await card.innerText();
    assert(queuedText.includes("Price for future messages: USD 12.50 (fixed)") && queuedText.includes("Queued"));
    assert(!queuedText.includes("Media synced to OnlyFans") || queuedText.includes("only means"), "a queued upload is not shown as synced");
    assert.equal(await form.locator("[data-sync-save-label]").inputValue(), "", "the form resets after a confirmed save");
    await shot(page, "sync-queued-upload.png");
    state.hold = false;
    await card.locator('[data-sync-draft-state]').filter({ hasText: "Media synced to OnlyFans" }).waitFor({ timeout: 30000 });
    const syncedText = await card.innerText();
    assert(syncedText.includes("does not switch the item on, message a fan or publish a post"));
    assert(syncedText.includes("Saved as catalogue item 9101, switched off."));
    assert(syncedText.includes("can be switched on from its editor"));
    await shot(page, "sync-synced-media.png");

    // Reconnect, retry and the unpublished-upload block, as seen after a reload.
    state.status = { ...state.status, status: "paused_auth", uploads: { ...state.status.uploads, connectionRequired: 1, needsReview: 1 } };
    const asset = (state_, extra = {}) => ({ assetId: "as-c", fileId: "5f0e0d0c-0b0a-4908-8706-050403020100", name: "Waiting.png", kind: "photo", order: 0, freePreview: false, state: state_, attempts: 2, lastError: null, ...extra });
    state.extraDrafts = [
      { draftId: "dr-conn", revision: 2, state: "connection_required", reason: "connection_unavailable", label: "Waiting for connection", description: "Synthetic.", priceCents: 1500, pricingMode: "fixed", itemId: null, enabled: false,
        assets: [asset("connection_required")], readiness: { mediaSynced: false, canEnable: false, blockers: ["connection_required"] } },
      { draftId: "dr-review", revision: 2, state: "needs_review", reason: "unpublished_upload_unavailable", label: "Waiting for upload path", description: "Synthetic.", priceCents: 2000, pricingMode: "fixed", itemId: null, enabled: false,
        assets: [asset("needs_review", { assetId: "as-r", fileId: "6f0e0d0c-0b0a-4908-8706-050403020100", name: "Review.png", lastError: "unpublished_upload_unavailable" })], readiness: { mediaSynced: false, canEnable: false, blockers: ["unpublished_upload_unavailable"] } },
    ];
    state.ops = [{ ...{ operationId: "op-retry-1", kind: "upload", status: "failed", createdAt: STAMP, updatedAt: STAMP, completedAt: STAMP, coverage: {}, result: {}, lastError: "auth_required", retryable: true, draftId: "dr-conn", assetId: "as-c" } }];
    state.draft = null; state.hold = true;
    await page.reload({ waitUntil: "networkidle" });
    await showOffers();
    await sync.locator("[data-sync-connection]").waitFor({ timeout: 15000 });
    assert((await sync.locator("[data-sync-connection] a").getAttribute("href")).includes("/onlyfans/accounts?account=acc-a"));
    assert((await sync.innerText()).includes("Connection required"));
    await showVault();
    const recent = page.locator("[data-sync-recent]");
    const connection = recent.locator('[data-sync-draft="dr-conn"]'), blocked = recent.locator('[data-sync-draft="dr-review"]');
    await connection.waitFor({ timeout: 15000 });
    assert((await connection.locator("[data-sync-draft-state]").innerText()).trim() === "Connection required");
    assert((await connection.locator("[data-sync-reconnect]").getAttribute("href")).includes("/onlyfans/accounts?account=acc-a"));
    assert((await blocked.innerText()).replaceAll("’", "'").includes("OnlyFans upload without posting isn't available yet. Nothing was posted or sent."));
    assert((await blocked.locator("[data-sync-draft-state]").innerText()).trim() === "Needs review");
    assert((await blocked.innerText()).includes("This item cannot be switched on yet."));
    assert(!(await blocked.innerText()).includes("Media synced to OnlyFans") || (await blocked.innerText()).includes("only means"));
    await shot(page, "sync-connection-required.png");
    state.loseNext = "retry";
    await connection.locator("[data-sync-retry-upload]").click();
    await connection.locator("[data-sync-draft-notice]").filter({ hasText: "Outcome not confirmed" }).waitFor();
    const retryFirst = state.requests.filter(r => r.path === "operations/op-retry-1/retry").at(-1);
    assert.deepEqual(Object.keys(retryFirst.body), ["requestId"]);
    await connection.getByRole("button", { name: "Retry the same request", exact: true }).click();
    await connection.locator("[data-sync-draft-notice]").filter({ hasText: "Retry queued." }).waitFor();
    assert.equal(state.requests.filter(r => r.path === "operations/op-retry-1/retry").at(-1).postData, retryFirst.postData, "the retry is byte-identical");
    // Sync now while the connection is gone is refused plainly.
    state.refuseNext = { key: "sync", status: 409, code: "connection_unavailable" };
    await showOffers();
    await sync.locator("[data-sync-now]").click();
    await sync.locator("[data-sync-notice]").filter({ hasText: "Connection required. Reconnect this OnlyFans account, then try again." }).waitFor();
    assert(await sync.locator("[data-sync-notice] a").count());

    // The editor never offers to switch on an item whose media is not fully synced.
    const editor = page.locator("[data-of-content-editor]").first();
    if (await editor.count()) {
      await showOffers();
      const itemId = await editor.getAttribute("data-of-content-editor");
      state.extraDrafts.push({ ...state.extraDrafts[1], draftId: "dr-item", itemId, label: "Synthetic item draft" });
      await editor.locator("[data-of-edit-content-open]").click();
      const enable = editor.locator("[data-of-edit-content-enabled]");
      await enable.waitFor({ timeout: 15000 });
      await editor.locator('[data-sync-draft="dr-item"]').waitFor({ timeout: 15000 });
      if (!(await enable.isChecked())) {
        assert(await enable.isDisabled(), "partially synced media can never be enabled");
        await editor.locator("[data-of-content-enable-blocked]").waitFor();
      }
      state.extraDrafts.pop();
    } else console.log("Content sync browser: editor gating skipped (no catalogue item on this page)");

    // Empty, unavailable and session-loss states.
    state.status = status("acc-a"); state.extraDrafts = []; state.ops = []; state.unavailable = true;
    await page.reload({ waitUntil: "networkidle" });
    await showOffers();
    await sync.locator("[data-sync-unavailable]").waitFor({ timeout: 15000 });
    assert((await sync.innerText()).includes("Nothing here is confirmed."));
    assert.equal(await page.locator("[data-content-sync-save] [data-sync-save-submit]").count(), 0);
    state.unavailable = false;
    await sync.getByRole("button", { name: "Try again", exact: true }).click();
    await sync.locator("[data-sync-state]").waitFor({ timeout: 15000 });
    assert.equal(await page.locator("[data-sync-recent]").count(), 0, "no recent saves are invented");
    state.denied = true;
    await sync.locator("[data-sync-now]").click();
    await sync.getByText("Your session cannot read sync status. Sign in again.").waitFor({ timeout: 10000 });
    assert.equal(await sync.locator("[data-sync-toggle]").count(), 0);
    state.denied = false;

    // Mobile: no horizontal overflow with conflict review and the save form open.
    state.conflicts = [conflict("cf-3", 7)]; state.status = { ...state.status, openConflicts: 1 };
    await page.reload({ waitUntil: "networkidle" });
    await showOffers();
    await review.locator("[data-sync-conflict]").waitFor({ timeout: 15000 });
    await page.setViewportSize({ width: 390, height: 844 });
    await review.scrollIntoViewIfNeeded();
    const [top, bottom] = [await review.locator("[data-conflict-terms]").nth(0).boundingBox(), await review.locator("[data-conflict-terms]").nth(1).boundingBox()];
    assert(bottom.y > top.y + top.height - 2, "terms stack on a phone");
    assert(await fits(page), "content sync overflows a 390px viewport");
    await showVault();
    await form.locator("[data-sync-save-files]").scrollIntoViewIfNeeded();
    assert(await fits(page));
    await shot(page, "sync-mobile-390.png");
    await page.setViewportSize({ width: 1440, height: 1000 });
    state.conflicts = []; state.status = { ...state.status, openConflicts: 0 };

    // Account switching: a reply that arrives after the switch is never shown for the new account.
    await open();
    const links = page.locator('nav[aria-label$="account"] a');
    if (await links.count() > 1) {
      state.delay = 2000;
      await page.reload({ waitUntil: "domcontentloaded" });
      await showOffers();
      await links.nth(1).click();
      await page.waitForTimeout(3500); state.delay = 0;
      await showOffers();
      assert.equal(await page.getByText("Synthetic media for acc-a", { exact: false }).count() === 0 || (await page.url()).includes("acc-a"), true);
    } else console.log("Content sync browser: account switching skipped (fixture exposes one account)");

    // Read-only sessions can read status but never change it or save media.
    if (process.env.ONLYFANS_TEST_READONLY_COOKIE) {
      const [name, ...value] = process.env.ONLYFANS_TEST_READONLY_COOKIE.split("=");
      const viewer = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 } });
      await viewer.route("**/*", route => route.request().url().startsWith(origin + "/") ? route.continue() : route.abort());
      await viewer.addCookies([{ name, value: value.join("="), url: origin }]);
      const readPage = await viewer.newPage();
      await readPage.route("**/api/onlyfans-content/accounts/*/sync/**", handle);
      state.conflicts = [conflict("cf-4", 1)]; state.status = { ...state.status, openConflicts: 1 };
      await readPage.goto(origin + target, { waitUntil: "networkidle" });
      await showOffers(readPage);
      await readPage.locator("[data-content-sync-status] [data-sync-state]").waitFor({ timeout: 15000 });
      assert.equal(await readPage.locator("[data-sync-toggle]").count(), 0); assert.equal(await readPage.locator("[data-sync-now]").count(), 0);
      await showVault(readPage);
      assert.equal(await readPage.locator("[data-sync-save-submit]").count(), 0);
      await showOffers(readPage);
      await readPage.locator("[data-conflict-choice]").first().waitFor();
      assert.equal(await readPage.locator("[data-conflict-choice]:enabled").count(), 0);
      assert.equal(await readPage.locator("[data-conflict-apply]").count(), 0);
      await viewer.close();
    } else console.log("Content sync browser: read-only scenario skipped (ONLYFANS_TEST_READONLY_COOKIE not set)");

    assert.equal(external.length, 0, "content sync attempted an external request: " + external.join(", "));
    console.log("Content sync browser PASS: autosync status with unsupported coverage, exact lost-ack retries, conflict review with explicit decisions, browser digests, resumable part upload, queued to synced progress, reconnect and unpublished-upload states, unavailable and session loss, 390px, external requests=0");
  } finally {
    page.off("request", watch);
    await page.unroute("**/api/onlyfans-content/accounts/*/sync/**", handle).catch(() => {});
    await page.unroute("**/api/onlyfans-content/accounts/*/imports/**").catch(() => {});
  }
}
