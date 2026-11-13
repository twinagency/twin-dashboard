// RULE G07a stop-gating (regression guard; REVIEW.md inv 7 "Holds and STOP": a STOP is never harder than a go). Promoted from
// known-red W3-ui-onlyfans-launch-stop-gating (finding L2). Emergency stop and its Reason box render whatever the emergency-stop read
// says (AccountControls.tsx); a STOP sent with no readable state goes without a fingerprint and the route (account-controls-route.ts)
// pins it to the fingerprint it reads now, refusing with 503 and sending nothing when it cannot read one. Only a STOP may be bare.
// L1/L3/L4 of the same known-red file are not G07a and stay there.
// Mounts the real BAutomationPanel inside real Next router contexts; the route half spawns tests/rules/W3-lib-onlyfans-2-route.child.ts.
// Offline: jsdom, stub fetch, synthetic ids.
//   node --import tsx --test tests/rules/G07a-stop-gating.test.tsx
import { button, click, html502, inNextApp, json, mount, stubFetch, typeInto, unmount } from "../helpers/w3-launch-dom";
import { runRoute } from "./W3-lib-onlyfans-2-route.spawn";
import { accounts, conversations, runtime, stopRead } from "../helpers/w3-launch-fixtures";
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

const STOP_URL = "/api/onlyfans-launch/automation/accounts/of-a/emergency-stop";
type Answers = { stopGet?: (n: number) => Response; stopPost?: () => Response; control?: () => Response; resumeReady?: boolean };
async function open(a: Answers = {}) {
  const stub = stubFetch((url, method, n) => {
    if (url === "/api/onlyfans/accounts") return json(accounts("of-a"));
    if (url === "/api/onlyfans/accounts/of-a/conversations") return json(conversations());
    if (url === "/api/onlyfans/accounts/of-a/workspace/settings") return json(runtime());
    if (url === STOP_URL && method === "GET") return a.stopGet ? a.stopGet(n) : json(stopRead(a.resumeReady ? { enabled: false, readyToEnable: true } : {}));
    if (url === STOP_URL && method === "POST") return a.stopPost ? a.stopPost() : html502();
    if (url.startsWith("/api/onlyfans-controls/accounts/of-a/conversations/") && method === "POST") return a.control ? a.control() : html502();
    // Moxy ownership and engagement: not under test; the engagement panel stays hidden.
    if (url.startsWith("/api/onlyfans-configuration/") || url.startsWith("/api/onlyfans-launch/automation/accounts/of-a/")) return json({ error: "Not in this fixture." }, 503);
    throw new TypeError(`unexpected fetch ${method} ${url}`);
  });
  const { default: BAutomationPanel } = await import("../../components/onlyfans-launch/automation/BAutomationPanel");
  await mount(inNextApp(React.createElement(BAutomationPanel, { canManage: true, initialAccountId: "of-a" })));
  return stub;
}
const reasonInput = () => document.querySelector<HTMLInputElement>('[data-b-card="account"] input');
const stopButton = () => document.querySelector<HTMLButtonElement>("[data-b-emergency]");
/** Booleans and strings only: a failing assertion that inspects a jsdom node can exhaust the heap. */
const stop = () => { const b = stopButton(); return { present: Boolean(b), enabled: Boolean(b && !b.disabled) }; };
const goAction = (action: string) => { const b = document.querySelector<HTMLButtonElement>(`[data-b-conversation="c-1"] [data-b-action="${action}"]`); return { present: Boolean(b), enabled: Boolean(b && !b.disabled) }; };
const stopNote = () => (document.querySelector("[data-b-stop-note]")?.textContent ?? "").trim();

test("control: readiness read ok and a reason typed, Emergency stop is present and enabled", async () => {
  await open();
  await typeInto(reasonInput(), "Synthetic stop reason");
  assert.deepEqual(stop(), { present: true, enabled: true });
  assert.deepEqual(goAction("resume_automation"), { present: true, enabled: true }, "paused conversation: resume is a live go action");
  await unmount();
});

test("control: STOP POST answers 502, the outcome is reported unconfirmed and an identical retry is offered", async () => {
  const stub = await open({ stopPost: html502 });
  await typeInto(reasonInput(), "Synthetic stop reason");
  await click(stopButton());
  await click(button(/^Confirm emergency stop$/i));
  assert.equal(stub.posts(/emergency-stop$/).length, 1, "one STOP POST");
  assert.match(stopNote(), /unconfirmed|not confirmed/i);
  assert.equal(Boolean(button(/Retry identical account command/i)), true);
  await unmount();
});

test("L2: emergency-stop read answers 503, Emergency stop is still usable", async () => {
  const stub = await open({ stopGet: () => json({ error: "Readiness is not available." }, 503) });
  const reason = reasonInput();
  if (reason) await typeInto(reason, "Synthetic stop reason");
  assert.deepEqual(stop(), { present: true, enabled: true }, "STOP disappears when the readiness read is not ok (AccountControls.tsx:103)");
  await click(stopButton());
  await click(button(/^Confirm emergency stop$/i));
  const posts = stub.posts(/emergency-stop$/);
  assert.equal(posts.length, 1, "exactly one STOP POST");
  assert.equal(String(JSON.parse(String(posts[0].raw)).action), "emergency_stop", "the POST is a STOP (expectedFingerprint deliberately unpinned)");
  await unmount();
});

test("L2 route: a STOP without a fingerprint is pinned to the current one and sent once", () => {
  const run = runRoute("account-stop-bare");
  const sent = run.calls.filter(c => c.method === "POST").map(c => c.body as Record<string, unknown>);
  assert.deepEqual({ status: run.status, posts: sent.length, action: sent[0]?.action, fingerprint: sent[0]?.expectedFingerprint },
    { status: 200, posts: 1, action: "emergency_stop", fingerprint: "e".repeat(64) });
});

test("L2 route: a bare STOP whose state cannot be read is refused and nothing is sent", () => {
  const run = runRoute("account-stop-bare-unread");
  assert.deepEqual({ status: run.status, posts: run.calls.filter(c => c.method === "POST").length }, { status: 503, posts: 0 });
});

test("L2 route: only a STOP may be bare, a pause without a fingerprint is refused", () => {
  const run = runRoute("account-pause-bare");
  assert.deepEqual({ status: run.status, calls: run.calls.length }, { status: 400, calls: 0 });
});
