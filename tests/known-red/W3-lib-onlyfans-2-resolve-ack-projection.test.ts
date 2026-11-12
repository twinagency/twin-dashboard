// KNOWN RED (W3-lib-onlyfans-2 C2C3, C2S 8; REVIEW.md inv 6 "Secrets ... never reach the browser" + inv 4's projection
// rule (allowlist projection, never a spread of an upstream object)): lib/onlyfans/launch/a-backend.ts:137 returns the
// upstream ledger/resolve ack's `command` object as-is, so every field the control backend adds (e.g. an
// `op-session:` actor hash, internal notes) is forwarded to the browser by a-route.ts:46. The sibling ledger/retry
// branch on the same line already projects to named fields ({outcome, queuedAt}).
// Fixed: ledger/resolve returns a named projection (e.g. {recorded, commandKey}); unknown fields are withheld by default.
// Team's Claude owns the fix; not wired into npm scripts.
import assert from "node:assert/strict";
import test from "node:test";
import { createLaunchBackend } from "../../lib/onlyfans/launch/a-backend";
import { CONTROL_SCHEMA } from "../../lib/onlyfans/controls";

const BASE = "https://backend.invalid";
const KEY = "c".repeat(64);

function acking(ack: Record<string, unknown>) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    calls.push(String(url));
    return new Response(JSON.stringify(ack), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const backend = (fetchImpl: typeof fetch) => createLaunchBackend({ baseUrl: BASE, token: "", controlToken: "synthetic-token", fetchImpl });

test("control: a ledger/retry ack is projected to named fields", async () => {
  const fake = acking({
    schemaVersion: CONTROL_SCHEMA, ok: true, accountId: "of-a", accepted: true, outcome: "queued",
    commandKey: KEY, queuedAt: "2026-11-12T10:00:00Z", actor: "op-session:synthetic", extra: 1,
  });
  const result = await backend(fake.fetchImpl).command("of-a", "ledger/retry", { entryId: "1", actor: "operator:synthetic", commandKey: KEY });
  assert.deepEqual(fake.calls, [`${BASE}/onlyfans/control/v1/accounts/of-a/ledger/retry`]);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.data, { outcome: "queued", queuedAt: "2026-11-12T10:00:00Z" });
});

test("C2C3: a ledger/resolve ack does not forward upstream-only fields", async () => {
  const fake = acking({
    schemaVersion: CONTROL_SCHEMA, ok: true, accountId: "of-a",
    command: { recorded: true, commandKey: KEY, actor: "op-session:synthetic", extra: 1 },
  });
  const result = await backend(fake.fetchImpl).command("of-a", "ledger/resolve", {
    expectedFingerprint: "b".repeat(64), evidenceHash: "e".repeat(64), reason: "synthetic check", actor: "operator:synthetic", commandKey: KEY,
  });
  assert.deepEqual(fake.calls, [`${BASE}/onlyfans/control/v1/accounts/of-a/ledger/resolve`]);
  assert.equal(result.ok, true);
  if (result.ok) {
    const keys = Object.keys(result.data as Record<string, unknown>);
    assert.ok(!keys.includes("actor") && !keys.includes("extra"), `a-backend.ts:137 forwards the upstream command unprojected: ${keys.join(",")}`);
  }
});
