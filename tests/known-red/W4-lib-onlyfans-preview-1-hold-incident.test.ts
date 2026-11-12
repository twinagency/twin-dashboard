// KNOWN RED (W4 lib-onlyfans-preview-1 F1): availableActions (lib/onlyfans-preview/actions.ts:98,142) holds sends only on
// summary.delivery and ignores deliveryIncident.outcome. A summary that says "sent" next to an incident that says
// "unknown"/"partial" offers send_manual_message, release_takeover and resume_automation beside "Delivery needs
// resolving". An unresolved delivery must block every action that can start another send, whichever field reports it.
// Team's Claude owns the fix. Not wired into npm scripts or init.sh (lane may not edit init.sh; window close wires it).
import assert from "node:assert/strict";
import test from "node:test";
import { incident, offered, PAUSED, TAKEN_OVER } from "../rules/W4-lib-onlyfans-preview-1-helpers";

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
