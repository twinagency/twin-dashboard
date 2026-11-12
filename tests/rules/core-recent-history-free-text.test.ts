/**
 * Rule (W1 lane 4 F15; "OnlyFans session data never reaches the browser"): `providerErrors` keys, `discoveryError`, `budgetHold`
 * (rendered verbatim under "Blockers:" in components/onlyfans-preview/RecentHistoryStatus.tsx, and reaching agency users) and
 * `providerOrdering` must match DIAGNOSTIC_CODE (lib/onlyfans-connections/recent-history.ts: lowercase, short segments, so a token
 * or URL cannot pass). Any other string becomes the fixed code "unrecognized" (non-null, so the blocker still shows and the
 * connection, with its "Pause outgoing" control, still parses); a blank blocker is null; bad providerErrors keys sum, clamped.
 * Pure function, no I/O. Fixtures: tests/rules/core-recent-fixtures.ts. Synthetic values only (an .invalid URL).
 * Control: an incomplete block with code-shaped values parses and keeps them, including hyphenated ones
 * (scripts/check-recent-history.ts uses budgetHold "profile-budget-exhausted"), so a narrower shape stays red.
 * Run: nice -n 10 node --import tsx --test tests/rules/core-recent-history-free-text.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { DIAGNOSTIC_CODE, parseRecentHistory } from "../../lib/onlyfans-connections/recent-history";
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

test("F15 A: a 5000-char discoveryError carrying a URL becomes \"unrecognized\"", () => {
  const r = parseRecentHistory(incomplete({ discoveryError: LONG }));
  assert.notEqual(r, null);
  assert.equal(r?.initialHistory.discoveryError, "unrecognized");
});

test("F15 B: a 5000-char budgetHold carrying a URL becomes \"unrecognized\"", () => {
  const r = parseRecentHistory(incomplete({}, LONG));
  assert.notEqual(r, null);
  assert.equal(r?.memoryProcessing.budgetHold, "unrecognized");
});

test("F15 C: a 5000-char providerErrors key carrying a URL becomes \"unrecognized\"", () => {
  const r = parseRecentHistory(incomplete({ providerErrors: { [LONG]: 1 } }));
  assert.notEqual(r, null);
  assert.deepEqual(r?.initialHistory.providerErrors, { unrecognized: 1 });
});

test("F15 D: a 5000-char budgetHold keeps the connection and shows as the fixed code \"unrecognized\"", () => {
  const c = parseConnection(connectionResponse({ ...CONNECTION, recentHistory: incomplete({}, LONG) }), "of-1");
  assert.notEqual(c, null);
  assert.equal(c?.recentHistory?.memoryProcessing.budgetHold, "unrecognized");
});

const REAL = ["provider-timeout", "invalid_page", "rate-limited", "profile-budget-exhausted", "provider_connection_check_retry",
  "provider_authentication_required", "id_desc_exhaustive_date_filter", "verified_timestamp_desc"];
const TOKENS = ["a" + "0123456789abcdef".repeat(3).slice(0, 39), "eyJhbGciOiJIUzI1NiJ9AbCdEf+/xYz", "x_bc=abc"];
const fields = (v: string) => parseRecentHistory(incomplete({ discoveryError: v, providerOrdering: v, providerErrors: { [v]: 1 } }, v));

test("F15 E: real backend codes pass unchanged in every field; token-shaped values become \"unrecognized\"", () => {
  for (const v of REAL) {
    assert.ok(DIAGNOSTIC_CODE.test(v), v);
    const r = fields(v);
    assert.deepEqual([r?.initialHistory.discoveryError, r?.initialHistory.providerOrdering, r?.memoryProcessing.budgetHold], [v, v, v]);
    assert.deepEqual(r?.initialHistory.providerErrors, { [v]: 1 });
  }
  for (const v of TOKENS) {
    const r = fields(v);
    assert.deepEqual([r?.initialHistory.discoveryError, r?.initialHistory.providerOrdering, r?.memoryProcessing.budgetHold],
      ["unrecognized", "unrecognized", "unrecognized"], v);
    assert.deepEqual(r?.initialHistory.providerErrors, { unrecognized: 1 }, v);
  }
});

test("F15 F: bad providerErrors keys, __proto__ included, sum into an existing \"unrecognized\" without touching a prototype", () => {
  const providerErrors = JSON.parse(`{"${"y".repeat(100)}":1,"x_bc=abc":2,"unrecognized":3,"__proto__":4,"":5,"invalid_page":6}`);
  const r = parseRecentHistory(incomplete({ providerErrors }));
  assert.deepEqual(r?.initialHistory.providerErrors, { unrecognized: 15, invalid_page: 6 });
  assert.equal(Object.getPrototypeOf(r?.initialHistory.providerErrors), Object.prototype);
});

test("F15 G: blank blockers mean no blocker (a ready block still parses); a blank providerOrdering becomes \"unrecognized\"", () => {
  const ready = { ...RECENT, initialHistory: { ...RECENT.initialHistory, discoveryError: "", providerOrdering: "" },
    memoryProcessing: { ...RECENT.memoryProcessing, budgetHold: "  " } };
  const c = parseConnection(connectionResponse({ ...CONNECTION, recentHistory: ready }), "of-1");
  assert.notEqual(c, null);
  assert.equal(c?.recentHistory?.initialHistory.discoveryError, null);
  assert.equal(c?.recentHistory?.memoryProcessing.budgetHold, null);
  assert.equal(c?.recentHistory?.initialHistory.providerOrdering, "unrecognized");
});

test("F15 H: merging two valid counts clamps at MAX_SAFE_INTEGER instead of refusing the connection", () => {
  const block = incomplete({ providerErrors: { [LONG]: Number.MAX_SAFE_INTEGER, "x_bc=abc": Number.MAX_SAFE_INTEGER } });
  const c = parseConnection(connectionResponse({ ...CONNECTION, recentHistory: block }), "of-1");
  assert.notEqual(c, null);
  assert.deepEqual(c?.recentHistory?.initialHistory.providerErrors, { unrecognized: Number.MAX_SAFE_INTEGER });
});
