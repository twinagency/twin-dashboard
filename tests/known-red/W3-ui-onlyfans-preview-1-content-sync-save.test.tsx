// KNOWN RED (W3 ui-onlyfans-preview-1, findings F34 F35 in docs/review/W3/ui-onlyfans-preview-1.md). Team's Claude owns the fixes.
// F34 components/onlyfans-preview/ContentSyncSave.tsx:100,132-133: when the created draft is not in state `draft` (a create replay or
//     commit answering needs_review, connection_required, outcome_unconfirmed) the flow skips upload and still shows "Saved.
//     Uploading to OnlyFans in the background…", clears the form and resets the job (inv 7: no false success).
// F35 ContentSyncSave.tsx:36-47,59-64: the 3 s draft poll ignores denied replies, so after a 401 it keeps firing GETs every 3 s for
//     as long as the tab is visible (sessionLost() is never called from the poll).
// Not wired into npm scripts; init.sh does not run it yet (shared file; wiring decided at window close). Offline: jsdom, global fetch stubbed (https://fixture.invalid), setInterval mocked (node:test mock.timers).
import { ACCOUNT, calls, close, json, mount, q, serve, settle, submit, type, unmount } from "../helpers/w3-preview1-dom";
import assert from "node:assert/strict";
import test, { after, mock } from "node:test";
import React, { act } from "react";

after(close);
Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
const draft = (state: string, draftId = "draft-1") => ({ draftId, revision: 1, state, reason: null, label: "Beach set", description: "Two photos.", priceCents: 1200,
  pricingMode: "fixed", itemId: null, enabled: false, assets: [], readiness: { mediaSynced: false, canEnable: false, blockers: [] } });
const ok = (data: unknown) => json({ ok: true, data });

async function saveAs(createdState: string) {
  serve(call => {
    if (call.url.endsWith("/sync/status")) return ok({});
    if (call.method === "POST" && call.url.endsWith("/sync/drafts")) return ok(draft(createdState));
    if (call.url.includes("/sync/drafts/")) return ok(draft(createdState));
    return ok({ items: [] });
  });
  const { default: ContentSyncSave } = await import("../../components/onlyfans-preview/ContentSyncSave");
  await mount(<ContentSyncSave accountId={ACCOUNT} />, "/onlyfans/content");
  const input = q<HTMLInputElement>("[data-sync-save-files]");
  assert.ok(input, "save form is available");
  await act(async () => {
    Object.defineProperty(input, "files", { configurable: true, value: [new File([new Uint8Array([1, 2, 3])], "beach.jpg", { type: "image/jpeg" })] });
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
  await type(q("[data-sync-save-label]"), "Beach set");
  await type(q("[data-sync-save-price]"), "12.00");
  await type(q("[data-sync-save-description]"), "Two photos.");
  await submit(q("[data-sync-save-submit]")?.closest("form"));
  await settle(60);
  assert.equal(calls.filter(call => call.method === "POST" && call.url.endsWith("/sync/drafts")).length, 1, "one create sent");
}
const notice = () => q("[data-sync-save-notice]")?.textContent ?? "";

test("control: a create answered with a queued draft reads Saved", async () => {
  await saveAs("queued");
  assert.match(notice(), /^Saved\. Uploading to OnlyFans/);
});

test("F34: a create answered with a draft that needs review does not read Saved", async () => {
  await saveAs("needs_review");
  assert.doesNotMatch(notice(), /Saved|Uploading/, "a needs_review draft is not a successful save and nothing is uploading");
  assert.match(notice(), /review/i, "the notice names the review state");
  assert.equal(q<HTMLInputElement>("[data-sync-save-label]")?.value, "Beach set", "the operator's entries remain");
});

test("control: while a draft is uploading, the poll reads drafts every 3 s", async () => {
  await unmount(); // clear earlier real intervals with the real clearInterval before mocking
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    serve(call => call.url.endsWith("/sync/status") ? ok({}) : ok({ items: [draft("uploading")] }));
    const { default: ContentSyncSave } = await import("../../components/onlyfans-preview/ContentSyncSave");
    await mount(<ContentSyncSave accountId={ACCOUNT} />, "/onlyfans/content");
    const before = calls.length;
    await act(async () => { mock.timers.tick(3000); }); await settle();
    await act(async () => { mock.timers.tick(3000); }); await settle();
    assert.equal(calls.length - before, 2);
  } finally { await unmount(); mock.timers.reset(); }
});

test("F35: after the draft poll is answered 401, it stops polling", async () => {
  await unmount(); // clear earlier real intervals with the real clearInterval before mocking
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    let denied = false;
    serve(call => denied ? new Response(null, { status: 401 }) : call.url.endsWith("/sync/status") ? ok({}) : ok({ items: [draft("uploading")] }));
    const { default: ContentSyncSave } = await import("../../components/onlyfans-preview/ContentSyncSave");
    await mount(<ContentSyncSave accountId={ACCOUNT} />, "/onlyfans/content");
    assert.equal(q("[data-sync-draft]")?.getAttribute("data-state"), "uploading", "a draft is being followed");
    const beforeTick = calls.length;
    denied = true;
    await act(async () => { mock.timers.tick(3000); }); await settle();
    const afterDenied = calls.length;
    assert.equal(afterDenied - beforeTick, 1, "the poll fired once and was answered 401");
    for (let n = 0; n < 3; n++) { await act(async () => { mock.timers.tick(3000); }); await settle(); }
    assert.equal(calls.length - afterDenied, 0, "no further reads after the session was denied");
  } finally { await unmount(); mock.timers.reset(); }
});
