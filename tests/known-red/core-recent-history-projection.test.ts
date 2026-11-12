/**
 * KNOWN RED (W1 lane 4 F5; REVIEW.md invariant 6 risk: the contract is the field boundary to the browser). D2: recent-history
 * ships separately (docs/RISKS.md "Decisions"); this red is for THAT review, not the fold.
 * lib/onlyfans-connections/recent-history.ts:42 returns its input object, so an unknown key at ANY level of the block (top level,
 * every nested block) survives parseRecentHistory and parseConnection (contract.ts:106) and reaches the
 * browser, while the connection's own keys are held to an exact allowlist (contract.ts:104).
 * Pure functions, no I/O. Fixtures: tests/rules/core-recent-fixtures.ts.
 * Control: a valid block keeps every known field (so "drop the block always" is not a fix).
 * Turns green when the block is projected field by field or rejects unknown keys at every level.
 * Team's Claude owns the fix. Not wired into npm scripts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { parseRecentHistory } from "../../lib/onlyfans-connections/recent-history";
import { parseConnection } from "../../lib/onlyfans-connections/contract";
import { CONNECTION, RECENT, connectionResponse } from "../rules/core-recent-fixtures";

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
