// KNOWN RED (W3 ui-onlyfans-preview-2 P2/P3/P12, InboxView.tsx):
//   P2 :262,:270 Thread identity is conversationId only (no account), and Thread at :945 has no key. Switching to the same
//      conversationId on another account keeps A's scroll, skips B's recallScroll and shows "N new messages" for the length delta.
//   P3 :280 the unseen count is the timeline length delta, and the timeline includes handover control events, so a late handover
//      read shows "k new messages" with no new message.
//   P29 (new, measured here) :280 the first message that arrives while scrolled up is never counted.
//   P12 InboxView.tsx:999 vs HandoverPanel.tsx:11 — rendered the way OnlyFansWorkspace.tsx:849-850 renders it (HandoverPanel in
//      the `handover` slot plus handoverHistory), an automated fan on an account whose runtime is disabled gets two role=status
//      lines that contradict: "AI enabled for this fan. Account paused" and the panel's "AI replies enabled".
// Team's Claude owns the fixes. Offline: jsdom with a prototype scroll box on [data-of-thread] (survives a remount), fetch stubbed.
import { dom, inNextApp, json, mount, rerender, settle, stubFetch, stubScrollBox } from "../helpers/w3-preview2-dom";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { act } from "react";
import { clearInboxViewMemory, rememberScroll } from "../../lib/onlyfans/inbox-view-memory";
import type { ConversationDetail, OfAccount } from "../../lib/onlyfans-preview/types";
import type { Handover } from "../../lib/onlyfans/handover";
import HandoverPanel from "../../components/onlyfans-preview/HandoverPanel";
import { PRINCIPAL, detailFor, handover, inbox, liveAccount } from "../helpers/w3-preview2-fixtures";

const A = liveAccount("acct-a"), B = liveAccount("acct-b");
const view = (account: OfAccount, detail: ConversationDetail, handoverHistory?: Handover | null) =>
  inNextApp(inbox({ account, detail, allAccounts: [A, B], handoverHistory }));
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
const scrollTop = () => thread()?.scrollTop ?? null;

beforeEach(() => { clearInboxViewMemory(); stubFetch(() => json({ ok: false }, 404)); stubScrollBox("[data-of-thread]", { scrollHeight: 2000, clientHeight: 400 }); });

/**
 * Scroll A's thread up, then deliver one real message. Measured: that FIRST message is never counted (P29 below), because the
 * `setUnseen` updater runs lazily after `previousLength` was already overwritten; later messages are counted. The tests prime
 * past it so P2/P3 measure their own defect.
 */
async function scrolledUpAndPrimed(account: OfAccount, conversationId: string, count = 2, handoverHistory?: Handover | null) {
  await mount(view(account, detailFor(account.accountId, conversationId, { messageCount: count, revision: 42 }), handoverHistory));
  await scrollAwayFromBottom();
  await rerender(view(account, detailFor(account.accountId, conversationId, { messageCount: count + 1, revision: 42 }), handoverHistory));
}

// ---- P29 (found while building P3) ----
test("control: scrolled up, messages keep arriving: a new-messages pill appears", async () => {
  await scrolledUpAndPrimed(A, "conv-x");
  await rerender(view(A, detailFor(A.accountId, "conv-x", { messageCount: 4, revision: 42 })));
  assert.match(pill() ?? "", /new message/);
});

test("P29: scrolled up, the first message that arrives is counted", async () => {
  await scrolledUpAndPrimed(A, "conv-x");
  assert.equal(pill(), "1 new message ↓", "first message to arrive while scrolled up is not counted (lazy updater reads the overwritten previousLength)");
});

// ---- P2 ----
test("control: scrolled up on A, switch to a DIFFERENT conversationId: no pill, B's saved scroll recalled", async () => {
  await scrolledUpAndPrimed(A, "conv-x");
  rememberScroll(PRINCIPAL, B.accountId, "conv-y", 120);
  await rerender(view(B, detailFor(B.accountId, "conv-y", { messageCount: 6 })));
  assert.deepEqual({ pill: pill(), scrollTop: scrollTop() }, { pill: null, scrollTop: 120 });
});

test("P2: scrolled up on A, switch to the SAME conversationId on account B: no pill, B's saved scroll recalled", async () => {
  await scrolledUpAndPrimed(A, "conv-x");
  rememberScroll(PRINCIPAL, B.accountId, "conv-x", 120);
  await rerender(view(B, detailFor(B.accountId, "conv-x", { messageCount: 6 })));
  assert.match(thread()?.textContent ?? "", /message 6 in conv-x/, "account B's thread is on screen");
  assert.deepEqual({ pill: pill(), scrollTop: scrollTop() }, { pill: null, scrollTop: 120 },
    "thread state keyed by conversationId only: A's scroll kept, B's recallScroll skipped, length delta shown as new messages");
});

// ---- P3 ----
test("P3: scrolled up, a late handover read adds control events only: new-messages pill unchanged", async () => {
  await scrolledUpAndPrimed(A, "conv-x", 2, null);
  const before = pill();
  const events = [{ action: "request_takeover", mode: "human_controlled", revision: 40, who: "you", at: "2026-10-17T08:00:30.000Z" },
    { action: "complete_takeover", mode: "human_controlled", revision: 41, who: "you", at: "2026-10-17T08:00:40.000Z" }];
  await rerender(view(A, detailFor(A.accountId, "conv-x", { messageCount: 3, revision: 42 }), handover(A.accountId, "conv-x", 41, events)));
  assert.equal(document.querySelectorAll("[data-of-handover-event]").length, 2, "control events rendered in the thread");
  assert.deepEqual({ before, after: pill() }, { before, after: before }, "handover control events counted as new messages");
});

// ---- P12 ----
const statuses = () => [...document.querySelectorAll('section[aria-label="Reply control"] [role="status"]')].map(node => node.textContent ?? "");
/** The live wiring (OnlyFansWorkspace.tsx:849-850): HandoverPanel in the `handover` slot, the same handover as history. */
const liveView = (account: OfAccount, detail: ConversationDetail, current: Handover) => inNextApp(inbox({ account, detail, allAccounts: [account],
  handoverHistory: current, handover: <HandoverPanel value={current} loading={false} onRefresh={() => {}} /> }));
const aiLines = () => statuses().filter(line => /\bAI\b/.test(line));

test("control: human-controlled conversation, live handover panel: one status line, the owner", async () => {
  const current = handover(A.accountId, "conv-x", 42, []);
  await mount(liveView(A, detailFor(A.accountId, "conv-x", { revision: 42 }), current));
  assert.deepEqual(statuses(), ["You are handling replies"]);
});

test("P12: automated + account runtime disabled, live handover panel: no Reply control line claims AI replies are enabled", async () => {
  const paused = liveAccount("acct-a", { runtime: { enabled: false, deliveryEnabled: true, sender: { state: "running", observedAt: null, reason: null } } });
  const current = handover(paused.accountId, "conv-x", 42, [], { mode: "automated", takeoverState: "none", owner: null });
  await mount(liveView(paused, detailFor(paused.accountId, "conv-x", { revision: 42, summary: { automationMode: "automated", takeoverState: "none" } }), current));
  assert.deepEqual({ aiLines: aiLines().length, claimsEnabled: statuses().some(line => /^AI replies enabled$/.test(line.trim())) }, { aiLines: 1, claimsEnabled: false },
    `Reply control status lines while runtime.enabled is false: ${JSON.stringify(statuses())}`);
});
