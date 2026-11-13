// RULE G02 (W1 lane 9a finding 1): an edited Plan C draft is superseded by generation + 1 (backend approval.py edit,
// `generation_next = generation + 1`), so after an edit and a re-list the edited draft approves through client, proxy and the
// typed mock. The mock models that, so approve-after-edit, the path that sends, is tested. Offline: typed mock, no network.
import assert from "node:assert/strict";
import test from "node:test";
import { createPlanCClient } from "../../lib/onlyfans/plan-c-client";
import { MOCK_ACCOUNT, createPlanCMock, seedDraft } from "../contracts/plan-c-mock-backend";
import { createPlanCProxy } from "../contracts/plan-c-proxy";

function setup() {
  const mock = createPlanCMock({ drafts: [seedDraft()] }), proxy = createPlanCProxy(mock);
  return { mock, client: createPlanCClient({ accountId: MOCK_ACCOUNT, operatorScope: "test-operator", fetchImpl: proxy.fetch }) };
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
