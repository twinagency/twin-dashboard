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
import React, { act } from "react";

const reads = automationReads();
function serve(moxy: () => Response | Promise<Response>) {
  return stubFetch((url, method) => {
    if (url === "/api/onlyfans/accounts") return json(reads.accounts);
    if (url === "/api/onlyfans/accounts/of-a/conversations") return json(reads.conversations);
    if (url === "/api/onlyfans/accounts/of-a/workspace/settings") return json(reads.runtime);
    if (url === "/api/onlyfans-configuration/accounts/of-a/moxy") return moxy();
    if (url.startsWith("/api/onlyfans-launch/automation/accounts/of-a/follow-ups"))
      return json(method === "POST" ? { schemaVersion: "of-launch-b.v1", ok: true, accountId: "of-a", action: { ...reads.followUps.actions[0], cancelRequested: true } } : reads.followUps);
    if (url.endsWith("/emergency-stop")) return json(reads.emergency);
    // Engagement settings read: contract unavailable in this fixture; it does not gate the follow-ups list.
    if (url.startsWith("/api/onlyfans-launch/automation/accounts/of-a/")) return json({ error: EDITOR_MARK }, 503);
    throw new TypeError(`unexpected fetch ${url}`);
  });
}
async function open(moxy: () => Response | Promise<Response>) {
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
/** The policy editor card's only copy in this fixture: its settings read fails with this message, rendered by the editor card alone. */
const EDITOR_MARK = "Engagement settings unavailable in this fixture.";
const policyEditor = () => (document.body.textContent ?? "").includes(EDITOR_MARK);

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

test("P1 C: the Moxy read never resolves, follow-up and its cancel control are still shown, without the policy editor", async () => {
  const stub = await open(() => new Promise<Response>(() => {}));
  assert.equal(stub.count(/\/moxy$/), 1, "the Moxy read started");
  assert.deepEqual(followUps(), { card: true, row: true, cancel: true, moxy: true }, "follow-ups wait for a Moxy read that never ends");
  assert.equal(policyEditor(), false, "policy editor waits for a legacy view");
  await unmount();
});

test("P1 D: the policy editor card is absent when Moxy owns the account and present on a legacy account", async () => {
  await open(() => json(moxySelected("preview")));
  assert.equal(policyEditor(), false, "policy editor shown beside Moxy, two owners");
  await unmount();
  await open(() => json(moxyLegacy()));
  assert.equal(policyEditor(), true, "legacy account lost its policy editor");
  await unmount();
});

test("P1 E: Request cancellation sends exactly one POST to the follow-up endpoint", async () => {
  const stub = await open(() => json(moxySelected("off")));
  const row = document.querySelector('[data-b-followup="scheduled"]');
  const cancel = [...(row?.querySelectorAll("button") ?? [])].find(b => /request cancellation/i.test(b.textContent ?? ""));
  assert.ok(cancel, "Request cancellation button renders");
  await act(async () => { cancel.click(); });
  await settle();
  const posts = stub.calls.filter(c => c.method === "POST");
  assert.deepEqual(posts.map(c => c.url), ["/api/onlyfans-launch/automation/accounts/of-a/follow-ups"]);
  assert.deepEqual(posts[0].body, { actionId: ACTION_ID, action: "cancel" });
  await unmount();
});
