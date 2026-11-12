/**
 * Offline jsdom harness for W3 lane 2 (ui-onlyfans-launch) component tests, known-red and rules. Copied from W1 lane 8's
 * tests/helpers/w1-8-dom.ts (branch rwl/W1-preview-shell-launch), not imported from it. Import it FIRST: it installs the DOM
 * globals before any component (or next/navigation) module loads. next/navigation hooks are satisfied by real Next context
 * providers (`inNextApp`), not module mocks. No network: fetch is stubbed by ./w3-launch-fetch (re-exported here). Synthetic ids only.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before } from "node:test";
import React, { act } from "react";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
export { deferred, html502, json, never, stubFetch } from "./w3-launch-fetch";
const requireNative = createRequire(import.meta.url);
const { JSDOM } = requireNative("jsdom");
requireNative.extensions[".css"] = module => { module.exports = {}; };

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/onlyfans/launch", pretendToBeVisual: true });
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
/** Submits a form the way pressing Enter does. */
export async function submit(form: Element | null | undefined) {
  assert.ok(form, "form exists");
  await act(async () => { form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
  await settle(); await settle();
}
/** Visible text of the whole page, for copy checks that do not pin layout. */
export const pageText = () => document.body.textContent ?? "";

/** Real Next app-router contexts around `element`, so next/navigation hooks work without module mocks. */
export function inNextApp(element: React.ReactElement, pathname = "/onlyfans/launch") {
  const router: AppRouterInstance = { back() {}, forward() {}, refresh() {}, prefetch() {}, push() {}, replace() {} };
  return React.createElement(AppRouterContext.Provider, { value: router },
    React.createElement(PathnameContext.Provider, { value: pathname },
      React.createElement(SearchParamsContext.Provider, { value: new URLSearchParams() }, element)));
}
