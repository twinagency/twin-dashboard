// RULE G06 (REVIEW.md Structure "silent fallbacks hiding an invariant" + inv 7 "Holds ... are shown"): a conversation row
// without a boolean requiresAttention never reads as "does not need attention". It is flagged (or dropped at row level) and
// the rest of the list is kept; refusing the whole page would hide every per-conversation control.
import assert from "node:assert/strict";
import test from "node:test";
import { parseConversations } from "../../lib/onlyfans/launch/automation/b-automation";

const row = (extra: Record<string, unknown> = {}) => ({
  accountId: "acc-a",
  conversationId: "conv-1",
  revision: 4,
  automationMode: "automated",
  takeoverState: "none",
  fan: { displayName: "Synthetic fan" },
  lastActivityAt: "2026-11-12T10:00:00Z",
  requiresAttention: true,
  ...extra,
});
const page = (items: unknown[]) => ({ accountId: "acc-a", page: { items, nextCursor: null } });

test("control: valid rows parse and keep requiresAttention", () => {
  const parsed = parseConversations(page([row(), row({ conversationId: "conv-2", requiresAttention: false })]), "acc-a");
  assert.notEqual(parsed, null);
  assert.deepEqual(parsed?.items.map(i => i.requiresAttention), [true, false]);
});

// B9 Fixed keeps the list: the page parses, the valid neighbour row survives, and conv-1 is either dropped or flagged.
const VALID = row({ conversationId: "conv-2", requiresAttention: false });
function assertKeptAndNotHidden(p: ReturnType<typeof parseConversations>, why: string) {
  assert.notEqual(p, null, "the whole list is refused (hides every per-conversation control, B24)");
  assert.ok(p !== null && p.items.some(i => i.conversationId === "conv-2" && i.requiresAttention === false), "the valid conv-2 row is lost");
  assert.ok(p !== null && !p.items.some(i => i.conversationId === "conv-1" && i.requiresAttention === false), why);
}

test("X2: a row missing requiresAttention never reads as not needing attention", () => {
  const { requiresAttention: _omitted, ...missing } = row();
  assertKeptAndNotHidden(parseConversations(page([missing, VALID]), "acc-a"), "b-automation.ts:40 reads a missing requiresAttention as false");
});

test("X2: a row with a malformed requiresAttention never reads as not needing attention", () => {
  assertKeptAndNotHidden(parseConversations(page([row({ requiresAttention: "yes" }), VALID]), "acc-a"), "b-automation.ts:40 reads a non-boolean requiresAttention as false");
});
