/**
 * W4 lib-onlyfans-preview-1 C1 (rule a + REVIEW inv 7 "STOP never harder than go"): availableActions in
 * lib/onlyfans-preview/actions.ts, the function the live inbox asks which controls to render. While the conversation's
 * delivery is unresolved (dispatching, accepted_pending, unknown, partial) every action that can start another send
 * (manual send, resume, hand back) is withheld, and every stop-direction action (pause, take over, no contact) stays
 * offered. Characterization, green at HEAD; mutation proofs in tests/rules/mutations/W4-lib-onlyfans-preview-1/.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { DeliveryOutcome } from "../../lib/onlyfans-preview/types";
import { AUTOMATED, offered, PAUSED, TAKEN_OVER } from "./W4-lib-onlyfans-preview-1-helpers";

const UNRESOLVED: DeliveryOutcome[] = ["dispatching", "accepted_pending", "unknown", "partial"];

test("baseline: with delivery sent, send/hand back, resume, and pause/take over/no contact are each offered", () => {
  assert.ok(offered({ delivery: "sent", shape: TAKEN_OVER }).includes("send_manual_message"));
  assert.ok(offered({ delivery: "sent", shape: TAKEN_OVER }).includes("release_takeover"));
  assert.ok(offered({ delivery: "sent", shape: PAUSED }).includes("resume_automation"));
  for (const action of ["pause_automation", "request_takeover", "mark_no_contact"] as const) {
    assert.ok(offered({ delivery: "sent", shape: AUTOMATED }).includes(action), action);
  }
});

for (const delivery of UNRESOLVED) {
  test(`holds: ${delivery} delivery withholds manual send on a taken-over thread`, () => {
    const actions = offered({ delivery, shape: TAKEN_OVER });
    assert.ok(!actions.includes("send_manual_message"), `send offered: ${actions}`);
  });
  test(`holds: ${delivery} delivery withholds hand back on a taken-over thread`, () => {
    const actions = offered({ delivery, shape: TAKEN_OVER });
    assert.ok(!actions.includes("release_takeover"), `release offered: ${actions}`);
  });
  test(`holds: ${delivery} delivery withholds resume on a paused thread`, () => {
    const actions = offered({ delivery, shape: PAUSED });
    assert.ok(!actions.includes("resume_automation"), `resume offered: ${actions}`);
  });
  test(`stop stays open: ${delivery} delivery still offers pause on an automated thread`, () => {
    const actions = offered({ delivery, shape: AUTOMATED });
    assert.ok(actions.includes("pause_automation"), `pause withheld: ${actions}`);
  });
  test(`stop stays open: ${delivery} delivery still offers take over on an automated thread`, () => {
    const actions = offered({ delivery, shape: AUTOMATED });
    assert.ok(actions.includes("request_takeover"), `take over withheld: ${actions}`);
  });
  test(`stop stays open: ${delivery} delivery still offers mark no contact in every thread shape`, () => {
    for (const shape of [TAKEN_OVER, PAUSED, AUTOMATED]) {
      const actions = offered({ delivery, shape });
      assert.ok(actions.includes("mark_no_contact"), `no contact withheld (${shape.automationMode}): ${actions}`);
    }
  });
}
