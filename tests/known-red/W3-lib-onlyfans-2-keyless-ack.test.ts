// KNOWN RED (W3-lib-onlyfans-2 C3C N2, C3S F4; REVIEW.md inv 7 "No send, no auto-retry" (every upstream write carries an
// idempotency key) + "No false success" (acks need proof)): the commandKey echo check is optional.
//   lib/onlyfans/launch/native-backend.ts:52-55   configuration POST: a body with no commandKey skips the echo check, so
//                                                 any {schemaVersion, ok:true, accountId} 2xx is accepted as success
//   lib/onlyfans/launch/native-backend.ts:178,181 control: `j.command.commandKey === body.commandKey` is
//                                                 undefined === undefined when the caller sent no key
// Callers that build bodies without a key exist (b-native-routes.ts:194-201 backfill, :316-324 engagement, C3S F4), so a
// keyless write is sent with no idempotency key and any ack, including a replay for another command, reads as success.
// Fixed (B6): a keyless POST is refused pre-call, so no upstream call carries a body without a commandKey, and the
// result is not ok. A fix that still sends the keyless body and only rejects the ack stays red (the write went out
// with no idempotency key).
// Team's Claude owns the fix; not wired into npm scripts.
import assert from "node:assert/strict";
import test from "node:test";
import {
  createNativeConfigurationBackend,
  createNativeControlBackend,
} from "../../lib/onlyfans/launch/native-backend";
import { CONFIGURATION_SCHEMA } from "../../lib/onlyfans/configuration";
import { CONTROL_SCHEMA } from "../../lib/onlyfans/controls";

const BASE = "https://backend.invalid";
const TOKEN = "synthetic-token";

function acking(ack: Record<string, unknown>) {
  const calls: string[] = [];
  const bodies: unknown[] = [];
  const fetchImpl = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push(String(url));
    bodies.push(typeof init.body === "string" ? JSON.parse(init.body) as unknown : init.body ?? null);
    return new Response(JSON.stringify(ack), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { calls, bodies, fetchImpl };
}
/** Upstream calls whose body carries no string commandKey (a write sent with no idempotency key). */
const keylessSent = (bodies: unknown[]) =>
  bodies.filter(b => !(b !== null && typeof b === "object" && typeof (b as Record<string, unknown>).commandKey === "string")).length;

const configAck = (extra: Record<string, unknown> = {}) => ({ schemaVersion: CONFIGURATION_SCHEMA, ok: true, accountId: "of-a", ...extra });
const controlAck = (command: Record<string, unknown>) => ({ schemaVersion: CONTROL_SCHEMA, ok: true, accountId: "of-a", command });

// Positive controls: an always-fail echo check would turn these red.
test("control: a configuration ack echoing the same commandKey is ok", async () => {
  const fake = acking(configAck({ commandKey: "a".repeat(64) }));
  const write = createNativeConfigurationBackend({ baseUrl: BASE, token: TOKEN, fetchImpl: fake.fetchImpl });
  const result = await write("of-a", "engagement/settings", "POST", { settings: { enabled: true }, commandKey: "a".repeat(64) });
  assert.equal(fake.calls.length, 1, "the fake backend was reached once");
  assert.equal(result.ok, true);
});

test("control: a control ack recorded with the same commandKey is ok", async () => {
  const fake = acking(controlAck({ recorded: true, commandKey: "a".repeat(64) }));
  const write = createNativeControlBackend({ baseUrl: BASE, token: TOKEN, fetchImpl: fake.fetchImpl });
  const result = await write("of-a", "control", { action: "stop", reason: "synthetic check", commandKey: "a".repeat(64) });
  assert.equal(fake.calls.length, 1, "the fake backend was reached once");
  assert.equal(result.ok, true);
});

test("control: a configuration ack echoing a different commandKey is not ok", async () => {
  const fake = acking(configAck({ commandKey: "b".repeat(64) }));
  const write = createNativeConfigurationBackend({ baseUrl: BASE, token: TOKEN, fetchImpl: fake.fetchImpl });
  const result = await write("of-a", "engagement/settings", "POST", { settings: { enabled: true }, commandKey: "a".repeat(64) });
  assert.equal(fake.calls.length, 1, "the fake backend was reached once");
  assert.equal(fake.calls[0], `${BASE}/onlyfans/configuration/v1/accounts/of-a/engagement/settings`);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.outcome, "unconfirmed");
});

test("control: a control ack echoing a different commandKey is not ok", async () => {
  const fake = acking(controlAck({ recorded: true, commandKey: "b".repeat(64) }));
  const write = createNativeControlBackend({ baseUrl: BASE, token: TOKEN, fetchImpl: fake.fetchImpl });
  const result = await write("of-a", "control", { action: "stop", reason: "synthetic check", commandKey: "a".repeat(64) });
  assert.equal(fake.calls.length, 1, "the fake backend was reached once");
  assert.equal(fake.calls[0], `${BASE}/onlyfans/control/v1/accounts/of-a/control`);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.outcome, "unconfirmed");
});

test("N2: a keyless configuration write is never confirmed by a bare ack", async () => {
  const fake = acking(configAck());
  const write = createNativeConfigurationBackend({ baseUrl: BASE, token: TOKEN, fetchImpl: fake.fetchImpl });
  const result = await write("of-a", "engagement/settings", "POST", { settings: { enabled: true } });
  assert.ok(fake.calls.length <= 1);
  assert.equal(keylessSent(fake.bodies), 0, `native-backend.ts sends a configuration POST with no commandKey (${fake.calls.length} call(s))`);
  assert.equal(result.ok, false, `native-backend.ts:52-55 accepts a keyless write's ack as success (fetch called ${fake.calls.length}x)`);
});

test("N2: a keyless control write is never confirmed by a keyless ack", async () => {
  const fake = acking(controlAck({ recorded: true }));
  const write = createNativeControlBackend({ baseUrl: BASE, token: TOKEN, fetchImpl: fake.fetchImpl });
  const result = await write("of-a", "control", { action: "stop", reason: "synthetic check" });
  assert.ok(fake.calls.length <= 1);
  assert.equal(keylessSent(fake.bodies), 0, `native-backend.ts sends a control POST with no commandKey (${fake.calls.length} call(s))`);
  assert.equal(result.ok, false, `native-backend.ts:181 compares undefined === undefined (fetch called ${fake.calls.length}x)`);
});
