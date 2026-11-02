import assert from "node:assert/strict";
import path from "node:path";

/**
 * T20 browser check for the offer import panel, consumed by check-onlyfans-http-browser.mjs behind
 * ONLYFANS_TEST_OFFER_IMPORT=1. The real Next page, session and server rendering are used. The import
 * proxy API is answered by a stateful synthetic backend registered with page.route, so every scenario
 * (missing previews, unsupported bundle, source change, lost acknowledgement, cancellation, session
 * loss) is deterministic and no request leaves the harness.
 *
 * Optional environment:
 *   ONLYFANS_TEST_EVIDENCE            directory for synthetic screenshots
 *   ONLYFANS_TEST_READONLY_COOKIE     "name=value" of a read-only team session (enables the read-only scenario)
 */
const H = char => char.repeat(64);
const JOB = "0f0e0d0c-0b0a-4908-8706-050403020100", JOB2 = "2f0e0d0c-0b0a-4908-8706-050403020100", REFRESH = "3f0e0d0c-0b0a-4908-8706-050403020100";
const OBS = n => `${n}f0e0d0c-0b0a-4908-8706-050403020100`;
const shot = async (page, name) => { if (process.env.ONLYFANS_TEST_EVIDENCE) await page.screenshot({ path: path.join(process.env.ONLYFANS_TEST_EVIDENCE, name), fullPage: true }); };
const fits = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const STAMP = "2026-10-23T00:00:00Z";

const photo = (mediaId, freePreview = false) => ({ mediaId, kind: "photo", freePreview });
const observation = (n, fingerprint, extra = {}) => ({ observationId: OBS(n), fingerprint: H(fingerprint), sourceKind: "message", sourceId: "1001", fanId: "501", sourceContext: "direct",
  sourceAt: "2026-09-01T12:00:00Z", observedAt: STAMP, mediaIds: ["11", "12"], previewIds: ["11"], lockedText: false, priceCents: 1999, currency: "USD",
  attachments: [photo("11", true), photo("12")], reasons: [], ready: true, ...extra });
const summary = (char, extra = {}) => ({ candidateId: H(char), revision: 3, attachmentCount: 2, sourceCount: 3, observedPrices: [1999], variantCount: 1, verifiedSources: 1, itemId: null, status: "ready_for_review", ...extra });

/** Stateful synthetic backend. `hold` keeps a scan running; `denied` simulates a lost session. */
function backend() {
  const state = { hold: false, denied: false, polls: 0, c2Refreshed: false, c1Changed: false, committed: null, aborted: 0, drafts: [], jobs: [], delay: 0, cancelled: false };
  const candidates = () => [
    summary("1", { observedPrices: [1999, 2500], variantCount: 2, status: state.committed?.ok1 ? "draft_created" : "ready_for_review" }),
    state.c2Refreshed ? summary("2", { observedPrices: [1500], status: state.committed?.ok2 ? "draft_created" : "ready_for_review", itemId: state.committed?.ok2 ? "9001" : null })
      : summary("2", { observedPrices: [1500], verifiedSources: 0, status: "source_details_needed" }),
    summary("3", { attachmentCount: 21, status: "blocked", verifiedSources: 1 }),
    summary("4", { status: "ready_for_review" }),
  ];
  const detail = char => {
    const base = candidates().find(item => item.candidateId === H(char));
    const rest = { variants: [{ key: "a", priceCents: base.observedPrices[0], mediaIds: ["11", "12"], count: 3, latest: null }], samples: [], observations: [], assetReasons: [], existingItem: null };
    if (char === "1") return { ...base, ...rest, observations: [observation(1, state.c1Changed ? "d" : "b"), observation(5, "e", { priceCents: 2500, sourceAt: "2026-09-15T12:00:00Z" })] };
    if (char === "2") return { ...base, ...rest, samples: [{ fanId: "501", messageId: 1001, priceCents: 1500, sentAt: "2026-09-01T12:00:00Z" }],
      observations: [state.c2Refreshed ? observation(2, "a", { priceCents: 1500, previewIds: ["11"] })
        : observation(2, "9", { priceCents: 1500, previewIds: null, lockedText: null, ready: false, reasons: ["previews_unknown", "locked_text_unknown"] })] };
    if (char === "3") return { ...base, ...rest, observations: [observation(3, "c", { mediaIds: Array.from({ length: 21 }, (_v, i) => String(100 + i)),
      attachments: Array.from({ length: 21 }, (_v, i) => photo(String(100 + i))), ready: false, reasons: ["too_many_attachments"] })] };
    return { ...base, ...rest, observations: [observation(4, "f")], existingItem: { itemId: "7", priceCents: 1999, enabled: false, pricingMode: "fixed", importedBy: "import" } };
  };
  const job = (jobId, mode, status, revision) => ({ jobId, commandKey: H("a"), mode, status, revision, rowsScanned: status === "complete" ? 4812 : 1200, pagesRead: 5, pageBudget: 1000,
    targetsTotal: mode === "refresh" ? 1 : 0, targetsDone: mode === "refresh" && status === "complete" ? 1 : 0, lastError: null, requestedAt: STAMP, updatedAt: STAMP,
    completedAt: status === "complete" ? STAMP : null, coverage: mode === "refresh" ? "selected_sources" : "imported_history" });
  async function handle(route) {
    const request = route.request(), url = new URL(request.url());
    const match = url.pathname.match(/\/accounts\/([^/]+)\/imports\/(.*)$/), account = decodeURIComponent(match[1]), rest = match[2].split("/");
    const answer = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ schemaVersion: "of-offer-import.v1", ok: true, accountId: account, data }) });
    const refuse = (status, error, outcome = "refused") => route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ schemaVersion: "of-offer-import.v1", ok: false, outcome, error }) });
    if (state.denied) return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Sign in again." }) });
    if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
    if (account !== "acc-a") {
      if (request.method() === "POST" && rest[0] === "jobs") return answer(job(JOB, "inventory", "complete", 2));
      return rest[1] === JOB && rest[2] === "candidates" ? answer({ job: job(JOB, "inventory", "complete", 2), items: [], nextCursor: null }) : answer(job(JOB, "inventory", "complete", 2));
    }
    const body = request.method() === "POST" ? request.postDataJSON() : null;
    state.requests.push({ method: request.method(), path: match[2], postData: request.postData(), body });
    if (request.method() === "POST" && rest[0] === "jobs" && rest.length === 1) {
      if (body.mode === "refresh") return answer(job(REFRESH, "refresh", "running", 1));
      state.cancelled = false; state.polls = 0;
      return answer(job(state.hold ? JOB2 : JOB, "inventory", "running", 1));
    }
    if (request.method() === "POST" && rest[2] === "cancel") { state.cancelled = true; return answer(job(rest[1], "inventory", "cancelled", body.expectedRevision + 1)); }
    if (request.method() === "GET" && rest[0] === "jobs" && rest.length === 2) {
      if (rest[1] === REFRESH) { state.c2Refreshed = true; return answer(job(REFRESH, "refresh", "complete", 2)); }
      if (state.hold || state.cancelled) return answer(job(rest[1], "inventory", state.cancelled ? "cancelled" : "running", state.cancelled ? 2 : 1));
      return answer(job(rest[1], "inventory", "complete", 2));
    }
    if (request.method() === "GET" && rest[2] === "candidates" && rest.length === 3) return answer({ job: job(JOB, "inventory", "complete", 2), items: candidates(), nextCursor: null });
    if (request.method() === "GET" && rest[2] === "candidates" && rest.length === 4) return answer(detail(candidates().findIndex(c => c.candidateId === rest[3]) + 1 + ""));
    if (request.method() === "POST" && rest[0] === "drafts") {
      state.drafts.push(request.postData());
      const results = body.drafts.map((draft, index) => {
        const commandKey = H(String(index + 1));
        if (draft.observationId === OBS(1) && state.c1Changed) return { commandKey, ok: false, code: "stale_fingerprint", error: "The source changed since you reviewed it. Review it again." };
        return { commandKey, ok: true, itemId: draft.observationId === OBS(2) ? "9001" : "9002", priceCents: draft.observationId === OBS(2) ? 1500 : 1999, sourceAt: "2026-09-01T12:00:00Z" };
      });
      state.committed = { ok1: results.some((r, i) => r.ok && body.drafts[i].observationId === OBS(1)), ok2: results.some((r, i) => r.ok && body.drafts[i].observationId === OBS(2)) };
      state.committedResults = results;
      // The backend commits first. The reply is then lost once to prove the identical retry.
      if (state.loseNext) { state.loseNext = false; state.aborted++; return route.abort("connectionfailed"); }
      return answer({ results, created: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length });
    }
    return refuse(404, "That import resource is not available.");
  }
  state.requests = [];
  return { state, handle };
}

export async function checkOfferImport(page, context, origin, options = {}) {
  const showOffers = async (targetPage = page) => {
    const tab = targetPage.getByRole("tab", { name: "Offers", exact: true });
    if (await tab.count()) await tab.click();
  };
  const target = options.path ?? "/onlyfans/content?account=acc-a";
  const { state, handle } = backend();
  const external = [];
  const watch = request => { if (!request.url().startsWith(origin + "/") && !request.url().startsWith("data:") && !request.url().startsWith("blob:")) external.push(request.url()); };
  page.on("request", watch);
  await page.route("**/api/onlyfans-content/accounts/*/imports/**", handle);
  await page.route("**/api/onlyfans-content/accounts/*/sync/**", route => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ schemaVersion: "of-content-sync.v1", ok: false, outcome: "refused", code: "not_available", error: "That sync item is not available." }) }));
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(origin + target, { waitUntil: "networkidle" });
    await showOffers();
    const panel = page.locator("[data-offer-import]");
    await panel.getByRole("heading", { name: "Import existing OnlyFans offers" }).waitFor({ timeout: 15000 });
    const scan = panel.getByRole("button", { name: "Scan imported history", exact: true });
    assert(await scan.isEnabled());
    assert.equal(await panel.locator("[data-import-job]").count(), 0, "no scan is claimed before one runs");

    // Scan by keyboard. Running first, then complete after the next poll.
    await scan.focus(); await page.keyboard.press("Enter");
    await panel.locator("[data-import-job]").filter({ hasText: "Scanning" }).waitFor({ timeout: 10000 });
    assert.deepEqual(Object.keys(state.requests.find(r => r.path === "jobs").body).sort(), ["mode", "requestId", "sources"]);
    await panel.locator("[data-import-job]").filter({ hasText: "Complete" }).waitFor({ timeout: 15000 });
    const jobText = await panel.locator("[data-import-job]").innerText();
    assert(jobText.includes("Imported history scanned. This is not a full account sync."), "partial history is never presented as everything imported");
    assert(!/everything imported/i.test(await panel.innerText()));
    const groups = panel.locator('ul[aria-label="Offer groups"] > li button');
    await groups.nth(3).waitFor();
    assert.equal(await groups.count(), 4);
    assert((await groups.nth(0).innerText()).includes("Several prices"), "every observed price is shown, none chosen");
    assert((await groups.nth(0).innerText()).includes("USD 19.99, USD 25.00"));
    await shot(page, "import-scan.png");

    // Unsupported bundle: visible reason, nothing selectable.
    await groups.nth(2).click();
    const review = panel.locator("[data-import-review]");
    await review.getByText("More than 20 attachments.").first().waitFor();
    assert.equal(await review.locator('input[name="source"]:enabled').count(), 0, "an unsupported bundle cannot be selected");
    // Existing conflict: stated, never overwritten.
    await groups.nth(3).click();
    await review.locator("[data-import-conflict]").waitFor();
    assert((await review.locator("[data-import-conflict]").innerText()).includes("It will not be overwritten."));

    // Missing previews and locked text stay unknown and block selection until source details are refreshed.
    await groups.nth(1).click();
    await review.getByText("Free previews unknown.").first().waitFor();
    assert(await review.getByText("Locked text unknown.").count());
    assert.equal(await review.locator('input[name="source"]:enabled').count(), 0);
    await shot(page, "import-blocked-preview.png");
    const refresh = review.getByRole("button", { name: "Refresh selected source details", exact: true });
    await refresh.focus(); await page.keyboard.press("Enter");
    await review.getByText(/Scanning: 0 of 1 sources found|Queued: 0 of 1 sources found/).waitFor({ timeout: 10000 });
    const refreshRequest = state.requests.filter(r => r.path === "jobs").at(-1).body;
    assert.deepEqual(refreshRequest.sources, [{ fanId: "501", messageId: "1001" }]);
    await review.locator('[data-reason="previews_unknown"]').waitFor({ state: "detached", timeout: 15000 });
    assert.equal(await review.getByText(/previews unknown/i).count(), 0);
    await review.locator('input[name="source"]:enabled').first().waitFor();

    // Choose the exact source, approve explicitly and queue it, all by keyboard.
    const radio = review.locator('input[name="source"]').first();
    await radio.focus(); await page.keyboard.press("Space"); assert(await radio.isChecked());
    const add = review.getByRole("button", { name: "Add to drafts", exact: true });
    assert(await add.isDisabled(), "approvals are explicit");
    await review.getByLabel("Label", { exact: true }).focus(); await page.keyboard.type("Beach photo pair");
    await review.getByLabel("Factual description of what unlocks").focus(); await page.keyboard.type("Two approved beach photographs.");
    assert(await add.isDisabled());
    await review.getByLabel("This content is reusable, not a custom or personalized offer.").focus(); await page.keyboard.press("Space");
    assert(await add.isDisabled(), "both confirmations are required");
    await review.getByLabel(/I approve this factual description/).focus(); await page.keyboard.press("Space");
    assert(await add.isEnabled());
    await add.focus(); await page.keyboard.press("Enter");
    await panel.getByRole("heading", { name: "Drafts to create (1)" }).waitFor();

    // A second group whose source changes before creation.
    await groups.nth(0).click();
    await review.getByText("Price from selected OnlyFans offer: USD 25.00").waitFor();
    await review.locator('input[name="source"]').first().check();
    await review.getByLabel("Label", { exact: true }).fill("Two photos");
    await review.getByLabel("Factual description of what unlocks").fill("Two approved photographs.");
    await review.getByLabel("This content is reusable, not a custom or personalized offer.").check();
    await review.getByLabel(/I approve this factual description/).check();
    await review.getByRole("button", { name: "Add to drafts", exact: true }).click();
    await panel.getByRole("heading", { name: "Drafts to create (2)" }).waitFor();
    assert((await panel.getByLabel("Drafts to create").innerText()).includes("Drafts are created switched off. Nothing is sent."));
    state.c1Changed = true; state.loseNext = true;
    const create = panel.getByRole("button", { name: "Create selected drafts", exact: true });
    await create.click();
    await panel.getByText("The outcome is not confirmed. Retry the same request.").waitFor({ timeout: 15000 });
    assert.equal(state.aborted, 1);
    assert(await create.isDisabled(), "no new request until the identical retry is resolved");
    const retryPost = [];
    const capture = request => { if (request.method() === "POST" && request.url().includes("/imports/drafts")) retryPost.push(request.postData()); };
    page.on("request", capture);
    await panel.getByRole("button", { name: "Retry the same request", exact: true }).click();
    await panel.locator('ul[aria-label="Draft results"]').waitFor({ timeout: 15000 });
    page.off("request", capture);
    assert.equal(retryPost.length, 1); assert.equal(retryPost[0], state.drafts[0], "the retry is byte-identical to the original command");
    const sent = JSON.parse(state.drafts[0]).drafts;
    for (const draft of sent) assert.deepEqual(Object.keys(draft).sort(), ["description", "descriptionApproved", "expectedFingerprint", "label", "observationId", "reuseConfirmed"], "no price, actor or command key from the browser");
    const results = panel.locator('[data-draft-result]');
    assert.equal(await results.count(), 2);
    assert((await results.nth(0).innerText()).includes("Draft created: item 9001 at USD 15.00, switched off."));
    assert((await results.nth(1).innerText()).includes("Not created: The source changed since you reviewed it. Review it again."), "a partial batch never claims full success");
    assert.equal(await panel.getByRole("heading", { name: "Drafts to create (1)" }).count(), 1, "only the unresolved draft stays queued");
    if (process.env.ONLYFANS_TEST_EVIDENCE) await results.first().locator("xpath=..").screenshot({ path: path.join(process.env.ONLYFANS_TEST_EVIDENCE, "import-source-conflict.png") });
    await panel.locator('ul[aria-label="Offer groups"] [data-status="draft_created"]').first().waitFor();
    await shot(page, "import-disabled-draft.png");
    await panel.locator("[data-view-item]").first().waitFor();

    // Source change surfaced by refreshing: the new fingerprint is what the next review would send.
    await groups.nth(0).click();
    await review.getByText("Price from selected OnlyFans offer: USD 19.99").waitFor();

    // Reload: nothing private is invented, a fresh scan shows the created draft.
    await page.reload({ waitUntil: "networkidle" });
    await showOffers();
    await panel.getByRole("heading", { name: "Import existing OnlyFans offers" }).waitFor();
    assert.equal(await panel.locator("[data-import-job]").count(), 0);
    await panel.getByRole("button", { name: "Scan imported history", exact: true }).click();
    await panel.locator('ul[aria-label="Offer groups"] [data-status="draft_created"]').first().waitFor({ timeout: 20000 });

    // Cancellation of a running scan.
    state.hold = true;
    await panel.getByRole("button", { name: "Scan imported history", exact: true }).click();
    await panel.locator("[data-import-job]").filter({ hasText: "Scanning" }).waitFor();
    await panel.getByRole("button", { name: "Cancel scan", exact: true }).click();
    await panel.locator("[data-import-job]").filter({ hasText: "Cancelled" }).waitFor();
    assert.deepEqual(state.requests.filter(r => r.path.endsWith("/cancel")).at(-1).body, { expectedRevision: 1 });
    state.hold = false;

    // 390px layout with the review open, and the desktop layout again.
    await panel.getByRole("button", { name: "Scan imported history", exact: true }).click();
    await groups.nth(1).waitFor({ timeout: 20000 });
    await groups.nth(0).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await review.scrollIntoViewIfNeeded();
    assert(await fits(page), "offer import overflows a 390px viewport");
    await shot(page, "import-mobile-390.png");
    await page.setViewportSize({ width: 1440, height: 1000 });
    assert(await fits(page));

    // Session loss clears private offers and refuses to continue.
    state.denied = true;
    await panel.getByRole("button", { name: "Scan imported history", exact: true }).click();
    await panel.locator("[data-import-denied]").waitFor({ timeout: 10000 });
    assert.equal(await panel.locator('ul[aria-label="Offer groups"]').count(), 0);
    assert.equal(await panel.locator("[data-import-review]").count(), 0);
    state.denied = false;

    // Account switching: an in-flight reply for one account is never shown under another.
    await page.goto(origin + target, { waitUntil: "networkidle" });
    await showOffers();
    const others = page.locator('nav[aria-label$="account"] a');
    if (await others.count() > 1) {
      state.delay = 1500;
      await panel.getByRole("button", { name: "Scan imported history", exact: true }).click();
      await others.nth(1).click();
      await page.waitForTimeout(2500); state.delay = 0;
      await showOffers();
      assert.equal(await page.locator("[data-offer-import] [data-import-review]").count(), 0, "a stale reply must not appear for the new account");
    } else console.log("Offer import browser: account switching skipped (fixture exposes one account)");

    // Read-only sessions can read but never start, approve or create.
    if (process.env.ONLYFANS_TEST_READONLY_COOKIE) {
      const [name, ...value] = process.env.ONLYFANS_TEST_READONLY_COOKIE.split("=");
      const viewer = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 } });
      await viewer.route("**/*", route => route.request().url().startsWith(origin + "/") ? route.continue() : route.abort());
      await viewer.addCookies([{ name, value: value.join("="), url: origin }]);
      const readPage = await viewer.newPage();
      await readPage.route("**/api/onlyfans-content/accounts/*/imports/**", handle);
      await readPage.goto(origin + target, { waitUntil: "networkidle" });
      await showOffers(readPage);
      const readPanel = readPage.locator("[data-offer-import]");
      assert(await readPanel.getByRole("button", { name: "Scan imported history", exact: true }).isDisabled(), "read-only team access cannot start a scan");
      assert.equal(await readPanel.getByRole("button", { name: "Create selected drafts" }).count(), 0);
      await viewer.close();
    } else console.log("Offer import browser: read-only scenario skipped (ONLYFANS_TEST_READONLY_COOKIE not set)");

    assert.equal(external.length, 0, "offer import attempted an external request: " + external.join(", "));
    console.log("Offer import browser PASS: keyboard scan and poll, grouped variants, unsupported bundle, existing conflict, unknown previews until refresh, explicit approvals, exact lost-ack retry, partial batch results, source change, cancellation, reload, session loss, 390px/desktop, external requests=0");
  } finally {
    page.off("request", watch);
    await page.unroute("**/api/onlyfans-content/accounts/*/imports/**", handle).catch(() => {});
    await page.unroute("**/api/onlyfans-content/accounts/*/sync/**").catch(() => {});
  }
}
