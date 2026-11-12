// RULE (W3 ui-onlyfans-preview-1, F20 "holds" half): ContentSyncConflict's "Retry the same request" resends the identical resolve,
// same requestId, for every answer that leaves the outcome unknown (D7). Mutation proof: tests/rules/mutations/W3-ui-onlyfans-preview-1/
// m4-conflict-retry-remints-request-id.diff. Offline: jsdom, global fetch stubbed (https://fixture.invalid).
import { UNKNOWN_OUTCOMES, click, close, routeFailure, type Answer } from "../helpers/w3-preview1-dom";
import assert from "node:assert/strict";
import test, { after } from "node:test";
import { applyDecision, choose, conflicts, notice, resolved, resolvePosts, retryButton } from "../helpers/w3-preview1-conflict";

after(close);
// Shared cases plus the two syncCall documents as unconfirmed (content-sync-client.ts:30): any non-503 5xx, and a 503 whose body
// says outcome "unconfirmed".
const UNKNOWN: Array<[string, Answer]> = [...UNKNOWN_OUTCOMES,
  ["500", () => new Response(null, { status: 500 })],
  ["503 outcome unconfirmed", () => routeFailure(503, "unconfirmed", { code: "outcome_unconfirmed" })],
];

test("an unconfirmed conflict resolve is retried with the identical body and requestId", async () => {
  for (const [label, first] of UNKNOWN) {
    await conflicts(n => n === 0 ? first() : resolved());
    await choose("101");
    await applyDecision("101");
    assert.equal(resolvePosts().length, 1, `${label}: resolve sent once`);
    assert.ok(retryButton("101"), `${label}: exact retry offered`);
    await click(retryButton("101"));
    const [sent, again] = resolvePosts();
    assert.ok(again, `${label}: retry sent`);
    assert.equal(again.url, sent.url, `${label}: same conflict`);
    assert.deepEqual(again.body, sent.body, `${label}: the retry resends the identical resolve, same requestId`);
    assert.match(notice(), /Keeping the CRM terms/, `${label}: confirmed after the retry`);
  }
});
