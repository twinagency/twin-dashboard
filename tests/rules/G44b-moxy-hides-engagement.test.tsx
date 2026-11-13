// RULE G44b P1 (REVIEW.md inv 7 "Holds and STOP": a STOP is never harder than a go, holds shown; CLAUDE.md "deleted brake").
// BAutomationPanel always mounts the follow-ups card ([data-b-card="follow-ups"]) and each scheduled row's cancel control,
// whatever the Moxy read says: a 503/502/timeout/unparseable Moxy read, or Moxy selected (even mode Off), never hides a
// scheduled follow-up or its cancel. Only the engagement policy editor is gated on ownership (EngagementPanel `editPolicy`).
// Copy is not pinned: data attributes + a cancel-shaped button.
// Mounts the real BAutomationPanel (real MoxyControls, EngagementPanel, AccountControls) inside real Next router contexts.
// Offline: jsdom, stub fetch, synthetic ids.
//   node --import tsx --test tests/rules/G44b-moxy-hides-engagement.test.tsx
import { ACTION_ID, automationReads, inNextApp, json, moxyLegacy, moxySelected, mount, settle, stubFetch, unmount } from "../helpers/w1-8-dom";
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

const reads = automationReads();
function serve(moxy: () => Response) {
  return stubFetch(url => {
    if (url === "/api/onlyfans/accounts") return json(reads.accounts);
    if (url === "/api/onlyfans/accounts/of-a/conversations") return json(reads.conversations);
    if (url === "/api/onlyfans/accounts/of-a/workspace/settings") return json(reads.runtime);
    if (url === "/api/onlyfans-configuration/accounts/of-a/moxy") return moxy();
    if (url.startsWith("/api/onlyfans-launch/automation/accounts/of-a/follow-ups")) return json(reads.followUps);
    // Engagement settings and the emergency-stop readiness read: contract unavailable; neither gates the follow-ups list.
    if (url.startsWith("/api/onlyfans-launch/automation/accounts/of-a/")) return json({ error: "Not available in this fixture." }, 503);
    throw new TypeError(`unexpected fetch ${url}`);
  });
}
async function open(moxy: () => Response) {
  const stub = serve(moxy);
  const { default: BAutomationPanel } = await import("../../components/onlyfans-launch/automation/BAutomationPanel");
  await mount(inNextApp(React.createElement(BAutomationPanel, { canManage: true, initialAccountId: "of-a" })));
  await settle(); await settle();
  return stub;
}
/** Booleans and strings only: a failing assertion that inspects a jsdom node can exhaust the heap. */
function followUps() {
  const card = document.querySelector('[data-b-card="follow-ups"]');
  const row = card?.querySelector(`[data-b-followup="scheduled"]`);
  const cancel = [...(row?.querySelectorAll("button") ?? [])].find(b => /cancel/i.test(b.textContent ?? ""));
  return { card: Boolean(card), row: Boolean(row && row.textContent?.includes(ACTION_ID)), cancel: Boolean(cancel && !(cancel as HTMLButtonElement).disabled),
    moxy: Boolean(document.querySelector("[data-moxy-controls]")) };
}

test("control: Moxy GET answers a valid legacy view, scheduled follow-up and its cancel control are shown", async () => {
  const stub = await open(() => json(moxyLegacy()));
  assert.equal(stub.count(/\/moxy$/), 1, "the Moxy read happened");
  assert.ok(stub.calls.every(c => c.method === "GET"), "reads only");
  assert.deepEqual(followUps(), { card: true, row: true, cancel: true, moxy: true });
  await unmount();
});

test("P1 A: Moxy GET answers 503, scheduled follow-up and its cancel control are still shown", async () => {
  const stub = await open(() => json({ error: "Moxy configuration is not available." }, 503));
  assert.equal(stub.count(/\/moxy$/), 1, "the Moxy read happened");
  assert.deepEqual(followUps(), { card: true, row: true, cancel: true, moxy: true }, "follow-ups hidden because the Moxy read failed");
  await unmount();
});

test("P1 B: Moxy selected with mode off, scheduled follow-up and its cancel control are still shown", async () => {
  const stub = await open(() => json(moxySelected("off")));
  assert.equal(stub.count(/\/moxy$/), 1, "the Moxy read happened");
  assert.deepEqual(followUps(), { card: true, row: true, cancel: true, moxy: true }, "follow-ups hidden because Moxy is selected");
  await unmount();
});
