// KNOWN RED (REVIEW.md inv 7 "Holds and STOP": a STOP is never harder to trigger than a go; "No false success"; W1 lane 3 F7, F8).
// F7: validPreparationCommand (preparation.ts:29-30) requires expectedRevision for `stop` as well as `configure`, so a stop
//     is revision-gated (same shape as RISKS R13). The UI half (Stop disabled while a configure retry is pending,
//     Preparation.tsx:64,91) belongs to lane 7b and is not tested here.
// F8: the preparation ack (preparation-backend.ts:14) checks schema, account and commandKey but not that the state matches
//     the action: a stop answered 200 with status "configured" returns ok. Harm (inferred): the UI shows its generic
//     "Preparation saved." notice after a stop that did not take (Preparation.tsx:57), then the refresh shows "configured".
// Shared stub: tests/helpers/w1-commerce-preparation-stub.ts (an F7 fix that drops expectedRevision from the stop type
// needs a TEST-CHANGE there).
// Team's Claude owns the fix. Not wired into npm scripts; init.sh does not list it yet (lane 10/orchestrator wires it).
import assert from "node:assert/strict";
import test from "node:test";
import { validPreparationCommand } from "../../lib/onlyfans/preparation";
import { HASH, preparationConfig as config, preparationState, sendPreparationStop } from "../helpers/w1-commerce-preparation-stub";

const REQUEST_ID = "0a1b2c3d-1111-4222-8333-444455556661";

// The control keeps only the configure half: a correct F7 fix may refuse or ignore a revision on stop.
// "A stop acked with status stopped is ok" is pinned once, in tests/rules/w1-commerce-holds.test.ts (m13).
test("control: a configure with a valid config is a valid command", () => {
  assert.equal(validPreparationCommand({ action: "configure", expectedRevision: 3, requestId: REQUEST_ID, reason: "prepare", config }), true);
});

test("F7: a stop needs no revision", () => {
  assert.equal(validPreparationCommand({ action: "stop", requestId: REQUEST_ID, reason: "stop spending" }), true, "STOP must not be harder than a go");
});

test("F8: a stop acked with status configured is not a confirmed stop", async () => {
  assert.equal((await sendPreparationStop(HASH, { commandKey: HASH, preparation: preparationState({ status: "configured" }) })).ok, false,
    "200 with preparation still configured claims a stop without evidence");
});
