// KNOWN RED (W1 lane 9a finding 10, HIGH; docs/review/W1/tests-contracts.md): the backend sends each recent message as
// `m.body or ''` with no length cap (d10e065 conversation_engine/operator_v2.py:167-168), the dashboard parser rejects a
// message text over 4000 characters (lib/onlyfans/plan-c.ts:98 via text(body, 4000)) and parsePlanCDrafts refuses the
// whole list on one bad draft (:157). One long fan message makes every draft on the account unreadable (route 502
// "could not be read"), so a draft-only conversation loses its Stop while autonomous mode keeps sending.
// Recorded exception to "don't test other lanes' files": lane 1 (lib/onlyfans/plan-c*.ts) is closed and none of its
// findings covers this. If the fix lands backend-side (a cap on the wire), delete this file with a TEST-CHANGE: line.
// Owner: team's Claude. Not wired into npm scripts or init.sh (new-files-only lane).
// Depends on tests/contracts/plan-c-mock-backend.ts: if the mock is replaced (finding I1), re-seat this on a fetch stub; do not delete.
import assert from "node:assert/strict";
import test from "node:test";
import { createPlanCBackend } from "../../lib/onlyfans/plan-c-backend";
import { planCReadDrafts } from "../../lib/onlyfans/plan-c-route";
import { MOCK_ACCOUNT, MOCK_TOKEN, createPlanCMock, seedDraft } from "../contracts/plan-c-mock-backend";

const LONG_FAN = "900000000001", OTHER_FAN = "900000000002";

async function readWithFanMessage(length: number) {
  const long = seedDraft({ fanId: LONG_FAN });
  long.conversation.messages = [{ direction: "fan", text: "x".repeat(length), at: new Date(Date.now() - 60_000).toISOString() }];
  const mock = createPlanCMock({ drafts: [long, seedDraft({ fanId: OTHER_FAN })] });
  const backend = createPlanCBackend({ baseUrl: "http://backend.invalid", token: MOCK_TOKEN, fetchImpl: mock.fetch });
  return planCReadDrafts(backend, MOCK_ACCOUNT);
}
const listedFans = (body: Record<string, unknown>) => (Array.isArray(body.drafts) ? body.drafts : []).map(draft => (draft as { fanId: string }).fanId).sort();

test("control: a 4000-character fan message keeps the draft list readable", async () => {
  const result = await readWithFanMessage(4000);
  assert.equal(result.status, 200, JSON.stringify(result.body).slice(0, 200));
  assert.deepEqual(listedFans(result.body), [LONG_FAN, OTHER_FAN]);
});

test("finding 10: a 4001-character fan message does not make the draft list unreadable", async () => {
  const result = await readWithFanMessage(4001);
  assert.notEqual(result.status, 502, `the whole list was refused: ${JSON.stringify(result.body)}`);
  assert.equal(result.status, 200);
  assert.deepEqual(listedFans(result.body), [LONG_FAN, OTHER_FAN], "both drafts stay listed (the long text may be truncated or shown in full)");
});
