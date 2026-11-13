// Regression guard (G03): was KNOWN RED tests/known-red/plan-c-invented-conversation.test.ts, fixed in this PR (lib/onlyfans/plan-c.ts). Original header below.
/**
 * KNOWN RED (W1 lane 1 finding 10, structure S3; REVIEW.md invariant 7 "Holds and STOP" / "Isolation").
 * lib/onlyfans/plan-c.ts:120 invents `${accountId}:${fanId}` when a draft has no `conversationId`, and that id becomes the
 * STOP/takeover target (PlanCConsole.tsx:182,190). Measured: a draft without conversationId parses with the invented id.
 * Turns green when a draft without conversationId is refused (null). The fix needs a `TEST-CHANGE:` line where existing fixtures
 * omit conversationId (tests/contracts/plan-c-mock-backend.ts seedDraft); the plan-c-fixtures scoped drafts already carry it.
 * Team's Claude owns the fix. Not wired into npm scripts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { parsePlanCDraft } from "../../lib/onlyfans/plan-c";
import { CONVERSATION, MOCK_ACCOUNT, parsedDraft, scopedDraft } from "./plan-c-fixtures";

test("control: a draft that carries its conversationId parses with exactly that id", () => {
  assert.equal(parsedDraft(scopedDraft()).conversationId, CONVERSATION);
});

test("finding 10: a draft without a conversationId is refused, not given an invented one", () => {
  const { conversationId: _dropped, ...raw } = scopedDraft();
  assert.equal(parsePlanCDraft(raw, MOCK_ACCOUNT), null);
});
