// KNOWN RED (W7 app-tracker, finding: high 1, "run it" can never turn a bot OFF). app/tracker/bots/actions.ts:26
// writes `enabled` only `if (fd.has("enabled"))`, and bots/BotSettings.tsx:77 renders a bare checkbox, which a browser
// omits from the FormData when unticked. Condition: admin unticks "run it" on an enabled bot and saves: the PATCH to
// tracker_bots carries no `enabled`, the row stays true, the bot keeps running (credit spend inferred, bot repo not read).
// Team's Claude owns the fix. Not wired into npm scripts or init.sh (lane rule); run:
//   node --import tsx --test tests/known-red/W7-app-tracker-bot-disable.test.tsx
// Offline: jsdom render of the real BotSettings form; the test clicks the checkbox and "save", React builds the FormData
// from the rendered form and calls the real updateBot, faked at the wire (globalThis.fetch, `.invalid` host, fake
// non-key service key), no network, no ports. A server-side OR a UI-only fix (hidden enabled field, Toggle) turns it
// green. Outside a request scope getDashboardAccess() is null (lib/dashboard-access.ts:16-21), so the guard passes.
// globalThis.FormData is jsdom's so React can build the form's FormData from a jsdom <form>; globalThis.self is the jsdom window
// because next/link's prefetch observer reads `self`.
// Module stub: only `revalidatePath` on next/cache's CJS exports, because it throws "static generation store missing"
// outside Next; it records the path instead.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";
import React, { act } from "react";
import type { BotRow } from "../../app/tracker/bots/BotSettings";
const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");

process.env.SUPABASE_URL = "https://tracker-fixture.invalid";
process.env.SUPABASE_SERVICE_KEY = "fixture-not-a-key";
const revalidated: string[] = [];
require("next/cache").revalidatePath = (path: string) => { revalidated.push(path); };
const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/tracker/bots" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent, FormData: dom.window.FormData, React, IS_REACT_ACT_ENVIRONMENT: true });

const patches: Record<string, unknown>[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if ((init?.method ?? "GET").toUpperCase() === "PATCH" && url.pathname === "/rest/v1/tracker_bots") patches.push(JSON.parse(String(init?.body)));
  return new Response(null, { status: 204 });
}) as typeof fetch;

let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => { ({ createRoot } = await import("react-dom/client")); });
after(async () => { await act(async () => root?.unmount()); dom.window.close(); });
const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
const click = async (element: Element | null | undefined) => {
  assert.ok(element, "element exists");
  await act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true })); });
  await settle();
};

const bot = (enabled: boolean): BotRow => ({ slug: "snitch", label: "Snitch", blurb: "reads the stream", enabled, every_minutes: 180,
  runs_after: null, model: "deepseek/deepseek-flash", lookback_hours: 3, max_items: 25, files_to_tracker: true, last_run_at: null, last_run_note: "" });

// Render the real settings page for one bot, click "run it" so it flips from `enabledBefore`, click save.
async function flipAndSave(enabledBefore: boolean) {
  const { BotSettings } = await import("../../app/tracker/bots/BotSettings");
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<BotSettings bots={[bot(enabledBefore)]} />); });
  const runIt = [...document.querySelectorAll("label")].find(l => /run it/.test(l.textContent ?? ""))?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  assert.ok(runIt, "the \"run it\" checkbox is rendered");
  assert.equal(runIt.checked, enabledBefore);
  await click(runIt);
  assert.equal(runIt.checked, !enabledBefore, "the click flipped the checkbox");
  patches.length = 0;
  await click([...document.querySelectorAll("button")].find(b => (b.textContent ?? "").trim() === "save"));
  await settle();
  assert.equal(patches.length, 1, "one PATCH to tracker_bots");
  return patches[0];
}

test("control: ticking \"run it\" on an OFF bot and saving PATCHes enabled:true", async () => {
  const patch = await flipAndSave(false);
  assert.equal(patch.enabled, true);
  assert.equal(patch.max_items, 25);
});

test("W7 bot-disable: unticking \"run it\" on an ON bot and saving PATCHes enabled:false", async () => {
  const patch = await flipAndSave(true);
  assert.equal(patch.enabled, false, "unticking \"run it\" and saving must switch the bot off");
});
