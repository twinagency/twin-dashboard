/**
 * Rule (W1 lane 4 F15; "OnlyFans session data never reaches the browser"): `providerErrors` keys, `discoveryError` and `budgetHold`
 * (rendered verbatim under "Blockers:" in components/onlyfans-preview/RecentHistoryStatus.tsx, and reaching agency users) must match
 * the bounded code shape BOUNDED_CODE `/^[A-Za-z0-9:_.-]{1,80}$/` (lib/onlyfans-connections/recent-history.ts, shared with
 * parseConnectionRunner `reason`); any other string is replaced by the fixed code "unrecognized" (non-null, so the blocker still
 * shows and the connection, with its "Pause outgoing" control, still parses).
 * Pure function, no I/O. Fixtures: tests/rules/core-recent-fixtures.ts. Synthetic values only (an .invalid URL).
 * Control: an incomplete block with code-shaped values parses and keeps them, including hyphenated ones
 * (scripts/check-recent-history.ts uses budgetHold "profile-budget-exhausted"), so a narrower shape stays red.
 * Run: nice -n 10 node --import tsx --test tests/rules/core-recent-history-free-text.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { parseRecentHistory } from "../../lib/onlyfans-connections/recent-history";
import { parseConnection } from "../../lib/onlyfans-connections/contract";
import { CONNECTION, RECENT, connectionResponse } from "./core-recent-fixtures";

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

test("F15 D: a 5000-char budgetHold keeps the connection and shows as the fixed code \"unrecognized\"", () => {
  const c = parseConnection(connectionResponse({ ...CONNECTION, recentHistory: incomplete({}, LONG) }), "of-1");
  assert.notEqual(c, null);
  assert.equal(c?.recentHistory?.memoryProcessing.budgetHold, "unrecognized");
});
