// RULE G09 (W3 ui-onlyfans-preview-2 P4, REVIEW inv 7 "STOP/holds win"): on a desktop width under 1280px the Reply control (Pause,
// Stop further contact, the hold line) is displayed whenever Send is. P5/P6 are not G09.
// Offline: jsdom (Tailwind display resolved from class tokens by hiddenAt), fetch stubbed, synthetic ids.
import { button, click, close, hiddenAt, json, mount, resetDom, serve, type, viewport } from "../helpers/w3-preview1-dom";
import assert from "node:assert/strict";
import test, { after, afterEach, beforeEach } from "node:test";
import { detailFor, inbox, incident, liveAccount } from "../helpers/w3-preview2-fixtures";

const A = liveAccount("acct-a");
const replyControl = () => document.querySelector('section[aria-label="Reply control"]');
const send = () => document.querySelector<HTMLButtonElement>("[data-of-send]");

beforeEach(() => { serve(() => json({ ok: false }, 404)); });
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

/** Brakes displayed at the current width. The panel's Reply control stays mounted while hidden, so a displayed count > 1 would be a duplicate. */
const brakes = () => {
  const shownCount = (selector: string) => [...document.querySelectorAll(selector)].filter(node => !hiddenAt(node, viewport.width)).length;
  return { pause: shownCount('[data-of-action="pause_automation"]'), stop: shownCount('[data-of-action="mark_no_contact"]') };
};
const automated = (opts: Parameters<typeof detailFor>[2] = {}) => detailFor(A.accountId, "conv-1", { ...opts, summary: { automationMode: "automated", takeoverState: "none" } });

test("P4: at 1100px (matchMedia max-width 1279px) the brakes are displayed while Send is", async () => {
  viewport.width = 1100;
  await mount(inbox({ account: A, detail: automated() }));
  assert.equal(shown().send, true, "Send is displayed in the chat card");
  assert.deepEqual(brakes(), { pause: 1, stop: 1 }, "Pause AI / Stop further contact are display:none at 1100px while Send stays one click away");
});

test("FA4: after 'Hide fan details' the brakes stay displayed beside Send, once", async () => {
  await mount(inbox({ account: A, detail: automated() }));
  assert.deepEqual(brakes(), { pause: 1, stop: 1 }, "panel open: brakes in the Reply control");
  await click(button(/Hide fan details/));
  assert.equal(shown().send, true, "Send stays displayed");
  assert.deepEqual(brakes(), { pause: 1, stop: 1 }, "panel hidden: Pause AI and Stop further contact are display:none while Send shows");
  await click(button(/^Fan details$/));
  assert.deepEqual(brakes(), { pause: 1, stop: 1 }, "panel reopened: each brake displayed once, not twice");
});

test("FA4: below 1024px the chat tab shows the brakes beside Send; the Fan info sheet takes them over", async () => {
  viewport.width = 390;
  await mount(inbox({ account: A, detail: automated() }));
  await click(document.querySelector('[data-of-mobile-panel="chat"]'));
  assert.equal(shown().send, true, "Send is displayed on the chat tab");
  assert.deepEqual(brakes(), { pause: 1, stop: 1 }, "chat tab: brakes displayed with Send");
  await click(document.querySelector('[data-of-mobile-panel="controls"]'));
  assert.deepEqual(brakes(), { pause: 1, stop: 1 }, "sheet open: each brake displayed once, in the sheet");
});

test("R2-7: hiding and showing fan details keeps the delivery-resolution draft", async () => {
  await mount(inbox({ account: A, detail: automated({ incident: incident("att-1") }) }));
  const field = () => document.querySelector<HTMLInputElement>('input[aria-label="Provider message ID"]');
  assert.ok(field(), "the resolution form renders for a held delivery");
  await type(field(), "12345");
  await click(document.querySelector('[data-of-decision]'));
  await click(button(/Hide fan details/));
  assert.match(document.querySelector("[data-of-chat-brakes]")?.textContent ?? "", /Delivery held/, "the hold line shows beside Send");
  await click(button(/^Fan details$/));
  assert.equal(field()?.value, "12345", "the typed provider message ID survives the panel toggle");
  assert.equal(document.querySelector('[data-of-decision][aria-pressed="true"]') !== null, true, "the chosen decision survives the panel toggle");
});
