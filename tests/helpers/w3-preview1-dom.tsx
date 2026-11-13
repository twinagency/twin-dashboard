/**
 * W3 ui-onlyfans-preview-1 test harness: real React components in an offline jsdom. No network: `global.fetch` is replaced by
 * a recorder whose answers each test supplies. Next's app-router hooks (`useRouter`, `usePathname`) read React contexts, so the
 * components get them from the real Next context modules through <NextShell>; no product module is stubbed or edited.
 * Import this module first: it installs the DOM globals before react-dom is loaded.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React, { act } from "react";
const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");

export const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/onlyfans/accounts" });
// `self` is a window global; next/link reads it (requestIdleCallback) when a <Link> mounts.
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent, React, IS_REACT_ACT_ENVIRONMENT: true });
// jsdom has no layout: scrolling is a no-op here (ConnectionEditor scrolls itself into view on open).
dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
require.extensions[".css"] = (module: { exports: unknown }) => { module.exports = {}; };

const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime");
const { PathnameContext, SearchParamsContext } = require("next/dist/shared/lib/hooks-client-context.shared-runtime");
const router = { refresh() {}, push() {}, replace() {}, back() {}, forward() {}, prefetch() {} };
/** `pathname` may carry a query ("/onlyfans/accounts?creator=x"); the query becomes `useSearchParams()`. */
export function NextShell({ pathname = "/onlyfans/accounts", children }: { pathname?: string; children: React.ReactNode }) {
  const [path, query = ""] = pathname.split("?");
  return <AppRouterContext.Provider value={router}><PathnameContext.Provider value={path}>
    <SearchParamsContext.Provider value={new URLSearchParams(query)}>{children}</SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>;
}

/** One recorded request. `body` is the parsed JSON body of a write, or null; read fields through `bodyOf`. */
export type Call = { method: string; url: string; body: unknown };
/** The recorded JSON body as a field map. Throws when the call is missing or sent no JSON object, so a body assertion
 * can never pass vacuously (undefined === undefined). */
export const bodyOf = (call: Call | undefined): Record<string, unknown> => {
  assert.ok(call, "expected a recorded request");
  const body = call.body;
  assert.ok(body !== null && typeof body === "object" && !Array.isArray(body), `expected a JSON object body on ${call.method} ${call.url}`);
  return body as Record<string, unknown>;
};
export const calls: Call[] = [];
export const posts = () => calls.filter(call => call.method !== "GET");
type Handler = (call: Call) => Response | Promise<Response>;
/** Installs the fetch stub. Every request is recorded; the handler answers it. Anything not under fixture.invalid fails the test. */
export function serve(handler: Handler) {
  calls.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "https://fixture.invalid");
    assert.equal(url.host, "fixture.invalid", "no request leaves the fixture origin");
    const call: Call = { method: init?.method ?? "GET", url: url.pathname + url.search, body: typeof init?.body === "string" ? JSON.parse(init.body) : null };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
}
export const json = (value: unknown, status = 200) => Response.json(value, { status });

/** The account id every fixture in this lane uses unless it needs a second one. */
export const ACCOUNT = "of-a";
/** One answer to one request. Throwing models a reply that never arrived. */
export type Answer = () => Response | Promise<Response>;
export const lostReply: Answer = () => { throw new TypeError("connection reset"); };
export const http502: Answer = () => new Response("bad gateway", { status: 502 });
/** A route failure body `{ ok: false, outcome, error, ...extra }` (extra: schemaVersion, code). */
export const routeFailure = (status: number, outcome: "refused" | "unconfirmed", extra: Record<string, unknown> = {}) =>
  json({ ok: false, outcome, error: "fixture", ...extra }, status);
/**
 * Answers that leave a write's outcome unknown for every client in this lane (D7): the exact retry must be kept. Shared by the three
 * rules files; a file adds only cases its own client documents (the content-sync client also treats 500 and a 503 whose body says
 * outcome "unconfirmed" as unconfirmed, content-sync-client.ts:30; the campaign/editor clients do not promise that).
 */
export const UNKNOWN_OUTCOMES: Array<[string, Answer]> = [
  ["lost reply", lostReply],
  ["timeout", () => { throw new DOMException("timed out", "TimeoutError"); }],
  ["502", http502],
  ["unreadable 200", () => new Response("not json", { status: 200 })],
];

let createRoot: typeof import("react-dom/client").createRoot;
let root: import("react-dom/client").Root | undefined;
export async function mount(element: React.ReactElement, pathname?: string) {
  createRoot ??= (await import("react-dom/client")).createRoot;
  await unmount();
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<NextShell pathname={pathname}>{element}</NextShell>); });
  await settle();
}
/** Re-render into the same root (same React tree, so keyed children remount only when their key changes). */
export async function rerender(element: React.ReactElement, pathname?: string) {
  assert.ok(root, "mounted");
  await act(async () => { root!.render(<NextShell pathname={pathname}>{element}</NextShell>); });
  await settle();
}
export async function unmount() { if (root) { const r = root; root = undefined; await act(async () => r.unmount()); } }
export async function close() { await unmount(); dom.window.close(); }

export const settle = async (ms = 30) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
export const q = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector);
export const button = (label: RegExp, scope: ParentNode = document) =>
  [...scope.querySelectorAll<HTMLButtonElement>("button")].find(item => label.test(item.textContent?.trim() ?? ""));
export async function click(element: Element | null | undefined) {
  assert.ok(element, "element to click exists");
  await act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true })); });
  await settle();
}
/** Sets a controlled input/textarea/select value the way a user does, so React's onChange runs. */
export async function type(element: Element | null | undefined, value: string) {
  assert.ok(element, "field exists");
  const proto = element instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype
    : element instanceof dom.window.HTMLSelectElement ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value);
    element.dispatchEvent(new dom.window.Event(element instanceof dom.window.HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
export async function submit(form: Element | null | undefined) {
  assert.ok(form, "form exists");
  await act(async () => { form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
  await settle();
}
