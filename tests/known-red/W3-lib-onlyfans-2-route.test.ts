// KNOWN RED (W3 lane lib-onlyfans-2, route harness). Drives the REAL engagementSettings / engagementActions handlers in
// lib/onlyfans/launch/b-native-routes.ts through bGate -> requireOnlyFansRead and the real configuration transport, with
// only next/headers, view-as-banner and plan-c-owner's `server-only` line replaced (see the .child.ts header).
//  - C4C1 (REVIEW.md inv 7, no false success on a stop): b-native-routes.ts:325-328 answers 200 ok:true to a cancel
//    whenever the ack parses and names the same actionId; it never checks cancelRequested or status. An ack of
//    status "accepted", cancelRequested false (no cancellation recorded) becomes ok:true, and EngagementPanel.tsx:304
//    then shows "Cancellation request recorded". Measured [m]: 200 {ok:true, action.status:"accepted"}.
//  - C4C3/C4S3 (inv 6, unfiltered upstream): parseEngagementSettings (native.ts:549-556) returns the upstream object
//    itself and b-native-routes.ts:234 spreads it into the browser reply, so any extra top-level upstream field reaches
//    the browser. Measured [m]: upstream `internalNote:"x"` and `backendOnlyHint:"y"` pass the parser and are in the 200 body.
// Not tested: C4C4 (memory for another fan). The memory read carries no fan id on the wire: parseNativeMemory
// (native.ts:393) has none, and the backend's {"memory": ...} reply (twin-onlyfans-backend launch_api.py:211-218,
// memory.py:165) has none; the only fan id, recovery.fanId, is already checked (native.ts:640).
// Team's Claude owns the fixes; not wired into npm scripts or init.sh's known-red loop (orchestrator decides).
// Offline: every fetch is faked at *.invalid origins; synthetic values only.
import assert from "node:assert/strict";
import test from "node:test";
import { runRoute as run } from "./W3-lib-onlyfans-2-route.spawn";

const ACTIONS = "/onlyfans/configuration/v1/accounts/of-a/engagement";

test("control: engagementSettings GET reaches the real handler and the fake configuration backend", () => {
  const r = run("settings-read");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.ok, true);
  assert.deepEqual(r.calls.map(c => `${c.method} ${c.path}`), [`GET ${ACTIONS}`]);
});

test("control: engagementActions refresh POST is relayed once and acknowledged", () => {
  const r = run("refresh");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.ok, true);
  assert.deepEqual(r.calls.map(c => `${c.method} ${c.path}`), [`POST ${ACTIONS}/actions/12345678-1234-4234-8234-123456789abc/refresh`]);
});

test("control: engagement cancel acked with cancelRequested:true / status cancelled answers 200 ok", () => {
  const r = run("cancel-confirmed");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.ok, true);
  assert.equal(r.calls.length, 1);
});

test("C4C1: a cancel whose ack shows no cancellation recorded (accepted, cancelRequested:false) is not ok", () => {
  const r = run("cancel-not-requested");
  assert.equal(r.calls.length, 1, "the cancel was relayed once");
  // An upstream 200 never proves not-applied (REVIEW.md inv 7 D7), so the only correct answer is unconfirmed, not refused.
  assert.notEqual(r.body.ok, true, `b-native-routes.ts:327 answers ok:true to an unrecorded cancel: ${JSON.stringify(r.body)}`);
  assert.notEqual(r.body.outcome, "refused", `an upstream 200 does not prove not-applied (D7): ${JSON.stringify(r.body)}`);
  assert.ok(r.status === 502 || r.body.outcome === "unconfirmed",
    `b-native-routes.ts:327 claims a stop the backend did not record: ${r.status} ${JSON.stringify(r.body)}`);
});

test("C4S3: engagementSettings GET does not forward an unknown upstream top-level field to the browser", () => {
  const r = run("settings-extra-field");
  // Preconditions: the read itself succeeds, so the red is about the leak, not a refused read.
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.ok, true);
  const wire = JSON.stringify(r.body);
  assert.ok(!wire.includes("internalNote"), "b-native-routes.ts:234 spreads the raw upstream object (native.ts:555 returns it unprojected)");
  assert.ok(!wire.includes("backendOnlyHint"), "a second unknown upstream field still reaches the browser (strip-one-name fix)");
});
