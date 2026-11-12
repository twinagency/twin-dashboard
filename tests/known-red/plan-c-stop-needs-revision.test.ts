/**
 * KNOWN RED (W1 lane 1 finding 2; REVIEW.md invariant 7 "A STOP is never harder to trigger than a go (no fingerprint/revision
 * gate on stop)", which governs; sibling of RISKS R13). lib/onlyfans/plan-c-route.ts:66 requires `expectedRevision` for every
 * conversation action, so a STOP sent with only its `commandKey` is refused 400 and never reaches the backend (and the UI hides
 * STOP when the revision is unknown, PlanCConsole.tsx:30, lane 7a).
 * The backend contract has the same gate: NEEDS-BACKEND.md:124 (revision required for Stop to be offered), :127 (exactly the
 * contract keys) and the typed mock tests/contracts/plan-c-mock-backend.ts:116 (400 without expectedRevision). So the fix is a
 * dashboard change AND a backend contract change. This test turns green on the dashboard half: the STOP reaches the backend
 * (what the backend then answers is the contract's call; with today's mock it is 400).
 * Team's Claude owns the fix. Not wired into npm scripts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { planCConversationCommand } from "../../lib/onlyfans/plan-c-route";
import { CONVERSATION, KEY, MOCK_ACCOUNT, OPERATOR_ACTOR, mockBackend } from "../rules/plan-c-fixtures";

const stop = (body: unknown) => { const { mock, backend } = mockBackend();
  return planCConversationCommand(backend, { actor: OPERATOR_ACTOR, accountId: MOCK_ACCOUNT, conversationId: CONVERSATION, action: "stop", body }).then(result => ({ result, posts: mock.posts().length })); };

test("control: a STOP with its revision reaches the backend and is recorded", async () => {
  const { result, posts } = await stop({ commandKey: KEY, expectedRevision: 7 });
  assert.equal(result.status, 200);
  assert.equal(posts, 1);
});

test("finding 2: a STOP without expectedRevision still reaches the backend", async () => {
  const { result, posts } = await stop({ commandKey: KEY });
  assert.equal(posts, 1, `STOP was refused before the backend (status ${result.status})`);
});
