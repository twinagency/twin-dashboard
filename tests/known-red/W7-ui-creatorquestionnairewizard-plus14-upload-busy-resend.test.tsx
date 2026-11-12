// KNOWN RED (W7 ui-creatorquestionnairewizard-plus14, finding F3, high): every `upload_busy` answer makes the creator's
// browser re-POST the whole file. components/CreatorUploadForm.tsx:212-219 loops `send(item, form)` with the full
// FormData up to 25 times, 5 s apart, while the route answers busy only after the body was sent
// (app/creator-auth/upload/route.ts:256). Up to 25 x 512 MiB per video on mobile data. Expected: admission before bytes
// (a cheap reservation call, or a server-side queue), so a busy refusal never costs a full re-upload.
// Not wired into npm scripts; init.sh reports it. Offline: jsdom, fetch and XMLHttpRequest stubbed at the wire, the 5 s
// busy back-off shortened to 0 ms.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";
import React, { act } from "react";
const { JSDOM } = createRequire(import.meta.url)("jsdom");

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/creator/onboarding?step=content" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent,
  FormData: dom.window.FormData, sessionStorage: dom.window.sessionStorage, React, IS_REACT_ACT_ENVIRONMENT: true });
createRequire(import.meta.url).extensions[".css"] = module => { module.exports = {}; };
let createRoot: typeof import("react-dom/client").createRoot;
let UploadForm: (props: { kind: string; label: string; accept: string; locked: boolean; accountId?: string }) => React.ReactElement;
let AppRouterContext: React.Context<unknown>;
let root: ReturnType<typeof createRoot> | undefined;
const realSetTimeout = globalThis.setTimeout;
before(async () => {
  ({ createRoot } = await import("react-dom/client"));
  ({ AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime") as unknown as { AppRouterContext: React.Context<unknown> });
  ({ default: UploadForm } = await import("../../components/CreatorUploadForm") as unknown as { default: typeof UploadForm });
  // Only the busy back-off uses exactly 5000 ms; run it at once so 25 attempts take milliseconds.
  globalThis.setTimeout = ((fn: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => realSetTimeout(fn, ms === 5000 ? 0 : ms, ...args)) as typeof setTimeout;
});
after(async () => { globalThis.setTimeout = realSetTimeout; await act(async () => root?.unmount()); dom.window.close(); });
const wait = async (ms: number) => act(async () => { await new Promise(resolve => realSetTimeout(resolve, ms)); });

const refreshes: string[] = [];
const router = { push: () => {}, replace: () => {}, refresh: () => { refreshes.push("refresh"); }, prefetch: () => {}, back: () => {}, forward: () => {} };
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = new URL(String(input), "https://fixture.invalid");
  if (url.pathname === "/creator-auth/uploads") return Response.json({ uploads: (url.searchParams.get("ids") || "").split(",").map(id => ({ id, state: "missing" })) });
  return new Response(null, { status: 404 });
}) as typeof fetch;

// Wire-level XHR fake: records every body, then answers busy (429) or saved (200).
let answer: "busy" | "saved" = "saved";
const sends: { hasFile: boolean }[] = [];
class FakeXHR {
  status = 0; responseText = ""; responseURL = ""; timeout = 0;
  upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null; onload: (() => void) | null } = { onprogress: null, onload: null };
  onload: (() => void) | null = null; onerror: (() => void) | null = null; ontimeout: (() => void) | null = null; onabort: (() => void) | null = null;
  open() {} setRequestHeader() {}
  send(body: unknown) {
    const file = body instanceof dom.window.FormData ? (body as FormData).get("files") : null;
    sends.push({ hasFile: !!file && typeof file === "object" && (file as File).name === "a.jpg" && (file as File).size > 0 });
    realSetTimeout(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 3, total: 3 });
      this.upload.onload?.();
      [this.status, this.responseText] = answer === "busy" ? [429, JSON.stringify({ status: "upload_busy" })] : [200, JSON.stringify({ status: "content_saved" })];
      this.onload?.();
    }, 0);
  }
}
Object.assign(globalThis, { XMLHttpRequest: FakeXHR });
Object.assign(dom.window, { XMLHttpRequest: FakeXHR });

async function uploadOneFile(mode: "busy" | "saved") {
  answer = mode; sends.length = 0; refreshes.length = 0;
  if (root) await act(async () => root!.unmount());
  dom.window.sessionStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<AppRouterContext.Provider value={router}><UploadForm kind="content_sfw_image" label="SFW images" accept="image/jpeg" locked={false} accountId="acct-1" /></AppRouterContext.Provider>); });
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  assert.ok(input, "file input rendered");
  const file = new dom.window.File(["abc"], "a.jpg", { type: "image/jpeg", lastModified: 1 });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => { input.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
  const submit = document.querySelector<HTMLButtonElement>("[data-upload-content]");
  assert.equal(submit?.disabled, false, "upload button enabled after selecting a file");
  await act(async () => { submit!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true })); });
  // Bounded wait: a fix may queue instead of failing, so the run need not end for the count to be meaningful.
  for (let i = 0; i < 200 && /Uploading ·/.test(submit!.textContent ?? ""); i++) await wait(10);
  return { fileSends: sends.filter(send => send.hasFile).length, finished: !/Uploading ·/.test(submit!.textContent ?? "") };
}

test("control: an admitted upload sends the file once and the item ends saved", async () => {
  const { fileSends, finished } = await uploadOneFile("saved");
  assert.equal(finished, true, "upload run finished");
  assert.equal(fileSends, 1, "exactly one XHR body carrying the file");
  const text = document.body.textContent ?? "";
  assert.match(text, /Saved ✓/);
  assert.match(text, /1 file uploaded and verified/);
  assert.equal(refreshes.length, 1, "router refreshed after a saved file");
});

test("F3: a busy refusal must not make the client re-upload the whole file again and again", async () => {
  const { fileSends } = await uploadOneFile("busy");
  assert.ok(fileSends >= 1, "the file must still be uploaded at least once (a fix that never sends the file is not a fix)");
  assert.ok(fileSends <= 2, `a busy refusal must not make the client re-upload the whole file again and again; admit before sending bytes (full-file sends: ${fileSends}, allowed: 2)`);
});
