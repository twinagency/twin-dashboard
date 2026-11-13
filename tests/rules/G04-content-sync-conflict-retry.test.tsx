// RULE G04, was KNOWN RED (W3 ui-onlyfans-preview-1, finding F20 in docs/review/W3/ui-onlyfans-preview-1.md).
// F20 components/onlyfans-preview/ContentSyncConflict.tsx:35,75,82,92: one component-wide `retry` disables the fieldset and
//     "Apply decision" of EVERY conflict; an unconfirmed resolve of one conflict freezes review of all others, and there is no
//     "discard and refresh", so the operator's way out (reload) drops the kept requestId and the next Apply mints a new one (:72).
//     Fix keys the retry per conflictId (+ discard); the retry itself already reuses its requestId (characterized in
//     tests/rules/W3-ui-onlyfans-preview-1-content-sync-conflict-retry.test.tsx).
// Green since G04: the kept retry is per conflictId (discard not added). Offline: jsdom, global fetch stubbed (https://fixture.invalid), real ContentSyncConflict + Next contexts.
import { bodyOf, close, lostReply } from "../helpers/w3-preview1-dom";
import assert from "node:assert/strict";
import test, { after } from "node:test";
import { CONFLICTS, SECOND, applyButton, applyDecision, choose, conflicts, notice, refusedWith, resolved, resolvePosts, retryButton } from "../helpers/w3-preview1-conflict";

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
  assert.equal(applyButton("102")?.disabled, false, "one unconfirmed resolve must not freeze review of every other conflict");
  await applyDecision("102");
  const second = resolvePosts().filter(call => call.url.includes(`/conflicts/${SECOND}/resolve`));
  assert.equal(second.length, 1, "applying conflict 2 must send its own resolve, not be swallowed by conflict 1's pending retry");
  const sent = bodyOf(second[0]);
  assert.deepEqual({ ...sent, requestId: typeof sent.requestId },
    { requestId: "string", resolution: "keep_crm", expectedRevision: 5, expectedItemFingerprint: CONFLICTS[1].itemFingerprint });
});
