// KNOWN RED (W1 lane 9a finding 2, lane 7a handoff, docs/RISKS.md R5; docs/review/W1/tests-contracts.md): the Plan C mock
// backend's STOP only sets the owner to "stopped" (tests/contracts/plan-c-mock-backend.ts:120); every draft stays live and
// approvable, so every Plan C client test passes with approve live after a stop. Backend d10e065: a stop goes through
// Store.control (onlyfans_runtime/store.py:526-528) -> delivery.control_changed, which withdraws every live approval of
// the fan (conversation_engine/delivery.py:146-154 invalidate_fan_in_session 'control_changed'), and evaluate refuses a
// stale control revision (approval.py:238-239). Owner: team's Claude (mock fidelity, tests/contracts/**).
// Not wired into npm scripts or init.sh (new-files-only lane).
import assert from "node:assert/strict";
import test from "node:test";
import type { PlanCConversationAction } from "../../lib/onlyfans/plan-c";
import { createPlanCClient } from "../../lib/onlyfans/plan-c-client";
import { MOCK_ACCOUNT, createPlanCMock, seedDraft } from "../contracts/plan-c-mock-backend";
import { createPlanCProxy } from "../contracts/plan-c-proxy";

const FAN = "900000000001", CONVERSATION = `${MOCK_ACCOUNT}:${FAN}`;

/** Lists, runs one conversation control on the listed revision, re-lists and tries to approve the draft shown before the control. */
async function controlThenApprove(action: PlanCConversationAction) {
  const mock = createPlanCMock({ drafts: [seedDraft({ fanId: FAN })] }), proxy = createPlanCProxy(mock);
  const client = createPlanCClient({ accountId: MOCK_ACCOUNT, fetchImpl: proxy.fetch });
  const before = await client.listDrafts();
  assert.ok(before.ok, "the draft list must be readable");
  const shown = before.data.drafts.find(draft => draft.conversationId === CONVERSATION);
  assert.ok(shown, "the seeded draft is listed");
  const revision = shown.conversationRevision;
  assert.ok(revision !== null, "the listed draft reports its conversation revision");
  const ack = await client.conversationCommand(CONVERSATION, action, revision);
  assert.equal(ack.ok, true, `the ${action} must be acknowledged, got ${JSON.stringify(ack)}`);
  const after = await client.listDrafts();
  assert.ok(after.ok, "the draft list must be readable after the control");
  const live = after.data.drafts.filter(draft => draft.conversationId === CONVERSATION && ["awaiting", "approved"].includes(draft.status));
  const approve = await client.approveDraft(shown);
  return { live, approve };
}

test("control: a takeover withdraws the conversation's live drafts", async () => {
  const { live, approve } = await controlThenApprove("takeover");
  assert.deepEqual(live, [], "no live draft is listed after a takeover");
  assert.equal(approve.ok, false, "the draft shown before the takeover cannot be approved");
});

test("finding 2: a stop withdraws the conversation's live drafts", async () => {
  const { live, approve } = await controlThenApprove("stop");
  assert.deepEqual(live.map(draft => `${draft.requestId}/${draft.generation}/${draft.status}`), [], "no live draft is listed after a stop");
  assert.equal(approve.ok, false, "the draft shown before the stop cannot be approved");
});
