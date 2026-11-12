// KNOWN RED (W7 ui-manualtakeover-plus13, finding F2, data-risk/high): a payout whose outcome is unknown must not be
// re-recorded under a fresh idempotency key. PayoutDashboard.tsx:94-95 re-mints `requestId` whenever the form fingerprint
// changes, and lib/payouts/server.ts:86-91 dedupes only on `request_id`. So after a POST whose response was lost (the
// insert may have committed), editing any field (e.g. fixing the reference) and saving again sends a NEW requestId and the
// server inserts a second payout row. Keeping the id is safe: the server already answers 409 for the same id with
// different fields (server.ts:89-90).
// Condition: admin/manager on /payouts whose save got a network error or lost response, who then edits a field and saves.
// Fixed: keep `requestId` until a 2xx (or an explicit "new payout"); show "unconfirmed, check payment history" meanwhile.
// Run: nice -n 10 node --import tsx --test tests/known-red/W7-ui-manualtakeover-plus13-payout-request-id.test.tsx
// Not wired into npm scripts. Offline: jsdom, global fetch stubbed at the wire (/api/payouts), CSS module stubbed via
// CJS Module._load. No server, no database, no network.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";
import React, { act } from "react";
const requireNative = createRequire(import.meta.url);
const { JSDOM } = requireNative("jsdom");

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/payouts" });
const win = dom.window;
Object.assign(globalThis, { window: win, document: win.document, HTMLElement: win.HTMLElement, Event: win.Event, MouseEvent: win.MouseEvent, FormData: win.FormData, React, IS_REACT_ACT_ENVIRONMENT: true });
win.HTMLElement.prototype.scrollIntoView = () => {};

const Module = requireNative("node:module") as { _load: (request: string, ...rest: unknown[]) => unknown };
const load = Module._load;
Module._load = (request, ...rest) => {
  if (request.endsWith(".module.css")) return new Proxy({}, { get: (_t, key) => (key === "__esModule" ? false : String(key)) });
  return load(request, ...rest);
};

const CREATOR = "11111111-1111-4111-8111-111111111111";
const snapshot = { audience: "admin", canManage: true, brand: "twin", creators: [{ id: CREATOR, name: "Creator A", earnedUsdCents: 100_00, paid: { USD: 0, AUD: 0 }, lastPaidOn: null }],
  history: [], historyCount: 0, page: 0, pageSize: 50, checkedAt: "2026-11-12T00:00:00.000Z" };
let posts: { requestId: string; reference: string }[] = [];
let postOutcomes: ("lost" | "ok")[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (!url.startsWith("/api/payouts")) throw new Error(`unexpected fetch ${url}`);
  if (init?.method === "POST") {
    posts.push(JSON.parse(String(init.body)));
    // "lost": the request reached the server (it may have committed) but the response never arrived.
    if ((postOutcomes.shift() ?? "ok") === "lost") throw new TypeError("Failed to fetch");
    return Response.json({ id: "22222222-2222-4222-8222-222222222222" });
  }
  return Response.json(snapshot);
}) as typeof fetch;

let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => { ({ createRoot } = await import("react-dom/client")); });
after(async () => { await act(async () => root?.unmount()); dom.window.close(); });
const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });

async function mount() {
  const { default: PayoutDashboard } = await import("../../components/PayoutDashboard");
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<PayoutDashboard audience="admin" brand="twin" />); });
  await settle();
}
const field = (name: string) => { const el = document.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`); assert.ok(el, `field ${name} rendered`); return el; };
async function fill(reference: string) {
  const select = field("cloneId") as HTMLSelectElement;
  await act(async () => { select.value = CREATOR; select.dispatchEvent(new win.Event("change", { bubbles: true })); });
  (field("amount") as HTMLInputElement).value = "50.00";
  (field("paidOn") as HTMLInputElement).value = "2026-11-10";
  (field("reference") as HTMLInputElement).value = reference;
}
async function save() {
  const form = document.querySelector("form");
  assert.ok(form, "payout form rendered");
  await act(async () => { form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true })); });
  await settle();
}

test("control: after a lost response, an unchanged resubmit reuses the same requestId", async () => {
  posts = []; postOutcomes = ["lost", "ok"];
  await mount();
  await fill("BANK-001");
  await save();
  assert.equal(posts.length, 1, "first save posted");
  assert.ok(document.querySelector('[role="alert"]'), "the lost response is surfaced to the admin");
  await save();
  assert.equal(posts.length, 2, "retry posted");
  assert.equal(posts[1].requestId, posts[0].requestId, "unchanged retry carries the same idempotency key");
});

test("F2: after a lost response, editing a field and saving again must keep the requestId (server dedupes on it)", async () => {
  posts = []; postOutcomes = ["lost", "ok"];
  await mount();
  await fill("BANK-001");
  await save();
  assert.equal(posts.length, 1, "first save posted");
  (field("reference") as HTMLInputElement).value = "BANK-001-fixed";
  await save();
  assert.equal(posts.length, 2, "edited retry posted");
  assert.equal(posts[1].reference, "BANK-001-fixed", "the edit reached the payload");
  assert.equal(posts[1].requestId, posts[0].requestId,
    "an outcome-unknown payout re-sent under a fresh requestId is inserted as a second payout row");
});

test("control: after a confirmed save, the next payout gets a new requestId (rules out a hard-coded key)", async () => {
  posts = []; postOutcomes = ["ok", "ok"];
  await mount();
  await fill("BANK-002");
  await save();
  assert.ok(document.querySelector('[role="status"]'), "confirmed save shows success");
  await fill("BANK-003");
  await save();
  assert.equal(posts.length, 2, "two separate payouts posted");
  assert.notEqual(posts[1].requestId, posts[0].requestId, "a new payout must not reuse a confirmed payout's key");
});
