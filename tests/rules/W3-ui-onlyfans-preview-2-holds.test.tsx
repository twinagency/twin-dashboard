// Characterization (W3 ui-onlyfans-preview-2, rules that HOLD on base ff918f6b; mutation proofs in
// tests/rules/mutations/W3-ui-onlyfans-preview-2/):
//   (a) InboxView.tsx:958 (disabledReason) / :411 — after an unconfirmed, non-simulated send_manual_message result, composer Send
//       stays disabled until the outcome is resolved or the same request is retried (no second send identity).
//   (b) EarningsAutoRefresh.tsx:6-11 — router.refresh() only while the document is visible, and the interval is cleared on unmount.
// Offline: jsdom, fetch stubbed, setInterval mocked for (b) on globalThis and window (helper mockTimers), synthetic ids.
import { advance, inNextApp, json, mockTimers, mount, nextRouter, stubFetch, unmount } from "../helpers/w3-preview2-dom";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import EarningsAutoRefresh from "../../components/onlyfans-preview/EarningsAutoRefresh";
import { clearDrafts, draftKey, writeDraft } from "../../lib/onlyfans/inbox-drafts";
import { PRINCIPAL, detailFor, inbox, liveAccount, liveResult } from "../helpers/w3-preview2-fixtures";

// ---- (a) unconfirmed send holds the composer ----
const A = liveAccount("acct-a"), CONV = "conv-1";
const send = () => document.querySelector<HTMLButtonElement>("[data-of-send]");
const showWith = (commandResult: ReturnType<typeof liveResult> | null) => {
  writeDraft(draftKey(PRINCIPAL, A.accountId, CONV), { body: "typed reply" });
  return mount(inNextApp(inbox({ account: A, detail: detailFor(A.accountId, CONV), commandResult })));
};

test("hold (a) control: typed reply with a recorded previous send is sendable", async () => {
  clearDrafts(); stubFetch(() => json({ ok: false }, 404));
  await showWith(liveResult("send_manual_message", "recorded", A.accountId, CONV));
  assert.equal(send()?.disabled, false);
});

test("hold (a): after an unconfirmed live send, composer Send stays disabled and says why", async () => {
  clearDrafts(); stubFetch(() => json({ ok: false }, 404));
  await showWith(liveResult("send_manual_message", "unconfirmed", A.accountId, CONV));
  assert.equal(send()?.disabled, true, "Send must stay disabled while the previous send's outcome is unconfirmed");
  assert.match(document.querySelector(".of-composer")?.textContent ?? "", /Resolve the previous request outcome or retry that same request/);
});

// ---- (b) EarningsAutoRefresh ----
let visibility: DocumentVisibilityState = "visible";
const showRefresher = async () => { const router = nextRouter(); await mount(inNextApp(<EarningsAutoRefresh />, router, "/onlyfans/sales")); return router; };
/** The component calls window.setInterval (jsdom's own timer); mockTimers patches window too. */
const enableTimers = () => mockTimers(["setInterval"]);

beforeEach(() => {
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});

test("hold (b) control: visible page refreshes every 30 s", async () => {
  enableTimers();
  const router = await showRefresher();
  await advance(30_000); await advance(30_000);
  assert.equal(router.refreshes, 2);
});

test("hold (b): hidden page never calls router.refresh()", async () => {
  enableTimers();
  visibility = "hidden";
  const router = await showRefresher();
  await advance(30_000); await advance(30_000); await advance(30_000);
  assert.equal(router.refreshes, 0, "router.refresh() ran while document.visibilityState was hidden");
});

test("hold (b): unmount clears the interval (no refresh afterwards)", async () => {
  enableTimers();
  const router = await showRefresher();
  await advance(30_000);
  assert.equal(router.refreshes, 1);
  await unmount();
  await advance(30_000); await advance(30_000);
  assert.equal(router.refreshes, 1, "interval kept refreshing after unmount");
});
