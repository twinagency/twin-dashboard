/**
 * RULE G04, was KNOWN RED (W1 lane 5 finding 4, handed over by lane 4 F10; REVIEW.md invariant 7 "No send, no auto-retry": an idempotency key
 * that a user retry reuses). app/api/onlyfans-controls/accounts/[accountId]/conversations/[conversationId]/requests/[requestId]/route.ts:39
 * hashes `ctx.actor` into the commandKey, and for the internal operator lib/onlyfans/route.ts:73 sets
 * `actor = op-session:sha256(session cookie)`. The same operator retrying the same command after signing in again (new cookie)
 * therefore sends a different commandKey for the same intent, and a different `actor`. The backend binds a handover to that exact
 * actor string (twin-onlyfans-backend b9261f45 service/conversation_engine/operator.py:78,84,92: accept needs
 * handover_target == actor, complete/decline need accepted_by == owner == actor; lib/onlyfans/engine-operator.ts:33 sends
 * `target: command.actor`), so a re-login between request, accept and resolve strands the request. The red therefore also
 * requires the posted actor to be equal across the two sessions: a fix that only stabilises the key stays red.
 * Drives the REAL route through tests/rules/controls-route.child.ts: two synthetic owner sessions (`owner_1…1`, `owner_2…2`), both
 * verified by the fake owner-session RPC (isAuthed is the real code), the same body sent under each; the fake backend records keys.
 * Controls: the same session sending the same command twice produces the same key (lane 4 CH3 proves the key's other inputs);
 * two distinct agency grants (different actor) sending the identical command produce DIFFERENT keys, so a fix that simply drops
 * the actor from the hash stays caught.
 * Turns green when the actor (and with it the key) comes from a stable principal (e.g. the named owner) instead of the session token.
 * Green since G04: the route opts in through authorizeOnlyFansRead `pilotIdentity` (lib/onlyfans/route.ts) and uses ctx.pilotActor, so the key and the posted actor
 * survive a re-sign-in; a lookup a retry could answer differently (here a 429) refuses 503 before upstream. ctx.actor itself stays
 * the session actor (uploads, tests/rules/G04-upload-session-actor.test.ts). A shared-password session (no named owner) keys by session.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { controlsChild } from "./controls-fixtures";

const run = () => controlsChild("requests");

test("control: the same operator session sending the same command twice reaches the backend with the same commandKey", () => {
  const r = run();
  assert.equal(r["session A"].posts, 1);
  assert.equal(r["session A again"].posts, 1);
  assert.ok(r["session A"].commandKey);
  assert.equal(r["session A again"].commandKey, r["session A"].commandKey);
});

test("control: two different agency members sending the identical command reach the backend with different commandKeys", () => {
  const r = run();
  assert.equal(r["agency user 1"].posts, 1);
  assert.equal(r["agency user 2"].posts, 1);
  assert.ok(r["agency user 1"].commandKey);
  assert.notEqual(r["agency user 2"].commandKey, r["agency user 1"].commandKey);
});

test("F4: the same command under a second valid operator session reaches the backend with the same commandKey and actor", () => {
  const r = run();
  assert.equal(r["session B"].posts, 1, "precondition: the second session's command reached the backend");
  assert.ok(r["session A"].actor, "precondition: the route posted an actor");
  assert.equal(r["session B"].commandKey, r["session A"].commandKey, "a new sign-in changed the idempotency key for the same intent");
  assert.equal(r["session B"].actor, r["session A"].actor, "a new sign-in changed the actor the backend binds the handover to");
});

test("F4: an owner lookup that answers 429 refuses 503 before upstream instead of falling back to the session actor", () => {
  const r = run();
  assert.equal(r["owner lookup 429"].status, 503);
  assert.equal(r["owner lookup 429"].posts, 0, "the refused command reached the backend");
});
