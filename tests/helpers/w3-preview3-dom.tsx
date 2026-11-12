/**
 * W3 ui-onlyfans-preview-3 test harness (lane copy of the ui-onlyfans-preview-1 DOM helper; lanes do not share files across
 * branches): real React components in an offline jsdom. No network: `global.fetch` is replaced by a recorder whose answers each
 * test supplies; a request the test did not expect is recorded in `unexpected` (a throw inside fetch would read as a lost reply).
 * Next's app-router hooks read React contexts, so components get them from the real Next context modules through <NextShell>;
 * no product module is stubbed or edited. Import this module first: it installs the DOM globals before react-dom is loaded.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React, { act } from "react";
const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");

export const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/onlyfans/content" });
// `self` is a window global; next/link reads it (requestIdleCallback) when a <Link> mounts.
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent, React, IS_REACT_ACT_ENVIRONMENT: true });
dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
require.extensions[".css"] = (module: { exports: unknown }) => { module.exports = {}; };

const { AppRouterContext } = require("next/dist/shared/lib/app-router-context.shared-runtime");
const { PathnameContext, SearchParamsContext } = require("next/dist/shared/lib/hooks-client-context.shared-runtime");
const router = { refresh() {}, push() {}, replace() {}, back() {}, forward() {}, prefetch() {} };
export function NextShell({ pathname = "/onlyfans/content", children }: { pathname?: string; children: React.ReactNode }) {
  const [path, query = ""] = pathname.split("?");
  return <AppRouterContext.Provider value={router}><PathnameContext.Provider value={path}>
    <SearchParamsContext.Provider value={new URLSearchParams(query)}>{children}</SearchParamsContext.Provider></PathnameContext.Provider></AppRouterContext.Provider>;
}

/** One recorded request. `body` is the parsed JSON body of a write, or null. */
export type Call = { method: string; url: string; body: unknown };
/** The recorded JSON body as a field map. Throws when the call is missing or sent no JSON object, so a body assertion cannot pass vacuously. */
export const bodyOf = (call: Call | undefined): Record<string, unknown> => {
  assert.ok(call, "expected a recorded request");
  const body = call.body;
  assert.ok(body !== null && typeof body === "object" && !Array.isArray(body), `expected a JSON object body on ${call.method} ${call.url}`);
  return body as Record<string, unknown>;
};
export const calls: Call[] = [];
export const unexpected: string[] = [];
export const posts = () => calls.filter(call => call.method !== "GET");
type Handler = (call: Call) => Response | Promise<Response> | undefined;
/** Installs the fetch stub. Every request is recorded; the handler answers it; `undefined` from the handler = not expected (404 + recorded). */
export function serve(handler: Handler) {
  calls.length = 0; unexpected.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "https://fixture.invalid");
    // An off-origin request is recorded as unexpected and refused here; an assert thrown inside fetch would be swallowed by the
    // component as a lost reply.
    if (url.host !== "fixture.invalid") { unexpected.push(`off-origin ${init?.method ?? "GET"} ${url.href}`); return new Response("off-origin", { status: 404 }); }
    const call: Call = { method: init?.method ?? "GET", url: url.pathname + url.search, body: typeof init?.body === "string" ? JSON.parse(init.body) : null };
    calls.push(call);
    const answer = await handler(call);
    if (answer) return answer;
    unexpected.push(`${call.method} ${call.url}`);
    return new Response("not expected by the test", { status: 404 });
  }) as typeof fetch;
}
export const json = (value: unknown, status = 200) => Response.json(value, { status });

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
/** Sets a controlled input/textarea value the way a user does, so React's onChange runs. */
export async function type(element: Element | null | undefined, value: string) {
  assert.ok(element, "field exists");
  const proto = element instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value);
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

/**
 * Runs `run` with every timer of 1 s or more scaled down 100x (3 s poll -> 30 ms, 30 s backoff -> 300 ms), then restores setTimeout.
 * Timers scheduled before the call keep their real delay.
 */
export async function withFastTimers<T>(run: () => Promise<T>): Promise<T> {
  const real = globalThis.setTimeout;
  globalThis.setTimeout = ((fn: (...args: unknown[]) => void, ms?: number, ...rest: unknown[]) =>
    real(fn, ms !== undefined && ms >= 1000 ? ms / 100 : ms, ...rest)) as typeof setTimeout;
  try { return await run(); } finally { globalThis.setTimeout = real; }
}
