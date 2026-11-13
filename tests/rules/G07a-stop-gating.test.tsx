// RULE G07a stop-gating (regression guard; REVIEW.md inv 7 "Holds and STOP": a STOP is never harder than a go). Promoted from
// known-red W3-ui-onlyfans-launch-stop-gating (finding L2). Emergency stop and its Reason box render whatever the emergency-stop read
// says (AccountControls.tsx). Every STOP goes without a fingerprint (a stale one is refused by the backend exactly when STOP is needed) and
// the route (account-controls-route.ts) pins it to the fingerprint it reads now, refusing with 503 and sending nothing when it cannot read
// one. Pause and resume still carry the fingerprint the operator saw. A pause or resume in flight or unconfirmed never disables STOP, and
// STOP and pause/resume report in separate lanes, so neither result hides the other's; resume waits for every command in flight; Pause waits only for its own lane, never for a STOP (G07d B11).
// L1/L3/L4 of the same known-red file are not G07a and stay there.
// Mounts the real BAutomationPanel inside real Next router contexts; the route half spawns tests/rules/W3-lib-onlyfans-2-route.child.ts.
// Offline: jsdom, stub fetch, synthetic ids.
//   node --import tsx --test tests/rules/G07a-stop-gating.test.tsx
import { button, click, html502, inNextApp, json, mount, settle, stubFetch, typeInto, unmount } from "../helpers/w3-launch-dom";
import { runRoute } from "./W3-lib-onlyfans-2-route.spawn";
import { accounts, conversations, runtime, stopRead } from "../helpers/w3-launch-fixtures";
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

const STOP_URL = "/api/onlyfans-launch/automation/accounts/of-a/emergency-stop";
type Answers = { stopGet?: (n: number) => Response; stopPost?: (raw: string) => Response | Promise<Response>; control?: () => Response; resumeReady?: boolean };
async function open(a: Answers = {}) {
  const stub = stubFetch((url, method, n, raw) => {
    if (url === "/api/onlyfans/accounts") return json(accounts("of-a"));
    if (url === "/api/onlyfans/accounts/of-a/conversations") return json(conversations());
    if (url === "/api/onlyfans/accounts/of-a/workspace/settings") return json(runtime());
    if (url === STOP_URL && method === "GET") return a.stopGet ? a.stopGet(n) : json(stopRead(a.resumeReady ? { enabled: false, readyToEnable: true } : {}));
    if (url === STOP_URL && method === "POST") return a.stopPost ? a.stopPost(String(raw)) : html502();
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
const sentActions = (stub: Awaited<ReturnType<typeof open>>) => stub.posts(/emergency-stop$/).map(p => String(JSON.parse(String(p.raw)).action));
const sentKeys = (stub: Awaited<ReturnType<typeof open>>) => stub.posts(/emergency-stop$/).map(p => Object.keys(JSON.parse(String(p.raw))).sort().join(","));
/** The route's own refusal when it cannot read a fingerprint to pin the STOP to (account-controls-route.ts). */
const NOT_SENT = () => json({ schemaVersion: "of-launch-b.v1", ok: false, code: "refused",
  error: "Current account state could not be read, so the stop was not sent. Try again." }, 503);
async function pauseThenStop(stub: Awaited<ReturnType<typeof open>>) {
  await typeInto(reasonInput(), "Synthetic stop reason");
  await click(button(/^Pause account$/i));
  await click(button(/^Confirm pause$/i));
  assert.deepEqual(stop(), { present: true, enabled: true }, "a pause in flight or unconfirmed disables STOP");
  await click(stopButton());
  await click(button(/^Confirm emergency stop$/i));
  return sentActions(stub);
}

test("control: readiness read ok and a reason typed, Emergency stop is present and enabled", async () => {
  await open();
  await typeInto(reasonInput(), "Synthetic stop reason");
  assert.deepEqual(stop(), { present: true, enabled: true });
  assert.deepEqual(goAction("resume_automation"), { present: true, enabled: true }, "paused conversation: resume is a live go action");
  await unmount();
});

test("STOP POST answers 502: reported unconfirmed and offered as 'Send stop again', not as an identical retry", async () => {
  const stub = await open({ stopPost: html502 });
  await typeInto(reasonInput(), "Synthetic stop reason");
  await click(stopButton());
  await click(button(/^Confirm emergency stop$/i));
  assert.equal(stub.posts(/emergency-stop$/).length, 1, "one STOP POST");
  assert.match(stopNote(), /unconfirmed|not confirmed/i);
  assert.deepEqual({ again: Boolean(button(/^Send stop again$/)), identical: Boolean(button(/identical/i)) }, { again: true, identical: false },
    "a resent STOP is pinned to a fresh read, so it is not identical");
  await click(button(/^Send stop again$/));
  assert.deepEqual(sentActions(stub), ["emergency_stop", "emergency_stop"]);
  await unmount();
});

test("a STOP from an ok read carries no fingerprint: the operator's view may be stale, the route pins the current one", async () => {
  const stub = await open({ stopPost: html502 });
  await typeInto(reasonInput(), "Synthetic stop reason");
  await click(stopButton());
  await click(button(/^Confirm emergency stop$/i));
  assert.deepEqual(sentKeys(stub), ["action,reason"], "STOP sends the fingerprint of the last read");
  await unmount();
});

test("a pause still carries the fingerprint the operator saw", async () => {
  const stub = await open({ stopPost: html502 });
  await typeInto(reasonInput(), "Synthetic stop reason");
  await click(button(/^Pause account$/i));
  await click(button(/^Confirm pause$/i));
  assert.deepEqual(sentKeys(stub), ["action,expectedFingerprint,reason"]);
  assert.equal(Boolean(button(/^Retry identical account command$/)), true, "a pause retry is identical");
  await unmount();
});

test("an unconfirmed pause does not disable STOP", async () => {
  const stub = await open({ stopPost: html502 });
  assert.deepEqual(await pauseThenStop(stub), ["pause", "emergency_stop"]);
  await unmount();
});

test("a pause still in flight does not disable STOP", async () => {
  let release: (r: Response) => void = () => {};
  const hung = new Promise<Response>(resolve => { release = resolve; });
  const stub = await open({ stopPost: raw => JSON.parse(raw).action === "pause" ? hung : html502() });
  assert.deepEqual(await pauseThenStop(stub), ["pause", "emergency_stop"]);
  release(html502());
  await unmount();
});

/** Each command answered by its own promise, settled by the test; `recorded` is the route's ack for a recorded command. */
function held() {
  const gates = new Map<string, (r: Response) => void>();
  return { post: (raw: string) => new Promise<Response>(resolve => { gates.set(String(JSON.parse(raw).action), resolve); }),
    answer: async (action: string, r: Response) => { gates.get(action)?.(r); await settle(); await settle(); } };
}
const recorded = () => json({ schemaVersion: "of-launch-b.v1", ok: true, accountId: "of-a", command: { recorded: true } });
const controlNote = () => (document.querySelector("[data-b-control-note]")?.textContent ?? "").trim();
const enabled = (label: RegExp) => { const b = button(label); return Boolean(b && !b.disabled); };

test("STOP recorded while a pause is still in flight: pause and resume stay blocked, and the pause's later failure is shown with its retry", async () => {
  const h = held();
  const stub = await open({ stopPost: h.post });
  await pauseThenStop(stub);
  await h.answer("emergency_stop", recorded());
  assert.deepEqual({ stop: /recorded/i.test(stopNote()), pause: enabled(/^Pause account$/) }, { stop: true, pause: false },
    "the STOP settling clears 'busy' while the pause is still in flight");
  await h.answer("pause", html502());
  assert.deepEqual({ pause: /unconfirmed|not confirmed/i.test(controlNote()), retry: enabled(/^Retry identical account command$/), stop: /recorded/i.test(stopNote()) },
    { pause: true, retry: true, stop: true }, "the superseded pause's unconfirmed result is dropped");
  await click(button(/^Retry identical account command$/));
  assert.deepEqual(sentActions(stub), ["pause", "emergency_stop", "pause"]);
  await unmount();
});

test("a pause recorded while a STOP is in flight is reported, and Pause stays live while resume waits for the STOP", async () => {
  const h = held();
  const stub = await open({ stopPost: h.post });
  await pauseThenStop(stub);
  await h.answer("pause", recorded());
  assert.deepEqual({ pause: /recorded/i.test(controlNote()), pauseEnabled: enabled(/^Pause account$/), stop: stop() },
    { pause: true, pauseEnabled: true, stop: { present: true, enabled: false } }, "the pause's recorded result is dropped while a STOP is newer");
  await h.answer("emergency_stop", html502());
  assert.deepEqual({ pause: /recorded/i.test(controlNote()), stop: /unconfirmed|not confirmed/i.test(stopNote()), again: enabled(/^Send stop again$/) },
    { pause: true, stop: true, again: true });
  await unmount();
});

test("one gate for every control: with no reason nothing can be confirmed; a STOP in flight blocks only another STOP", async () => {
  const h = held();
  await open({ stopPost: h.post });
  await click(button(/^Pause account$/i));
  assert.equal(button(/^Confirm pause$/i), undefined, "Pause opens a confirm with no reason typed");
  await typeInto(reasonInput(), "Synthetic stop reason");
  await click(stopButton());
  await typeInto(reasonInput(), " ");
  assert.equal(enabled(/^Confirm emergency stop$/i), false, "Confirm emergency stop is enabled with a blank reason");
  await typeInto(reasonInput(), "Synthetic stop reason");
  await click(button(/^Confirm emergency stop$/i));
  assert.deepEqual({ stop: stop().enabled, pause: enabled(/^Pause account$/), confirm: Boolean(button(/^Confirm/)) }, { stop: false, pause: true, confirm: true });
  await h.answer("emergency_stop", recorded());
  assert.deepEqual({ stop: stop().enabled, pause: enabled(/^Pause account$/), confirm: Boolean(button(/^Confirm/)) }, { stop: true, pause: true, confirm: false });
  await unmount();
});

test("the route's 503 (state unreadable) is shown as not sent, with no retry button", async () => {
  const stub = await open({ stopPost: NOT_SENT });
  await typeInto(reasonInput(), "Synthetic stop reason");
  await click(stopButton());
  await click(button(/^Confirm emergency stop$/i));
  assert.equal(stub.posts(/emergency-stop$/).length, 1);
  assert.match(stopNote(), /not sent/i);
  const controls = document.querySelector('[data-b-card="account"]') ?? document;
  assert.deepEqual({ again: Boolean(button(/^Send stop again$/)), retry: Boolean(button(/retry/i, controls)), stop: stop() },
    { again: false, retry: false, stop: { present: true, enabled: true } });
  await unmount();
});

test("L2: emergency-stop read answers 503, Emergency stop is still usable", async () => {
  const stub = await open({ stopGet: () => json({ error: "Readiness is not available." }, 503) });
  const reason = reasonInput();
  if (reason) await typeInto(reason, "Synthetic stop reason");
  assert.deepEqual(stop(), { present: true, enabled: true }, "STOP disappears when the readiness read is not ok");
  await click(stopButton());
  await click(button(/^Confirm emergency stop$/i));
  assert.deepEqual({ actions: sentActions(stub), keys: sentKeys(stub) }, { actions: ["emergency_stop"], keys: ["action,reason"] },
    "exactly one STOP POST, and it carries no fingerprint (the route pins one)");
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

test("route: a STOP carrying a stale client fingerprint is pinned to the current one instead", () => {
  const run = runRoute("account-stop-stale");
  const sent = run.calls.filter(c => c.method === "POST").map(c => c.body as Record<string, unknown>);
  assert.deepEqual({ status: run.status, reads: run.calls.filter(c => c.method === "GET").length, posts: sent.length, fingerprint: sent[0]?.expectedFingerprint },
    { status: 200, reads: 1, posts: 1, fingerprint: "e".repeat(64) }, "the route forwards the client's fingerprint on a STOP");
});

test("route: a pause keeps the client's fingerprint and reads nothing", () => {
  const run = runRoute("account-pause");
  assert.deepEqual({ status: run.status, calls: run.calls.map(c => `${c.method} ${String((c.body as Record<string, unknown> | null)?.expectedFingerprint ?? "")}`) },
    { status: 200, calls: [`POST ${"f".repeat(64)}`] });
});

for (const scenario of ["account-pause-bare", "account-resume-bare", "account-pause-extra", "account-stop-extra"] as const)
  test(`route: one exact key set per action, ${scenario} is refused before any backend call`, () => {
    const run = runRoute(scenario);
    assert.deepEqual({ status: run.status, calls: run.calls.length }, { status: 400, calls: 0 });
  });

for (const [scenario, status] of [["account-stop-bare-signed-out", 401], ["account-stop-bare-chatter", 403]] as const)
  test(`route: a bare STOP answered ${status} by the dashboard gate reads no state and sends nothing`, () => {
    const run = runRoute(scenario);
    assert.deepEqual({ status: run.status, calls: run.calls.length }, { status, calls: 0 });
  });
