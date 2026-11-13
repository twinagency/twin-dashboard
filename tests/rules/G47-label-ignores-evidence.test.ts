// Rule (W1 lane 2 finding 2, REVIEW inv 7 "No false success"): a completed offer's label follows the same purchase evidence as
// its chip, so explicit refunded, offered, purchased or held_for_review evidence never reads "Purchase and access confirmed".
import assert from "node:assert/strict";
import test from "node:test";
import { engineRequestLabel, engineRequestPurchase, parseEngineRequest } from "../../lib/onlyfans/engine-status";

/** A label that claims the purchase or access went through. "access is not yet confirmed" must not match. */
const CLAIMS_CONFIRMED = /(purchase|access)( and access)? confirmed|unlocked/i;
const completedOffer = (state: string) => {
  const parsed = parseEngineRequest({ requestId: "12345678-1234-1234-1234-123456789abc", sourceMessageId: "1", status: "completed", owner: "engine",
    nextStep: "none", actionOutcome: "completed", actionType: "offer", purchase: { state } });
  assert.ok(parsed, `fixture with purchase state ${state} must parse`);
  return parsed;
};

test("control: explicit unlocked evidence on a completed offer chips and labels as confirmed", () => {
  assert.doesNotMatch("Purchase recorded; access is not yet confirmed", CLAIMS_CONFIRMED, "the claim pattern must not catch the honest wording");
  assert.match("Purchase and access confirmed", CLAIMS_CONFIRMED);
  const request = completedOffer("unlocked");
  assert.equal(engineRequestPurchase(request)?.state, "unlocked");
  const label = engineRequestLabel(request);
  assert.ok(label.trim(), "the row has a label");
  assert.match(label, CLAIMS_CONFIRMED, "explicit unlocked evidence may claim access");
  assert.doesNotMatch(label, /not yet|no purchase/i);
});

test("finding 2: a completed offer whose explicit evidence is not unlocked never claims purchase or access", () => {
  // Every state is checked before asserting, so a red run lists all of them.
  // Each label must also name its own state (stem match, not exact wording), so one generic "not yet confirmed"
  // label for every state cannot pass while hiding a refund or a review hold.
  const NAMES: Record<string, RegExp> = { refunded: /refund|chargeback/i, offered: /offer/i, purchased: /purchase/i, held_for_review: /review|held/i };
  const wrong: string[] = [];
  for (const [state, name] of Object.entries(NAMES)) {
    const request = completedOffer(state);
    assert.equal(engineRequestPurchase(request)?.state, state, `the chip already shows ${state}`);
    const label = engineRequestLabel(request);
    if (CLAIMS_CONFIRMED.test(label) || !name.test(label)) wrong.push(`${state}: "${label}"`);
  }
  assert.deepEqual(wrong, [], "the label must follow the explicit evidence, never claim, and name the evidence state");
});
