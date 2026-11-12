/**
 * W4 lib-onlyfans-preview-1 C2 (REVIEW inv 7 isolation): scopeId and parseWorkspaceScope in lib/onlyfans-preview/scope.ts
 * turn ?creator= / ?account= into the requested workspace scope on live paths (components/Sidebar.tsx:305,
 * app/onlyfans/launch/layout.tsx:7). A value that cannot be an id is never forwarded: it becomes null. Characterization,
 * green at HEAD; mutation proofs in tests/rules/mutations/W4-lib-onlyfans-preview-1/. Dot-only ids ("..") are admitted
 * today: open finding F11, not pinned here.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkspaceScope, scopeId } from "../../lib/onlyfans-preview/scope";

const BAD = ["", "   ", "a".repeat(65), "of acc", "of/acc", "of?acc", "of&acc", "of%2Facc", "of#acc"];

test("scopeId: accepts a plain id (trimmed) up to 64 chars", () => {
  assert.equal(scopeId("of-acc-ava-001"), "of-acc-ava-001");
  assert.equal(scopeId("  creator-ava-0001 "), "creator-ava-0001");
  assert.equal(scopeId("a".repeat(64)), "a".repeat(64));
});

test("scopeId: rejects empty, over 64 chars, spaces, slashes, ? and & (and other escapes)", () => {
  for (const value of BAD) assert.equal(scopeId(value), null, JSON.stringify(value));
  assert.equal(scopeId(null), null);
  assert.equal(scopeId(undefined), null);
});

test("parseWorkspaceScope: never returns a rejected creator or account", () => {
  for (const value of BAD) {
    const params = new URLSearchParams();
    params.set("creator", value);
    params.set("account", value);
    assert.deepEqual(parseWorkspaceScope(params), { creatorId: null, accountId: null }, JSON.stringify(value));
  }
  assert.deepEqual(parseWorkspaceScope(new URLSearchParams("creator=creator-ava-0001&account=of-acc-ava-001")),
    { creatorId: "creator-ava-0001", accountId: "of-acc-ava-001" });
});
