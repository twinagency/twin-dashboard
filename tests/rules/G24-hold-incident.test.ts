// RULE G24 (W4 lib-onlyfans-preview-1 F1): availableActions (lib/onlyfans-preview/actions.ts) holds on deliveryHold, which reads
// the rollup AND the incident. A "sent" summary beside an "unknown"/"partial" incident offers no send, hand back or resume.
import assert from "node:assert/strict";
import test from "node:test";
import { deliveryHold } from "../../lib/onlyfans-preview/actions";
import type { DeliveryOutcome } from "../../lib/onlyfans-preview/types";
import { AUTOMATED, incident, offered, PAUSED, TAKEN_OVER } from "./W4-lib-onlyfans-preview-1-helpers";

test("control: sent with no incident offers send, hand back and resume; an unknown summary holds them", () => {
  const sentTakenOver = offered({ delivery: "sent", shape: TAKEN_OVER });
  assert.ok(sentTakenOver.includes("send_manual_message"), `offered: ${sentTakenOver}`);
  assert.ok(sentTakenOver.includes("release_takeover"), `offered: ${sentTakenOver}`);
  const sentPaused = offered({ delivery: "sent", shape: PAUSED });
  assert.ok(sentPaused.includes("resume_automation"), `offered: ${sentPaused}`);
  const held = offered({ delivery: "unknown", shape: TAKEN_OVER, incident: incident("unknown") });
  assert.ok(!held.includes("send_manual_message"), `offered: ${held}`);
  assert.ok(!held.includes("release_takeover"), `offered: ${held}`);
});

for (const outcome of ["unknown", "partial"] as const) {
  test(`F1: summary "sent" + incident "${outcome}" on a taken-over thread offers no send and no hand-back`, () => {
    const actions = offered({ delivery: "sent", shape: TAKEN_OVER, incident: incident(outcome) });
    assert.ok(!actions.includes("send_manual_message"), `send offered beside an unresolved ${outcome} incident: ${actions}`);
    assert.ok(!actions.includes("release_takeover"), `release offered beside an unresolved ${outcome} incident: ${actions}`);
  });

  test(`F1: summary "sent" + incident "${outcome}" on a paused thread offers no resume`, () => {
    const actions = offered({ delivery: "sent", shape: PAUSED, incident: incident(outcome) });
    assert.ok(!actions.includes("resume_automation"), `resume offered beside an unresolved ${outcome} incident: ${actions}`);
  });
}

test("deliveryHold (the rule G09 consumes): held or unrecognised incident withholds every send path and never a stop", () => {
  const outcomes: DeliveryOutcome[] = ["unknown", "partial", "dispatching", "something_new" as DeliveryOutcome];
  for (const outcome of outcomes) {
    const hold = deliveryHold("sent", { outcome });
    assert.equal(hold.held, true, outcome);
    assert.deepEqual([...hold.withheld].sort(), ["release_takeover", "resume_automation", "send_manual_message"], outcome);
  }
  assert.deepEqual(deliveryHold("sent", null), { held: false, withheld: [] });
  assert.equal(deliveryHold("sent", { outcome: "failed" }).held, false);
  const stops = offered({ delivery: "sent", shape: AUTOMATED, incident: incident("unknown") });
  for (const stop of ["pause_automation", "request_takeover", "mark_no_contact"]) assert.ok(stops.includes(stop as never), `${stop} missing: ${stops}`);
});
