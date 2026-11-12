/**
 * KNOWN RED (W1 lane 4 F4). D2: recent-history ships separately (docs/RISKS.md "Decisions"); this red is for THAT review,
 * not the fold. A fix needs a `TEST-CHANGE:` line, because scripts/check-recent-history.ts:22 asserts today's whole-connection
 * rejection.
 * F4: lib/onlyfans-connections/contract.ts:106 nulls the WHOLE connection when the optional `recentHistory` diagnostic fails
 * lib/onlyfans-connections/recent-history.ts (`stamp` requires "Z", :21, while contract.ts:38 accepts "+00:00"; the count
 * identity at :37 rejects a transient skew). ConnectionEditor then drops the status block and "Pause outgoing"
 * (components/onlyfans-preview/ConnectionEditor.tsx:53, :168, :182): a diagnostic removes a stop control.
 * F5 (unknown keys pass the block) is its own known-red: core-recent-history-projection.test.ts.
 * The UI half (status block and Pause hidden) is [i]: no rendered-markup assertion here; see the LIVE-CHECK in the findings file.
 * Pure functions, no I/O. Fixtures: tests/rules/core-recent-fixtures.ts (shape from scripts/check-recent-history.ts).
 * Turns green when the connection parses independently of the block (e.g. `recentHistory: parseRecentHistory(x) ?? undefined`).
 * Team's Claude owns the fix. Not wired into npm scripts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { parseConnection } from "../../lib/onlyfans-connections/contract";
import { CONNECTION as connection, RECENT as recent, connectionResponse as response } from "../rules/core-recent-fixtures";

const withRecent = (r: object) => parseConnection(response({ ...connection, recentHistory: r }), "of-1");

test("control: a core connection parses without recentHistory and with a valid one", () => {
  assert.equal(parseConnection(response(connection), "of-1")?.status, "verified");
  const parsed = withRecent(recent);
  assert.equal(parsed?.status, "verified");
  assert.equal(parsed?.recentHistory?.schemaVersion, "of-recent-history.v1");
});

test("F4 A: a recentHistory stamped +00:00 does not null the connection (status and outgoing stay readable)", () => {
  const parsed = withRecent({ ...recent, startedAt: "2026-11-02T03:00:00+00:00" });
  assert.notEqual(parsed, null, "the whole connection was dropped over an optional diagnostic's timestamp format");
  assert.equal(parsed?.status, "verified");
  assert.equal(parsed?.outgoingEnabled, true);
});

test("F4 B: a recentHistory count skew (ready + awaiting != discovered) does not null the connection", () => {
  const parsed = withRecent({ ...recent, initialHistory: { ...recent.initialHistory, conversationsDiscovered: 3 } });
  assert.notEqual(parsed, null, "the whole connection was dropped over a transient diagnostic count skew");
  assert.equal(parsed?.status, "verified");
  assert.equal(parsed?.outgoingEnabled, true);
});
