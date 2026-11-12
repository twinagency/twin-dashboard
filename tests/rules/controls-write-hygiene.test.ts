/**
 * Characterization (W1 lane 5 CH-A; REVIEW.md invariant 7 "No send"): the engine request-action route
 * app/api/onlyfans-controls/accounts/[accountId]/conversations/[conversationId]/requests/[requestId]/route.ts:17-19 refuses a
 * write that is not a same-origin JSON request from this dashboard (403), and :25,33 refuses a body over 64 KB (413), each before
 * anything reaches the backend. Driven through tests/rules/controls-route.child.ts as the internal operator (see its header for
 * what is replaced); every other header is the valid same-origin set, so each case changes exactly one thing.
 * Not duplicated: lane 1 PC tests cover planCGate's copy of this gate (lib/onlyfans/plan-c-guard.ts:30-32), not this route.
 * Mutation-proven (tests/rules/mutations/W1-app-onlyfans-controls/): a-1 drops `!trustedFormOrigin(request) ||` (only "foreign
 * Origin" red); a-2 maps CommandBodyTooLarge to 400 (only "over 64 KB" red); a-3 drops the `sec-fetch-site` clause (only
 * "cross-site" red); a-4 drops the content-type clause (only "text/plain" red). Each test has its own mutation.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { controlsChild } from "./controls-fixtures";

const run = () => controlsChild("requests");

test("CH-A: a request with a foreign Origin is refused 403 and never reaches the backend", () => {
  const r = run()["foreign origin"];
  assert.equal(r.status, 403);
  assert.equal(r.posts, 0);
});

test("CH-A: a request with sec-fetch-site cross-site is refused 403 and never reaches the backend", () => {
  const r = run()["cross-site"];
  assert.equal(r.status, 403);
  assert.equal(r.posts, 0);
});

test("CH-A: a request with content-type text/plain is refused 403 and never reaches the backend", () => {
  const r = run()["text/plain"];
  assert.equal(r.status, 403);
  assert.equal(r.posts, 0);
});

test("CH-A: a body over 64 KB is refused 413 and never reaches the backend", () => {
  const r = run().oversize;
  assert.equal(r.status, 413);
  assert.equal(r.posts, 0);
});
