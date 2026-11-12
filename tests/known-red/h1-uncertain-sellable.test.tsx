// KNOWN RED (rule h, DROP finding H1, docs/RISKS.md D13: backend-gated, medium): an asset whose classification is
// uncertain must stay in Miscellaneous and be unsellable. CategoryDrafts.tsx:55 computes `ready` without
// `classificationUncertain`, so ticking the two boxes enables "Create disabled single drafts" for an uncertain asset and
// the command is posted; validCategoryDraft (commercial-categories.ts:31-41) cannot refuse it because the draft carries no
// classification. The backend is expected to refuse (D13, not run here). Team's Claude owns the fix.
// Not wired into npm scripts; init.sh reports it. Offline: jsdom, global fetch stubbed.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";
import React, { act } from "react";
const { JSDOM } = createRequire(import.meta.url)("jsdom");

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/onlyfans/content" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, React, IS_REACT_ACT_ENVIRONMENT: true });
let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot> | undefined;
before(async () => { ({ createRoot } = await import("react-dom/client")); });
after(async () => { await act(async () => root?.unmount()); dom.window.close(); });
const settle = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
const click = async (element: Element | null | undefined) => { assert.ok(element, "element exists"); await act(async () => { element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 25)); }); };
const button = (label: RegExp) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => label.test(item.textContent ?? ""));

import { CONTENT_SCHEMA } from "../../lib/onlyfans/content";
const ACCOUNT = "of-a", FOLDER = "7", MEDIA = "1001", HASH = "d".repeat(64);
const posts: string[] = [];
function backend(priceCents: number | null, uncertain: boolean): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") { posts.push(url); return Response.json({ ok: true, items: [] }); }
    if (url.includes("/category-price/")) return Response.json({ schemaVersion: CONTENT_SCHEMA, ok: true, accountId: ACCOUNT, categoryPrice: { folderId: FOLDER, name: "Beach",
      revision: 1, priceCents, currency: "USD", appliesTo: "single_asset", fingerprint: "c".repeat(64) } });
    if (url.includes("/category-review/")) return Response.json({ schemaVersion: CONTENT_SCHEMA, ok: true, accountId: ACCOUNT, categoryName: "Beach",
      reviewedState: { version: "agency-category-review.v1", bindingId: "binding-1", categoryFingerprint: "c".repeat(64), assets: { [MEDIA]: HASH } },
      assets: [{ mediaId: MEDIA, fingerprint: HASH, description: "Photo on a beach.", tags: null, kind: "photo", durationSeconds: null, analysisNote: null, classificationUncertain: uncertain }] });
    return new Response(null, { status: 404 });
  }) as typeof fetch;
}
async function reviewed(priceCents: number | null, uncertain: boolean) {
  globalThis.fetch = backend(priceCents, uncertain);
  const { default: CategoryDrafts } = await import("../../components/onlyfans-preview/CategoryDrafts");
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => { root!.render(<CategoryDrafts accountId={ACCOUNT} folderId={FOLDER} selectedIds={[MEDIA]} onCreated={() => {}} />); });
  await settle();
  const review = button(/^Review 1 selected singles$/);
  if (priceCents === null) return review;
  await click(review);
  for (const box of document.querySelectorAll('input[type="checkbox"]')) await click(box);
  return button(/^Create disabled single drafts$/);
}

test("control: no manual price means nothing can be reviewed; a certain asset with a manual price can be drafted", async () => {
  assert.equal((await reviewed(null, false))?.disabled, true, "no operator price row, no review");
  const create = await reviewed(1200, false);
  assert.equal(create?.disabled, false);
});

test("H1: an asset with uncertain classification cannot be drafted for sale", async () => {
  posts.length = 0;
  const create = await reviewed(1200, true);
  assert.match(document.body.textContent ?? "", /Classification needs agency review/);
  assert.equal(create?.disabled, true, "uncertain classification must keep the draft control disabled");
  await click(create);
  assert.deepEqual(posts, [], "no draft command for an uncertain asset");
});
