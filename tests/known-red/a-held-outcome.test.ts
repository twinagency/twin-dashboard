// KNOWN RED (rule a, docs/RISKS.md): the engine reports actionOutcome "held" (a send stopped by a hold, the only way a
// budget or policy hold reaches a request row), and lib/onlyfans/engine-status.ts:42 accepts it, but engineRequestLabel
// (engine-status.ts:132-155) has no case for it: a held send reads "Request in progress" or "Reply completed".
// Holds must always be visible. Team's Claude owns the fix. Not wired into npm scripts; init.sh reports it.
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
