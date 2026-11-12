// KNOWN RED (W1 lane 7b F4, REVIEW.md inv 7 Holds and STOP: "A STOP is never harder to trigger than a go"): Preparation.tsx:64
// `held=readOnly||busy||!!pending` disables "Stop preparation" (:91) while an unconfirmed configure keeps "Retry same request" (the go, :92)
// enabled. Fixed = Stop is enabled whenever the go is. The lib-side STOP revision gate (preparation.ts:30) is lane 3 F7, not this.
// Team's Claude owns the fix. Not wired into npm scripts; init.sh does not run it yet. Offline: jsdom, global fetch stubbed, no network.
import assert from "node:assert/strict";
import test from "node:test";
import { button, hasButton, lostReply, openPreparation, preparationConfigured, preparationRead, savePreparationLimits, stubFetch } from "../helpers/w1-7b-dom";

const open = async () => {
  const stub = stubFetch({ read: () => preparationRead(preparationConfigured("fixture")), post: lostReply });
  await openPreparation(stub);
  return stub;
};

test("control: before any write, Stop preparation is offered and enabled", async () => {
  await open();
  assert.equal(button(/^Stop preparation$/)?.disabled, false);
});

test("F4: while a configure is unconfirmed and its retry is enabled, Stop preparation is enabled too", async () => {
  const stub = await open();
  await savePreparationLimits();
  assert.equal(stub.posts.length, 1);
  assert.equal(button(/^Retry same request$/)?.disabled, false, "precondition: the go (Retry same request) is enabled");
  assert.ok(hasButton(/^Stop preparation$/), "Stop preparation is still offered");
  assert.equal(button(/^Stop preparation$/)?.disabled, false, "a STOP is never harder to trigger than a go");
});
