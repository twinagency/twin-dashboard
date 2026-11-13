// Regression guard (G28): was KNOWN RED tests/known-red/W5-app-ai-plus3-ai-chat-silent-send-failure.test.tsx (origin/jaka/fix-sweep-20261112), fixed in this PR (app/ai/AiChat.tsx send(): non-ok response throws its {error}). Original header below.
// KNOWN RED (W5 app-ai-plus3 F-A1, high, silent failure): AiChat send() checks only `if (!res.body)`
// (app/ai/AiChat.tsx:137-142), never `res.ok` or the content type. The chat route answers JSON `{error}` with 400/500
// BEFORE any stream (app/api/ai-assistant/route.ts:137,141,156: bad JSON, missing message, conversation/DB failure).
// That body is non-null, contains no `\n\n`-framed `data:` event, so the loop parses nothing, `{error}` is dropped,
// and the operator sees their question plus an empty assistant turn with no error, as if the assistant said nothing.
// Control: a real text/event-stream (start, token, done; event shapes from route.ts:217,250) renders the token text
// and no error banner (holds).
// Turns green when a non-ok response surfaces its `{error}` text to the operator (e.g. `if (!res.ok) throw new
// Error(j.error)` into the existing error banner). Coupling: asserts the server's error string is visible somewhere
// in the page; a fix that replaces it with a generic message would need this assertion loosened.
// The red reply mirrors the route exactly: `new Response(JSON.stringify({ error }), { status: 500 })` (no content type).
// Promoted: runs in `npm run test:rules` (globs tests/rules). Offline: jsdom, global fetch stubbed per URL; next/navigation's useRouter is fed a fake
// router through AppRouterContext (the provider Next itself mounts), no module mocks.
// Run: node --import tsx --test <this file>.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";
import React, { act } from "react";
const { JSDOM } = createRequire(import.meta.url)("jsdom");

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/ai" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, React, IS_REACT_ACT_ENVIRONMENT: true });
(dom.window.HTMLElement.prototype as any).scrollTo = () => {};
let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => { ({ createRoot } = await import("react-dom/client")); });
after(async () => { await act(async () => root?.unmount()); dom.window.close(); });
const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
const click = async (element: Element | null | undefined) => { assert.ok(element, "element exists"); await act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 25)); }); };

import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} } as any;
const QUESTION = "Any errors in the last day?";
const posts: string[] = [];

function backend(chat: () => Response): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/ai-assistant" && init?.method === "POST") { posts.push(String(init.body)); return chat(); }
    if (url === "/api/ai-assistant/conversations") return Response.json({ conversations: [] });
    if (url === "/api/ai-assistant/suggestions") return Response.json({ suggestions: [] });
    throw new Error(`blocked in test: ${url}`);
  }) as typeof fetch;
}
const sse = (...events: object[]) => new Response(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });

async function ask(chat: () => Response) {
  posts.length = 0;
  globalThis.fetch = backend(chat);
  const { default: AiChat } = await import("../../app/ai/AiChat");
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<AppRouterContext.Provider value={router}><AiChat /></AppRouterContext.Provider>); });
  await settle();
  await click([...document.querySelectorAll("button")].find(b => b.textContent === QUESTION)); // the starter chip, real send() path
  await settle();
  assert.equal(posts.length, 1, "the question was posted to /api/ai-assistant");
  return document.body.textContent ?? "";
}
const errorBanner = () => document.querySelector('[class*="bg-crit/10"]');

test("control: a streamed answer renders and no error is shown", async () => {
  const text = await ask(() => sse({ type: "start", conversationId: "c-1" }, { type: "token", text: "No errors in the last day." }, { type: "done" }));
  assert.match(text, /No errors in the last day\./);
  assert.equal(errorBanner(), null);
});

test("F-A1: a JSON 500 from the chat route (no stream) must be shown to the operator", async () => {
  const text = await ask(() => new Response(JSON.stringify({ error: "conversation store unavailable" }), { status: 500 }));
  assert.ok(text.includes(QUESTION), "the user's question bubble is shown");
  assert.match(text, /conversation store unavailable/, `the route's {error} was dropped; the page shows no error (banner: ${errorBanner() ? "present" : "absent"})`);
});
