/**
 * Rule (W1 lane 4 F4; a diagnostic never removes a brake): an invalid optional `recentHistory` block drops only that key.
 * parseConnection returns a copy of the connection without it, so ConnectionEditor keeps the status block and "Pause outgoing".
 * Triggers seen: a "+00:00" stamp (recent-history.ts `stamp` requires "Z") and a transient count skew.
 * Everything else still refuses the whole connection (unknown keys, required fields, runner/aiLive contradictions, sync,
 * throttleSeconds); the control below pins two of those. scripts/check-recent-history.ts carries the matching TEST-CHANGE line.
 * Pure functions, no I/O. Fixtures: tests/rules/core-recent-fixtures.ts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { parseConnection } from "../../lib/onlyfans-connections/contract";
import { CONNECTION as connection, RECENT as recent, connectionResponse as response } from "./core-recent-fixtures";

const withRecent = (r: object) => parseConnection(response({ ...connection, recentHistory: r }), "of-1");

test("control: a core connection parses without recentHistory and with a valid one", () => {
  assert.equal(parseConnection(response(connection), "of-1")?.status, "verified");
  const parsed = withRecent(recent);
  assert.equal(parsed?.status, "verified");
  assert.equal(parsed?.recentHistory?.schemaVersion, "of-recent-history.v1");
});

test("control: an invalid required field or an aiLive contradiction still nulls the connection", () => {
  assert.equal(parseConnection(response({ ...connection, status: "bogus" }), "of-1"), null);
  const runner = { state: "running", reason: null, observedAt: "2026-11-02T03:00:00Z", stale: false, restarts: 0 };
  const live = { ...connection, outgoingEnabled: false, runner, aiLive: true };
  assert.equal(parseConnection(response({ ...live, aiLive: false }), "of-1")?.aiLive, false, "fixture runner must be valid");
  assert.equal(parseConnection(response(live), "of-1"), null);
  assert.equal(parseConnection(response({ ...live, recentHistory: recent }), "of-1"), null);
});

test("F4 A: a recentHistory stamped +00:00 does not null the connection (status and outgoing stay readable)", () => {
  const input = response({ ...connection, recentHistory: { ...recent, startedAt: "2026-11-02T03:00:00+00:00" } });
  const parsed = parseConnection(input, "of-1");
  assert.notEqual(parsed, null, "the whole connection was dropped over an optional diagnostic's timestamp format");
  assert.equal(parsed?.status, "verified");
  assert.equal(parsed?.outgoingEnabled, true);
  assert.equal(parsed && "recentHistory" in parsed, false, "the invalid block is dropped, not passed through");
  assert.ok("recentHistory" in input.connection, "the input is not mutated");
});

test("F4 B: a recentHistory count skew (ready + awaiting != discovered) does not null the connection", () => {
  const parsed = withRecent({ ...recent, initialHistory: { ...recent.initialHistory, conversationsDiscovered: 3 } });
  assert.notEqual(parsed, null, "the whole connection was dropped over a transient diagnostic count skew");
  assert.equal(parsed?.status, "verified");
  assert.equal(parsed?.outgoingEnabled, true);
  assert.equal(parsed?.recentHistory, undefined);
});

test("F4 C: a dropped recentHistory also drops sync, so the UI shows progress unavailable, never a stale \"import complete\"", () => {
  const sync = { discoveryStatus: "complete", pages: 1, conversationsComplete: 1, conversationsRemaining: 0, pendingMessages: 0, quarantinedMessages: 0, recoveryRequired: false, lastCompleteSyncAt: "2026-11-02T03:00:00Z" };
  assert.equal(parseConnection(response({ ...connection, sync }), "of-1")?.sync?.discoveryStatus, "complete", "fixture sync must be valid");
  const parsed = parseConnection(response({ ...connection, sync, recentHistory: { ...recent, startedAt: "2026-11-02T03:00:00+00:00" } }), "of-1");
  assert.equal(parsed?.outgoingEnabled, true);
  assert.equal(parsed && "sync" in parsed, false, "a stale sync block would render as Last import complete");
});
