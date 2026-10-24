// "Connected" is not "AI live". The status line says live only when the backend proves it.
// Run: npm run test:ai-live  (uses the scripts tsconfig for the server-only stub)
import assert from "node:assert/strict";
import { createConnectionBackend } from "../lib/onlyfans-connections/backend";
import { parseConnection, CONNECTION_SCHEMA, type Connection, type ConnectionRunner } from "../lib/onlyfans-connections/contract";
import { connectionAiStatus } from "../lib/onlyfans-connections/presentation";

const now = Date.parse("2026-10-24T00:00:00Z");
const base: Connection = { accountId: "of-123", revision: 2, status: "verified", ownerId: "123", expiresAt: new Date(now + 60000).toISOString(),
  verifiedAt: new Date(now - 60000).toISOString(), lastError: null, outgoingEnabled: true, policyRevision: 1, usedUnits: 0, limitUnits: 10, mediaEnabled: false, automateNewConversations: false };
const runner = (over: Partial<ConnectionRunner> = {}): ConnectionRunner => ({ state: "running", reason: null, observedAt: new Date(now).toISOString(), stale: false, restarts: 0, ...over });
const read = (connection: unknown) => ({ schemaVersion: CONNECTION_SCHEMA, ok: true, connection });
const parse = (extra: Record<string, unknown>) => parseConnection(read({ ...base, ...extra }), base.accountId);

// Older API: no new fields, still parses, shows nothing.
assert(parse({}));
assert.equal(connectionAiStatus(parse({})), null);

// Live only when aiLive and a fresh running runner.
assert.deepEqual(connectionAiStatus(parse({ runner: runner(), aiLive: true })), { live: true, text: "AI live" });

// Not live: held (with reason), unknown, stale, restarting, not supervised, running with sending off.
assert.equal(connectionAiStatus(parse({ runner: runner({ state: "held", reason: "operator_hold" }), aiLive: false }))?.text, "AI not running (held: operator hold)");
assert.equal(connectionAiStatus(parse({ runner: runner({ state: "held" }), aiLive: false }))?.text, "AI not running (held)");
assert.equal(connectionAiStatus(parse({ runner: runner({ state: "unknown", reason: "status_unavailable", observedAt: null }), aiLive: false }))?.text, "AI not running (status unknown)");
assert.equal(connectionAiStatus(parse({ runner: runner({ state: "unknown", reason: "status_stale", stale: true }), aiLive: false }))?.text, "AI not running (status out of date)");
assert.equal(connectionAiStatus(parse({ runner: runner({ state: "restarting", restarts: 3 }), aiLive: false }))?.text, "AI not running (restarting)");
assert.equal(connectionAiStatus(parse({ runner: runner({ state: "not_supervised" }), aiLive: false }))?.text, "AI not running (not started)");
assert.equal(connectionAiStatus(parse({ outgoingEnabled: false, runner: runner(), aiLive: false }))?.text, "AI not running (sending is off)");
// A stale or non-running status never reads as live even if a client were handed a true flag.
const lying = { ...base, aiLive: true, runner: runner({ stale: true }) } as Connection;
assert.equal(connectionAiStatus(lying)?.live, false);
assert.equal(connectionAiStatus({ ...base, aiLive: true, runner: runner({ state: "unknown" }) } as Connection)?.live, false);

// Strict parsing: unknown keys, bad shapes, half-present fields and contradictions are rejected.
for (const bad of [
  { runner: runner(), aiLive: true, extra: 1 }, { runner: { ...runner(), extra: 1 }, aiLive: true }, { runner: runner() }, { aiLive: false },
  { runner: runner({ state: "invented" as never }), aiLive: false }, { runner: runner({ reason: "has space" }), aiLive: false },
  { runner: runner({ stale: "no" as never }), aiLive: false }, { runner: runner({ restarts: -1 }), aiLive: false },
  { runner: runner({ observedAt: "yesterday" }), aiLive: false }, { runner: null, aiLive: false }, { runner: runner(), aiLive: "yes" },
  { runner: runner({ stale: true }), aiLive: true }, { runner: runner({ state: "held" }), aiLive: true }, { runner: runner({ state: "unknown" }), aiLive: true },
  { outgoingEnabled: false, runner: runner(), aiLive: true },
]) assert.equal(parse(bad as Record<string, unknown>), null, JSON.stringify(bad));
assert(parse({ runner: runner(), aiLive: true, sync: { discoveryStatus: "complete", pages: 1, conversationsComplete: 1, conversationsRemaining: 0, pendingMessages: 0, quarantinedMessages: 0, recoveryRequired: false, lastCompleteSyncAt: null } }), "runner and sync together");

// The backend request asks for the runner view.
(async () => {
  let url = "";
  const backend = createConnectionBackend({ baseUrl: "http://connections.invalid", token: "t".repeat(40),
    fetchImpl: (async (input: RequestInfo | URL) => { url = String(input); return new Response(JSON.stringify(read({ ...base, runner: runner(), aiLive: true })), { status: 200, headers: { "content-type": "application/json" } }); }) as typeof fetch });
  const result = await backend.get(base.accountId);
  assert.match(url, /\/accounts\/of-123\?.*runner=1/);
  assert(result.ok && result.data.aiLive === true);
  console.log("PASS ai live: strict runner/aiLive parsing, older API unchanged, never live when unknown/stale/held, request asks runner=1.");
})();
