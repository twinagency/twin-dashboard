// KNOWN RED (W5 app-ai-plus3 F-C1, high, wrong credential handed out): the one-time key reveal is keyed on nothing.
// app/api-access/KeyManager.tsx:19-20 `KeyReveal` keeps `copied` in its own state and is rendered at :79 with no React
// `key`, and visibility is one boolean `dismissed` (:69-70) that the form resets to false BEFORE the request (:82-85).
// (1) Mint key A (All models), click Copy (button reads "Copied", clipboard = A), then mint key B (one model) without
//     Done: the same KeyReveal instance re-renders with B and still reads "Copied" although the clipboard holds A, the
//     fleet key. The operator pastes A where B was meant to go.
// (2) Reported: after Done on A, a new submit un-dismisses before the request, re-showing A while pending.
//     NOT REPRODUCED (measured, React 19.2.7): the form action runs inside a transition entangled with the async
//     useActionState action, so setDismissed(false) only commits with the result. Kept as control (b), a guard.
// Control: first mint shows A with "Copy"; clicking Copy writes A to the clipboard and reads "Copied" (holds).
// Turns green with `<KeyReveal key={state.key} ...>` (fresh copy state per key).
// DECLARED BYPASS: app/api-access/actions.ts is "use server" and pulls lib/supabase + lib/api-keys-admin; it is swapped
// for W5-app-ai-plus3-key-actions-fake.ts with node:module registerHooks, ONLY for the `./actions` import made by
// KeyManager.tsx. Everything else (useActionState, the form action, KeyReveal) is the real component. The test asserts
// the real actions module was not loaded. Coupling: if KeyManager imports its actions under another specifier the
// swap misses and the "fake in use" assertion fails loudly.
// Not wired into npm scripts. Offline: jsdom; globalThis.fetch is a deny-all guard asserted empty in after().
// Run: node --import tsx --test <this file>.
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test, { after, before } from "node:test";
import React, { act } from "react";
const require_ = nodeModule.createRequire(import.meta.url);
// registerHooks is Node >= 23.5; the repo's @types/node predates it, so it is typed locally.
type ResolveCtx = { parentURL?: string };
const { registerHooks } = nodeModule as unknown as { registerHooks(hooks: { resolve(specifier: string, context: ResolveCtx, nextResolve: (s: string, c: ResolveCtx) => unknown): unknown }): void };
const { JSDOM } = require_("jsdom");

const FAKE_ACTIONS = pathToFileURL(path.resolve("tests/known-red/W5-app-ai-plus3-key-actions-fake.ts")).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "./actions" && context.parentURL?.endsWith("/app/api-access/KeyManager.tsx")) return { url: FAKE_ACTIONS, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

// Deny-all network guard (codex final P2): nothing in this test may reach the network; any fetch is recorded and fails.
const blockedFetches: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL) => { blockedFetches.push(String(input)); throw new Error("blocked in test"); }) as typeof fetch;
after(() => assert.deepEqual(blockedFetches, [], "no network call attempted"));

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/api-access" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, FormData: dom.window.FormData, React, IS_REACT_ACT_ENVIRONMENT: true });
let clipboard = "";
Object.defineProperty(globalThis.navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { clipboard = text; } } });

type IssueState = { key?: string; prefix?: string; scope?: "clone" | "fleet"; error?: string };
type Control = { calls: FormData[]; answer: (fd: FormData) => Promise<IssueState> };
let control: Control;
let KeyManager: typeof import("../../app/api-access/KeyManager").KeyManager;
let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => {
  ({ createRoot } = await import("react-dom/client"));
  ({ KeyManager } = await import("../../app/api-access/KeyManager"));
  control = (globalThis as any).__w5KeyActions;
  assert.ok(control, "fake actions module in use");
  assert.equal(Object.keys(require_.cache).some(k => k.endsWith(path.join("app", "api-access", "actions.ts"))), false, "real actions module not loaded");
});
after(async () => { await act(async () => root?.unmount()); dom.window.close(); });
const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
const click = async (element: Element | null | undefined) => { assert.ok(element, "element exists"); await act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 25)); }); };
const button = (label: RegExp) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => label.test(item.textContent ?? ""));
const shownKey = () => document.querySelector("code")?.textContent ?? null;

const CLONE = { id: "cccccccc-1111-4111-8111-111111111111", slug: "kait", name: "Kait" };
const KEY_A = "twin_fake_A_fleet_0000000000000000", KEY_B = "twin_fake_B_clone_1111111111111111";

async function mount() {
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<KeyManager clones={[CLONE]} keys={[]} />); });
  await settle();
}
async function mint(cloneValue: string, label: string, answer: Control["answer"]) {
  control.answer = answer;
  const form = document.querySelector("form")!;
  (form.querySelector('select[name="clone_id"]') as HTMLSelectElement).value = cloneValue;
  (form.querySelector('input[name="label"]') as HTMLInputElement).value = label;
  await act(async () => { form.requestSubmit(); await new Promise(resolve => setTimeout(resolve, 25)); });
  await settle();
}

test("control: minting a key reveals it with Copy; Copy puts that key on the clipboard and reads Copied", async () => {
  await mount();
  control.calls.length = 0; clipboard = "";
  await mint("__fleet__", "A", async () => ({ key: KEY_A, prefix: "twin_fake_A", scope: "fleet" }));
  assert.equal(control.calls.length, 1);
  assert.equal(control.calls[0].get("clone_id"), "__fleet__");
  assert.equal(shownKey(), KEY_A);
  assert.ok(button(/^Copy$/), "fresh reveal reads Copy");
  await click(button(/^Copy$/));
  assert.equal(clipboard, KEY_A);
  assert.ok(button(/^Copied$/), "after Copy it reads Copied");
});

test("F-C1: a second key minted without Done must not inherit the first key's Copied state", async () => {
  // same start as the control (key A revealed and copied, Done not pressed), rebuilt here so this test also runs when
  // init.sh skips the control (--test-skip-pattern); W5 close.
  await mount();
  clipboard = "";
  await mint("__fleet__", "A", async () => ({ key: KEY_A, prefix: "twin_fake_A", scope: "fleet" }));
  await click(button(/^Copy$/));
  await mint(CLONE.id, "B", async () => ({ key: KEY_B, prefix: "twin_fake_B", scope: "clone" }));
  assert.equal(shownKey(), KEY_B, "the reveal now shows key B");
  const copyButton = [...document.querySelectorAll("button")].find(b => /^Cop(y|ied)$/.test(b.textContent ?? ""))?.textContent;
  assert.equal(copyButton, "Copy", `key B's reveal reads "${copyButton}" while the clipboard still holds key A (${clipboard === KEY_A ? "the fleet key" : clipboard})`);
});

test("control (b): after Done, a new submit does not re-show the dismissed key while the request is pending", async () => {
  await mount();
  await mint("__fleet__", "A", async () => ({ key: KEY_A, prefix: "twin_fake_A", scope: "fleet" }));
  assert.equal(shownKey(), KEY_A);
  await click(button(/^Done$/));
  assert.equal(shownKey(), null, "Done hides the reveal");
  let release!: (s: IssueState) => void;
  await mint(CLONE.id, "B", () => new Promise<IssueState>(resolve => { release = resolve; }));
  assert.ok(button(/^Creating/), "the request is pending");
  const visible = shownKey();
  await act(async () => { release({ key: KEY_B, prefix: "twin_fake_B", scope: "clone" }); await new Promise(resolve => setTimeout(resolve, 25)); });
  assert.equal(visible, null, `the dismissed key ${visible === KEY_A ? "A (fleet)" : visible} was shown again during the pending request`);
});
