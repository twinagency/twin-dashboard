// RULE G07c launch-stop-hold (regression guard; REVIEW.md inv 7: a STOP is never harder than a go, unknown-delivery holds win).
// Promoted from known-red W3-ui-onlyfans-launch-stop-gating (findings L3, L4; L1/L2 are G07a), widened by the #401 R1 review.
//   L3 a 401/403 on one conversation control withdrew `manage`, and `manage` gates Emergency stop. Now it holds only the go controls of
//      that account (conversation resume and hand back, account resume, Moxy On, engagement enabling) until a later control there succeeds.
//   L4 an unconfirmed STOP (502) showed the generic "outcome is not confirmed. Refresh before trying again" and left every go live. Now a
//      STOP holds every go of its account from the moment it is sent, until it is recorded, definitively refused, or a read STARTED after it
//      shows the account stopped. The hold is a per-account sessionStorage marker, so a remount or reload keeps it. STOP, Pause, Take over,
//      No contact, Moxy Off and engagement disabling stay live in every state.
// Mounts the real BAutomationPanel (real AccountControls, MoxyControls, EngagementPanel) inside real Next router contexts. Offline: jsdom,
// stub fetch, synthetic ids.
//   node --import tsx --test tests/rules/G07c-launch-stop-hold.test.tsx
import { button, click, deferred, html502, inNextApp, json, mount, stubFetch, typeInto, unmount } from "../helpers/w3-launch-dom";
import { accounts, conversations, followUps, moxyLegacy, moxySelected, runtime, settings, stopRead } from "../helpers/w3-launch-fixtures";
import { CONTROL_SCHEMA } from "../../lib/onlyfans/controls";
import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";

const stopUrl = (id: string) => `/api/onlyfans-launch/automation/accounts/${id}/emergency-stop`;
type Answers = { stopGet?: (n: number) => Response | Promise<Response>; stopPost?: (raw: string) => Response | Promise<Response>; control?: () => Response;
  ids?: string[]; conv?: Record<string, unknown>; moxy?: () => Response };
async function open(a: Answers = {}, keepStorage = false) {
  if (!keepStorage) window.sessionStorage.clear();
  const ids = a.ids ?? ["of-a"];
  const stub = stubFetch((url, method, n, raw) => {
    if (url === "/api/onlyfans/accounts") return json(accounts(...ids));
    const id = /accounts\/(of-[a-z])/.exec(url)?.[1] ?? "";
    if (url === `/api/onlyfans/accounts/${id}/conversations`) return json(conversations(id, a.conv));
    if (url === `/api/onlyfans/accounts/${id}/workspace/settings`) return json(runtime(id));
    if (url === stopUrl(id) && method === "GET") return a.stopGet && id === "of-a" ? a.stopGet(n) : json(stopRead({}, id));
    if (url === stopUrl(id) && method === "POST") return a.stopPost ? a.stopPost(String(raw)) : html502();
    if (url.startsWith(`/api/onlyfans-controls/accounts/${id}/conversations/`) && method === "POST") return a.control ? a.control() : html502();
    if (url === `/api/onlyfans-configuration/accounts/${id}/moxy` && a.moxy) return a.moxy();
    if (url === `/api/onlyfans-launch/automation/accounts/${id}/settings` && method === "GET") return json(settings(3, id));
    if (url === `/api/onlyfans-launch/automation/accounts/${id}/settings` && method === "POST") return html502();
    if (url === `/api/onlyfans-launch/automation/accounts/${id}/follow-ups` && method === "GET") return json(followUps([], null, id));
    if (url.startsWith("/api/onlyfans-configuration/")) return json({ error: "Not in this fixture." }, 503);
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
const conv = (action: string) => { const b = document.querySelector<HTMLButtonElement>(`[data-b-conversation="c-1"] [data-b-action="${action}"]`); return Boolean(b && !b.disabled); };
const enabled = (label: RegExp) => { const b = button(label); return Boolean(b && !b.disabled); };
const stopNote = () => (document.querySelector("[data-b-stop-note]")?.textContent ?? "").trim();
const actions = (stub: Awaited<ReturnType<typeof open>>) => stub.posts(/emergency-stop$/).map(p => String(JSON.parse(String(p.raw)).action));
const recorded = () => json({ schemaVersion: "of-launch-b.v1", ok: true, accountId: "of-a", command: { recorded: true } });
const ack = (action: string) => json({ schemaVersion: CONTROL_SCHEMA, ok: true, applied: true, commandKey: "a".repeat(64), accountId: "of-a",
  conversationId: "c-1", action, recordedRevision: 5 });
async function sendStop() {
  await typeInto(reasonInput(), "Synthetic stop reason");
  await click(stopButton());
  await click(button(/^Confirm emergency stop$/i));
}
async function choose(selector: string, value: string) {
  const select = document.querySelector<HTMLSelectElement>(selector);
  assert.ok(select, `${selector} exists`);
  await act(async () => { select.value = value; select.dispatchEvent(new window.Event("change", { bubbles: true })); });
  await typeInto(reasonInput(), "Synthetic stop reason"); // settles, and the remounted account controls get a reason again
}

test("control: readiness read ok and a reason typed, STOP, brakes and conversation resume are live", async () => {
  await open();
  await typeInto(reasonInput(), "Synthetic stop reason");
  assert.deepEqual({ stop: stop(), resume: conv("resume_automation"), takeover: conv("request_takeover"), noContact: conv("mark_no_contact") },
    { stop: { present: true, enabled: true }, resume: true, takeover: true, noContact: true });
  await unmount();
});

test("control: a recorded STOP holds nothing", async () => {
  await open({ stopPost: recorded });
  await sendStop();
  assert.deepEqual({ recorded: /recorded/i.test(stopNote()), stop: stop(), resume: conv("resume_automation") },
    { recorded: true, stop: { present: true, enabled: true }, resume: true });
  await unmount();
});

const ORIGIN_REFUSAL = { schemaVersion: CONTROL_SCHEMA, ok: false, outcome: "refused", error: "This change must be requested from this dashboard." };
for (const [status, body] of [[403, ORIGIN_REFUSAL], [401, { error: "Sign in again." }]] as const)
  test(`L3: a conversation control answered ${status} keeps Emergency stop and every brake; only conversation go controls are held`, async () => {
    const stub = await open({ control: () => json(body, status) });
    await typeInto(reasonInput(), "Synthetic stop reason");
    await click(document.querySelector('[data-b-conversation="c-1"] [data-b-action="request_takeover"]'));
    assert.equal(stub.posts(/\/conversations\/c-1$/).length, 1, "the conversation control POST happened");
    assert.deepEqual({ stop: stop(), pause: enabled(/^Pause account$/), takeover: conv("request_takeover"), noContact: conv("mark_no_contact"),
      resume: conv("resume_automation") },
    { stop: { present: true, enabled: true }, pause: true, takeover: true, noContact: true, resume: false },
    "one refused conversation control withdrew STOP (BAutomationPanel.tsx setManage(false))");
    await click(stopButton());
    await click(button(/^Confirm emergency stop$/i));
    assert.deepEqual(actions(stub), ["emergency_stop"], "STOP still sends after the refusal");
    await unmount();
  });

test("L3 recovery: the refusal holds only its own account, and a later control there that succeeds lifts it", async () => {
  let n = 0;
  await open({ ids: ["of-a", "of-b"], control: () => (n++ === 0 ? json(ORIGIN_REFUSAL, 403) : ack("request_takeover")) });
  await click(document.querySelector('[data-b-conversation="c-1"] [data-b-action="request_takeover"]'));
  const hint = document.querySelector("[data-b-notice]")?.textContent ?? "";
  await choose("select#b-auto-acct", "of-b");
  assert.equal(conv("resume_automation"), true, "a refusal on of-a holds of-b");
  await choose("select#b-auto-acct", "of-a");
  assert.equal(conv("resume_automation"), false, "the refusal is still held on of-a");
  await click(document.querySelector('[data-b-conversation="c-1"] [data-b-action="request_takeover"]'));
  assert.equal(conv("resume_automation"), true, "a successful control on of-a does not lift the refusal");
  assert.match(hint, /sign in again/i, "the hint says how to recover");
  await unmount();
});

test("L4: STOP POST answers 502, the notice names an unconfirmed stop, conversation resume is held and STOP stays enabled", async () => {
  await open();
  await sendStop();
  const note = stopNote();
  assert.deepEqual({ unconfirmedStop: /stop (is )?(unconfirmed|not confirmed)/i.test(note), saysHeld: /held/i.test(note), resume: conv("resume_automation"),
    takeover: conv("request_takeover"), stop: stop(), again: enabled(/^Send stop again$/) },
  { unconfirmedStop: true, saysHeld: true, resume: false, takeover: true, stop: { present: true, enabled: true }, again: true },
  `unconfirmed STOP must be labelled a stop and hold go actions; notice was: ${note}`);
  await unmount();
});

test("L4: hand back (release_takeover) is held by an unconfirmed STOP", async () => {
  await open({ conv: { takeoverState: "requested" } });
  assert.equal(conv("release_takeover"), true, "control: hand back is live before the STOP");
  await sendStop();
  assert.deepEqual({ release: conv("release_takeover"), noContact: conv("mark_no_contact") }, { release: false, noContact: true });
  await unmount();
});

test("L4: go is held while the STOP is in flight, and an old stopped read that lands then does not lift it", async () => {
  const first = deferred(), post = deferred();
  // The first readiness read was issued before the STOP and shows the account stopped; every later read shows it running.
  await open({ stopGet: n => (n === 0 ? first.promise : json(stopRead())), stopPost: () => post.promise });
  await sendStop();
  assert.equal(conv("resume_automation"), false, "go is live while the STOP is in flight");
  first.resolve(json(stopRead({ enabled: false, readyToEnable: true })));
  await typeInto(reasonInput(), "Synthetic stop reason");
  assert.deepEqual({ resume: conv("resume_automation"), accountResume: enabled(/^Resume with current prerequisites$/) }, { resume: false, accountResume: false },
    "a read issued before the STOP lifted the hold");
  post.resolve(html502());
  await typeInto(reasonInput(), "Synthetic stop reason");
  assert.equal(conv("resume_automation"), false, "held after the unconfirmed reply");
  await unmount();
});

test("L4: a stale STOP reply cannot clear a newer STOP's hold", async () => {
  // STOP 1 hangs; the operator switches away and back (remount), sends STOP 2 (502, unknown), then STOP 1 answers recorded.
  const first = deferred();
  let n = 0;
  const stub = await open({ ids: ["of-a", "of-b"], stopPost: () => (n++ === 0 ? first.promise : html502()) });
  await sendStop();
  await choose("select#b-auto-acct", "of-b");
  await choose("select#b-auto-acct", "of-a");
  await sendStop();
  assert.deepEqual(actions(stub), ["emergency_stop", "emergency_stop"], "both STOPs were sent");
  first.resolve(recorded());
  await typeInto(reasonInput(), "Synthetic stop reason");
  assert.equal(conv("resume_automation"), false, "STOP 1's late recorded reply cleared STOP 2's unknown hold");
  await unmount();
});

test("L4: a definitive refusal of the STOP lifts the in-flight hold and shows why", async () => {
  const notSent = () => json({ schemaVersion: "of-launch-b.v1", ok: false, code: "refused", error: "Current account state could not be read, so the stop was not sent. Try again." }, 503);
  await open({ stopPost: notSent });
  await sendStop();
  assert.deepEqual({ notSent: /not sent/i.test(stopNote()), resume: conv("resume_automation"), stop: stop() },
    { notSent: true, resume: true, stop: { present: true, enabled: true } });
  await unmount();
});

test("L4: a refused resend does not lift the hold an earlier unconfirmed STOP set", async () => {
  let n = 0;
  await open({ stopPost: () => (n++ === 0 ? html502() : json({ schemaVersion: "of-launch-b.v1", ok: false, code: "refused", error: "Not sent." }, 503)) });
  await sendStop();
  await click(button(/^Send stop again$/));
  assert.equal(conv("resume_automation"), false);
  await unmount();
});

test("L4: dropping the unconfirmed STOP result does not release the hold", async () => {
  await open();
  await sendStop();
  await click(button(/^Use current account view$/));
  assert.deepEqual({ resume: conv("resume_automation"), stop: stop(), held: Boolean(document.querySelector("[data-b-stop-held]")) },
    { resume: false, stop: { present: true, enabled: true }, held: true });
  await unmount();
});

test("L4: a recorded 'Send stop again' releases the hold", async () => {
  let n = 0;
  const stub = await open({ stopPost: () => (n++ === 0 ? html502() : recorded()) });
  await sendStop();
  assert.equal(conv("resume_automation"), false, "held after the unconfirmed STOP");
  await click(button(/^Send stop again$/));
  assert.deepEqual({ sent: actions(stub), resume: conv("resume_automation") }, { sent: ["emergency_stop", "emergency_stop"], resume: true });
  await unmount();
});

test("L4: a fresh read showing the account stopped releases the hold and the stop lane, so account resume is live again", async () => {
  await open({ stopGet: n => json(stopRead(n === 0 ? {} : { enabled: false })) });
  await sendStop();
  assert.deepEqual({ resume: conv("resume_automation"), accountResume: enabled(/^Resume with current prerequisites$/), again: Boolean(button(/^Send stop again$/)) },
    { resume: true, accountResume: true, again: false }, "the read after the STOP shows the account stopped");
  await unmount();
});

test("L4: an unconfirmed resume cannot be retried while a STOP is unconfirmed, even after the stop result is dropped", async () => {
  // First read: stopped and ready, so resume is offered. Every later read: running, so the STOP is never confirmed by a read.
  const stub = await open({ stopGet: n => json(stopRead(n === 0 ? { enabled: false, readyToEnable: true } : {})) });
  await typeInto(reasonInput(), "Synthetic resume reason");
  await click(button(/^Resume with current prerequisites$/));
  await click(button(/^Confirm resume$/i));
  assert.equal(enabled(/^Retry identical account command$/), true, "control: the unconfirmed resume can be retried");
  await click(stopButton());
  await click(button(/^Confirm emergency stop$/i));
  assert.deepEqual({ sent: actions(stub), retry: enabled(/^Retry identical account command$/), stop: stop() },
    { sent: ["resume", "emergency_stop"], retry: false, stop: { present: true, enabled: true } }, "a go retry is live under an unconfirmed STOP");
  const dropStop = [...document.querySelectorAll<HTMLButtonElement>("button")].filter(b => /^Use current account view$/.test(b.textContent ?? "")).at(-1);
  await click(dropStop);
  assert.equal(enabled(/^Retry identical account command$/), false, "dropping the stop result released the resume retry");
  await unmount();
});

test("L4: the hold survives an account switch and does not leak to another account", async () => {
  await open({ ids: ["of-a", "of-b"] });
  await sendStop();
  await choose("select#b-auto-acct", "of-b");
  assert.equal(conv("resume_automation"), true, "of-a's STOP holds of-b");
  await choose("select#b-auto-acct", "of-a");
  assert.equal(conv("resume_automation"), false, "switching back dropped of-a's hold");
  await unmount();
});

test("L4: the hold survives a remount (reload of the panel)", async () => {
  await open();
  await sendStop();
  await unmount();
  await open({}, true);
  assert.deepEqual({ resume: conv("resume_automation"), stop: stop().present }, { resume: false, stop: true }, "a remount after a 502 STOP re-enabled resume");
  await unmount();
});

test("L4: a malformed stored hold never throws and holds (the safe direction)", async () => {
  window.sessionStorage.clear();
  window.sessionStorage.setItem("b-stop-held:of-a", "{not json");
  await open({}, true);
  assert.deepEqual({ stop: stop().present, resume: conv("resume_automation") }, { stop: true, resume: false });
  await unmount();
});

test("L4: Moxy On is held by an unconfirmed STOP, Moxy Off stays live", async () => {
  await open({ moxy: () => json(moxySelected("on")) });
  const save = () => enabled(/^Save mode$/);
  assert.equal(save(), true, "control: saving mode On is live before the STOP");
  await sendStop();
  const onOption = document.querySelector<HTMLOptionElement>('select[aria-label="Mode"] option[value="on"]');
  assert.deepEqual({ save: save(), on: Boolean(onOption && !onOption.disabled) }, { save: false, on: false }, "Moxy On escapes the STOP hold");
  await choose('select[aria-label="Mode"]', "off");
  assert.equal(save(), true, "Moxy Off is held");
  await unmount();
});

test("L4: engagement enabling is held by an unconfirmed STOP, disabling stays live", async () => {
  await open({ moxy: () => json(moxyLegacy()) });
  const box = (k: string) => [...document.querySelectorAll<HTMLLabelElement>("label")].find(l => l.textContent === k)?.querySelector("input");
  const save = () => enabled(/^Save engagement settings$/);
  await click(box("enabled"));
  assert.equal(save(), true, "control: enabling is live before the STOP");
  await click(box("enabled"));
  await sendStop();
  await click(box("enabled"));
  assert.equal(save(), false, "engagement enabling escapes the STOP hold");
  await click(box("enabled"));
  await click(box("follow ups"));
  assert.equal(save(), true, "turning follow-ups off is held");
  await unmount();
});

test("L4: saving an identical engagement policy with a flag on is held", async () => {
  await open({ moxy: () => json(moxyLegacy()) }); // the saved policy has follow ups on
  const save = () => enabled(/^Save engagement settings$/);
  assert.equal(save(), true, "control: an identical save is live before the STOP");
  await sendStop();
  assert.equal(save(), false, "an identical enabled save escapes the STOP hold");
  await unmount();
});

test("L4: retrying identical engagement settings with a flag on is held", async () => {
  await open({ moxy: () => json(moxyLegacy()) });
  await click(button(/^Save engagement settings$/)); // 502: the retry is offered
  assert.equal(enabled(/^Retry identical engagement settings$/), true, "control: the identical retry is live before the STOP");
  await sendStop();
  assert.equal(enabled(/^Retry identical engagement settings$/), false, "an identical enabled retry escapes the STOP hold");
  await unmount();
});
