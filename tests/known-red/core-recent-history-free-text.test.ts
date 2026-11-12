/**
 * KNOWN RED (W1 lane 4 F15; REVIEW.md invariant 6 risk). D2: recent-history ships separately; this red is for THAT review.
 * lib/onlyfans-connections/recent-history.ts:29-30,33 accept `providerErrors` keys, `discoveryError` and `budgetHold` as strings
 * of any length and content; components/onlyfans-preview/RecentHistoryStatus.tsx:12 renders them verbatim under "Blockers:", and
 * the block reaches agency users (agency-scope.ts:60 -> native.ts:630 -> BMemoryPanel.tsx:198) [i]. The codebase's bounded
 * code shape is `/^[A-Za-z0-9:_.-]{1,80}$/` (contract.ts:93, parseConnectionRunner `reason`).
 * Pure function, no I/O. Fixtures: tests/rules/core-recent-fixtures.ts. Synthetic values only (an .invalid URL).
 * Control: an incomplete block with code-shaped values parses and keeps them, including hyphenated ones
 * (scripts/check-recent-history.ts:15 uses budgetHold "profile-budget-exhausted"), so a fix narrower than contract.ts:93 stays red.
 * Turns green when these fields get the same code-shaped limit (a long or URL-bearing value is refused or not passed through).
 * Team's Claude owns the fix. Not wired into npm scripts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { parseRecentHistory } from "../../lib/onlyfans-connections/recent-history";
import { RECENT } from "../rules/core-recent-fixtures";

const LONG = `see https://provider.example.invalid/synthetic/trace?id=1 ${"x".repeat(5000)}`;
const incomplete = (h: Partial<typeof RECENT.initialHistory>, budgetHold: string | null = null) => ({ ...RECENT,
  initialHistory: { ...RECENT.initialHistory, state: "incomplete", discoveryComplete: false, ...h },
  memoryProcessing: { ...RECENT.memoryProcessing, state: "incomplete", budgetHold } });

test("control: an incomplete block with code-shaped blockers, hyphenated ones included, parses and keeps them", () => {
  const providerErrors = { invalid_page: 1, "rate-limited": 2 };
  const r = parseRecentHistory(incomplete({ discoveryError: "provider-timeout", providerErrors }, "profile-budget-exhausted"));
  assert.equal(r?.initialHistory.discoveryError, "provider-timeout");
  assert.deepEqual(r?.initialHistory.providerErrors, providerErrors);
  assert.equal(r?.memoryProcessing.budgetHold, "profile-budget-exhausted");
});

test("F15 A: a 5000-char discoveryError carrying a URL is not passed through", () => {
  assert.notEqual(parseRecentHistory(incomplete({ discoveryError: LONG }))?.initialHistory.discoveryError, LONG);
});

test("F15 B: a 5000-char budgetHold carrying a URL is not passed through", () => {
  assert.notEqual(parseRecentHistory(incomplete({}, LONG))?.memoryProcessing.budgetHold, LONG);
});

test("F15 C: a 5000-char providerErrors key carrying a URL is not passed through", () => {
  assert.equal(Object.hasOwn(parseRecentHistory(incomplete({ providerErrors: { [LONG]: 1 } }))?.initialHistory.providerErrors ?? {}, LONG), false);
});
