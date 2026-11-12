/**
 * Known red (rule e, tenant isolation): `applyConversation` (lib/onlyfans-preview/selection.ts:377) caches a detail
 * payload under account A even when the payload says account B. Its sibling `appendOlderConversation` (:471) refuses it.
 * Control: A's own payload applies. Turns green when applyConversation checks result.data.accountId/conversationId.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { applyConversation, initialSelectionState, requestConversation } from "../../lib/onlyfans-preview/selection";
import type { ConversationDetail } from "../../lib/onlyfans-preview/types";

const A = "of-a", B = "of-b", FAN = "42";
const detail = (accountId: string) => ({ accountId, conversationId: FAN, messages: [] }) as unknown as ConversationDetail;

test("control: account A's own detail applies", () => {
  const r = requestConversation(initialSelectionState(), A, FAN);
  assert.equal(applyConversation(r.state, A, FAN, r.generation, r.seq, { status: "ready", data: detail(A) }).applied, true);
});

test("account B's detail for the same fan id is refused when applied as A's", () => {
  const r = requestConversation(initialSelectionState(), A, FAN);
  assert.equal(applyConversation(r.state, A, FAN, r.generation, r.seq, { status: "ready", data: detail(B) }).applied, false);
});
