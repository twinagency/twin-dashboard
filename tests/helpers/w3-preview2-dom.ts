/**
 * Offline jsdom harness for W3 lane 4 (ui-onlyfans-preview-2) known-red and rules tests. Pattern copied from
 * rwl/W3-ui-onlyfans-launch tests/helpers/w3-launch-dom.ts + w3-launch-fetch.ts (not imported across branches).
 * Import it FIRST: it installs the DOM globals before any component (or next/navigation) module loads.
 * No network: a root beforeEach installs a fetch that throws on any call; tests answer requests with `stubFetch`. A root afterEach
 * unmounts, resets mock timers, restores fetch, the window timers, the viewport width and the scroll-box stub. Synthetic ids only.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, afterEach, before, beforeEach, mock } from "node:test";
import React, { act } from "react";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
const requireNative = createRequire(import.meta.url);
const { JSDOM } = requireNative("jsdom");
requireNative.extensions[".css"] = module => { module.exports = {}; };

export const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/onlyfans/inbox", pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent, KeyboardEvent: dom.window.KeyboardEvent, Element: dom.window.Element, Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: dom.window.requestAnimationFrame,
  cancelAnimationFrame: dom.window.cancelAnimationFrame, React, IS_REACT_ACT_ENVIRONMENT: true,
  // next/link's viewport prefetch (use-intersection -> request-idle-callback) reads `self`.
  self: dom.window });
/** Captured before any test can mock timers, so settling always uses real time. */
const realSetTimeout = globalThis.setTimeout;
const realFetch = globalThis.fetch;
const TIMER_APIS = ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] as const;
const jsdomTimers = Object.fromEntries(TIMER_APIS.map(name => [name, dom.window[name]]));
const unstubbedFetch = (async (input: RequestInfo | URL) => { throw new Error(`unstubbed fetch in test: ${String(input)}`); }) as typeof globalThis.fetch;

// matchMedia: jsdom has none. Width-only evaluation of "(max-width: Npx)" / "(min-width: Npx)" against `viewport.width`.
export const viewport = { width: 1440 };
dom.window.matchMedia = (query: string) => {
  const max = /max-width:\s*(\d+)px/.exec(query), min = /min-width:\s*(\d+)px/.exec(query);
  const matches = (!max || viewport.width <= Number(max[1])) && (!min || viewport.width >= Number(min[1]));
  return { matches, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false };
};

let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => { ({ createRoot } = await import("react-dom/client")); });
after(async () => { await act(async () => root?.unmount()); root = undefined; globalThis.fetch = realFetch; dom.window.close(); });
beforeEach(() => { globalThis.fetch = unstubbedFetch; });
afterEach(async () => {
  await unmount();
  mock.timers.reset();
  globalThis.fetch = unstubbedFetch;
  Object.assign(dom.window, jsdomTimers);
  viewport.width = 1440;
  for (const name of SCROLL_PROPS) Reflect.deleteProperty(dom.window.HTMLElement.prototype, name);
});

/**
 * node:test mock timers for `apis`, patched onto globalThis AND window (components that call `window.setInterval` get jsdom's own
 * timers otherwise). The root afterEach resets them. Drive them with `advance`.
 */
export function mockTimers(apis: ("setTimeout" | "setInterval")[]) {
  mock.timers.enable({ apis });
  for (const api of apis) {
    const clear = api === "setTimeout" ? "clearTimeout" : "clearInterval";
    Object.assign(dom.window, { [api]: globalThis[api], [clear]: globalThis[clear] });
  }
}
/** Moves mocked time forward `ms` and lets React and the stubbed fetches settle. */
export async function advance(ms: number) { mock.timers.tick(ms); await settle(); await settle(); }

// ---- scroll box ----
const SCROLL_PROPS = ["scrollHeight", "clientHeight", "scrollTop"] as const;
/**
 * jsdom has no layout. Gives every element matching `selector` a scroll box: fixed scrollHeight/clientHeight and a settable
 * scrollTop. Installed as accessors on HTMLElement.prototype backed by a per-node WeakMap, so a node created by a remount gets
 * the same box (its scrollTop starts at 0). Removed by the root afterEach.
 */
export function stubScrollBox(selector: string, geometry: { scrollHeight: number; clientHeight: number }) {
  const tops = new WeakMap<Element, number>();
  const proto = dom.window.HTMLElement.prototype;
  const boxed = (node: Element) => node.matches(selector);
  Object.defineProperty(proto, "scrollHeight", { configurable: true, get(this: Element) { return boxed(this) ? geometry.scrollHeight : 0; } });
  Object.defineProperty(proto, "clientHeight", { configurable: true, get(this: Element) { return boxed(this) ? geometry.clientHeight : 0; } });
  Object.defineProperty(proto, "scrollTop", { configurable: true, get(this: Element) { return tops.get(this) ?? 0; },
    set(this: Element, value: number) { if (boxed(this)) tops.set(this, value); } });
}

export async function unmount() { if (root) await act(async () => root!.unmount()); root = undefined; }
/** Fresh root. */
export async function mount(element: React.ReactElement) {
  await unmount();
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(element); });
  await settle(); await settle();
}
/** Re-render into the SAME root (same component instances where the tree shape matches), the way a parent prop change does. */
export async function rerender(element: React.ReactElement) {
  assert.ok(root, "mount first");
  await act(async () => { root!.render(element); });
  await settle(); await settle();
}
/** Real-time settle: lets stubbed fetches and React updates finish. */
export const settle = async (ms = 25) => act(async () => { await new Promise(resolve => realSetTimeout(resolve, ms)); });
export const button = (label: RegExp, scope: ParentNode = document) => [...scope.querySelectorAll<HTMLButtonElement>("button")].find(item => label.test(item.textContent ?? ""));
export async function click(element: Element | null | undefined) {
  assert.ok(element, "element to click exists");
  await act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  await settle(); await settle();
}
/** Types `value` into an input or textarea the way React sees a user edit (native setter + input event). */
export async function typeInto(element: Element | null | undefined, value: string) {
  assert.ok(element, "field to type into exists");
  const proto = element instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value);
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  await settle();
}
export const pageText = () => document.body.textContent ?? "";
const BREAKPOINTS: Record<string, number> = { sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1536 };
const DISPLAY = /^(hidden|block|inline|inline-block|flex|inline-flex|grid|inline-grid|contents|table|flow-root)$/;
/** The Tailwind display an element's own classes give it at `width` ("hidden" or a visible display), or null if none applies. */
function displayAt(element: Element, width: number): string | null {
  // Tailwind order: unprefixed, then max-* variants, then min-width variants ascending; a later match wins.
  let base: string | null = null, max: string | null = null;
  const min: [number, string][] = [];
  for (const token of (element.getAttribute("class") ?? "").split(/\s+/).filter(Boolean)) {
    const [variant, utility] = token.includes(":") ? [token.slice(0, token.lastIndexOf(":")), token.slice(token.lastIndexOf(":") + 1)] : ["", token];
    if (!DISPLAY.test(utility)) continue;
    if (variant === "") base = utility;
    else if (variant.startsWith("max-") && BREAKPOINTS[variant.slice(4)] !== undefined) { if (width < BREAKPOINTS[variant.slice(4)]) max = utility; }
    else if (BREAKPOINTS[variant] !== undefined) { if (width >= BREAKPOINTS[variant]) min.push([BREAKPOINTS[variant], utility]); }
  }
  min.sort((a, b) => a[0] - b[0]);
  return min.length ? min[min.length - 1][1] : max ?? base;
}
/**
 * True when `element` would be display:none at viewport `width`: it or an ancestor has the `hidden` attribute, or its Tailwind
 * display utilities (hidden / block / flex / grid ..., unprefixed, sm..2xl min-width, max-sm..max-2xl) resolve to `hidden`.
 * `data-profile` on the inbox layout is NOT a display rule (measured: InboxView.module.css only changes grid columns for it), so it
 * is ignored. jsdom cannot compute Tailwind, which is why this reads class tokens.
 */
export function hiddenAt(element: Element, width: number): boolean {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node.hasAttribute("hidden")) return true;
    if (displayAt(node, width) === "hidden") return true;
  }
  return false;
}

/** Real Next app-router contexts around `element`; `router.refreshes` counts router.refresh() calls. */
export type CountingRouter = AppRouterInstance & { refreshes: number };
export function nextRouter(): CountingRouter {
  const router: CountingRouter = { refreshes: 0, back() {}, forward() {}, refresh() { router.refreshes++; }, prefetch() {}, push() {}, replace() {} };
  return router;
}
export function inNextApp(element: React.ReactElement, router: AppRouterInstance = nextRouter(), pathname = "/onlyfans/inbox") {
  return React.createElement(AppRouterContext.Provider, { value: router },
    React.createElement(PathnameContext.Provider, { value: pathname },
      React.createElement(SearchParamsContext.Provider, { value: new URLSearchParams() }, element)));
}

// ---- fetch ----
export type Call = { url: string; method: string; raw: string | undefined; signal: AbortSignal | undefined };
/**
 * Installs globalThis.fetch. `answer(url, method, n, raw)` gets every request (n = 0-based count of earlier calls to the same
 * method+path, query ignored). Calls are recorded with the raw body and the abort signal.
 */
export function stubFetch(answer: (url: string, method: string, n: number, raw: string | undefined) => Response | Promise<Response>) {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method ?? "GET", raw = init?.body === undefined ? undefined : String(init.body);
    const n = calls.filter(c => c.method === method && c.url.split("?")[0] === url.split("?")[0]).length;
    calls.push({ url, method, raw, signal: init?.signal ?? undefined });
    return answer(url, method, n, raw);
  }) as typeof globalThis.fetch;
  return { calls, matching: (re: RegExp, method?: string) => calls.filter(c => (!method || c.method === method) && re.test(c.url)) };
}
export const json = (body: unknown, status = 200) => Response.json(body, { status });
/** A request that stays in flight for the rest of the test. */
export const never = () => new Promise<Response>(() => {});
