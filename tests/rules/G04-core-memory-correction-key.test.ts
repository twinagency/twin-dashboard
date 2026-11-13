/**
 * RULE G04, was KNOWN RED (W1 lane 4 F2; REVIEW.md invariant 7 "No send, no auto-retry": every upstream write carries an idempotency key that
 * a user retry reuses). lib/onlyfans/launch/b-native-routes.ts:154-160: `actor = named ?? g.ctx.actor!` and the commandKey hashes
 * that actor (`identity()`, :160). `planCOwnerActor` (lib/onlyfans/plan-c-owner-core.ts:14,18) returns null on any Supabase
 * non-OK answer or timeout, so the same operator retrying the same correction gets a different actor AND a different commandKey.
 * Drives the REAL memory fan PATCH route (app/api/onlyfans-launch/memory/accounts/[accountId]/fans/[fanId]/route.ts -> memoryFan)
 * through tests/rules/core-route.child.ts (see its header for what is replaced); the owner lookup is the real core against a fake
 * Supabase wire that answers a UUID, then a 503.
 * Control: the lookup resolves both times -> both corrections POSTs carry the identical commandKey.
 * Turns green when every backend corrections POST for the same correction carries the same commandKey: either the key comes
 * from one stable actor, or a failed lookup refuses before calling upstream (zero POSTs on that attempt).
 * Green since G04: memoryFan refuses 503 before upstream when namedOwnerActor reports the lookup unavailable.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { coreRouteChild } from "./core-fixtures";

const HEX64 = /^[a-f0-9]{64}$/;
/** Every key the backend received is a real sha256 hex (a missing key must not make "all keys equal" pass vacuously). */
const assertKeys = (keys: unknown[]) => { for (const key of keys) assert.match(String(key), HEX64, `backend POST without a sha256 commandKey: ${String(key)}`); };

test("control: the owner lookup resolves on both attempts, so both corrections POSTs carry the identical commandKey", () => {
  const r = coreRouteChild("memory-stable");
  assert.equal(r.keys.length, 2, "both identical corrections reach the backend");
  assertKeys(r.keys);
  assert.equal(r.keys[0], r.keys[1]);
});

test("F2: the owner lookup fails on the retry; every corrections POST for the same correction still carries one commandKey", () => {
  const r = coreRouteChild("memory-flap");
  assert.ok(r.keys.length >= 1, "the first attempt (lookup resolved) reaches the backend");
  assertKeys(r.keys);
  assert.equal(new Set(r.keys).size, 1, `the retry of the same correction was sent under ${new Set(r.keys).size} different commandKeys`);
});
