/**
 * Regression guard (G05, rule e, tenant isolation): `applyConversation` (lib/onlyfans-preview/selection.ts) never caches a detail
 * payload under account A when the payload says account B (its sibling `appendOlderConversation` refuses it too). The mismatch is
 * stored as an error for that thread, so the thread does not stay "loading" forever.
 * Control: A's own payload applies as ready.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { applyConversation, initialSelectionState, requestConversation } from "../../lib/onlyfans-preview/selection";
import type { ConversationDetail } from "../../lib/onlyfans-preview/types";

const A = "of-a", B = "of-b", FAN = "42";
const detail = (accountId: string) => ({ accountId, conversationId: FAN, messages: [] }) as unknown as ConversationDetail;

test("control: account A's own detail applies", () => {
  const r = requestConversation(initialSelectionState(), A, FAN);
  const out = applyConversation(r.state, A, FAN, r.generation, r.seq, { status: "ready", data: detail(A) });
  assert.equal(out.applied, true);
  assert.equal(out.state.byAccount[A]?.detail[FAN]?.status, "ready");
});

test("account B's detail for the same fan id is never cached as A's; A's thread shows an error, not loading", () => {
  const r = requestConversation(initialSelectionState(), A, FAN);
  const stored = applyConversation(r.state, A, FAN, r.generation, r.seq, { status: "ready", data: detail(B) }).state.byAccount[A]?.detail[FAN];
  assert.equal(stored?.status, "error");
  assert.ok(stored && !("data" in stored));
});
