/**
 * Rule (W1 lane 4 F5; "OnlyFans session data never reaches the browser"; outbound projections name every field): parseRecentHistory
 * builds a new object naming every field at every level, and parseConnection returns that projection, so an unknown key at ANY level
 * of the recent-history block (top level or any nested block, e.g. a nested `capture`) never reaches the browser.
 * Pure functions, no I/O. Fixtures: tests/rules/core-recent-fixtures.ts.
 * Control: a valid block keeps every known field (so "drop the block always" is not a fix).
 * Run: nice -n 10 node --import tsx --test tests/rules/core-recent-history-projection.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { parseRecentHistory } from "../../lib/onlyfans-connections/recent-history";
import { parseConnection } from "../../lib/onlyfans-connections/contract";
import { CONNECTION, RECENT, connectionResponse } from "./core-recent-fixtures";

const EXTRA = "syntheticExtraField";
const withRecent = (r: object) => parseConnection(connectionResponse({ ...CONNECTION, recentHistory: r }), "of-1")?.recentHistory;
const leaked = (value: unknown, path: string[]): boolean => {
  const target = path.reduce<unknown>((at, key) => (at && typeof at === "object" ? (at as Record<string, unknown>)[key] : undefined), value);
  return !!target && typeof target === "object" && Object.hasOwn(target, EXTRA);
};

test("control: a valid block keeps every known field through parseRecentHistory and parseConnection", () => {
  assert.deepEqual(parseRecentHistory(RECENT), RECENT);
  assert.deepEqual(withRecent(RECENT), RECENT);
});

test("F5: an unknown key at the top level or inside a nested block does not survive parsing", () => {
  // The top level plus every object-valued block of the fixture (initialHistory, memoryProcessing, olderHistory, ...).
  const nested = Object.entries(RECENT).flatMap(([key, value]): Array<[string, object, string[]]> =>
    value && typeof value === "object" && !Array.isArray(value) ? [[key, { ...RECENT, [key]: { ...value, [EXTRA]: "synthetic" } }, [key]]] : []);
  assert.ok(nested.length >= 5, `fixture lost its nested blocks: ${nested.map(([key]) => key).join(", ")}`);
  const cases: Array<[string, object, string[]]> = [["top level", { ...RECENT, [EXTRA]: "synthetic" }, []], ...nested];
  for (const [name, block, path] of cases) {
    assert.equal(leaked(parseRecentHistory(block), path), false, `parseRecentHistory passed an unknown key (${name})`);
    assert.equal(leaked(withRecent(block), path), false, `parseConnection passed an unknown key (${name})`);
  }
});
