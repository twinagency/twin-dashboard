// Regression guard (G50a F10, W9 lib-mtproto-2): a RESUME (lift) that landed but whose read-back failed hid the
// GLOBAL STOP. components/mtproto/GlobalStopControl.tsx resume() returned on `!result.ok` before router.refresh(), so
// the panel stayed on "stopped" props and rendered only "Lift global stop" (the STOP button is drawn only when
// `!stopped`) while the worker could be sending again. lib/mtproto/global-stop.ts reported the landed lift as a raw
// read error. Unknown holds win: after a failed lift the STOP button stays visible and usable, the state reads
// "State unknown", never "lifted", and the page is refreshed. Control: a stopped panel with no action shows the lift
// button only; a refused lift with the phrase still offers STOP.
// DECLARED BYPASS: app/mtproto-campaign/actions.ts is "use server" and pulls lib/mtproto + the dashboard guard; it is
// swapped for tests/rules/G50a-stop-actions-fake.ts with node:module registerHooks, ONLY for GlobalStopControl.tsx's
// import. Everything else is the real component; the router comes through AppRouterContext (the provider Next mounts).
// Runs in `npm run test:rules`. Offline: jsdom; globalThis.fetch is a deny-all guard asserted empty in after().
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test, { after, before } from "node:test";
import React, { act } from "react";
const require_ = nodeModule.createRequire(import.meta.url);
type ResolveCtx = { parentURL?: string };
const { registerHooks } = nodeModule as unknown as { registerHooks(hooks: { resolve(specifier: string, context: ResolveCtx, nextResolve: (s: string, c: ResolveCtx) => unknown): unknown }): void };
const { JSDOM } = require_("jsdom");

const FAKE = pathToFileURL(path.resolve("tests/rules/G50a-stop-actions-fake.ts")).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/app/mtproto-campaign/actions" && context.parentURL?.endsWith("/components/mtproto/GlobalStopControl.tsx")) return { url: FAKE, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const blockedFetches: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL) => { blockedFetches.push(String(input)); throw new Error("blocked in test"); }) as typeof fetch;
after(() => assert.deepEqual(blockedFetches, [], "no network call attempted"));

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/mtproto-campaign/settings" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, FormData: dom.window.FormData, React, IS_REACT_ACT_ENVIRONMENT: true });
(dom.window as any).confirm = () => true;

import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
let refreshes = 0;
const router = { push() {}, replace() {}, refresh() { refreshes += 1; }, back() {}, forward() {}, prefetch() {} } as any;
type Control = { calls: FormData[]; answer: (fd: FormData) => Promise<{ ok: true } | { ok: false; error: string }> };
let control: Control;
let GlobalStopControl: typeof import("../../components/mtproto/GlobalStopControl").default;
let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => {
  ({ createRoot } = await import("react-dom/client"));
  ({ default: GlobalStopControl } = await import("../../components/mtproto/GlobalStopControl"));
  control = (globalThis as any).__g50aStop;
  assert.ok(control, "fake actions module in use");
  assert.equal(Object.keys(require_.cache).some((k) => k.endsWith(path.join("app", "mtproto-campaign", "actions.ts"))), false, "real actions module not loaded");
});
after(async () => { await act(async () => root?.unmount()); dom.window.close(); });
const settle = async () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
const click = async (el: Element | null | undefined) => { assert.ok(el, "element exists"); await act(async () => { el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); }); await settle(); };
const button = (label: RegExp) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => label.test(b.textContent ?? ""));
const text = () => document.body.textContent ?? "";

async function mount(stopped: boolean | null) {
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<AppRouterContext.Provider value={router}><GlobalStopControl stopped={stopped} /></AppRouterContext.Provider>); });
}
async function liftWith(answer: Control["answer"]) {
  control.calls.length = 0;
  control.answer = answer;
  refreshes = 0;
  await mount(true);
  await click(button(/Lift global stop/));
  const input = document.querySelector<HTMLInputElement>('input[aria-label^="Type RESUME"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, "RESUME");
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  await click(button(/^Confirm$/));
  assert.equal(control.calls.length, 1, "the lift was sent");
  assert.equal(control.calls[0].get("stopped"), "false");
}

test("control: a stopped panel with no action offers the lift, not STOP", async () => {
  await mount(true);
  assert.ok(button(/Lift global stop/), "lift button shown");
  assert.equal(button(/GLOBAL STOP/), undefined, "no STOP button while verified stopped");
  assert.doesNotMatch(text(), /State unknown/);
});

test("F10: an unreadable flag (null) shows STOP and says the state is unknown", async () => {
  await mount(null);
  assert.ok(button(/GLOBAL STOP/), "STOP shown");
  assert.match(text(), /State unknown/);
});

test("F10: lift landed but read-back failed, STOP stays visible and usable, state reads unknown, page refreshes", async () => {
  await liftWith(async () => ({ ok: false, error: "global resume was written but could not be read back, state unknown (read timeout)" }));
  const stop = button(/GLOBAL STOP/);
  assert.ok(stop, "GLOBAL STOP hidden after a lift whose outcome is unknown");
  assert.equal(stop!.disabled, false, "STOP usable");
  assert.match(text(), /State unknown/, "unknown state must say so");
  assert.doesNotMatch(text(), /lifted/i, "never shown as lifted");
  assert.ok(refreshes >= 1, "page refreshed so the server re-reads the flag");
  control.answer = async () => ({ ok: true });
  await click(stop);
  assert.equal(control.calls.length, 2, "STOP was sent");
  assert.equal(control.calls[1].get("stopped"), "true");
});

test("F10: any failed lift (here a thrown action) keeps STOP reachable", async () => {
  await liftWith(async () => { throw new Error("network down"); });
  assert.ok(button(/GLOBAL STOP/), "STOP reachable after a thrown lift");
  assert.match(text(), /State unknown/);
});
