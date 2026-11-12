// KNOWN RED (W5 lane app-catalogue-plus2, docs/review/W5/app-catalogue-plus2.md F1 + F2). Team's Claude owns the fix.
// F1: app/catalogue/[slug]/Catalogue.tsx:357-397 `payWithTon` drops `begin.orderId` on every non-confirmed exit. The bare
//     `catch {}` (:375-380) turns ANY connectWallet/sendTransaction failure (a bridge timeout after the wallet may already
//     have broadcast) into "Payment cancelled. You have not unlocked this item.", and after it or after the 5-min poll
//     (:383-394) the next tap calls `ton_checkout` again; the server mints a new order + memo every call
//     (lib/catalogue-ton.ts:113-127), so the fan signs a second transfer and pays twice.
// F2: Catalogue.tsx:327,342,738-739: no per-item "payment in flight" state spans both rails. F2a: after Telegram's 'paid'
//     callback with the server still unsettled, the 32-poll window ends with `canRetry` (the real server's retryAfterSeconds
//     reaches 0 after 60 s, lib/catalogue-checkout.ts:172-175) and the TON button for the same item is payable again.
//     F2b (reverse): after the TON poll gives up with the order still pending, the Stars button opens a new invoice.
// Not wired into npm scripts or init.sh (orchestrator merges the known-red list). Offline: jsdom, global fetch stubbed at
// the wire, fake Telegram WebApp, fake TonConnectUI (module swapped before Catalogue loads); nothing is sent anywhere.
// Clock: jsdom window.setTimeout delays >= 1 s run in 1 ms and advance the fake clock (Date.now) by their full delay when
// they fire, so the fake server's retryAfterSeconds counts down exactly as the real one would; tests may also jump the
// clock to pass the 5-min TON deadline.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, afterEach, before, beforeEach } from "node:test";
import React, { act } from "react";
const requireHere = createRequire(import.meta.url);
const { JSDOM } = requireHere("jsdom");
const tonSdk = requireHere("@tonconnect/sdk");

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/catalogue/fixture", pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent, KeyboardEvent: dom.window.KeyboardEvent, MutationObserver: dom.window.MutationObserver, React, IS_REACT_ACT_ENVIRONMENT: true });
class NoIntersection { observe() {} unobserve() {} disconnect() {} }
Object.assign(globalThis, { IntersectionObserver: NoIntersection });
Object.assign(dom.window, { IntersectionObserver: NoIntersection, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
const realNow = Date.now.bind(Date);
let clockOffset = 0;
Date.now = () => realNow() + clockOffset;
// Fast timers: the component's 2 s / 3 s polls and 90 s invoice guard run in 1 ms but move the fake clock by their delay;
// the 30 s background refresh never fires.
Object.assign(dom.window, {
  setTimeout: (fn: (...a: unknown[]) => void, ms = 0, ...args: unknown[]) =>
    ms >= 1000 ? setTimeout(() => { clockOffset += ms; fn(...args); }, 1) : setTimeout(fn, ms, ...args),
  clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  setInterval: () => 0, clearInterval: () => {},
});

// Module swaps (CJS loader, same as tests/components/engine-ui.test.tsx does for .css).
requireHere.extensions[".css"] = (module: { exports: unknown }) => { module.exports = {}; };
type SendBehaviour = "ok" | Error;
const wallet = { sends: [] as unknown[], next: [] as SendBehaviour[] };
class FakeTonConnectUI {
  connected = false; uiOptions: unknown;
  constructor(_options: unknown) {}
  async connectWallet() { this.connected = true; return {}; }
  async sendTransaction(tx: unknown) {
    wallet.sends.push(tx);
    const behaviour = wallet.next.shift() ?? "ok";
    if (behaviour instanceof Error) throw behaviour;
    return { boc: "te6cc-fixture" };
  }
}
function FakeScript({ onReady }: { onReady?: () => void }) { React.useEffect(() => { onReady?.(); }, []); return null; }
const Module = requireHere("node:module");
const originalLoad = Module._load;
Module._load = function (request: string, ...rest: unknown[]) {
  if (request === "@tonconnect/ui-react") return { ...tonSdk, TonConnectUI: FakeTonConnectUI };
  if (request === "next/script") return { __esModule: true, default: FakeScript };
  return originalLoad.call(this, request, ...rest);
};

// Fake Telegram WebApp: openInvoice reports whatever the test sets. 'paid'/'pending' means the fan went through Telegram's
// pre-checkout, which is when the real server writes a catalogue_checkout_attempts row (starts the 60 s retry clock).
let invoiceCallbackStatus = "paid";
let invoiceOpens = 0;
let starsAttemptAt: number | null = null;
const telegram = {
  initData: "fixture-init-data", initDataUnsafe: {}, ready() {}, expand() {}, close() {}, openTelegramLink(_url: string) {},
  openInvoice(_url: string, callback: (status: string) => void) {
    invoiceOpens++;
    if (invoiceCallbackStatus === "paid" || invoiceCallbackStatus === "pending") starsAttemptAt ??= Date.now();
    callback(invoiceCallbackStatus);
  },
};
Object.assign(dom.window, { Telegram: { WebApp: telegram } });

const ITEM_ID = "11111111-1111-4111-8111-111111111111";
const catalogue = () => ({
  checkoutMode: "invoice", name: "Fixture", verified: false, items: [{ id: ITEM_ID, type: "photo", description: "Fixture photo", stars: 100,
    free: false, purchased: false, received: false, createdAt: "2026-11-01T00:00:00Z" }],
  blur: 16, admin: false, enabled: true, canSend: true, chatUrl: "https://t.me/fixture", purchaseNote: "", bundles: [], rewards: null,
  tonEnabled: true, tonWalletAddress: "UQ-fixture-wallet", tonPerStar: 0.01, tonNanotonPerStar: 10_000_000, tonNanotonPerUsd: null,
  tonDiscountPercent: 0, tonReturnUrl: null, starTipAmounts: null,
});
// Wire fake of POST /api/catalogue/fixture, answering by `action` like the server: ton_checkout mints a NEW order every call.
let actions: string[];
let tonStatusPolls: string[];
// Mirrors catalogueOrderStatus (lib/catalogue-checkout.ts:165-176) for an order the server has not settled: 'checkout'
// once a pre-checkout attempt exists, retryAfterSeconds = attempt + 60 s - now on the fake clock; else 'pending'.
function checkoutStatus() {
  if (starsAttemptAt == null) return { status: "pending", retryAfterSeconds: 0 };
  return { status: "checkout", retryAfterSeconds: Math.max(0, Math.ceil((starsAttemptAt + 60_000 - Date.now()) / 1000)) };
}
let orderSeq = 0;
beforeEach(() => {
  actions = []; tonStatusPolls = []; wallet.sends = []; wallet.next = []; clockOffset = 0; invoiceCallbackStatus = "paid";
  invoiceOpens = 0; starsAttemptAt = null;
  dom.window.sessionStorage.clear(); dom.window.localStorage.clear();
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const action = String(body.action); actions.push(action);
    if (action === "catalogue") return Response.json(catalogue());
    if (action === "ton_checkout") {
      const n = ++orderSeq; const orderId = `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
      return Response.json({ orderId, memo: `memo${n}`, toAddress: "UQ-fixture-wallet", amountNanoton: 1_000_000_000, comment: `memo${n}` });
    }
    if (action === "ton_status") { tonStatusPolls.push(String(body.orderId)); return Response.json({ status: "pending" }); }
    if (action === "checkout") return Response.json({ orderId: "bbbbbbbb-0000-4000-8000-000000000001", invoiceUrl: "https://t.me/$fixture-invoice", status: "pending" });
    if (action === "checkout_status") return Response.json({ orderId: "bbbbbbbb-0000-4000-8000-000000000001", ...checkoutStatus() });
    if (action === "event") return Response.json({ ok: true });
    return Response.json({ error: `unexpected action ${action}` }, { status: 400 });
  }) as typeof fetch;
});

let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => { ({ createRoot } = await import("react-dom/client")); });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; });
after(async () => { Module._load = originalLoad; Date.now = realNow; dom.window.close(); });
const tick = async (ms = 20) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });

async function mountAndOpenItem() {
  const { default: Catalogue } = await import("../../app/catalogue/[slug]/Catalogue");
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<Catalogue slug="fixture" preview={false} />); });
  await tick();
  const card = document.querySelector<HTMLButtonElement>(".cat-picture-button");
  assert.ok(card, "catalogue rendered the fixture item");
  await act(async () => { card.click(); });
  await tick();
  assert.ok(document.querySelector(".cat-modal"), "item sheet open");
}
const tonButton = () => document.querySelector<HTMLButtonElement>(".cat-modal .cat-pay-ton");
const starsButton = () => document.querySelector<HTMLButtonElement>(".cat-modal .cat-pay-stars");
const notice = () => document.querySelector(".cat-modal .cat-payment-status")?.textContent ?? "";
const count = (action: string) => actions.filter(a => a === action).length;
// Tap TON and let the flow finish: a pending TON poll runs until the 5-min deadline, so jump the clock past it.
async function tapTonAndFinish() {
  const button = tonButton();
  assert.ok(button && !button.disabled, "TON button present and enabled");
  await act(async () => { button.click(); });
  await tick(60);
  clockOffset += 6 * 60_000;
  await tick(60);
}
const bridgeTimeout = () => Object.assign(new Error("[TON_CONNECT_SDK_ERROR] Bridge request timed out"), { name: "TonConnectError" });

test("control: one TON tap mints one order and one transfer; a wallet user-reject reads as cancelled", async () => {
  await mountAndOpenItem();
  await tapTonAndFinish();
  assert.equal(count("ton_checkout"), 1);
  assert.equal(wallet.sends.length, 1);
  assert.ok(tonStatusPolls.length >= 1, "the sent order is polled");
  assert.match(notice(), /Still confirming on TON/);

  await act(async () => root!.unmount()); root = undefined; actions = []; wallet.sends = []; dom.window.sessionStorage.clear();
  wallet.next = [new tonSdk.UserRejectsError()];
  await mountAndOpenItem();
  await tapTonAndFinish();
  assert.equal(wallet.sends.length, 1);
  assert.match(notice(), /Payment cancelled\. You have not unlocked this item\./);
});

test("F1a: a non-reject wallet error after sendTransaction was called must not be reported as cancelled / not unlocked", async () => {
  wallet.next = [bridgeTimeout()];
  await mountAndOpenItem();
  await tapTonAndFinish();
  assert.equal(wallet.sends.length, 1, "harness: the transfer was handed to the wallet");
  assert.doesNotMatch(notice(), /cancelled|not unlocked/i, "an unconfirmed transfer must not be shown as refused");
});

test("F1b: after a bridge error, tapping TON again must not mint a second order or ask for a second transfer", async () => {
  wallet.next = [bridgeTimeout(), "ok"];
  await mountAndOpenItem();
  await tapTonAndFinish();
  await tapTonAndFinish();
  assert.equal(count("ton_checkout"), 1, "second tap must check the kept order (ton_status), not mint a new memo");
  assert.equal(wallet.sends.length, 1, "second tap must not ask the wallet for a second transfer");
});

test("F1c: after the 5-min TON poll gives up, tapping TON again must not mint a second order or transfer", async () => {
  await mountAndOpenItem();
  await tapTonAndFinish();
  assert.match(notice(), /Still confirming on TON/, "harness: deadline path reached");
  await tapTonAndFinish();
  assert.equal(count("ton_checkout"), 1, "second tap must check the kept order, not mint a new memo");
  assert.equal(wallet.sends.length, 1, "second tap must not ask the wallet for a second transfer");
});

test("control: a Stars tap on a fresh item opens one invoice; a Telegram cancel reads as cancelled", async () => {
  invoiceCallbackStatus = "cancelled";
  await mountAndOpenItem();
  const stars = starsButton();
  assert.ok(stars && !stars.disabled);
  await act(async () => { stars.click(); });
  await tick(60);
  assert.equal(count("checkout"), 1);
  assert.equal(invoiceOpens, 1);
  assert.match(notice(), /Payment cancelled\. You have not unlocked this item\./);
});

test("F2a: after Telegram reports a Stars payment 'paid' and the server has not settled it, TON for that item must not be payable", async () => {
  await mountAndOpenItem();
  const stars = starsButton();
  assert.ok(stars && !stars.disabled);
  await act(async () => { stars.click(); });
  for (let i = 0; i < 20 && count("checkout_status") < 32; i++) await tick(30);
  await tick(60);
  assert.equal(count("checkout_status"), 32, "harness: full Stars poll window ran");
  assert.ok(clockOffset >= 60_000, "harness: fake clock moved through the poll window (~62 s)");
  assert.equal(invoiceOpens, 1);
  const ton = tonButton();
  assert.ok(!ton || ton.disabled, "TON must not be payable while a Telegram-reported Stars payment for the same item is unsettled");
  if (ton) { await act(async () => { ton.click(); }); await tick(); }
  assert.equal(count("ton_checkout"), 0, "no TON order for an item whose Stars payment is in flight");
});

test("F2b: after the TON poll gives up with the order still pending, the Stars button must not open a new invoice for that item", async () => {
  invoiceCallbackStatus = "cancelled"; // keeps the HEAD path short if the invoice does open
  await mountAndOpenItem();
  await tapTonAndFinish();
  assert.match(notice(), /Still confirming on TON/, "harness: TON order sent and still pending");
  const stars = starsButton();
  assert.ok(stars, "Stars button still rendered");
  if (!stars.disabled) { await act(async () => { stars.click(); }); await tick(60); }
  assert.equal(count("checkout"), 0, "no Stars order while the TON order for the same item is unconfirmed");
  assert.equal(invoiceOpens, 0, "no Stars invoice while the TON order for the same item is unconfirmed");
});
