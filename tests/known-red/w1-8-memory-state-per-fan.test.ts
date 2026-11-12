// KNOWN RED (W1 lane 8 P7; REVIEW.md inv 7 "No false success" / "UI claims that outrun backend evidence"; D2 recent-history).
// BMemoryPanel.tsx:210-213 memoryState() returns "Recent memory ready" / "Recent history processed, no supported facts" from the
// ACCOUNT-level recovery.recentHistory before any per-fan check, so a fan with nothing processed (processedCurrentMessages 0, no
// lastProcessedAt) is labelled ready. recentHistory carries no accountId/fanId (it rides RecoveryProgress `[key: string]: unknown`).
// Fixed looks like: the per-fan state wins; this fan is "not_processed" whatever the account-level block says (or recent history is
// bound to account+fan in the parser and ignored here). Asserts the state KEY only, never the label copy.
// Not wired into npm scripts; init.sh does not run it yet. Offline: pure function, no DOM, no fetch.
//   node --import tsx --test --test-name-pattern='^control' tests/known-red/w1-8-memory-state-per-fan.test.ts   (green)
//   node --import tsx --test --test-skip-pattern='^control' tests/known-red/w1-8-memory-state-per-fan.test.ts   (red, ERR_ASSERTION)
import assert from "node:assert/strict";
import test from "node:test";
import { memoryState } from "../../components/onlyfans-launch/memory/BMemoryPanel";
import { emptyMemory, memoryProgress, recentHistory, recovery } from "../helpers/w1-8-fixtures";

test("control: a fan with nothing processed and no recent history is not_processed", () => {
  assert.equal(memoryState(memoryProgress(0), recovery(), emptyMemory()).key, "not_processed");
});

test("P7: account-level recent history (ready) does not make an unprocessed fan ready", () => {
  const state = memoryState(memoryProgress(0), recovery(recentHistory()), emptyMemory());
  assert.equal(state.key, "not_processed", `unprocessed fan labelled "${state.label}" from account-level recent history`);
});
