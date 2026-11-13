/**
 * Shared offline harness for the W1 lane 7a known-red and G01 rule tests (not a test file: the name must not match *.test.*).
 * Importing it sets up jsdom globals and registers the root-level after() that unmounts and closes the window.
 * Plan C: real PlanCConsole, real client, real proxy handlers, typed mock backend. Engine: real EngineStatus. No network.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after } from "node:test";
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { MOCK_ACCOUNT, createPlanCMock, type PlanCMock, type RawDraft, type RawUnresolved } from "../contracts/plan-c-mock-backend";
import { createPlanCProxy } from "../contracts/plan-c-proxy";
const { JSDOM } = createRequire(import.meta.url)("jsdom");

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/onlyfans" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, React, IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
after(async () => { await act(async () => root?.unmount()); dom.window.close(); });

export const settle = async (ms = 25) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
export const all = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];
export const q = <T extends Element = HTMLButtonElement>(selector: string) => document.querySelector<T>(selector);
export const text = () => document.body.textContent ?? "";
export const button = (label: string) => all("button").find(item => item.textContent === label) as HTMLButtonElement | undefined;
export const approveButton = () => q("[data-plan-c-draft] [data-plan-c-approve]");
export async function click(element: Element | null | undefined) {
  assert.ok(element, "element to click exists");
  await act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 25)); });
}
export async function typeInto(element: Element | null | undefined, value: string) {
  assert.ok(element, "field to type into exists");
  await act(async () => {
    Object.getOwnPropertyDescriptor(element.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}
/** Renders into a fresh root (the previous one is unmounted), or into the current root when `keep` is set. */
export async function render(element: React.ReactElement, keep = false) {
  if (!keep || !root) {
    if (root) await act(async () => root!.unmount());
    document.body.innerHTML = '<div id="root"></div>';
    const { createRoot } = await import("react-dom/client"); // after the jsdom globals: react-dom reads them when it loads
    root = createRoot(document.getElementById("root")!);
  }
  await act(async () => { root!.render(element); });
  await settle();
}

export type ConsoleOptions = { drafts?: RawDraft[]; unresolved?: RawUnresolved[];
  /** Wraps the backend wire (what the mock answers the dashboard's server side): the one fault seam. */
  wire?: (mock: PlanCMock) => typeof fetch };
/** Real PlanCConsole (supervised, canAct) over the real client and proxy handlers, in front of the typed mock backend. */
export async function mountConsole(options: ConsoleOptions = {}) {
  const mock = createPlanCMock({ drafts: options.drafts ?? [], unresolved: options.unresolved ?? [] });
  const proxy = createPlanCProxy(options.wire ? { ...mock, fetch: options.wire(mock) } : mock);
  const { default: PlanCConsole } = await import("../../components/onlyfans-preview/PlanCConsole");
  await render(<PlanCConsole accountId={MOCK_ACCOUNT} operatorScope="test-operator" canAct fetchImpl={proxy.fetch} />);
  return { mock };
}
/** Design-neutral hold check: the draft stays on screen; its approve is absent or disabled, and clicking whatever is there sends no approve command. */
export async function assertApproveHeld(mock: PlanCMock, why: string) {
  assert.ok(document.querySelector("[data-plan-c-draft]"), "fixture: the draft is on screen");
  const control = approveButton();
  if (control) await click(control);
  assert.equal(mock.posts().filter(call => /\/approve$/.test(call.path)).length, 0, `no approve command leaves while ${why} (REVIEW inv 7)`);
  assert.ok(!control || control.disabled, `approve is not live while ${why}`);
}

type EngineProps = Omit<React.ComponentProps<typeof import("../../components/onlyfans-preview/EngineStatus").EngineStatus>, "value" | "accountId" | "conversationId">;
/** EngineStatus for account `of-a`, conversation `of-a:42`. `keep` re-renders the same tree (a parent refresh). */
export async function showEngine(view: unknown, props: EngineProps = {}, keep = false) {
  const { EngineStatus } = await import("../../components/onlyfans-preview/EngineStatus");
  await render(<EngineStatus value={view} accountId="of-a" conversationId="of-a:42" {...props} />, keep);
}
/** A current engine view for `of-a:42` with the given requests. */
export const engineView = (requests: unknown[], extra: Record<string, unknown> = {}) => ({ schemaVersion: "of-engine.v1", state: "current", accountId: "of-a",
  conversationId: "of-a:42", environment: "live", mode: "human", salesMode: "open", truncated: false, nextCursor: null, requests, ...extra });
