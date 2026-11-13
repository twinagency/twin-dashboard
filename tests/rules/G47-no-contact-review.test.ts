// Rule (G47, REVIEW inv 7 "unknown-delivery holds win"): an unknown or held send needs a person whatever else the row says.
// It sits under Needs attention and its label asks for that review; "Contact stopped" never hides it.
// Offline: parsed synthetic rows, no fetch.
import assert from "node:assert/strict";
import test from "node:test";
import { engineRequestLabel, isUnresolvedRequest, parseEngineRequest } from "../../lib/onlyfans/engine-status";

const row = (extra: Record<string, unknown>) => {
  const parsed = parseEngineRequest({ requestId: "0a1b2c3d-1111-4222-8333-444455556661", sourceMessageId: "7", owner: "engine",
    nextStep: "no_contact", actionType: "reply", revision: 1, ...extra });
  assert.ok(parsed, "the fixture parses");
  return parsed;
};

test("control: a settled no-contact row reads Contact stopped", () => {
  assert.equal(engineRequestLabel(row({ status: "completed", actionOutcome: "accepted" })), "Contact stopped at the fan’s request");
});

test("an unknown or held send under no-contact sits under Needs attention and never reads Contact stopped", () => {
  const wrong: string[] = [];
  for (const status of ["open", "completed", "cancelled", "declined"]) for (const actionOutcome of ["unknown", "held"]) {
    const request = row({ status, actionOutcome }), label = engineRequestLabel(request);
    if (!isUnresolvedRequest(request) || /contact stopped/i.test(label)) wrong.push(`${status}/${actionOutcome}: ${label}`);
  }
  assert.deepEqual(wrong, []);
});
