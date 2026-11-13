// RULE G24 R1 (#2, #2b): the control-panel overrides live inside the fixture data source (buildScenarios), so the reads the
// controls are decided from and simulateCommand see the same thread. Measured before the fix: of-conv-ava-1001 forced to
// human_controlled + effective offered send and the simulator refused it (false refusal); of-conv-ava-1003 forced to delivery
// "unknown" withheld send and the simulator accepted it (false allow).
import assert from "node:assert/strict";
import test from "node:test";
import { availableActions, createCommandRequest } from "../../lib/onlyfans-preview/actions";
import { createFixtureOnlyFansDataSource, operatorViewer } from "../../lib/onlyfans-preview/fixture-data-source";
import { ACCOUNT_AVA } from "../../lib/onlyfans-preview/fixtures";
import { buildScenarios, DEFAULT_CONTROLS, type PreviewControls } from "../../lib/onlyfans-preview/scenarios";
import { dataOf } from "./W4-lib-onlyfans-preview-1-helpers";

/** What the controls offer from the source's own reads, and what the same source says when the send is submitted. */
async function sendViaControls(conversationId: string, patch: Partial<PreviewControls>) {
  const viewer = operatorViewer();
  const source = createFixtureOnlyFansDataSource({ viewer, scenarios: buildScenarios({ ...DEFAULT_CONTROLS, ...patch }, viewer) });
  const account = dataOf(await source.getAccount(ACCOUNT_AVA));
  const detail = dataOf(await source.getConversation(ACCOUNT_AVA, conversationId));
  assert.ok(account && detail, "fixture reads failed");
  const offered = availableActions({ account, summary: detail.summary, viewer, deliveryIncident: detail.deliveryIncident })
    .available.some(entry => entry.action === "send_manual_message");
  const result = await source.submitCommand(createCommandRequest({ command: "send_manual_message", accountId: ACCOUNT_AVA,
    conversationId, expectedRevision: detail.summary.revision, payload: { kind: "manual_message", body: "hello" } }));
  return { offered, accepted: result.accepted, detail, reason: result.refusalReason };
}

test("control: with no overrides the taken-over thread offers send and the simulator accepts it", async () => {
  const run = await sendViaControls("of-conv-ava-1003", {});
  assert.deepEqual([run.offered, run.accepted], [true, true]);
});

test("#2: a thread the panel forces to human_controlled + effective is offered send, and the simulator accepts it", async () => {
  const run = await sendViaControls("of-conv-ava-1001", { automationMode: "human_controlled", takeoverState: "effective" });
  assert.equal(run.detail.summary.automationMode, "human_controlled", "the read does not carry the override");
  assert.equal(run.offered, true);
  assert.equal(run.accepted, true, `simulator refused what the controls offer: ${run.reason}`);
});

test("#2b: a thread the panel forces to delivery unknown withholds send, and the simulator refuses it", async () => {
  const run = await sendViaControls("of-conv-ava-1003", { delivery: "unknown" });
  assert.equal(run.detail.summary.delivery, "unknown", "the read does not carry the override");
  assert.equal(run.offered, false);
  assert.equal(run.accepted, false, "simulator accepted a send the controls withhold");
  assert.equal(run.reason, "An earlier send is unresolved. Resolve its outcome before sending anything else.");
});

test("#2: a health override reaches getAccount and the simulator alike", async () => {
  const run = await sendViaControls("of-conv-ava-1003", { health: "disconnected" });
  assert.deepEqual([run.offered, run.accepted], [false, false]);
});
