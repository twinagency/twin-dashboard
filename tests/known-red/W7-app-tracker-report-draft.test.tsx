// KNOWN RED (W7 app-tracker, finding: high 2, report form closes before the insert resolves; a failed report is lost).
// app/tracker/TrackerBoard.tsx:489-494: `start(() => { createItem(fd); setReporting(false); })` neither awaits nor
// returns the promise, so the form unmounts at once. Condition: admin submits a report and createItem rejects (DB
// error, guard, body limit): title, body and screenshots are gone, the rejection is unhandled, no UI error. Same
// pattern at every `start(() => void action(...))` site (see docs/review/W7/app-tracker.md).
// Measured in a throwaway worktree: awaiting createItem inside `<form action>` keeps the form open but React 19
// still resets the uncontrolled inputs after the action, so the title is lost; an onSubmit + preventDefault (or
// controlled draft) fix turns this green.
// Team's Claude owns the fix. Not wired into npm scripts or init.sh (lane rule); run:
//   node --import tsx --test tests/known-red/W7-app-tracker-report-draft.test.tsx
// Offline: jsdom render of the real TrackerBoard with the real createItem server action, faked at the wire
// (globalThis.fetch, `.invalid` host, fake non-key service key); the tracker_items insert answers 409. No network,
// no ports. Outside a request scope getDashboardAccess() is null (lib/dashboard-access.ts:16-21), guard passes.
// No module stubs. globalThis.FormData is jsdom's so React can build the form's FormData from a jsdom <form>.
// The unhandled rejection the defect produces would be pinned on the test by node:test's own listener and replace the
// assertion, so for this file's run node:test's unhandledRejection listeners are swapped for a recorder (restored in
// after()); the recorded rejection is asserted last.
// Error feedback is a WEAK check: after the failed submit, the report form area (the form plus its previous and next
// sibling elements) must show text it did not show before submit. No error copy is asserted; any added text passes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";
import React, { act } from "react";
const { JSDOM } = createRequire(import.meta.url)("jsdom");

process.env.SUPABASE_URL = "https://tracker-fixture.invalid";
process.env.SUPABASE_SERVICE_KEY = "fixture-not-a-key";
const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/tracker" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent, FormData: dom.window.FormData, React, IS_REACT_ACT_ENVIRONMENT: true });

const inserts: string[] = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const method = (init?.method ?? "GET").toUpperCase();
  if (method === "POST" && url.pathname === "/rest/v1/tracker_items") {
    inserts.push(String(init?.body ?? ""));
    return json({ code: "23514", message: "fixture: insert refused", details: null, hint: null }, 409);
  }
  return json([]);
}) as typeof fetch;
const stray: unknown[] = [];
const record = (reason: unknown) => { stray.push(reason); };
const runnerListeners = process.listeners("unhandledRejection");

let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => {
  ({ createRoot } = await import("react-dom/client"));
  process.removeAllListeners("unhandledRejection").on("unhandledRejection", record);
});
after(async () => {
  await act(async () => root?.unmount());
  dom.window.close();
  process.off("unhandledRejection", record);
  for (const listener of runnerListeners) process.on("unhandledRejection", listener);
});
const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
const button = (label: RegExp) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => label.test(item.textContent ?? ""));
const click = async (element: Element | null | undefined) => {
  assert.ok(element, "element exists");
  await act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true })); });
  await settle();
};
const titleInput = () => document.querySelector<HTMLInputElement>('form input[name="title"]');
const reportAreaText = () => {
  const form = titleInput()?.closest("form");
  return form ? [form.previousElementSibling, form, form.nextElementSibling].map(el => el?.textContent ?? "").join("\n") : "";
};
const TITLE = "bot isnt remembering names on clone 3";

async function openAndType() {
  const { TrackerBoard } = await import("../../app/tracker/TrackerBoard");
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<TrackerBoard board={{ open: [], batches: [], dropped: [], jobs: [] }} bots={[]} log={[]} />); });
  await click(button(/new report/));
  const input = titleInput();
  assert.ok(input, "report form is open");
  await act(async () => { input.value = TITLE; input.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
  return input;
}

test("control: the report form opens and holds the typed title", async () => {
  const input = await openAndType();
  assert.equal(input.value, TITLE);
  assert.equal(titleInput()?.value, TITLE);
});

test("W7 report-draft: a report whose insert fails keeps the form and the typed title", async () => {
  await openAndType();
  inserts.length = 0;
  const before = reportAreaText();
  await click(button(/^submit report$/));
  await settle();
  assert.equal(inserts.length, 1, "the submit reached the tracker_items insert");
  assert.ok(titleInput(), "a failed report must leave the form open");
  assert.equal(titleInput()?.value, TITLE, "a failed report must keep the typed title");
  const after = reportAreaText();
  assert.ok(after.length > before.length && after !== before, "a failed report must show some error text in the report form area");
  assert.deepEqual(stray.map(String), [], "createItem's rejection must be handled, not left unhandled");
});
