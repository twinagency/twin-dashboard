/**
 * RULE G04, was KNOWN RED (W1 lane 4 F2; REVIEW.md invariant 7 "No send, no auto-retry": every upstream write carries an idempotency key that
 * a user retry reuses). memoryFan (lib/onlyfans/launch/b-native-routes.ts) hashes the actor into the commandKey. Before G04 the
 * named-owner lookup returned null on any Supabase non-OK answer or timeout, the route fell back to the session actor, and the same
 * operator retrying the same correction got a different actor AND a different commandKey.
 * Since G04 the lookup lives once, in authorizeOnlyFansRead (lib/onlyfans/route.ts), so ctx.actor IS the named owner; namedOwnerActor
 * (lib/onlyfans/plan-c-owner-core.ts) is null only on a definite miss (404, or a 200 that says null) and "unavailable" on anything a
 * retry could answer differently (408/425/429/5xx, malformed 200, timeout, network), which refuses 503 before any upstream call.
 * Drives the REAL memory fan PATCH route through tests/rules/core-route.child.ts (see its header for what is replaced); the owner
 * lookup is the real core against a fake Supabase wire with a scripted answer per attempt.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { coreRouteChild } from "./core-fixtures";

const HEX64 = /^[a-f0-9]{64}$/;
/** Every key the backend received is a real sha256 hex (a missing key must not make "all keys equal" pass vacuously). */
const assertKeys = (keys: unknown[]) => { for (const key of keys) assert.match(String(key), HEX64, `backend POST without a sha256 commandKey: ${String(key)}`); };

test("control: the owner lookup resolves on both attempts, so both corrections POSTs carry the identical commandKey and actor", () => {
  const r = coreRouteChild("memory-stable");
  assert.deepEqual(r.statuses, [200, 200]);
  assert.equal(r.keys.length, 2, "both identical corrections reach the backend");
  assertKeys(r.keys);
  assert.equal(r.keys[0], r.keys[1]);
  assert.equal(new Set(r.actors).size, 1);
});

for (const [scenario, why] of [["memory-flap", "a 503"], ["memory-429", "a 429"], ["memory-malformed", "a malformed 200"]] as const) {
  test(`F2: the owner lookup answers ${why} on the retry, which refuses 503 before upstream instead of re-keying under the session actor`, () => {
    const r = coreRouteChild(scenario);
    assert.deepEqual(r.statuses, [200, 503]);
    assert.equal(r.keys.length, 1, "exactly one corrections POST: the refused attempt never reached the backend");
    assertKeys(r.keys);
    assert.equal(r.actors.length, 1);
  });
}

test("F2: the lookup is unavailable first and resolves on the retry; the one POST carries the same key and actor as a clean run", () => {
  const flap = coreRouteChild("memory-flap-back"), stable = coreRouteChild("memory-stable");
  assert.deepEqual(flap.statuses, [503, 200]);
  assert.equal(flap.keys.length, 1);
  assertKeys(flap.keys);
  assert.equal(flap.keys[0], stable.keys[0], "the retry after an outage sent a different commandKey for the same correction");
  assert.equal(flap.actors[0], stable.actors[0]);
});
