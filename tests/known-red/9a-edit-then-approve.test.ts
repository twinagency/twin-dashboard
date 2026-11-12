// KNOWN RED (W1 lane 9a finding 1, docs/review/W1/tests-contracts.md): the Plan C mock backend keeps the generation on
// an edit (tests/contracts/plan-c-mock-backend.ts:104-107) and then finds the invalidated v1 for (requestId, generation)
// (:48), so the edited draft can never be approved through client -> proxy -> mock. The backend at d10e065 supersedes
// the draft with generation + 1 (conversation_engine/approval.py:581,617 `generation_next = generation + 1`) and its ack
// reports it (operator_v2.py:367-370). Approve-after-edit, the path that sends, is therefore untested.
// Owner: team's Claude (mock fidelity, tests/contracts/**). Not wired into npm scripts or init.sh (new-files-only lane).
import assert from "node:assert/strict";
import test from "node:test";
import { createPlanCClient } from "../../lib/onlyfans/plan-c-client";
import { MOCK_ACCOUNT, createPlanCMock, seedDraft } from "../contracts/plan-c-mock-backend";
import { createPlanCProxy } from "../contracts/plan-c-proxy";

function setup() {
  const mock = createPlanCMock({ drafts: [seedDraft()] }), proxy = createPlanCProxy(mock);
  return { mock, client: createPlanCClient({ accountId: MOCK_ACCOUNT, fetchImpl: proxy.fetch }) };
}
async function listed(client: ReturnType<typeof createPlanCClient>) {
  const list = await client.listDrafts();
  assert.ok(list.ok, "the draft list must be readable");
  assert.equal(list.data.drafts.length, 1, "exactly one live draft");
  return list.data.drafts[0];
}

test("control: an unedited draft approves through client, proxy and mock", async () => {
  const { client } = setup();
  const result = await client.approveDraft(await listed(client));
  assert.equal(result.ok, true, JSON.stringify(result));
});

test("finding 1: after an edit and a re-list, the listed draft approves and carries generation + 1", async () => {
  const { client } = setup();
  const original = await listed(client);
  const edited = await client.editDraft(original, ["Hey you, saw your message.", "What are you after tonight?"]);
  assert.equal(edited.ok, true, "the edit itself is acknowledged");
  const current = await listed(client);
  const approved = await client.approveDraft(current);
  assert.equal(approved.ok, true, `approving the re-listed edited draft must succeed, got ${JSON.stringify(approved)}`);
  assert.equal(current.generation, original.generation + 1, "the backend supersedes an edited draft with generation + 1");
});
