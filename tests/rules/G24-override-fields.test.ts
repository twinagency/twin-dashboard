// RULE G24 R2 (#12): EVERY control-panel override (each PreviewControls field whose default is null) reaches the reads and the
// simulator, with no "is this field set" guard in buildScenarios to keep in step. A new nullable field fails to compile here
// until it is given a value below, and then fails at runtime if it is inert. Plant-red: restoring a guard that omits one field.
import assert from "node:assert/strict";
import test from "node:test";
import { availableActions, createCommandRequest } from "../../lib/onlyfans-preview/actions";
import { createFixtureOnlyFansDataSource, operatorViewer } from "../../lib/onlyfans-preview/fixture-data-source";
import { ACCOUNT_AVA, accounts, conversationDetails } from "../../lib/onlyfans-preview/fixtures";
import { buildScenarios, DEFAULT_CONTROLS, type PreviewControls } from "../../lib/onlyfans-preview/scenarios";
import type { AvailableAction, CommandPayload } from "../../lib/onlyfans-preview/types";
import { dataOf } from "./W4-lib-onlyfans-preview-1-helpers";

type Override = { [K in keyof PreviewControls]: null extends PreviewControls[K] ? K : never }[keyof PreviewControls];
const VALUE: { [K in Override]: NonNullable<PreviewControls[K]> } =
  { health: "disconnected", automationMode: "paused", takeoverState: "requested", delivery: "unknown" };
const THREAD = "of-conv-ava-1001";
const ACTIONS = Object.keys({ send_manual_message: 1, pause_automation: 1, resume_automation: 1, request_takeover: 1, release_takeover: 1,
  mark_no_contact: 1, resolve_delivery_evidence: 1 } satisfies Record<AvailableAction, 1>) as AvailableAction[];
const fixture: Record<Override, unknown> = { health: accounts.find(a => a.accountId === ACCOUNT_AVA)!.health,
  ...(({ automationMode, takeoverState, delivery }) => ({ automationMode, takeoverState, delivery }))(conversationDetails[THREAD].summary) };

test("control: the overrides are exactly the null-default controls", () => {
  const nullable = Object.keys(DEFAULT_CONTROLS).filter(key => DEFAULT_CONTROLS[key as keyof PreviewControls] === null);
  assert.deepEqual(nullable.sort(), Object.keys(VALUE).sort());
});

for (const key of Object.keys(VALUE) as Override[]) {
  test(`#12: the ${key} override reaches every read and the simulator`, async () => {
    assert.notEqual(VALUE[key], fixture[key], "fixture: the value must differ from the thread's own");
    const viewer = operatorViewer();
    const source = createFixtureOnlyFansDataSource({ viewer, scenarios: buildScenarios({ ...DEFAULT_CONTROLS, [key]: VALUE[key] }, viewer) });
    const account = dataOf(await source.getAccount(ACCOUNT_AVA))!, listed = dataOf(await source.listAccounts())!.find(a => a.accountId === ACCOUNT_AVA)!;
    const detail = dataOf(await source.getConversation(ACCOUNT_AVA, THREAD))!;
    const row = dataOf(await source.listConversations(ACCOUNT_AVA))!.items.find(item => item.conversationId === THREAD)!;
    const read = key === "health" ? [account.health, listed.health] : [detail.summary[key], row[key]];
    assert.deepEqual(read, [VALUE[key], VALUE[key]], "a read does not carry the override");
    const offered = availableActions({ account, summary: detail.summary, viewer, deliveryIncident: detail.deliveryIncident }).available.map(a => a.action);
    for (const action of ACTIONS) {
      const payload: CommandPayload = action === "send_manual_message" ? { kind: "manual_message", body: "hello" }
        : action === "resolve_delivery_evidence" ? { kind: "delivery_resolution", attemptId: detail.deliveryIncident?.attemptId ?? "none", decision: "delivered", providerMessageId: "123" }
        : { kind: "none" };
      const result = await source.submitCommand(createCommandRequest({ command: action, accountId: ACCOUNT_AVA, conversationId: THREAD,
        expectedRevision: detail.summary.revision, payload }));
      assert.equal(result.accepted, offered.includes(action), `${action}: simulator ${result.accepted ? "accepts" : `refuses (${result.refusalReason})`}`);
    }
  });
}
