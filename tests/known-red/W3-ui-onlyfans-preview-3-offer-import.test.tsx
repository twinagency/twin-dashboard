// KNOWN RED (W3 ui-onlyfans-preview-3, findings F1 F2 F3 F4 F5 F42; docs/review/W3/ui-onlyfans-preview-3.md):
// F1 components/onlyfans-preview/OfferImportPanel.tsx:87,91-92 — only a 502 or a body outcome "unconfirmed" keeps the retry; a 504/500
//    proxy page (no JSON) reads "The request was refused.", the retry is dropped and the next Scan mints a new requestId (:122), so the
//    route derives a new command key and a second provider scan can start (RISKS D7).
// F2 OfferImportPanel.tsx:91,221 — one retry slot, cleared by any other command's confirmed reply: a scan whose reply was lost, then a
//    confirmed refresh "Cancel", drops the kept scan and re-enables Scan with a fresh requestId.
// F3 OfferImportPanel.tsx:39-42 — every 401/403 is "session lost": a route refusal envelope (403 read-only / origin) wipes the operator's
//    queued drafts and shows "Sign in again".
// F4 OfferImportPanel.tsx:57-71 — one failed job-status read stops the scan poll for good (set() only on ok, the effect never re-arms);
//    the panel stays "Scanning" with Scan disabled and no notice.
// F5 OfferImportPanel.tsx:103,206 — a finished scan whose candidate read fails also says "No priced offers were found".
// F42 OfferImportPanel.tsx:109,254 — the route sends `data: result.data` (lib/onlyfans/offer-import-route.ts:48), a bare DraftResult[]
//    (parseDraftResults, lib/onlyfans/offer-import.ts:144-153); the panel reads `data.results`, so a successful create shows no
//    results, keeps the created draft queued and throws. scripts/check-onlyfans-offer-import-browser.mjs:89 mocks `{results,...}` instead.
// Team's Claude owns the fixes. Not wired into npm scripts; init.sh reports it.
// Offline: jsdom, global fetch stubbed (https://fixture.invalid), real OfferImportPanel + ContentSyncStatus + Next contexts.
import { bodyOf, button, click, close, json, posts, q, settle, unexpected, withFastTimers, type Call } from "../helpers/w3-preview3-dom";
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import test, { after, afterEach } from "node:test";
import { ACCOUNT, BASE, REFRESH_JOB, finishedScan, html, importBackend, job, jobReads, mountPanel, ok, panelNotice, queueOneDraft, refused,
  retryButton, scanButton, scannedAndOpened, startPosts, summary } from "../helpers/w3-preview3-import";
import { IMPORT_SCHEMA, parseDraftResults, type DraftInput } from "../../lib/onlyfans/offer-import";

after(close);
afterEach(() => assert.deepEqual(unexpected, [], "every request the panel made was one the test expected"));

const requestIdOf = (index: number) => bodyOf(startPosts()[index]).requestId;
/** The operator's next attempt at the same scan: the kept retry when offered, otherwise the Scan button. */
const nextScan = async () => click(retryButton() ?? scanButton());

test("control: a scan answered 502 keeps \"Retry the same request\" and the retry body is byte-identical", async () => {
  importBackend({ start: (_c, n) => n === 0 ? new Response("bad gateway", { status: 502 }) : ok(job("running")) });
  await mountPanel();
  await click(scanButton());
  assert.match(panelNotice(), /not confirmed/, "a 502 reads as not confirmed");
  assert.ok(retryButton(), "the exact retry is offered");
  await click(retryButton());
  assert.equal(startPosts().length, 2);
  assert.equal(JSON.stringify(startPosts()[1].body), JSON.stringify(startPosts()[0].body), "the retry resends the identical body");
});

for (const status of [504, 500]) {
  test(`F1: a scan answered ${status} with an HTML proxy page reads not confirmed and keeps the retry`, async () => {
    importBackend({ start: (_c, n) => n === 0 ? html(status) : ok(job("running")) });
    await mountPanel();
    await click(scanButton());
    assert.doesNotMatch(panelNotice(), /refused/i, `a ${status} without an import envelope proves nothing was refused (D7)`);
    assert.ok(retryButton(), `an unconfirmed reply (${status}, no envelope) must keep "Retry the same request"`);
  });

  test(`F1: after a scan answered ${status} (HTML), the next scan attempt reuses the first requestId`, async () => {
    importBackend({ start: (_c, n) => n === 0 ? html(status) : ok(job("running")) });
    await mountPanel();
    await click(scanButton());
    await nextScan();
    assert.equal(startPosts().length, 2, "the operator's second attempt was sent");
    assert.equal(requestIdOf(1), requestIdOf(0), "an unconfirmed reply must keep the same requestId (else the route starts a second scan job)");
  });
}

// Path chosen (simplest real one, see findings F2): scan finishes, group opened, refresh accepted (refresh job running, its "Cancel"
// shown), a second scan's reply is lost (502, retry kept), then the refresh job's "Cancel" is confirmed.
test("F2: a confirmed refresh Cancel does not drop the kept, unconfirmed scan request", async () => {
  importBackend({ ...finishedScan,
    start: (call, n) => n === 0 ? ok(job("complete")) : (bodyOf(call).mode === "refresh" ? ok(job("running", "refresh")) : new Response("bad gateway", { status: 502 })),
    job: () => ok(job("running", "refresh")),
    cancel: call => call.url === `${BASE}/jobs/${REFRESH_JOB}/cancel` ? ok(job("cancelled", "refresh", REFRESH_JOB, 2)) : undefined });
  await mountPanel();
  await scannedAndOpened();
  await click(button(/^Refresh selected source details$/));
  await click(scanButton());
  assert.ok(retryButton(), "fixture: the lost scan is kept for retry");
  const lost = requestIdOf(2);
  await click(button(/^Cancel$/));
  assert.equal(posts().filter(p => p.url.endsWith("/cancel")).length, 1, "fixture: the refresh cancel was sent");
  assert.ok(retryButton(), "a confirmed reply to another command must not drop the kept retry");
  await nextScan();
  assert.equal(startPosts().length, 4, "the operator's next scan attempt was sent");
  assert.equal(requestIdOf(3), lost, "an unconfirmed scan must be retried with its own requestId, not a new one");
});

// The refusal a manager's panel can really get: the route's origin/content-type guard (offer-import-route.ts:64), which runs after the
// read-only check (:62) and so reaches operators who may manage imports.
test("F3: a 403 refusal envelope on Create drafts keeps the queued drafts and is not a lost session", async () => {
  importBackend({ ...finishedScan, drafts: () => refused(403, "Manage imports from this dashboard.") });
  await mountPanel();
  await queueOneDraft();
  await click(button(/^Create selected drafts$/));
  assert.equal(posts().filter(p => p.url === `${BASE}/drafts`).length, 1, "fixture: the drafts were posted");
  const denied = !!q("[data-import-denied]"), queueKept = !!q('section[aria-label="Drafts to create"]');
  assert.equal(denied, false, `a route refusal (import envelope, outcome refused) is not a lost session (queued drafts still shown: ${queueKept})`);
  assert.equal(queueKept, true, "a refused create must keep the operator's queued drafts");
});

test("F4: a failed job-status read does not stop the scan poll for good", async () => {
  importBackend({ start: () => ok(job("running")),
    job: (_c, n) => n === 0 ? refused(503, "Import records could not be read.") : ok(job("complete")),
    candidates: () => ok({ job: job("complete"), items: [summary], nextCursor: null }) });
  // The poll waits 3 s; timers of 1 s or more run 100x faster for this test only (700 ms real ≈ 70 s of poll time).
  await withFastTimers(async () => {
    await mountPanel();
    await click(scanButton());
    await settle(700);
  });
  assert.ok(jobReads().length >= 1, "fixture: the first status read happened");
  const notice = panelNotice();
  assert.ok(jobReads().length >= 2 || /status|could not|not be read|unavailable/i.test(notice),
    `after one failed status read the scan must be polled again or say its status could not be read (reads ${jobReads().length}, notice "${notice}")`);
});

test("control: a finished scan whose candidate read returns no groups says none were found", async () => {
  importBackend({ start: () => ok(job("complete")), candidates: () => ok({ job: job("complete"), items: [], nextCursor: null }) });
  await mountPanel();
  await click(scanButton());
  assert.match(q("[data-offer-import]")?.textContent ?? "", /No priced offers were found in imported history\./);
});

test("F5: a finished scan whose candidate read fails does not claim no offers were found", async () => {
  importBackend({ start: () => ok(job("complete")), candidates: () => refused(503, "Import records could not be read.") });
  await mountPanel();
  await click(scanButton());
  assert.match(panelNotice(), /Candidates could not be read/, "fixture: the failed read is reported");
  assert.doesNotMatch(q("[data-offer-import]")?.textContent ?? "", /No priced offers were found/,
    "\"No priced offers were found\" may only follow a successful read that returned zero groups");
});

// F42: the POST /drafts reply is built by the real route (dispatchImport) over a fake backend whose drafts() returns what the real
// backend returns: { ok: true, data: parseDraftResults(...) }. lib/onlyfans/route.ts imports the bundler-only `server-only` marker,
// so it is resolved to the empty stub the repo's scripts already use (scripts/server-only.ts) for this file's process only.
const resolver = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
const resolveOriginal = resolver._resolveFilename, serverOnlyStub = createRequire(import.meta.url).resolve("../../scripts/server-only.ts");
resolver._resolveFilename = (request, ...rest) => request === "server-only" ? serverOnlyStub : resolveOriginal(request, ...rest);
type Backend = Parameters<typeof import("../../lib/onlyfans/offer-import-route").dispatchImport>[1];
/** What the fake upstream and the real route produced for the last drafts POST, for the F42 fixture preconditions. */
const routeSeen = { upstreamParsed: false, status: 0, ok: false, dataIsArray: false };
async function realRouteDrafts(call: Call) {
  const { dispatchImport } = await import("../../lib/onlyfans/offer-import-route");
  const backend = { drafts: async (accountId: string, drafts: (DraftInput & { commandKey: string })[]) => {
    const upstream = { schemaVersion: IMPORT_SCHEMA, ok: true, accountId, created: drafts.length, failed: 0,
      results: drafts.map(d => ({ commandKey: d.commandKey, ok: true, itemId: "7001", priceCents: 1000, sourceAt: "2026-11-01T10:00:00Z" })) };
    const parsed = parseDraftResults(upstream, accountId, drafts.map(d => d.commandKey));
    routeSeen.upstreamParsed = parsed !== null;
    return { ok: true as const, data: parsed! };
  } } as unknown as Backend;
  const answer = await dispatchImport({ method: "POST", accountId: ACCOUNT, path: ["drafts"], after: null, actor: "operator-fixture", canManage: true, body: call.body }, backend);
  const body = answer.body as { ok?: unknown; data?: unknown };
  Object.assign(routeSeen, { status: answer.status, ok: body.ok === true, dataIsArray: Array.isArray(body.data) });
  return json(answer.body, answer.status);
}
/** Clicks Create and records whether the click or its async handler threw. The panel's onClick promise is dropped by React, so a throw
 * is an unhandled rejection; node:test's own listener is set aside for these 80 ms so the test fails on an assertion, not a crash. */
async function createDraftsCaught() {
  const thrown: unknown[] = [], onRejection = (reason: unknown) => { thrown.push(reason); };
  const runner = process.listeners("unhandledRejection");
  process.removeAllListeners("unhandledRejection"); process.on("unhandledRejection", onRejection);
  try { await click(button(/^Create selected drafts$/)); await settle(50); } catch (error) { thrown.push(error); }
  finally { process.off("unhandledRejection", onRejection); for (const listener of runner) process.on("unhandledRejection", listener); }
  return thrown;
}
const queueText = () => q('section[aria-label="Drafts to create"]')?.textContent ?? "";

test("control: a draft reply in the browser-check mock shape (data: { results, created, failed }) renders results and trims the queue", async () => {
  importBackend({ ...finishedScan, drafts: call => ok({ results: (bodyOf(call).drafts as unknown[]).map((_d, i) =>
    ({ commandKey: String(i).repeat(64), ok: true, itemId: "7001", priceCents: 1000, sourceAt: null })), created: 1, failed: 0 }) });
  await mountPanel();
  await queueOneDraft();
  const thrown = await createDraftsCaught();
  assert.equal(thrown.length, 0, "the mock shape does not throw");
  assert.equal(!!q('[data-draft-result="created"]'), true, "the mock shape renders the created result");
  assert.doesNotMatch(queueText(), /Beach set/, "the mock shape removes the created draft from the queue");
});

test("F42: a successful draft create shows its results and removes the created draft from the queue", async () => {
  importBackend({ ...finishedScan, drafts: realRouteDrafts });
  await mountPanel();
  await queueOneDraft();
  const thrown = await createDraftsCaught();
  const reply = posts().find(p => p.url === `${BASE}/drafts`);
  assert.ok(reply, "fixture: the drafts were posted");
  assert.equal(routeSeen.upstreamParsed, true, "fixture: upstream envelope parses");
  assert.equal(routeSeen.status === 200 && routeSeen.ok && routeSeen.dataIsArray, true, "fixture: real route answered 200 ok with an array");
  const created = !!q('[data-draft-result="created"]');
  assert.equal(created, true, `a draft the real route reports created must show as created (route data is a bare DraftResult[]; ${thrown.length} error(s) thrown: ${thrown.map(e => String(e).slice(0, 120)).join(" | ")})`);
  assert.doesNotMatch(queueText(), /Beach set/, "a created draft must leave the queue");
});
