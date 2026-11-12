/**
 * Characterization (W1 lane 1, "rules that hold" PC7; REVIEW.md invariant 7 "Isolation", rule e): a Plan C conversation id must
 * start with `${accountId}:`, colon included, in the parser (lib/onlyfans/plan-c.ts:121, :192) and in the proxy route
 * (lib/onlyfans/plan-c-route.ts:65). Not duplicated from tests/contracts/plan-c.test.ts (which uses an unrelated "other:" prefix):
 * here the foreign account id has the local one as a PREFIX (MOCK_ACCOUNT vs MOCK_ACCOUNT + "b"), which a check without the colon
 * would accept. Fully scoped fixtures (tests/rules/plan-c-fixtures.ts): drafts carry conversationId, lists carry accountId.
 * Mutation-proven (tests/rules/mutations/W1-lib-onlyfans-plan-c/pc7-*).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { parsePlanCDraft, parsePlanCUnresolved } from "../../lib/onlyfans/plan-c";
import { planCConversationCommand } from "../../lib/onlyfans/plan-c-route";
import { CONVERSATION, FAN, KEY, MOCK_ACCOUNT, OPERATOR_ACTOR, mockBackend, scopedDraft, unresolvedItem, unresolvedList } from "./plan-c-fixtures";

const A = MOCK_ACCOUNT, SIBLING = `${MOCK_ACCOUNT}b`;

test("PC7: the parser refuses a draft or unresolved item whose conversation belongs to an account with the same prefix", () => {
  assert.equal(parsePlanCDraft(scopedDraft(), A)?.conversationId, CONVERSATION, "control: own conversation");
  for (const foreign of [`${SIBLING}:${FAN}`, `${A}${FAN}`, A])
    assert.equal(parsePlanCDraft({ ...scopedDraft(), conversationId: foreign }, A), null, `draft ${foreign}`);
  assert.ok(parsePlanCUnresolved(unresolvedList([unresolvedItem()]), A), "control: own item");
  assert.equal(parsePlanCUnresolved(unresolvedList([unresolvedItem(`${SIBLING}:${FAN}`)]), A), null, "unresolved sibling");
});

test("PC7: the route refuses a STOP for a conversation of an account with the same prefix and never calls the backend", async () => {
  const { mock, backend } = mockBackend();
  const stop = (conversationId: string) => planCConversationCommand(backend, { actor: OPERATOR_ACTOR, accountId: A, conversationId, action: "stop", body: { commandKey: KEY, expectedRevision: 7 } });
  assert.equal((await stop(CONVERSATION)).status, 200, "control: own conversation");
  for (const foreign of [`${SIBLING}:${FAN}`, `${A}${FAN}`]) assert.equal((await stop(foreign)).status, 400, foreign);
  assert.equal(mock.posts().length, 1, "a foreign conversation reached the backend");
});
