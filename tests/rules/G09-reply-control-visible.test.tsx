// RULE G09 (W3 ui-onlyfans-preview-2 P4, REVIEW inv 7 "STOP/holds win"): on a desktop width under 1280px the Reply control (Pause,
// Stop further contact, the hold copy) is displayed whenever Send is. P5/P6 are not G09.
// Offline: jsdom (Tailwind display resolved from class tokens by hiddenAt), fetch stubbed, synthetic ids.
import { button, click, close, hiddenAt, json, mount, resetDom, stubFetch, viewport } from "../helpers/w3-preview1-dom";
import assert from "node:assert/strict";
import test, { after, afterEach, beforeEach } from "node:test";
import { detailFor, inbox, liveAccount } from "../helpers/w3-preview2-fixtures";

const A = liveAccount("acct-a");
const replyControl = () => document.querySelector('section[aria-label="Reply control"]');
const send = () => document.querySelector<HTMLButtonElement>("[data-of-send]");

beforeEach(() => { stubFetch(() => json({ ok: false }, 404)); });
afterEach(resetDom);
after(close);
/** Visibility of the Reply control and Send at the current viewport width; null when the element did not render. */
const shown = () => {
  const reply = replyControl(), sending = send();
  return { replyControl: reply ? !hiddenAt(reply, viewport.width) : null, send: sending ? !hiddenAt(sending, viewport.width) : null };
};

test("control: at 1440px the Reply control and Send are both displayed", async () => {
  await mount(inbox({ account: A, detail: detailFor(A.accountId, "conv-1") }));
  assert.deepEqual(shown(), { replyControl: true, send: true });
});

test("P4: at 1100px (matchMedia max-width 1279px) the Reply control is displayed while Send is", async () => {
  viewport.width = 1100;
  await mount(inbox({ account: A, detail: detailFor(A.accountId, "conv-1") }));
  assert.equal(shown().send, true, "Send is displayed in the chat card");
  assert.deepEqual(shown(), { replyControl: true, send: true },
    "Reply control (Pause / Stop further contact / hold copy) is display:none at 1100px while Send stays one click away");
});

/** The brakes and Send, displayed or not at the current width; a brake rendered twice would make the counts > 1. */
const brakes = () => {
  const pause = [...document.querySelectorAll('[data-of-action="pause_automation"]')], stop = [...document.querySelectorAll('[data-of-action="mark_no_contact"]')];
  return { pause: pause.filter(node => !hiddenAt(node, viewport.width)).length, stop: stop.filter(node => !hiddenAt(node, viewport.width)).length,
    rendered: document.querySelectorAll('section[aria-label="Reply control"]').length };
};
const automated = () => detailFor(A.accountId, "conv-1", { summary: { automationMode: "automated", takeoverState: "none" } });

test("FA4: after 'Hide fan details' the brakes stay displayed beside Send, rendered once", async () => {
  await mount(inbox({ account: A, detail: automated() }));
  assert.deepEqual(brakes(), { pause: 1, stop: 1, rendered: 1 }, "panel open: one Reply control");
  await click(button(/Hide fan details/));
  assert.equal(shown().send, true, "Send stays displayed");
  assert.deepEqual(brakes(), { pause: 1, stop: 1, rendered: 1 }, "panel hidden: Pause AI and Stop further contact are display:none while Send shows");
  await click(button(/^Fan details$/));
  assert.deepEqual(brakes(), { pause: 1, stop: 1, rendered: 1 }, "panel reopened: the Reply control renders once, not twice");
});

test("FA4: below 1024px the chat tab shows the brakes beside Send; the Fan info sheet takes them over", async () => {
  viewport.width = 390;
  await mount(inbox({ account: A, detail: automated() }));
  await click(document.querySelector('[data-of-mobile-panel="chat"]'));
  assert.equal(shown().send, true, "Send is displayed on the chat tab");
  assert.deepEqual(brakes(), { pause: 1, stop: 1, rendered: 1 }, "chat tab: brakes displayed with Send");
  await click(document.querySelector('[data-of-mobile-panel="controls"]'));
  assert.deepEqual(brakes(), { pause: 1, stop: 1, rendered: 1 }, "sheet open: the Reply control renders once, in the sheet");
});
