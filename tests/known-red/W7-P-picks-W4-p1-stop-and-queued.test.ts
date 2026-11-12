// KNOWN RED (W4 lib-onlyfans-preview-1 F2, F3; docs/review/W4/lib-onlyfans-preview-1.md): lib/onlyfans-preview/actions.ts
// F2: pause_automation and mark_no_contact need the pauseAutomation capability (:75-83,126-131), which the fixtures mark
// unavailable on an expired/disconnected session, so a stop (our own state, no provider write) is blocked on degraded accounts.
// F3: a manual send is offered on a taken-over thread while summary.delivery is "queued"/"generating" (only
// dispatching/accepted_pending/unknown/partial hold, :52), so a queued automated reply and a manual send can both land.
// Control: on Ava's healthy account an automated thread offers pause + no-contact, and a "sent" taken-over thread offers send.
// Run: nice -n 10 node --import tsx --test tests/known-red/W7-P-picks-W4-p1-stop-and-queued.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { availableActions } from "../../lib/onlyfans-preview/actions";
import { accounts, conversationDetails, ACCOUNT_NOVA } from "../../lib/onlyfans-preview/fixtures";
import { operatorViewer } from "../../lib/onlyfans-preview/fixture-data-source";
import { AUTOMATED, AVA_ACCOUNT, TAKEN_OVER, offered } from "../rules/W4-lib-onlyfans-preview-1-helpers";

const NOVA = accounts.find(a => a.accountId === ACCOUNT_NOVA)!;
const onNova = () => {
  const summary = { ...conversationDetails["of-conv-ava-1003"].summary, ...AUTOMATED, delivery: "sent" as const };
  return availableActions({ account: NOVA, summary, viewer: operatorViewer() }).available.map(a => a.action);
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
