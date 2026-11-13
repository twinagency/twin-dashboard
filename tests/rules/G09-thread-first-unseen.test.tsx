// RULE G09 (W3 ui-onlyfans-preview-2 P29): scrolled up, the FIRST message that arrives is counted in the new-messages pill. The
// unseen delta is taken before previousLength is overwritten, not inside a lazy state updater. P2/P3/P12 are not G09.
// Offline: jsdom with a prototype scroll box on [data-of-thread], fetch stubbed.
import { dom, inNextApp, json, mount, rerender, settle, stubFetch, stubScrollBox } from "../helpers/w3-preview2-dom";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { act } from "react";
import { clearInboxViewMemory } from "../../lib/onlyfans/inbox-view-memory";
import type { ConversationDetail, OfAccount } from "../../lib/onlyfans-preview/types";
import type { Handover } from "../../lib/onlyfans/handover";
import { detailFor, inbox, liveAccount } from "../helpers/w3-preview2-fixtures";

const A = liveAccount("acct-a");
const view = (account: OfAccount, detail: ConversationDetail, handoverHistory?: Handover | null) =>
  inNextApp(inbox({ account, detail, allAccounts: [A], handoverHistory }));
const thread = () => document.querySelector<HTMLDivElement>("[data-of-thread]");
const pill = () => document.querySelector("[data-of-new-messages]")?.textContent ?? null;

/** Scroll the thread to the top, away from the bottom (the scroll box is stubbed on the prototype, see stubScrollBox). */
async function scrollAwayFromBottom() {
  const node = thread();
  assert.ok(node, "thread renders");
  node.scrollTop = 0;
  await act(async () => { node.dispatchEvent(new dom.window.Event("scroll")); });
  await settle();
}

beforeEach(() => { clearInboxViewMemory(); stubFetch(() => json({ ok: false }, 404)); stubScrollBox("[data-of-thread]", { scrollHeight: 2000, clientHeight: 400 }); });

/** Scroll A's thread up, then deliver one real message: the first one to arrive while scrolled up. */
async function scrolledUpAndPrimed(account: OfAccount, conversationId: string, count = 2, handoverHistory?: Handover | null) {
  await mount(view(account, detailFor(account.accountId, conversationId, { messageCount: count, revision: 42 }), handoverHistory));
  await scrollAwayFromBottom();
  await rerender(view(account, detailFor(account.accountId, conversationId, { messageCount: count + 1, revision: 42 }), handoverHistory));
}

test("control: scrolled up, messages keep arriving: a new-messages pill appears", async () => {
  await scrolledUpAndPrimed(A, "conv-x");
  await rerender(view(A, detailFor(A.accountId, "conv-x", { messageCount: 4, revision: 42 })));
  assert.match(pill() ?? "", /new message/);
});

test("P29: scrolled up, the first message that arrives is counted", async () => {
  await scrolledUpAndPrimed(A, "conv-x");
  assert.equal(pill(), "1 new message ↓", "first message to arrive while scrolled up is not counted (lazy updater reads the overwritten previousLength)");
});
