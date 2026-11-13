// RULE G04, was KNOWN RED (W3 ui-onlyfans-preview-1, finding F20 in docs/review/W3/ui-onlyfans-preview-1.md).
// F20 components/onlyfans-preview/ContentSyncConflict.tsx:35,75,82,92: one component-wide `retry` disables the fieldset and
//     "Apply decision" of EVERY conflict; an unconfirmed resolve of one conflict freezes review of all others, and there is no
//     "discard and refresh", so the operator's way out (reload) drops the kept requestId and the next Apply mints a new one (:72).
//     Fix keys the retry per conflictId (+ discard).
// Green since G04: the kept retry is per conflictId (discard not added), and the retry resends the original requestId (asserted below).
// G04 R1 (#390 findings 6-8): once a resolve is unconfirmed only a recorded resolve releases its requestId (a later refusal does not), and
//     the held decision lives in a module store per account, so a remount keeps it. A reload does not (G04c). Each new test uses its own
//     account so one test's held decision never reaches the next.
// Offline: jsdom, global fetch stubbed (https://fixture.invalid), real ContentSyncConflict + Next contexts.
import { bodyOf, close, lostReply } from "../helpers/w3-preview1-dom";
import assert from "node:assert/strict";
import test, { after } from "node:test";
import { CONFLICTS, FIRST, SECOND, applyButton, applyDecision, choose, conflicts, notice, refusedWith, resolved, resolvePosts, retryButton } from "../helpers/w3-preview1-conflict";
import { click, unmount } from "../helpers/w3-preview1-dom";

after(close);

test("control: a confirmed resolve sends the conflict's revision and fingerprint and reports the decision", async () => {
  await conflicts(resolved);
  await choose("101");
  await applyDecision("101");
  assert.equal(resolvePosts().length, 1);
  assert.equal(resolvePosts()[0].url, "/api/onlyfans-content/accounts/of-a/sync/conflicts/conflict-1/resolve");
  const sent = bodyOf(resolvePosts()[0]);
  assert.deepEqual({ ...sent, requestId: typeof sent.requestId },
    { requestId: "string", resolution: "keep_crm", expectedRevision: 3, expectedItemFingerprint: CONFLICTS[0].itemFingerprint });
  assert.match(CONFLICTS[0].itemFingerprint, /^[0-9a-f]{64}$/, "fixture fingerprint is 64 hex chars");
  assert.match(notice(), /Keeping the CRM terms/);
});

test("control: a refused resolve (409 revision_conflict) offers no retry and leaves the other conflict decidable", async () => {
  await conflicts(refusedWith(409, "revision_conflict"));
  await choose("102");
  await choose("101");
  await applyDecision("101");
  assert.equal(retryButton("101"), null);
  assert.match(notice(), /This item changed/);
  assert.equal(applyButton("102")?.disabled, false);
});

test("F20: an unconfirmed resolve of one conflict leaves the other conflict's decision available", async () => {
  await conflicts(lostReply);
  await choose("102");
  await choose("101");
  await applyDecision("101");
  assert.ok(retryButton("101"), "conflict 1 keeps its exact retry");
  await click(retryButton("101"));
  const first = resolvePosts().filter(call => call.url.includes(`/conflicts/${FIRST}/resolve`)).map(call => bodyOf(call).requestId);
  assert.equal(first.length, 2);
  assert.equal(first[1], first[0], "the retry resends the original requestId");
  assert.equal(applyButton("102")?.disabled, false, "one unconfirmed resolve must not freeze review of every other conflict");
  await applyDecision("102");
  const second = resolvePosts().filter(call => call.url.includes(`/conflicts/${SECOND}/resolve`));
  assert.equal(second.length, 1, "applying conflict 2 must send its own resolve, not be swallowed by conflict 1's pending retry");
  const sent = bodyOf(second[0]);
  assert.deepEqual({ ...sent, requestId: typeof sent.requestId },
    { requestId: "string", resolution: "keep_crm", expectedRevision: 5, expectedItemFingerprint: CONFLICTS[1].itemFingerprint });
  assert.notEqual(sent.requestId, first[0], "conflict 2 has its own requestId");
});

const firstIds = () => resolvePosts().filter(call => call.url.includes(`/conflicts/${FIRST}/resolve`)).map(call => bodyOf(call).requestId);

test("finding 6: unconfirmed, then refused: the decision stays held and the retry still resends the original requestId", async () => {
  await conflicts(n => n === 0 ? lostReply() : n === 1 ? refusedWith(409, "revision_conflict")() : resolved(), "of-held");
  await choose("101");
  await applyDecision("101");
  await click(retryButton("101"));
  assert.ok(retryButton("101"), "a refusal after an unconfirmed attempt released the held decision");
  assert.equal(applyButton("101")?.disabled, true, "a new decision (new requestId) is offered while the first may have committed");
  await click(retryButton("101"));
  const ids = firstIds();
  assert.equal(ids.length, 3);
  assert.equal(new Set(ids).size, 1, `every attempt resends the first requestId; got ${ids.join(", ")}`);
  assert.equal(retryButton("101"), null, "a recorded resolve releases it");
});

test("finding 7: a remount keeps the held decision and its requestId", async () => {
  await conflicts(lostReply, "of-remount");
  await choose("101");
  await applyDecision("101");
  const [original] = firstIds();
  await unmount();
  await conflicts(resolved, "of-remount");
  assert.ok(retryButton("101"), "the remounted list lost the held decision");
  await choose("102");
  assert.equal(applyButton("102")?.disabled, false, "only the held conflict is held");
  await click(retryButton("101"));
  assert.deepEqual(firstIds(), [original], "the retry after a remount resends the original requestId");
});
