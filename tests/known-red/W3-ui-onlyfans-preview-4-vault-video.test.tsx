// KNOWN RED (W3 ui-onlyfans-preview-4, finding F5 in docs/review/W3/ui-onlyfans-preview-4.md). Team's Claude owns the fixes.
// F5 components/onlyfans-preview/VaultVideoPlayer.tsx:7,11,20 + VaultAssetPreview.tsx:34: opening a video POSTs a prepare whose
//    `requestId` nonce lives in a ref of the player, which unmounts when the dialog closes; every reopen mints a new key, so the same
//    "view" is a new write each time (inv 7: a retry of the same action reuses its idempotency key). The chat hosts omit `readOnly`
//    (VaultMediaPicker.tsx:79), so the default host below is the one that writes.
// Not wired into npm scripts; init.sh does not run it yet (shared file; wiring decided at window close).
// Offline: jsdom, global fetch stubbed (https://fixture.invalid); timers faked by tests/helpers/w3-preview4-clock.tsx.
import { bodyOf, calls, click, close, json, mount, posts, q, serve, settle, unmount } from "../helpers/w3-preview4-dom";
import { ACCOUNT, MEDIA, contentBase, videoBody } from "../helpers/w3-preview4-vault";
import { install, uninstall } from "../helpers/w3-preview4-clock";
import assert from "node:assert/strict";
import test, { after } from "node:test";
import React from "react";
import { parseVideo } from "../../lib/onlyfans/vault-media";

after(close);
Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
const video = `${contentBase}/vault/videos/${MEDIA}`;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

async function openVideo() {
  await click(q(`[data-of-vault-image="${MEDIA}"]`));
  await settle(30);
  assert.ok(q("[data-of-video-player]"), "the video dialog shows the player");
}
async function closeVideo() {
  const content = q("[data-slot='dialog-content']");
  await click([...(content?.querySelectorAll("button") ?? [])].find(b => b.textContent?.trim() === "Close"));
  await settle(30);
  assert.equal(q("[data-of-video-player]"), null, "the dialog closed and the player unmounted");
}
async function host() {
  await unmount();
  install();
  serve(call => call.url === video ? json(videoBody("ready", true)) : new Response(null, { status: 404 }));
  const { default: VaultAssetPreview } = await import("../../components/onlyfans-preview/VaultAssetPreview");
  // Same props as the chat picker host (VaultMediaPicker.tsx:79): no readOnly.
  await mount(<VaultAssetPreview accountId={ACCOUNT} mediaId={MEDIA} kind="video" tile />, "/onlyfans/content");
}
const prepares = () => posts().filter(call => call.url === video);

test("control: the fixture is accepted, and opening a video sends at most one prepare, with a UUID requestId, and plays it", async () => {
  assert.ok(parseVideo(videoBody("ready", true), ACCOUNT, MEDIA));
  try {
    await host();
    await openVideo();
    assert.ok(prepares().length <= 1, `at most one prepare on open (a GET-first fix sends none for a ready video); prepares ${prepares().length}`);
    for (const call of prepares()) assert.match(String(bodyOf(call).requestId), UUID);
    assert.ok(q("[data-of-video-player] video"), "the ready video plays");
  } finally { await unmount(); uninstall(); }
});

test("F5: closing and reopening the same video does not mint a new prepare key", async () => {
  try {
    await host();
    await openVideo();
    await closeVideo();
    await openVideo();
    assert.ok(calls.filter(call => call.url === video).length >= 2, "the reopen was observed (the player asked about the video again, any method)");
    const ids = prepares().map(call => bodyOf(call).requestId);
    assert.ok(new Set(ids).size <= 1,
      `reopening the same video reuses its prepare key (or does not prepare again); prepares ${ids.length}, distinct requestIds ${new Set(ids).size}`);
  } finally { await unmount(); uninstall(); }
});
