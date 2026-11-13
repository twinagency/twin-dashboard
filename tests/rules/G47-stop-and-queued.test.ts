// Rule (W4 lib-onlyfans-preview-1 F2, F3, lib/onlyfans-preview/actions.ts): a stop (pause_automation, mark_no_contact) stays
// offered on a degraded account whose pauseAutomation capability is unavailable; a manual send is not offered on a taken-over
// thread while an automated reply is queued or generating, so the two cannot both land.
// Control: on Ava's healthy account an automated thread offers pause + no-contact, and a "sent" taken-over thread offers send.
import assert from "node:assert/strict";
import test from "node:test";
import { availableActions } from "../../lib/onlyfans-preview/actions";
import { accounts, conversationDetails, ACCOUNT_NOVA } from "../../lib/onlyfans-preview/fixtures";
import { operatorViewer } from "../../lib/onlyfans-preview/fixture-data-source";
import { AUTOMATED, AVA_ACCOUNT, TAKEN_OVER, offered } from "../rules/W4-lib-onlyfans-preview-1-helpers";

const NOVA = accounts.find(a => a.accountId === ACCOUNT_NOVA)!;
const onNova = () => {
  const summary = { ...conversationDetails["of-conv-ava-1003"].summary, ...AUTOMATED, delivery: "sent" as const };
  return availableActions({ goHold: null, account: NOVA, summary, viewer: operatorViewer() }).available.map(a => a.action);
};

test("control: healthy account offers pause and no-contact on an automated thread; send on a sent taken-over thread", () => {
  const auto = offered({ delivery: "sent", shape: AUTOMATED });
  assert.ok(auto.includes("pause_automation") && auto.includes("mark_no_contact"), `offered: ${auto}`);
  assert.ok(offered({ delivery: "sent", shape: TAKEN_OVER }).includes("send_manual_message"));
  assert.equal(AVA_ACCOUNT.health, "connected");
  assert.equal(NOVA.health, "expired_session");
});

test("F2: an expired-session account still offers pause and mark no further contact", () => {
  const actions = onNova();
  assert.ok(actions.includes("pause_automation"), `pause blocked on a degraded account: ${actions}`);
  assert.ok(actions.includes("mark_no_contact"), `no-contact blocked on a degraded account: ${actions}`);
});

for (const delivery of ["queued", "generating"] as const) {
  test(`F3: a "${delivery}" automated reply holds the manual send on a taken-over thread`, () => {
    const actions = offered({ delivery, shape: TAKEN_OVER });
    assert.ok(!actions.includes("send_manual_message"), `manual send offered while a reply is ${delivery}: ${actions}`);
  });
}
