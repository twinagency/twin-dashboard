// KNOWN RED (W3 ui-onlyfans-preview-2 P4/P5/P6, data-risk, REVIEW inv 7 "STOP/holds win"):
//   P4 InboxView.tsx:822-823,:972 — at <=1279px the whole Reply control (Pause, Stop further contact, the hold copy) sits in the
//      fan panel whose class is `lg:hidden` while Send stays in the chat card. Brake harder to reach than go.
//   P5 InboxView.tsx:411 — Composer "Take over" is disabled after any unconfirmed result (here an unconfirmed pause_automation,
//      which holds nothing) while ActionColumn's go buttons stay on.
//   P6 InboxView.tsx:610-613 — "Retry same request" renders for an unconfirmed send without re-checking the refreshed action set,
//      so a send the server now holds (delivery unknown, no_contact) is one click from being resubmitted.
// Team's Claude owns the fixes. Offline: jsdom (Tailwind display resolved from class tokens by hiddenAt), fetch stubbed, synthetic ids.
import { hiddenAt, inNextApp, json, mount, stubFetch, viewport } from "../helpers/w3-preview2-dom";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { detailFor, inbox, liveAccount, liveResult } from "../helpers/w3-preview2-fixtures";

const A = liveAccount("acct-a");
const replyControl = () => document.querySelector('section[aria-label="Reply control"]');
const send = () => document.querySelector<HTMLButtonElement>("[data-of-send]");
const composerTakeover = () => document.querySelector<HTMLButtonElement>("[data-of-composer-takeover]");
const columnTakeover = () => document.querySelector<HTMLButtonElement>('[data-of-actions] [data-of-action="request_takeover"]');
const retryShown = () => document.querySelector("[data-of-retry-control]") !== null;

beforeEach(() => { stubFetch(() => json({ ok: false }, 404)); });
/** Visibility of the Reply control and Send at the current viewport width; null when the element did not render. */
const shown = () => {
  const reply = replyControl(), sending = send();
  return { replyControl: reply ? !hiddenAt(reply, viewport.width) : null, send: sending ? !hiddenAt(sending, viewport.width) : null };
};

// ---- P4 ----
test("control: at 1440px the Reply control and Send are both displayed", async () => {
  await mount(inNextApp(inbox({ account: A, detail: detailFor(A.accountId, "conv-1") })));
  assert.deepEqual(shown(), { replyControl: true, send: true });
});

test("P4: at 1100px (matchMedia max-width 1279px) the Reply control is displayed while Send is", async () => {
  viewport.width = 1100;
  await mount(inNextApp(inbox({ account: A, detail: detailFor(A.accountId, "conv-1") })));
  assert.equal(shown().send, true, "Send is displayed in the chat card");
  assert.deepEqual(shown(), { replyControl: true, send: true },
    "Reply control (Pause / Stop further contact / hold copy) is display:none at 1100px while Send stays one click away");
});

// ---- P5 ----
const automated = () => detailFor(A.accountId, "conv-1", { summary: { automationMode: "automated", takeoverState: "none", delivery: "sent" } });

test("control: request_takeover available, no result: composer Take over and ActionColumn Take over both enabled", async () => {
  await mount(inNextApp(inbox({ account: A, detail: automated() })));
  assert.equal(composerTakeover()?.disabled, false);
  assert.equal(columnTakeover()?.disabled, false);
});

test("P5: after an unconfirmed (live) pause_automation result the composer Take over brake stays enabled", async () => {
  await mount(inNextApp(inbox({ account: A, detail: automated(), commandResult: liveResult("pause_automation", "unconfirmed", A.accountId, "conv-1") })));
  assert.equal(columnTakeover()?.disabled, false, "ActionColumn Take over is enabled in the same render");
  assert.equal(composerTakeover()?.disabled, false, "composer Take over (the only visible takeover at <1280px) is disabled by an unconfirmed result");
});

// ---- P6 ----
const unconfirmedSend = (conversationId = "conv-1") => liveResult("send_manual_message", "unconfirmed", A.accountId, conversationId);

test("control: unconfirmed send with nothing held offers Retry same request", async () => {
  await mount(inNextApp(inbox({ account: A, detail: detailFor(A.accountId, "conv-1"), commandResult: unconfirmedSend() })));
  assert.equal(retryShown(), true, "retry control renders for an unconfirmed send while sending is allowed");
});

test("P6: unconfirmed send, refreshed detail holds sending (delivery unknown): no Retry same request", async () => {
  const detail = detailFor(A.accountId, "conv-1", { summary: { delivery: "unknown" } });
  await mount(inNextApp(inbox({ account: A, detail, commandResult: unconfirmedSend() })));
  assert.match(document.querySelector(".of-blocked-actions")?.textContent ?? "", /Send as creator.*An earlier send is unresolved/, "refreshed action set holds the send");
  assert.equal(retryShown(), false, "Retry same request is offered while the refreshed action set holds send_manual_message (delivery unknown)");
});

test("P6: unconfirmed send, refreshed detail is no_contact: no Retry same request", async () => {
  const detail = detailFor(A.accountId, "conv-1", { summary: { automationMode: "no_contact", takeoverState: "none" } });
  await mount(inNextApp(inbox({ account: A, detail, commandResult: unconfirmedSend() })));
  assert.deepEqual({ sendDisabled: send()?.disabled, blocked: /Send as creator.*This fan asked for no further contact/.test(document.querySelector(".of-blocked-actions")?.textContent ?? "") },
    { sendDisabled: true, blocked: true }, "refreshed action set blocks the send (no_contact)");
  assert.equal(retryShown(), false, "Retry same request is offered after the fan asked for no further contact");
});
