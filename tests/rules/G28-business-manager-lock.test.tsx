// Regression guard (G28): was KNOWN RED tests/known-red/W5-app-ava-plus3-business-manager.test.tsx (origin/jaka/fix-sweep-20261112), fixed in this PR (app/business/BusinessAccountManager.tsx: one lock for every action; F1a + F1b). F2 (stale load after clone switch) is NOT in G28 and stays red in known-red; its test is not promoted here. Original header below.
// KNOWN RED (W5 lane app-ava-plus3, docs/review/W5/app-ava-plus3.md F1 + F2). Team's Claude owns the fix.
// F1: BusinessAccountManager.tsx:74,158-193 locks only the running action (`busy === "story"`) while one shared
//     `result` banner (:75,88,95-99) and one `setBusy(null)` (:105) serve every action. A story post in flight
//     re-enables after another action finishes (duplicate public story risk, W4 F26: not idempotent), and a failed
//     story is overwritten by a later action's "Done." (false success).
// F2: `load()` (:77-83) has no stale-response guard and the component has no `key={cloneId}` (app/business/page.tsx:20,
//     app/creator/business/page.tsx:9): clone A's late GET overwrites clone B's status, so B's editor shows A's profile
//     and the next save posts B's cloneId with A's prefilled values.
// Not wired into npm scripts or init.sh (orchestrator merges the known-red list). Offline: jsdom, global fetch stubbed
// at the wire; nothing is sent anywhere.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before, beforeEach } from "node:test";
import React, { act } from "react";
const { JSDOM } = createRequire(import.meta.url)("jsdom");

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/business" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent, MutationObserver: dom.window.MutationObserver, FormData: dom.window.FormData, React, IS_REACT_ACT_ENVIRONMENT: true });
let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => { ({ createRoot } = await import("react-dom/client")); });
after(async () => { await act(async () => root?.unmount()); dom.window.close(); });
const tick = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });

type Deferred = { resolve: (r: Response) => void; promise: Promise<Response> };
const defer = (): Deferred => { let resolve!: (r: Response) => void; const promise = new Promise<Response>(r => { resolve = r; }); return { resolve, promise }; };
const RIGHTS = { can_edit_name: true, can_edit_username: true, can_edit_bio: true, can_edit_profile_photo: true, can_manage_stories: true };
const status = (first: string) => Response.json({ connected: true, isEnabled: true, businessConnectionId: "bc-fixture", rights: RIGHTS,
  account: { id: null, firstName: first, lastName: null, username: null, bio: "old bio" } });

// Wire fake: GETs answer from `profiles` unless a test parks them; POSTs are parked per action so the test orders them.
let profiles: Record<string, string>;
let parkedGets: Map<string, Deferred>;
let parkedPosts: Map<string, Deferred>;
let posts: { cloneId: string; action: string }[];
beforeEach(() => {
  profiles = { "clone-a": "Ann", "clone-b": "Bea" }; parkedGets = new Map(); parkedPosts = new Map(); posts = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "https://fixture.invalid");
    if (init?.method === "POST") {
      const fd = init.body as FormData;
      const action = String(fd.get("action")); posts.push({ cloneId: String(fd.get("cloneId")), action });
      const d = defer(); parkedPosts.set(action, d); return d.promise;
    }
    const clone = url.searchParams.get("cloneId")!;
    const parked = parkedGets.get(clone);
    if (parked) { parkedGets.delete(clone); return parked.promise; }
    return status(profiles[clone]);
  }) as typeof fetch;
});

async function mount(cloneId: string) {
  const { default: Manager } = await import("../../app/business/BusinessAccountManager");
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<Manager cloneId={cloneId} />); });
  await tick();
  return (id: string) => act(async () => { root!.render(<Manager cloneId={id} />); });
}
const shownName = () => document.querySelector<HTMLInputElement>('input[placeholder="First name"]')?.value;
const storyFieldset = () => document.querySelector("form fieldset") as HTMLFieldSetElement | null;
async function submitStory() {
  await act(async () => { document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); });
  await tick();
}
async function saveBio(text: string) {
  const area = document.querySelector<HTMLTextAreaElement>('textarea[placeholder="Bio"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, "value")!.set!.call(area, text);
    area.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  area.closest("fieldset")!.querySelector("button")!.click(); // by position: a lock may relabel it "Saving…"
  await tick();
}

test("control: one story post locks the story form, a failure shows its error, a clone switch with no race shows the new clone", async () => {
  await mount("clone-a");
  assert.equal(shownName(), "Ann");
  await submitStory();
  assert.deepEqual(posts, [{ cloneId: "clone-a", action: "story" }]);
  assert.equal(storyFieldset()?.disabled, true, "story form locked while its own post is in flight");
  await act(async () => { parkedPosts.get("story")!.resolve(Response.json({ error: "story rejected by Telegram" }, { status: 400 })); });
  await tick();
  assert.match(document.body.textContent ?? "", /story rejected by Telegram/);
  await saveBio("new bio"); // harness proof for F1a/F1b: with nothing in flight, the bio save is sent
  assert.deepEqual(posts.map(p => p.action), ["story", "bio"]);

  const switchTo = await mount("clone-a");
  await switchTo("clone-b");
  await tick();
  assert.equal(shownName(), "Bea");
});

test("F1a: while a story post is in flight, finishing another action must not unlock the story form", async () => {
  await mount("clone-a");
  await submitStory();
  await saveBio("new bio"); // a fix may refuse to start it (one lock for every action); then nothing to resolve
  await act(async () => { parkedPosts.get("bio")?.resolve(Response.json({ ok: true })); });
  await tick(); await tick();
  assert.equal(storyFieldset()?.disabled, true, "story post still in flight: a second Post story must be impossible");
});

test("F1b: a failed story must not be reported as Done. by a later action finishing after it", async () => {
  await mount("clone-a");
  await submitStory();
  await saveBio("new bio");
  await act(async () => { parkedPosts.get("story")!.resolve(Response.json({ error: "story rejected by Telegram" }, { status: 400 })); });
  await tick();
  await act(async () => { parkedPosts.get("bio")?.resolve(Response.json({ ok: true })); });
  await tick(); await tick();
  assert.match(document.body.textContent ?? "", /story rejected by Telegram/, "the story failure must stay visible");
});
