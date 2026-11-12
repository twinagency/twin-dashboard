// KNOWN RED (W7 ui-createcloneform-plus18 F28): an answer typed less than 1 s before the questionnaire unmounts (client
// navigation away, e.g. a sidebar link) is never saved. CreatorProfileQuestionnaire.tsx:169 cleanup only clears the
// 1000 ms saveTimer (:117) and never flushes, and the beforeunload guard (:164) only fires on a real page unload.
// The test unmounts directly, with no guard in the way, as Back / swipe-back / an unguarded link does. A navigation
// guard alone does not fix this (it cannot cover every unmount path); the unmount itself must flush the pending edit.
// Team's Claude owns the fix. Not wired into npm scripts. Offline: jsdom, global fetch stubbed, CSS modules faked.
import "./W7-ui-createcloneform-plus18-fakes/hooks.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";
import React, { act } from "react";
const { JSDOM } = createRequire(import.meta.url)("jsdom");

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/creator/onboarding?step=questionnaire" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, React, IS_REACT_ACT_ENVIRONMENT: true });
let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot> | undefined;
let Questionnaire: typeof import("../../components/CreatorProfileQuestionnaire").default;
let PAGES: typeof import("../../lib/creator-questionnaire-compact").COMPACT_QUESTIONNAIRE_PAGES;
before(async () => {
  ({ createRoot } = await import("react-dom/client"));
  ({ default: Questionnaire } = await import("../../components/CreatorProfileQuestionnaire"));
  ({ COMPACT_QUESTIONNAIRE_PAGES: PAGES } = await import("../../lib/creator-questionnaire-compact"));
});
after(async () => { await act(async () => root?.unmount()); dom.window.close(); });
const wait = (ms: number) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });

// Same success shape as app/creator-auth/onboarding/draft/route.ts:64/78.
const drafts: { section: string; answers: Record<string, string>; revision: string }[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (init?.method === "POST" && String(input) === "/creator-auth/onboarding/draft") {
    drafts.push(JSON.parse(String(init.body)));
    return Response.json({ ok: true, revision: `2026-11-12T00:00:0${drafts.length}.000Z` });
  }
  return new Response(null, { status: 404 });
}) as typeof fetch;

async function mountAndType(value: string) {
  drafts.length = 0;
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<Questionnaire page={PAGES[0]} initialAnswers={{}} initialRevision="" />); });
  const input = document.querySelector<HTMLInputElement>('input[name="preferred_name"]');
  assert.ok(input, "preferred_name input rendered");
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  assert.equal(input.value, value, "controlled input took the edit");
}

test("control: an edit left alone for > 1 s autosaves exactly once", async () => {
  await mountAndType("Sophie");
  assert.equal(drafts.length, 0, "debounced, nothing sent yet");
  await wait(1200);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].answers.preferred_name, "Sophie");
  await act(async () => root!.unmount()); root = undefined;
});

test("F28: an edit made < 1 s before the questionnaire unmounts is still saved", async () => {
  await mountAndType("Mia");
  await wait(200);
  await act(async () => root!.unmount()); root = undefined;
  await wait(1200);
  assert.ok(drafts.some(d => d.answers.preferred_name === "Mia"), `the pending edit must be flushed on unmount; draft POSTs seen: ${drafts.length}`);
});
