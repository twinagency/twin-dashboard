// Regression guard (G03): was KNOWN RED tests/known-red/9a-long-context-message.test.ts, fixed in this PR (lib/onlyfans/plan-c.ts). Original header below.
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

async function readWithFanMessage(body: string) {
  const long = seedDraft({ fanId: LONG_FAN });
  long.conversation.messages = [{ direction: "fan", text: body, at: new Date(Date.now() - 60_000).toISOString() }];
  const mock = createPlanCMock({ drafts: [long, seedDraft({ fanId: OTHER_FAN })] });
  const backend = createPlanCBackend({ baseUrl: "http://backend.invalid", token: MOCK_TOKEN, fetchImpl: mock.fetch });
  return planCReadDrafts(backend, MOCK_ACCOUNT);
}
type Listed = { fanId: string; messages: Array<{ text: string }> };
const listed = (body: Record<string, unknown>) => (Array.isArray(body.drafts) ? body.drafts as Listed[] : []);
const listedFans = (body: Record<string, unknown>) => listed(body).map(draft => draft.fanId).sort();
const longText = (body: Record<string, unknown>) => listed(body).find(draft => draft.fanId === LONG_FAN)?.messages[0]?.text;

test("control: a 4000-character fan message keeps the draft list readable", async () => {
  const result = await readWithFanMessage("x".repeat(4000));
  assert.equal(result.status, 200, JSON.stringify(result.body).slice(0, 200));
  assert.deepEqual(listedFans(result.body), [LONG_FAN, OTHER_FAN]);
});

// R1 D2: the fan text is shown whole, never shortened: its end may be what the approval depends on.
test("finding 10 / D2: a long fan message is passed through in full, up to the backend's 20000-byte cap", async () => {
  const ending = "x".repeat(4001) + " DO NOT SEND";
  let result = await readWithFanMessage(ending);
  assert.equal(result.status, 200);
  assert.deepEqual(listedFans(result.body), [LONG_FAN, OTHER_FAN]);
  assert.equal(longText(result.body), ending, "the whole text, its end included");
  result = await readWithFanMessage("é".repeat(10_000)); // exactly 20000 UTF-8 bytes
  assert.equal(result.status, 200);
  assert.equal(longText(result.body), "é".repeat(10_000));
});

// The backend refuses a stored message over 20000 UTF-8 bytes (twin-onlyfans-backend service/onlyfans_runtime/store.py:82),
// so a longer one is not what it holds: the list is refused (never shortened) and the Stop targets survive (D1).
test("D2: a fan message over 20000 UTF-8 bytes refuses the list and keeps its Stop targets", async () => {
  for (const body of ["x".repeat(20_001), "é".repeat(10_001)]) {
    const result = await readWithFanMessage(body);
    assert.equal(result.status, 502, `${body.length} chars`);
    assert.equal(result.body.drafts, undefined, "no draft is shown");
    assert.deepEqual(result.body.stopTargets, [{ conversationId: `${MOCK_ACCOUNT}:${LONG_FAN}`, revision: 7 }, { conversationId: `${MOCK_ACCOUNT}:${OTHER_FAN}`, revision: 7 }]);
  }
});
