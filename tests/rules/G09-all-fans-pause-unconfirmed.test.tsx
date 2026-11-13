// RULE G09 (W3 ui-onlyfans-preview-1 F8, REVIEW inv 7): a Pause whose outcome is unconfirmed keeps "Enable AI replies" disabled;
// only a confirmed Pause gives the go back. The Pause itself stays available, including while an enable runs (FB1).
// Offline: jsdom, global fetch stubbed (https://fixture.invalid), window.confirm stubbed to true.
import { dom, bodyOf, button, calls, click, close, http502, json, mount, never, posts, q, serve, settle, unmount, type Call } from "../helpers/w3-preview1-dom";
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

test("FA6: after an unconfirmed pause the notice line says why Enable is off and names the way out, not a refresh", async () => {
  await control(call => call.method === "GET" ? controlRead() : http502());
  await click(pause());
  assert.match(status(), /Enable is off: the last pause was not confirmed\. Pause again/);
  assert.doesNotMatch(enable()?.title ?? "", /refresh/i, "the hold names a refresh that does not clear it");
});

// FB1: a brake outranks a go. Pause stays live through a running enable, stops it, and goes out on its own path.
const CONFIG = `/api/onlyfans-configuration/accounts/${encodeURIComponent(ACCOUNT)}`;
const controlReads = () => calls.filter(call => call.method === "GET" && call.url === CONTROL);
/** The enable's first read hangs until `release`, so the go is in flight when the brake is pressed. */
function hungEnable() {
  let release!: () => void;
  const held = new Promise<Response>(resolve => { release = () => resolve(json({})); });
  return { release, handler: (call: Call) => call.method === "GET" && call.url === CONFIG ? held : call.method === "GET" ? controlRead() : pauseAck() };
}

test("FB1: Pause during an in-flight enable sends the pause and stops the enable", async () => {
  const hung = hungEnable();
  await control(hung.handler);
  await click(enable());
  assert.equal(pause()?.disabled, false, "Pause stays enabled while an enable runs");
  await click(pause());
  assert.equal(pauses().length, 1, "the pause went out while the enable was still in flight");
  assert.match(status(), /Account paused/);
  hung.release(); await settle();
  assert.equal(controlReads().length, 1, "the stopped enable made no further request once its read returned");
});

test("FB1: Pause after 'Stop changes' while the enable's request is still in flight is not dropped", async () => {
  const hung = hungEnable();
  await control(hung.handler);
  await click(enable());
  await click(button(/^Stop changes$/));
  await click(pause());
  assert.equal(pauses().length, 1, "the pause was sent, not silently dropped by the enable's lock");
  assert.match(status(), /Account paused/);
  hung.release(); await settle();
});

// R2-2: a confirmed brake ends the hung enable outright, so the go is usable at once; it is not left locked behind a request
// that never returns (the old request is aborted, not waited on).
for (const [label, brake] of [["a confirmed Pause", () => click(pause())], ["Stop changes", () => click(button(/^Stop changes$/))]] as const) {
  test(`R2-2: Enable works right after ${label} while the old enable's request hangs`, async () => {
    let configReads = 0;
    await control(call => call.method === "GET" && call.url === CONFIG ? (++configReads === 1 ? never() : json({}))
      : call.method === "GET" ? controlRead() : pauseAck());
    await click(enable());
    await brake();
    assert.equal(enable()?.disabled, false, "the go looks available");
    await click(enable());
    assert.equal(configReads, 2, "the second Enable sent nothing: the hung enable still held its lock");
  });
}

// R3-1: a STOP is never harder to trigger than a go. The enable dies with the component; the pause does not.
test("R3-1: unmounting between Pause's control read and its POST still sends the pause", async () => {
  let release!: () => void;
  const held = new Promise<Response>(resolve => { release = () => resolve(controlRead()); });
  await control(call => call.method === "GET" ? held : pauseAck());
  await click(pause());
  assert.equal(pauses().length, 0, "the pause is waiting on its control read");
  await unmount();
  release(); await settle();
  assert.equal(pauses().length, 1, "the pause was dropped when the component unmounted before its POST");
  assert.equal(pauses()[0].signal?.aborted, false, "the pause POST was aborted");
});

test("R3-1: an unmount while the pause POST is in flight does not abort it", async () => {
  await control(call => call.method === "GET" ? controlRead() : never());
  await click(pause());
  assert.equal(pauses().length, 1);
  await unmount(); await settle();
  assert.equal(pauses()[0].signal?.aborted, false, "unmount aborted the in-flight pause");
});
