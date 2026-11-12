/**
 * Offline jsdom harness for W1 lane 8 (preview-shell-launch) component tests, known-red and rules. Pattern copied from lane 7b's
 * tests/helpers/w1-7b-dom.ts. Import it FIRST: it installs the DOM globals before any component (or next/navigation) module loads.
 * next/navigation hooks are satisfied by real Next context providers (`inNextApp`), not module mocks: useRouter/usePathname/
 * useSearchParams read AppRouterContext/PathnameContext/SearchParamsContext, so the component runs its real navigation code.
 * No network: every fetch goes to `stubFetch`. Synthetic ids only (of-a, *.invalid).
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before } from "node:test";
import React, { act } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { MOXY_SCHEMA, parseMoxy, type MoxyMode } from "../../lib/onlyfans/moxy";
import { parseEngagementPage } from "../../lib/onlyfans/launch/native";
import { parseAccounts, parseConversations, parseRuntime } from "../../lib/onlyfans/launch/automation/b-automation";
const requireNative = createRequire(import.meta.url);
const { JSDOM } = requireNative("jsdom");
// CSS modules (e.g. VaultMediaPicker.module.css) load as empty objects, as in scripts/check-onlyfans-ui.tsx.
requireNative.extensions[".css"] = module => { module.exports = {}; };

export const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/onlyfans/launch", pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent, Element: dom.window.Element, Node: dom.window.Node, getComputedStyle: dom.window.getComputedStyle,
  requestAnimationFrame: dom.window.requestAnimationFrame, cancelAnimationFrame: dom.window.cancelAnimationFrame, React, IS_REACT_ACT_ENVIRONMENT: true });
const realSetTimeout = globalThis.setTimeout;

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
export const settle = async (ms = 25) => act(async () => { await new Promise(resolve => realSetTimeout(resolve, ms)); });
export const button = (label: RegExp) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => label.test(item.textContent ?? ""));
export async function click(element: Element | null | undefined) {
  assert.ok(element, "element to click exists");
  await act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  await settle();
}
/** Choose `value` in a <select> the way a user does (also reachable for a disabled option, as a script or devtools can). */
export async function choose(select: HTMLSelectElement | null | undefined, value: string) {
  assert.ok(select, "select exists");
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, "value")!.set!.call(select, value);
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
}
/** Status/alert text, for asserting notices without pinning layout. */
export const liveText = () => [...document.querySelectorAll("[role=status],[role=alert]")].map(item => (item.textContent ?? "").trim()).filter(Boolean);

/** Real Next app-router contexts around `element`, so next/navigation hooks work without module mocks. */
export function inNextApp(element: React.ReactElement, pathname = "/onlyfans/launch") {
  const value = { back() {}, forward() {}, refresh() {}, prefetch() {}, hmrRefresh() {}, push() {}, replace() {} };
  return React.createElement(AppRouterContext.Provider, { value: value as never },
    React.createElement(PathnameContext.Provider, { value: pathname },
      React.createElement(SearchParamsContext.Provider, { value: new URLSearchParams() as never }, element)));
}

export type Call = { url: string; method: string; body: unknown };
/**
 * One offline fetch, installed as globalThis.fetch. `answer(url, method, n)` gets every request (n = 0-based count of earlier calls to
 * the same method+path); throw or return a Response. Calls are recorded in `calls`; `count(re, method)` counts matching ones.
 */
export function stubFetch(answer: (url: string, method: string, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method ?? "GET";
    const n = calls.filter(c => c.method === method && c.url.split("?")[0] === url.split("?")[0]).length;
    calls.push({ url, method, body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) });
    return answer(url, method, n);
  }) as typeof globalThis.fetch;
  globalThis.fetch = fetch;
  return { calls, fetch, count: (re: RegExp, method = "GET") => calls.filter(c => c.method === method && re.test(c.url)).length };
}
export const html502 = () => new Response("<html><body>502 Bad Gateway</body></html>", { status: 502, headers: { "Content-Type": "text/html" } });
export const json = (body: unknown, status = 200) => Response.json(body, { status });

/** Fixtures are checked against the real parsers so a drifted shape fails loudly instead of testing nothing. */
const parsed = <T,>(value: T, ok: boolean, what: string): T => { assert.ok(ok, `fixture: ${what} must pass its real parser`); return value; };

/** GET /api/onlyfans-configuration/accounts/<id>/moxy answers (lib/onlyfans/moxy.ts parseMoxy). */
export function moxyLegacy(accountId = "of-a", canManage = true) {
  const body = { ok: true, schemaVersion: MOXY_SCHEMA, accountId, canManage, moxy: { engine: "legacy", moxySelected: false } };
  return parsed(body, parseMoxy(body, accountId)?.engine === "legacy", "legacy moxy view");
}
export const MOXY_SETTINGS = { creator_key: "synthetic-creator", products: [], sequences: {}, catalogue_bindings: {}, operational: {} };
export function moxySelected(mode: MoxyMode, { accountId = "of-a", revision = 3, ready = false, canManage = true } = {}) {
  const body = { ok: true, schemaVersion: MOXY_SCHEMA, accountId, canManage, moxy: { engine: "moxy", moxySelected: true, mode, revision,
    readiness: ready ? { ready: true, blockers: [] } : { ready: false, blockers: ["catalogue_bindings_missing"] }, settings: MOXY_SETTINGS, decisions: [] } };
  return parsed(body, parseMoxy(body, accountId)?.engine === "moxy", "moxy-selected view");
}
/** POST ack (lib/onlyfans/moxy.ts moxyAck): `revision` defaults to the one a matching ack must carry. */
export const moxyAckBody = (mode: MoxyMode, revision: number, accountId = "of-a") =>
  ({ ok: true, schemaVersion: MOXY_SCHEMA, accountId, moxy: { mode, revision, readiness: { ready: false, blockers: ["catalogue_bindings_missing"] } } });

/** Reads BAutomationPanel makes for account of-a (accounts, conversations, runtime), plus EngagementPanel's follow-ups page. */
export const ACTION_ID = "0a1b2c3d-1111-4222-8333-444455556661";
export function automationReads(accountId = "of-a") {
  const accounts = { accounts: [{ accountId, health: "connected", automationMode: "automated" }] };
  const conversations = { accountId, page: { items: [], nextCursor: null } };
  const runtime = { accountId, section: "settings", runtimeEnabled: false };
  const followUps = { schemaVersion: "of-launch-b.v1", ok: true, accountId, engagementVersion: "of-engagement.v1", nextCursor: null,
    actions: [{ actionId: ACTION_ID, kind: "follow_up", status: "scheduled", reason: null, fanId: "42", dueAt: "2026-11-12T10:00:00Z",
      expiresAt: "2026-11-13T10:00:00Z", intentId: null, cancelRequested: false }] };
  parsed(accounts, parseAccounts(accounts)?.length === 1, "accounts");
  parsed(conversations, parseConversations(conversations, accountId) !== null, "conversations");
  parsed(runtime, parseRuntime(runtime, accountId) !== null, "runtime");
  parsed(followUps, parseEngagementPage(followUps)?.actions.length === 1, "engagement follow-ups page");
  return { accounts, conversations, runtime, followUps };
}
