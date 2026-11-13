// RULE G09 (W3 ui-onlyfans-preview-1 F8, REVIEW inv 7): a Pause whose outcome is unconfirmed keeps "Enable AI replies" disabled;
// only a confirmed Pause gives the go back. The Pause itself stays available. F7 (stop dropped while a go hangs) is not G09.
// Offline: jsdom, global fetch stubbed (https://fixture.invalid), window.confirm stubbed to true.
import { dom, bodyOf, button, click, close, http502, json, mount, posts, q, serve } from "../helpers/w3-preview1-dom";
import assert from "node:assert/strict";
import test, { after } from "node:test";
import React from "react";
import { accounts } from "../../lib/onlyfans-preview/fixtures";
import { createFixtureOnlyFansDataSource, operatorViewer } from "../../lib/onlyfans-preview/fixture-data-source";

after(close);
dom.window.confirm = () => true;
const account = accounts[0], viewer = operatorViewer(), source = createFixtureOnlyFansDataSource({ viewer });
const ACCOUNT = account.accountId, at = "2026-11-01T10:00:00.000Z";
const CONTROL = `/api/onlyfans-launch/automation/accounts/${encodeURIComponent(ACCOUNT)}/emergency-stop`;
const readiness = { readinessVersion: "of-launch-readiness.v1", observedAt: at, schemaRevision: "r1", readyToEnable: true, checks: [],
  accountControl: { enabled: true, bindingId: "binding-1", revision: 3, unresolvedOutgoing: 0, fingerprint: "b".repeat(64) },
  coverage: { storedMessages: 10, processedMessages: 10, providerTotalMessages: null, archiveComplete: true, pendingArchiveConversations: 0 },
  catalogue: { usableInspectedItems: 0, inspectedItems: 0, hasMore: false },
  autonomy: { accountEnabled: true, deliveryEnabled: true, automateNewConversations: false, engagementEnabled: false, existingAutomatedConversations: 0, workerCapabilities: {} },
  limits: [] };
const controlRead = () => json({ schemaVersion: "of-launch-b.v1", ok: true, accountId: ACCOUNT, readiness });
const pauseAck = () => json({ schemaVersion: "of-launch-b.v1", ok: true, accountId: ACCOUNT, command: { recorded: true } });
const pauses = () => posts().filter(call => call.url === CONTROL && bodyOf(call).action === "pause");

async function control(handler: Parameters<typeof serve>[0]) {
  serve(handler);
  const { default: AllFansControl } = await import("../../components/onlyfans-preview/AllFansControl");
  await mount(<AllFansControl account={account} viewer={viewer} source={source} onChanged={() => {}} />, "/onlyfans/inbox");
}
const enable = () => button(/^Enable AI replies for existing chats$/);
const pause = () => button(/^Pause account$/);
/** The control's own notice (AllFansControl.tsx:86). */
const status = () => q("[data-of-all-fans-controls] [role=status]")?.textContent ?? "";

test("control: a confirmed Pause reads the control fingerprint, sends one pause and says paused", async () => {
  await control(call => call.method === "GET" ? controlRead() : pauseAck());
  await click(pause());
  assert.deepEqual(pauses().map(call => bodyOf(call).expectedFingerprint), ["b".repeat(64)]);
  assert.match(status(), /Account paused/);
  assert.equal(enable()?.disabled, false, "after a confirmed pause the go is available again");
});

test("F8: after an unconfirmed pause, Enable AI replies stays disabled", async () => {
  await control(call => call.method === "GET" ? controlRead() : http502());
  await click(pause());
  assert.equal(pauses().length, 1, "the pause was sent");
  assert.match(status(), /could not be confirmed|unconfirmed/);
  assert.equal(enable()?.disabled, true, "a STOP whose outcome is unconfirmed keeps the go disabled");
});
