// Regression guard (G03): was KNOWN RED tests/known-red/plan-c-invented-conversation.test.ts, fixed in this PR (lib/onlyfans/plan-c.ts). Original header below.
/**
 * KNOWN RED (W1 lane 1 finding 10, structure S3; REVIEW.md invariant 7 "Holds and STOP" / "Isolation").
 * lib/onlyfans/plan-c.ts:120 invents `${accountId}:${fanId}` when a draft has no `conversationId`, and that id becomes the
 * STOP/takeover target (PlanCConsole.tsx:182,190). Measured: a draft without conversationId parses with the invented id.
 * Turns green when a draft without conversationId is refused (null). The fix needs a `TEST-CHANGE:` line where existing fixtures
 * omit conversationId (tests/contracts/plan-c-mock-backend.ts seedDraft); seedDraft now always carries it.
 * Team's Claude owns the fix. Not wired into npm scripts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { parsePlanCDraft } from "../../lib/onlyfans/plan-c";
import { CONVERSATION, MOCK_ACCOUNT, parsedDraft, seedDraft } from "./plan-c-fixtures";

test("control: a draft that carries its conversationId parses with exactly that id", () => {
  assert.equal(parsedDraft(seedDraft()).conversationId, CONVERSATION);
});

test("finding 10: a draft without a conversationId is refused, not given an invented one", () => {
  const { conversationId: _dropped, ...raw } = seedDraft();
  assert.equal(parsePlanCDraft(raw, MOCK_ACCOUNT), null);
});

// R2 FL4: the id IS `${accountId}:${fanId}` (twin-onlyfans-backend service/onlyfans_read/contract.py:126 conversation_id_for), so the
// draft that is approved and the conversation that is stopped are the same fan. The lenient Stop pass keeps id + prefix only (G03-stop-targets).
test("FL4: a draft whose conversationId is not `${accountId}:${fanId}`, or that has no fanId, is refused", () => {
  assert.ok(parsePlanCDraft(seedDraft({ fanId: 900000000001 as never }), MOCK_ACCOUNT), "control: an integer fanId names the same fan");
  const { fanId: _dropped, ...noFan } = seedDraft();
  const refused: Record<string, unknown>[] = [seedDraft({ conversationId: `${MOCK_ACCOUNT}:900000000002` }), seedDraft({ conversationId: `${MOCK_ACCOUNT}:bogus` }), noFan,
    seedDraft({ fanId: null as never, conversationId: CONVERSATION })];
  for (const raw of refused) assert.equal(parsePlanCDraft(raw, MOCK_ACCOUNT), null, JSON.stringify({ fanId: raw.fanId, conversationId: raw.conversationId }));
});
