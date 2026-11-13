// RULE G07c launch-stop-hold (regression guard; REVIEW.md inv 7: a STOP is never harder than a go, unknown-delivery holds win).
// Promoted from known-red W3-ui-onlyfans-launch-stop-gating (findings L3, L4; L1/L2 are G07a).
//   L3 a 401/403 on one conversation control withdrew `manage`, and `manage` gates Emergency stop. Now it holds only the conversation
//      go controls (resume, hand back); STOP and every brake stay.
//   L4 an unconfirmed STOP (502) showed the generic "outcome is not confirmed. Refresh before trying again" and left every go live. Now the notice names an unconfirmed stop, and
//      conversation resume and account resume (including its identical retry) are held until a STOP is recorded or a fresh read shows the
//      account stopped. Dropping the result ("Use current account view") does not release the hold. STOP itself stays enabled.
// Mounts the real BAutomationPanel inside real Next router contexts. Offline: jsdom, stub fetch, synthetic ids.
//   node --import tsx --test tests/rules/G07c-launch-stop-hold.test.tsx
import { button, click, html502, inNextApp, json, mount, stubFetch, typeInto, unmount } from "../helpers/w3-launch-dom";
import { accounts, conversations, runtime, stopRead } from "../helpers/w3-launch-fixtures";
import { CONTROL_SCHEMA } from "../../lib/onlyfans/controls";
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

const STOP_URL = "/api/onlyfans-launch/automation/accounts/of-a/emergency-stop";
type Answers = { stopGet?: (n: number) => Response; stopPost?: (raw: string) => Response; control?: () => Response };
async function open(a: Answers = {}) {
  const stub = stubFetch((url, method, n, raw) => {
    if (url === "/api/onlyfans/accounts") return json(accounts("of-a"));
    if (url === "/api/onlyfans/accounts/of-a/conversations") return json(conversations());
    if (url === "/api/onlyfans/accounts/of-a/workspace/settings") return json(runtime());
    if (url === STOP_URL && method === "GET") return a.stopGet ? a.stopGet(n) : json(stopRead());
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
const conv = (action: string) => { const b = document.querySelector<HTMLButtonElement>(`[data-b-conversation="c-1"] [data-b-action="${action}"]`); return Boolean(b && !b.disabled); };
const enabled = (label: RegExp) => { const b = button(label); return Boolean(b && !b.disabled); };
const stopNote = () => (document.querySelector("[data-b-stop-note]")?.textContent ?? "").trim();
const actions = (stub: Awaited<ReturnType<typeof open>>) => stub.posts(/emergency-stop$/).map(p => String(JSON.parse(String(p.raw)).action));
const recorded = () => json({ schemaVersion: "of-launch-b.v1", ok: true, accountId: "of-a", command: { recorded: true } });
async function sendStop() {
  await typeInto(reasonInput(), "Synthetic stop reason");
  await click(stopButton());
  await click(button(/^Confirm emergency stop$/i));
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

test("L4: dropping the unconfirmed STOP result does not release the hold", async () => {
  await open();
  await sendStop();
  await click(button(/^Use current account view$/));
  assert.deepEqual({ resume: conv("resume_automation"), stop: stop() }, { resume: false, stop: { present: true, enabled: true } });
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

test("L4: a fresh read showing the account stopped releases the hold", async () => {
  await open({ stopGet: n => json(stopRead(n === 0 ? {} : { enabled: false })) });
  await sendStop();
  assert.equal(conv("resume_automation"), true, "the read after the STOP shows the account stopped");
  await unmount();
});

test("L4: an unconfirmed resume cannot be retried while a STOP is unconfirmed", async () => {
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
  await unmount();
});
