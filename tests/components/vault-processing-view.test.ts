/** Pure display and parsing rules for vault import coverage + description analysis. The headline rule: nothing but a proven v4 full import reads as complete. */
import assert from "node:assert/strict";
import test from "node:test";
import { importView, analysisView, credentialView, processingControls, processingActive, processingPollDelay, effectiveCoverage, reasonText, ELIGIBILITY_NOTE, type SyncLite } from "../../lib/onlyfans/vault-processing-view";
import { parseVaultProcessingRead, parseVaultProcessingAck, parseVaultProcessingStatus } from "../../lib/onlyfans/vault-processing";
import { parseVaultCoverage, parseVaultSync, parseVaultSyncAck, validVaultSyncRequest, validVaultProcessingRequest, vaultSelectionLabel, type VaultCoverage } from "../../lib/onlyfans/vault";
import { CONTENT_SCHEMA } from "../../lib/onlyfans/content";

const cov = (patch: Partial<VaultCoverage> = {}): VaultCoverage => ({ scope: "full", state: "complete", reason: null, established_by: "provider_total",
  providerTotal: { photo: 5000, video: 300 }, seen: { photo: 5000, video: 300 }, uniqueImported: { photo: 5000, video: 300 }, ...patch });
const syncOf = (patch: Partial<SyncLite> = {}): SyncLite => ({ status: "complete", ...patch });
const ID = "af6b5c1e-79d0-4510-a5e2-535661d46a9f", KEY = "a".repeat(64), REQ = "fd2e6b88-4edb-43db-a654-e2025d57eece";

test("a proven v4 full import is the only thing called complete", () => {
  const v = importView(cov());
  assert.equal(v.isFull, true); assert.equal(v.tone, "complete"); assert.equal(v.stateLabel, "Complete"); assert.equal(v.notFullNotice, null);
  assert.match(v.rows[0].text, /5,000 unique imported of 5,000 on the provider/);
  assert.match(v.establishedBy ?? "", /provider's reported totals/);
  const traversal = importView(cov({ established_by: "traversal", providerTotal: { photo: null, video: null } }));
  assert.equal(traversal.isFull, true); assert.match(traversal.establishedBy ?? "", /Traversed every page/); assert.match(traversal.rows[0].text, /provider total not reported/);
});
test("v3 window, v1/v2 window and legacy jobs never read as complete, even when finished", () => {
  for (const scope of ["window", "legacy"] as const) {
    const v = importView(cov({ scope, state: "partial", reason: scope === "window" ? "window_not_full_vault" : "legacy_scan_not_proven_full", established_by: null, providerTotal: { photo: null, video: null } }));
    assert.equal(v.isFull, false); assert.equal(v.tone, "warning"); assert.notEqual(v.stateLabel, "Complete"); assert.ok(v.notFullNotice);
    assert.doesNotMatch(v.headline, /Full vault imported/); assert.ok(v.reason);
  }
  // Even a backend that wrongly said scope=window + state=complete cannot make a window look complete.
  const wrong = importView(cov({ scope: "window", state: "complete" }));
  assert.equal(wrong.isFull, false); assert.notEqual(wrong.stateLabel, "Complete"); assert.match(wrong.headline, /not the full vault/);
  assert.match(importView(cov({ scope: "legacy", state: "complete" })).headline, /not proven/);
});
test("a complete claim must reconcile with its own numbers", () => {
  const short = importView(cov({ uniqueImported: { photo: 4999, video: 300 } }));
  assert.equal(short.isFull, false); assert.equal(short.reasonCode, "imported_below_provider_total"); assert.equal(short.stateLabel, "Partial");
  assert.equal(importView(cov({ established_by: null })).isFull, false);
  assert.equal(importView(cov({ providerTotal: { photo: 5000, video: null } })).reasonCode, "counts_missing");
  assert.equal(importView(cov({ uniqueImported: { photo: null, video: 300 } })).isFull, false);
  assert.equal(importView(cov({ uniqueImported: { photo: 5200, video: 300 } })).isFull, true, "more unique rows than the provider total is not a shortfall");
});
test("in progress, unresolved, capped and restarted full jobs are not complete and keep their reason", () => {
  const progress = importView(cov({ state: "in_progress", established_by: null, reason: "retrying:provider_5xx", providerTotal: { photo: null, video: null }, uniqueImported: { photo: 120, video: 3 } }));
  assert.equal(progress.isFull, false); assert.equal(progress.tone, "progress"); assert.match(progress.headline, /not final/); assert.match(progress.reason ?? "", /retrying/);
  const capped = importView(cov({ state: "unresolved", reason: "page_limit", established_by: null }));
  assert.equal(capped.isFull, false); assert.equal(capped.tone, "problem"); assert.match(capped.reason ?? "", /page limit/); assert.match(capped.headline, /did not finish/);
  const exhausted = importView(cov({ state: "unresolved", reason: "retry_exhausted:rate_limited", established_by: null }));
  assert.match(exhausted.reason ?? "", /gave up/); assert.match(exhausted.reason ?? "", /rate_limited/);
  assert.equal(importView(cov({ state: "partial", reason: "window_not_full_vault" })).isFull, false);
});
test("the latest sync job outranks an older finished picture", () => {
  assert.equal(importView(cov(), syncOf({ status: "running" })).stateLabel, "In progress");
  assert.equal(importView(cov(), syncOf({ status: "pending" })).isFull, false);
  const failed = importView(cov(), syncOf({ status: "failed", lastError: "vault_total_page_limit" }));
  assert.equal(failed.isFull, false); assert.equal(failed.stateLabel, "Unresolved");
  assert.equal(importView(cov(), syncOf({ status: "superseded" })).isFull, false);
  assert.equal(importView(undefined, syncOf({ status: "running", scope: { version: 3, selection: "newest_per_type", photos: 1000, videos: 1000, order: "created_at_desc_id_desc" } })).stateLabel, "In progress");
  assert.equal(importView(cov(), syncOf({ status: "complete" })).isFull, true, "a finished latest job does not weaken a proven full status");
});
test("status and sync coverage disagree: the weaker claim wins", () => {
  const window = cov({ scope: "window", state: "partial", reason: "window_not_full_vault", established_by: null });
  assert.equal(importView(cov(), syncOf({ coverage: window })).isFull, false);
  assert.equal(importView(window, syncOf({ coverage: cov() })).isFull, false);
  assert.equal(importView(cov({ state: "in_progress" }), syncOf({ coverage: cov() })).stateLabel, "In progress");
  assert.equal(importView(cov(), syncOf({ coverage: cov() })).isFull, true);
  assert.equal(effectiveCoverage(window, null)?.scope, "window");
});
test("missing coverage is never promoted", () => {
  const none = importView(null, null);
  assert.equal(none.isFull, false); assert.equal(none.tone, "unknown"); assert.ok(none.notFullNotice);
  const v4 = importView(undefined, syncOf({ scope: { version: 4, selection: "full_vault", scope: "full", order: "created_at_desc_id_desc" } }));
  assert.equal(v4.isFull, false); assert.equal(v4.reasonCode, "coverage_not_reported");
  const v3 = importView(undefined, syncOf({ scope: { version: 3, selection: "newest_per_type", photos: 1000, videos: 1000, order: "created_at_desc_id_desc" } }));
  assert.equal(v3.isFull, false); assert.equal(v3.reasonCode, "window_not_full_vault");
  assert.equal(importView(undefined, syncOf()).reasonCode, "legacy_scan_not_proven_full");
});
test("reason text never echoes URLs or unexpected characters", () => {
  assert.equal(reasonText(null), null);
  const odd = reasonText("https://cdn.provider.invalid/x?sig=1") ?? "";
  assert.doesNotMatch(odd, /[/=]/); assert.match(odd, /^Reason code:/);
});

const counts = (patch = {}) => ({ eligible: 10, queued: 0, processing: 0, completed: 10, unresolved: 0, skippedOperator: 0, ...patch });
const analysisOf = (patch: Record<string, unknown> = {}, kinds?: { photo: object; video: object }, reasons: Record<string, number> = {}) =>
  parseVaultProcessingStatus({ paused: false, analysis: { ...counts(patch), byKind: kinds ?? {}, unresolvedReasons: reasons } })!.analysis;
test("analysis: description complete is only called done for an imported-and-fully-described set, and partial imports say so", () => {
  const full = analysisView(analysisOf(), true);
  assert.equal(full.state, "done"); assert.equal(full.tone, "complete"); assert.equal(full.coverageNote, null);
  const partial = analysisView(analysisOf(), false);
  assert.equal(partial.state, "done_partial_import"); assert.equal(partial.tone, "warning"); assert.match(partial.coverageNote ?? "", /not full/);
  assert.match(partial.headline, /imported so far/);
  assert.equal(analysisView(analysisOf({ completed: 8, skippedOperator: 2 }), true).coverageNote, "Operator-skipped items are not described.");
});
test("analysis: active, attention, idle, waiting and unreadable states", () => {
  const active = analysisView(analysisOf({ queued: 4, processing: 2, completed: 4 }), true);
  assert.equal(active.state, "active"); assert.match(active.headline, /2 processing, 4 queued/);
  const reasons = { provider_error: 1, credential_missing: 3, "https://x.invalid/a": 1 };
  const attention = analysisView(analysisOf({ completed: 5, unresolved: 5 }, undefined, reasons), true);
  assert.equal(attention.state, "attention"); assert.equal(attention.tone, "problem");
  assert.deepEqual(attention.unresolved.map(u => [u.code, u.count]), [["credential_missing", 3], ["other", 1], ["provider_error", 1]]);
  assert.equal(attention.unresolved[0].label, "Describe credential missing");
  assert.equal(analysisView(analysisOf({ eligible: 0, completed: 0 }), true).state, "idle");
  const waiting = analysisView(analysisOf({ completed: 6 }), true);
  assert.equal(waiting.state, "waiting"); assert.match(waiting.headline, /4 eligible items are not queued/);
  assert.equal(analysisView(null, true).state, "not_reported");
  assert.equal(analysisView(analysisOf({ completed: 8, queued: 2, processing: 0 }), true).state, "active");
});
test("analysis: unreliable counts are flagged, never shown as done", () => {
  assert.equal(analysisView(analysisOf({ completed: 12 }), true).state, "inconsistent");
  const k = (c: object) => ({ eligible: 5, queued: 0, processing: 0, completed: 5, unresolved: 0, skippedOperator: 0, ...c });
  assert.equal(analysisView(analysisOf({}, { photo: k({}), video: k({}) }), true).state, "done");
  assert.equal(analysisView(analysisOf({}, { photo: k({}), video: k({ completed: 4 }) }), true).state, "inconsistent");
  const rows = analysisView(analysisOf({}, { photo: k({}), video: k({ skippedOperator: 1, completed: 4 }) }), true).rows;
  assert.equal(rows.length, 2);
});
test("credential and budget problems are blocking and prominent; ok is not", () => {
  const status = (state: string) => parseVaultProcessingStatus({ paused: false, credential: { state } })!;
  for (const state of ["missing", "invalid", "budget", "weird"]) assert.equal(credentialView(status(state)).blocking, true, state);
  assert.equal(credentialView(status("budget")).tone, "problem"); assert.match(credentialView(status("budget")).headline, /budget is exhausted/);
  assert.equal(credentialView(status("weird")).headline, "Description credential status is unreadable.");
  assert.equal(credentialView(status("ok")).blocking, false);
  assert.equal(credentialView(parseVaultProcessingStatus({ paused: false })!).blocking, false);
  assert.equal(credentialView(null).tone, "unknown");
});
test("controls: pause/resume mirror state, retry needs unresolved work, re-describe needs 1..200 selected, read-only and busy lock everything", () => {
  const status = (paused: boolean, unresolved = 0) => parseVaultProcessingStatus({ paused, analysis: { ...counts({ unresolved, completed: 10 - unresolved }), byKind: {}, unresolvedReasons: {} } })!;
  let c = processingControls(status(false), []);
  assert.deepEqual([c.pause.enabled, c.resume.enabled, c.retry.enabled, c.redescribe.enabled], [true, false, false, false]);
  c = processingControls(status(true, 2), ["11"]);
  assert.deepEqual([c.pause.enabled, c.resume.enabled, c.retry.enabled, c.redescribe.enabled], [false, true, true, true]);
  const many = Array.from({ length: 201 }, (_, i) => String(i + 1));
  assert.equal(processingControls(status(false), many).redescribe.enabled, false); assert.match(processingControls(status(false), many).redescribe.why ?? "", /at most 200/);
  assert.equal(processingControls(status(false), many.slice(0, 200)).redescribe.enabled, true);
  for (const lock of [{ readOnly: true }, { busy: true }]) assert.ok(Object.values(processingControls(status(true, 2), ["11"], lock)).every(control => !control.enabled && control.why));
  assert.ok(Object.values(processingControls(null, ["11"])).every(control => !control.enabled));
});
test("polling: quick while active, slow when idle, backs off on errors and on unchanged polls, bounded", () => {
  assert.equal(processingPollDelay({ active: true, failures: 0, unchanged: 0 }), 4000);
  assert.equal(processingPollDelay({ active: true, failures: 0, unchanged: 2 }), 16000);
  assert.equal(processingPollDelay({ active: true, failures: 0, unchanged: 50 }), 30000);
  assert.equal(processingPollDelay({ active: false, failures: 0, unchanged: 9 }), 30000);
  assert.equal(processingPollDelay({ active: true, failures: 1, unchanged: 0 }), 8000);
  assert.equal(processingPollDelay({ active: true, failures: 20, unchanged: 0 }), 60000);
  assert.equal(processingPollDelay({ active: false, failures: 1, unchanged: 0 }), 60000);
  const busy = parseVaultProcessingStatus({ paused: false, analysis: { ...counts({ queued: 1, completed: 9 }), byKind: {}, unresolvedReasons: {} } });
  assert.equal(processingActive(busy), true); assert.equal(processingActive(analysisOf() ? parseVaultProcessingStatus({ paused: false }) : null), false);
  assert.equal(processingActive(null, syncOf({ status: "running" })), true);
  assert.equal(processingActive(parseVaultProcessingStatus({ paused: false, import: cov({ state: "in_progress" }) })), true);
});

test("status parser: tolerant of missing sections, strict about identity, drops anything URL-shaped", () => {
  const raw = { ok: true, processing: { account: "acc-a", paused: true, pauseReason: "budget_exhausted", import: { ...cov(), signedUrl: "https://x.invalid/s", jobStatus: "complete" },
    analysis: { ...counts({ queued: 1, completed: 9 }), byKind: { photo: counts() }, unresolvedReasons: { timeout: 2 }, previewUrl: "https://x.invalid/p" },
    credential: { state: "budget", token: "secret" }, updatedAt: "2026-11-15T01:02:03Z", extra: "https://y.invalid" } };
  const parsed = parseVaultProcessingRead(raw, "acc-a")!;
  assert.equal(parsed.paused, true); assert.equal(parsed.import?.jobStatus, "complete"); assert.equal(parsed.analysis?.byKind.video, null);
  assert.doesNotMatch(JSON.stringify(parsed), /https?:|secret|signedUrl|previewUrl|extra/);
  assert.equal(parseVaultProcessingRead(raw, "acc-b"), null);
  assert.equal(parseVaultProcessingRead({ ...raw, accountId: "acc-b" }, "acc-a"), null);
  assert.equal(parseVaultProcessingRead({ ...raw, ok: false }, "acc-a"), null);
  assert.equal(parseVaultProcessingRead({ ...raw, schemaVersion: "other" }, "acc-a"), null);
  assert.equal(parseVaultProcessingRead({ ok: true, processing: { account: "acc-a" } }, "acc-a"), null, "paused is required");
  const sparse = parseVaultProcessingRead({ ok: true, processing: { paused: false } }, "acc-a")!;
  assert.deepEqual([sparse.import, sparse.analysis, sparse.credential, sparse.account, sparse.pauseReason], [null, null, null, null, null]);
  const noEligible = parseVaultProcessingStatus({ paused: false, analysis: { queued: 0, processing: 0, completed: 0, unresolved: 0 } });
  assert.equal(noEligible?.analysis, null, "a section missing a required count is not reported rather than guessed as zero");
  assert.equal(parseVaultProcessingStatus({ paused: false, pauseReason: "https://evil.invalid/x" })?.pauseReason, "unreadable_reason");
  assert.equal(parseVaultProcessingStatus({ paused: false, analysis: { ...counts({ completed: -1 }) } })?.analysis, null);
  assert.equal(parseVaultProcessingStatus({ paused: "no" }), null);
});
test("ack parser: exact identity, applied, tolerant of an unreadable status", () => {
  const ok = { schemaVersion: CONTENT_SCHEMA, ok: true, applied: true, accountId: "acc-a", commandKey: KEY, processing: { account: "acc-a", paused: true } };
  assert.equal(parseVaultProcessingAck(ok, { accountId: "acc-a", commandKey: KEY })?.processing?.paused, true);
  assert.equal(parseVaultProcessingAck({ ...ok, processing: { nope: 1 } }, { accountId: "acc-a" })?.processing, null);
  for (const patch of [{ accountId: "acc-b" }, { commandKey: "b".repeat(64) }, { ok: false }, { applied: false }, { schemaVersion: "x" }, { processing: { account: "acc-b", paused: false } }])
    assert.equal(parseVaultProcessingAck({ ...ok, ...patch }, { accountId: "acc-a", commandKey: KEY }), null, JSON.stringify(patch));
});

test("sync job parser: v4 full scope, coverage and large counts are accepted; fakes are not", () => {
  const job = { jobId: ID, commandKey: KEY, status: "running", pagesRead: 400, itemsSeen: 9600, lastError: null, requestedAt: "2026-11-15T00:00:00Z", updatedAt: "2026-11-15T00:00:01Z", completedAt: null,
    retryAt: null, pageOffset: 0, refreshMode: "full", scope: { selection: "full_vault", version: 4, scope: "full", order: "created_at_desc_id_desc" }, kindOffsets: { photo: 9000, video: 600 }, pageBudget: 2500,
    coverage: cov({ state: "in_progress", established_by: null }) };
  const parsed = parseVaultSync(job)!;
  assert.ok(parsed); assert.equal(parsed.coverage?.scope, "full"); assert.match(vaultSelectionLabel(parsed) ?? "", /^Full vault: every photo and video, no item cap\. 9,000 photo rows and 600 video rows checked\.$/);
  assert.ok(parseVaultSyncAck({ schemaVersion: CONTENT_SCHEMA, ok: true, applied: true, accountId: "acc-a", commandKey: KEY, sync: job }, { accountId: "acc-a", commandKey: KEY }));
  for (const patch of [{ scope: { ...job.scope, scope: "window" } }, { scope: { ...job.scope, selection: "newest_per_type" } }, { scope: { ...job.scope, photos: 1000 } }, { scope: { ...job.scope, order: "recent" } },
    { kindOffsets: { photo: 100001, video: 0 } }, { pageBudget: 0 }, { itemsSeen: 200001 }, { rogueUrl: "https://x.invalid" }])
    assert.equal(parseVaultSync({ ...job, ...patch }), null, JSON.stringify(patch));
  // Non-full jobs keep their old caps and cannot borrow v4 fields.
  const v3 = { ...job, scope: { selection: "newest_per_type", version: 3, photos: 1000, videos: 1000, order: "created_at_desc_id_desc" }, refreshMode: "window", kindOffsets: { photo: 1000, video: 1000 }, status: "complete", completedAt: "2026-11-15T00:00:02Z", itemsSeen: 2000, pagesRead: 84, selectedCount: 2000, selectedByKind: { photo: 1000, video: 1000 } };
  const { pageBudget: _budget, ...v3NoBudget } = v3;
  assert.ok(parseVaultSync({ ...v3NoBudget, coverage: cov({ scope: "window", state: "partial", reason: "window_not_full_vault", established_by: null }) }));
  assert.equal(parseVaultSync(v3), null, "pageBudget is a full-vault field"); assert.equal(parseVaultSync({ ...v3NoBudget, itemsSeen: 4801 }), null); assert.equal(parseVaultSync({ ...v3NoBudget, refreshMode: "full" }), null);
  assert.equal(parseVaultSync({ ...v3NoBudget, kindOffsets: { photo: 5000, video: 0 } }), null);
  // Malformed coverage is dropped, never kept as a stronger claim.
  assert.equal(parseVaultSync({ ...job, coverage: { scope: "full", state: "done" } })?.coverage, undefined);
  assert.equal(parseVaultSync({ ...job, coverage: "complete" })?.coverage, undefined);
  assert.equal(parseVaultCoverage({ scope: "full", state: "complete", providerTotal: { photo: -1, video: "x" } })?.providerTotal.photo, null);
  assert.equal(parseVaultCoverage({ scope: "full", state: "complete", reason: "https://x.invalid" })?.reason, "unreadable_reason");
});
test("sync request: absent, 3 or 4 only, nothing else", () => {
  const base = { requestId: REQ, expectedConnectionRevision: 3 };
  assert.equal(validVaultSyncRequest(base), true);
  assert.equal(validVaultSyncRequest({ ...base, selectionVersion: 4 }), true);
  assert.equal(validVaultSyncRequest({ ...base, selectionVersion: 3 }), true);
  for (const bad of [1, 2, 5, "4", null, 4.5, [4], true]) assert.equal(validVaultSyncRequest({ ...base, selectionVersion: bad }), false, String(bad));
  assert.equal(validVaultSyncRequest({ ...base, selectionVersion: 4, actor: "browser" }), false);
  assert.equal(validVaultSyncRequest({ ...base, commandKey: KEY }), false);
});
test("processing request: nonce + action; media IDs bounded, unique, decimal, retry/redescribe only; redescribe must name items", () => {
  const ok = (v: unknown) => validVaultProcessingRequest(v);
  assert.equal(ok({ requestId: REQ, action: "pause" }), true); assert.equal(ok({ requestId: REQ, action: "resume" }), true); assert.equal(ok({ requestId: REQ, action: "retry" }), true);
  assert.equal(ok({ requestId: REQ, action: "retry", mediaIds: ["11", "9007199254740993"] }), true);
  assert.equal(ok({ requestId: REQ, action: "redescribe", mediaIds: ["11"] }), true);
  assert.equal(ok({ requestId: REQ, action: "redescribe" }), false, "redescribe without items would be an unbounded metered run");
  const two00 = Array.from({ length: 200 }, (_, i) => String(i + 1));
  assert.equal(ok({ requestId: REQ, action: "redescribe", mediaIds: two00 }), true);
  assert.equal(ok({ requestId: REQ, action: "redescribe", mediaIds: [...two00, "201"] }), false);
  for (const action of ["pause", "resume"]) assert.equal(ok({ requestId: REQ, action, mediaIds: ["11"] }), false, action);
  for (const mediaIds of [[], ["0"], ["-1"], ["1.5"], [11], ["11", "11"], ["abc"], ["9223372036854775808"], ["01"], "11", null, ["https://x.invalid/1"]])
    assert.equal(ok({ requestId: REQ, action: "retry", mediaIds }), false, JSON.stringify(mediaIds));
  for (const bad of [{ action: "pause" }, { requestId: "nonce", action: "pause" }, { requestId: REQ, action: "delete" }, { requestId: REQ, action: "PAUSE" }, { requestId: REQ },
    { requestId: REQ, action: "pause", actor: "browser" }, { requestId: REQ, action: "pause", commandKey: KEY }, [], null, "pause"]) assert.equal(ok(bad), false, JSON.stringify(bad));
});
test("the eligibility note says description is not sale permission", () => {
  assert.match(ELIGIBILITY_NOTE, /does not make a file sellable/); assert.match(ELIGIBILITY_NOTE, /approval/i); assert.match(ELIGIBILITY_NOTE, /price/i);
});


test("items waiting for an automatic media retry are counted and block completion", () => {
  const analysis = { eligible: 10, queued: 0, processing: 0, completed: 7, unresolved: 0, skippedOperator: 0, waitingRetry: 3,
    byKind: { photo: null, video: null }, unresolvedReasons: {} };
  const view = analysisView(analysis as never, true);
  assert.equal(view.state, "waiting");
  assert.match(view.headline, /3 items wait for an automatic retry/);
  assert.ok(view.totals.some(t => t.label === "Waiting to retry" && t.value === 3));
  assert.notEqual(view.state, "done");
});
