// Rule (G47, REVIEW inv 7 "No false success"): a held, unknown, in-flight, refused or not accepted send never reads sent,
// offered, recorded or purchased. A row's money and offer wording is read from engineRequestPurchase, the reading the chip
// shows, so the label and the chip on one row cannot disagree. A refusal or cancellation is worded for any action.
// Offline: parsed synthetic rows, no fetch.
import assert from "node:assert/strict";
import test from "node:test";
import { engineRequestLabel, engineRequestPurchase, parseEngineRequest } from "../../lib/onlyfans/engine-status";

const row = (extra: Record<string, unknown>) => {
  const parsed = parseEngineRequest({ requestId: "0a1b2c3d-1111-4222-8333-444455556661", sourceMessageId: "7", status: "open", owner: "engine",
    nextStep: "none", actionOutcome: "accepted", actionType: "offer", revision: 1, ...extra });
  assert.ok(parsed, "the fixture parses");
  return parsed;
};

test("control: an accepted offer awaiting access reads Purchase recorded, with a Purchased chip", () => {
  const request = row({ status: "waiting_provider", nextStep: "verify_access" });
  assert.equal(engineRequestLabel(request), "Purchase recorded; access is not yet confirmed");
  assert.equal(engineRequestPurchase(request)?.state, "purchased");
});

test("a refused, not accepted or queued offer awaiting access never reads Purchase recorded", () => {
  const wrong: string[] = [];
  for (const actionOutcome of ["refused", "not_accepted", "queued"]) {
    const request = row({ status: "waiting_provider", nextStep: "verify_access", actionOutcome });
    const label = engineRequestLabel(request), chip = engineRequestPurchase(request)?.state;
    if (/purchase recorded/i.test(label) || chip) wrong.push(`${actionOutcome}: ${label} / chip ${chip}`);
  }
  assert.deepEqual(wrong, []);
});

test("a completed reply still dispatching never reads Reply completed", () => {
  assert.notEqual(engineRequestLabel(row({ status: "completed", actionType: "reply", actionOutcome: "dispatching" })), "Reply completed");
});

test("an offer still in flight reads Offer not yet sent", () => {
  for (const actionOutcome of ["ready", "queued", "dispatching"])
    assert.equal(engineRequestLabel(row({ status: "waiting_fan", nextStep: "await_purchase_or_question", actionOutcome })), "Offer not yet sent", actionOutcome);
});

test("a refused or cancelled offer is not worded as a reply", () => {
  for (const actionOutcome of ["refused", "cancelled"]) assert.doesNotMatch(engineRequestLabel(row({ status: "open", actionOutcome })), /reply/i, actionOutcome);
});

test("explicit Unlocked evidence on a held send: the chip does not claim access the label puts under review", () => {
  const request = row({ status: "completed", actionOutcome: "held", purchase: { state: "unlocked", amountCents: 1500 } });
  assert.equal(engineRequestLabel(request), "Send held; review required");
  assert.equal(engineRequestPurchase(request)?.state, "held_for_review");
});
