// KNOWN RED (W1 lane 2 finding 3, docs/review/W1/lib-onlyfans-engine.md; REVIEW inv 7 "No false success"): an offer
// request waiting_fan/await_purchase_or_question reads "Offer sent; purchase is not confirmed" (engine-status.ts:141) and
// chips "Offered" (:128) whatever its actionOutcome. With not_accepted, refused or cancelled the outcome checks at :142 and
// :145 are never reached, so a send that did not go out is shown as sent; with unknown the label asks for review (:134)
// but the chip still claims "Offered". Backend emitting these combinations: guess. Team's Claude owns the fix.
// Not run by init.sh or npm yet: listed under '## Wiring (orchestrator)' in docs/review/W1/lib-onlyfans-engine.md.
import assert from "node:assert/strict";
import test from "node:test";
import { engineRequestLabel, engineRequestPurchase, parseEngineRequest } from "../../lib/onlyfans/engine-status";

const waitingOffer = (actionOutcome: string) => {
  const parsed = parseEngineRequest({ requestId: "12345678-1234-1234-1234-123456789abc", sourceMessageId: "1", status: "waiting_fan", owner: "engine",
    nextStep: "await_purchase_or_question", actionOutcome, actionType: "offer" });
  assert.ok(parsed, `fixture with outcome ${actionOutcome} must parse`);
  return parsed;
};

test("control: an accepted offer waiting for the fan reads as sent, purchase not confirmed", () => {
  const request = waitingOffer("accepted");
  assert.equal(engineRequestLabel(request), "Offer sent; purchase is not confirmed");
  assert.equal(engineRequestPurchase(request)?.state, "offered");
});

test("finding 3: an offer whose send was not accepted, refused or cancelled is never shown as sent or offered", () => {
  // Every outcome is checked before asserting, so a red run lists all of them.
  const claims: string[] = [];
  for (const actionOutcome of ["not_accepted", "refused", "cancelled"]) {
    const request = waitingOffer(actionOutcome);
    const label = engineRequestLabel(request), chip = engineRequestPurchase(request)?.state;
    if (/offer sent/i.test(label)) claims.push(`${actionOutcome}: label "${label}"`);
    if (chip === "offered") claims.push(`${actionOutcome}: chip offered`);
  }
  assert.deepEqual(claims, [], "a send that did not go out must not read as sent or chip as Offered");
});

test("finding 3: an offer whose delivery outcome is unknown is never chipped as offered", () => {
  const request = waitingOffer("unknown");
  assert.doesNotMatch(engineRequestLabel(request), /offer sent/i, "the label already avoids claiming a send");
  assert.notEqual(engineRequestPurchase(request)?.state, "offered", "an unknown delivery must not chip as Offered");
});
