// RULE G09 (W3 ui-onlyfans-preview-2 P4, REVIEW inv 7 "STOP/holds win"): on a desktop width under 1280px the Reply control (Pause,
// Stop further contact, the hold copy) is displayed whenever Send is. P5/P6 are not G09.
// Offline: jsdom (Tailwind display resolved from class tokens by hiddenAt), fetch stubbed, synthetic ids.
import { hiddenAt, inNextApp, json, mount, stubFetch, viewport } from "../helpers/w3-preview2-dom";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { detailFor, inbox, liveAccount } from "../helpers/w3-preview2-fixtures";

const A = liveAccount("acct-a");
const replyControl = () => document.querySelector('section[aria-label="Reply control"]');
const send = () => document.querySelector<HTMLButtonElement>("[data-of-send]");

beforeEach(() => { stubFetch(() => json({ ok: false }, 404)); });
/** Visibility of the Reply control and Send at the current viewport width; null when the element did not render. */
const shown = () => {
  const reply = replyControl(), sending = send();
  return { replyControl: reply ? !hiddenAt(reply, viewport.width) : null, send: sending ? !hiddenAt(sending, viewport.width) : null };
};

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
