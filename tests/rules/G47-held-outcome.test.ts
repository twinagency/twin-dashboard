// Rule (rule a, docs/RISKS.md): a held send (actionOutcome "held", how a budget or policy hold reaches a request row) always
// reads as held and needing review, never "Request in progress", "Reply completed" or any other settled state.
import assert from "node:assert/strict";
import test from "node:test";
import { engineRequestLabel, parseEngineRequest } from "../../lib/onlyfans/engine-status";

const row = (overrides: Record<string, unknown>) => {
  const parsed = parseEngineRequest({ requestId: "12345678-1234-1234-1234-123456789abc", sourceMessageId: "1", status: "open", owner: "engine",
    nextStep: "none", actionOutcome: null, actionType: "reply", ...overrides });
  assert.ok(parsed, "fixture must parse");
  return parsed;
};
const NOT_A_HOLD = /^(Request in progress|Reply completed|Request completed|Purchase and access confirmed|Waiting for the fan)$/;

test("control: an unknown delivery outcome is labelled as a hold", () => {
  assert.equal(engineRequestLabel(row({ actionOutcome: "unknown" })), "Delivery outcome needs review");
});

test("A-HELD: a held action outcome is shown as held, never as in progress or completed", () => {
  for (const status of ["open", "waiting_fan", "completed"]) {
    const label = engineRequestLabel(row({ status, actionOutcome: "held" }));
    assert.doesNotMatch(label, NOT_A_HOLD, `status ${status}: a held send must not read as "${label}"`);
    assert.match(label, /held|hold|review/i);
  }
});
