/** Offline jsdom harness for the W1 lane 7b component tests (known-red and rules). Import it first: it installs the DOM globals. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before } from "node:test";
import React, { act } from "react";
import { CONTENT_SCHEMA } from "../../lib/onlyfans/content";
import { parsePreparationState } from "../../lib/onlyfans/preparation";
const { JSDOM } = createRequire(import.meta.url)("jsdom");

// pretendToBeVisual: the document is visible, so a fix that pauses polling while the tab is hidden still polls here.
export const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/onlyfans/content", pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent, React, IS_REACT_ACT_ENVIRONMENT: true });
// Real timers captured before any test enables node:test mock timers.
const realSetTimeout = globalThis.setTimeout, realSetImmediate = globalThis.setImmediate;

let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => { ({ createRoot } = await import("react-dom/client")); });
after(async () => { await act(async () => root?.unmount()); dom.window.close(); });

export async function unmount() { if (root) await act(async () => root!.unmount()); root = undefined; }
export async function mount(element: React.ReactElement) {
  await unmount();
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(element); });
}
/** Real-time settle: lets stubbed fetches and React updates finish. */
export const settle = async () => act(async () => { await new Promise(resolve => realSetTimeout(resolve, 25)); });
/** Settle without the real-time wait (for loops under mock timers). */
export const flush = async () => act(async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => realSetImmediate(resolve)); });
export const pageText = () => document.body.textContent ?? "";
export const button = (label: RegExp) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => label.test(item.textContent ?? ""));
export const field = (label: string) => [...document.querySelectorAll("label")].find(item => (item.textContent ?? "").startsWith(label))?.querySelector("input") ?? null;
export async function click(element: Element | null | undefined) {
  assert.ok(element, "element to click exists");
  await act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  await settle();
}
export async function type(element: Element | null | undefined, value: string) {
  assert.ok(element, "input exists");
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
export async function submit(form: Element | null | undefined) {
  assert.ok(form, "form exists");
  await act(async () => { form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
  await settle();
}

/** Codex final (r3): a refusal counts as shown without pinning copy: `scope` shows the backend's error text, or any role=status/alert
 *  element says it in its own words. Returns a string for the failure message (no jsdom node reaches the assertion reporter). */
const REFUSAL_WORDS = /refused|changed|not (applied|saved|recorded)|could not|cannot/i;
export function refusalShown(scope: Element | null | undefined, backendError: string): { shown: boolean; seen: string } {
  const live = [...document.querySelectorAll("[role=status],[role=alert]")].map(item => (item.textContent ?? "").trim());
  const shown = Boolean(scope?.textContent?.includes(backendError)) || live.some(text => REFUSAL_WORDS.test(text));
  return { shown, seen: `scope says: ${(scope?.textContent ?? "(gone)").slice(0, 300)}; status/alert: ${JSON.stringify(live)}` };
}
export const hasButton = (label: RegExp): boolean => Boolean(button(label)); // boolean: a failing assertion that inspects a jsdom node exhausts the heap

type StubPost = { url: string; body: Record<string, unknown> };
/**
 * One offline fetch for every lane 7b test, used as `globalThis.fetch = stub.fetch` or `fetchImpl={stub.fetch}`. GETs go to `read(url, n)`
 * (n = 0-based read count); POSTs are recorded in `posts` and answered by `post()`. A POST with no `post` answer is still recorded and
 * gets a lost reply (no assertion here: the component would swallow it); tests that expect no write assert `posts.length === 0`.
 * With `holdReadsAfter: k`, read k and later wait for `release()`, so React renders in between, as with a real network read.
 */
export function stubFetch({ read, post, holdReadsAfter }: { read: (url: string, n: number) => Response | Promise<Response>;
  post?: () => Response | Promise<Response>; holdReadsAfter?: number }) {
  let open = () => {};
  const released = new Promise<void>(resolve => { open = resolve; });
  const stub = { posts: [] as StubPost[], reads: 0, release: () => open(),
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        stub.posts.push({ url, body: JSON.parse(String(init.body)) });
        return (post ?? lostReply)();
      }
      const n = stub.reads++;
      if (holdReadsAfter !== undefined && n >= holdReadsAfter) await released;
      return read(url, n);
    }) as typeof fetch };
  return stub;
}
export const lostReply = async (): Promise<Response> => { throw new TypeError("connection reset"); };

/** CategoryDrafts price read: the exact shape parseCategoryPrice (commercial-categories.ts) accepts. */
export const categoryPriceRead = () => Response.json({ schemaVersion: CONTENT_SCHEMA, ok: true,
  accountId: "of-a", categoryPrice: { folderId: "7", name: "Beach", revision: 1, priceCents: 1200, currency: "USD", appliesTo: "single_asset", fingerprint: "c".repeat(64) } });
/** Install `stub` as the global fetch, mount CategoryDrafts (account of-a, folder 7) and let it read the price. */
export async function openCategoryDrafts(stub: { fetch: typeof fetch }, selectedIds: string[]) {
  globalThis.fetch = stub.fetch;
  const { default: CategoryDrafts } = await import("../../components/onlyfans-preview/CategoryDrafts");
  await mount(React.createElement(CategoryDrafts, { accountId: "of-a", folderId: "7", selectedIds, onCreated: () => {} }));
  await settle();
}
/** Enter `text` as the category single price and click Save agency price. */
export async function saveCategoryPrice(text: string) {
  await type(document.querySelector("input[aria-label='Category single price']"), text);
  await click(button(/^Save agency price$/));
}

/** Preparation fixtures: built, then checked with parsePreparationState (lib/onlyfans/preparation.ts:39) so a drifted shape fails loudly. */
export type Mode = "fixture" | "production";
const parsed = <T,>(value: T): T => { assert.ok(parsePreparationState(value), "fixture is a valid preparation state"); return value; };
export const preparationConfigured = (mode: Mode, extra: Record<string, unknown> = {}) => parsed({ configured: true, revision: 3, status: "configured",
  fingerprint: "e".repeat(64), config: { contract_version: "preparation.v1", provider_account: "acct_synthetic", creator_id: "123456",
    qualification: { mode, reference: "synthetic-approval-1" }, limits: { provider_requests: 10, provider_credit_budget: 100, provider_credits_per_request: 1 } },
  providerRequestsUsed: 0, providerCreditsReserved: 0, automaticRepliesEnabled: false, salesEnabled: false, historyCoverage: "pending", ownershipCoverage: "pending",
  connected: false, vault: null, ...extra });
export const preparationUnconfigured = () => parsed({ configured: false, canPrepare: true });
export const preparationRead = (preparation: unknown) => Response.json({ ok: true, preparation });
/** Configured account: raise "Maximum provider requests" to 20 and submit the form. */
export async function savePreparationLimits() {
  await type(field("Maximum provider requests"), "20");
  await submit(document.querySelector("[data-commercial-preparation] form"));
}
/** Install `stub` as the global fetch (Preparation and CategoryDrafts have no fetchImpl seam), mount Preparation and let it read. */
export async function openPreparation(stub: { fetch: typeof fetch }) {
  globalThis.fetch = stub.fetch;
  const { default: Preparation } = await import("../../components/onlyfans-preview/Preparation");
  await mount(React.createElement(Preparation, { accountId: "of-a" }));
  await settle();
}
