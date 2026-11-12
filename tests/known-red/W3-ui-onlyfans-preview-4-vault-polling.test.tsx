// KNOWN RED (W3 ui-onlyfans-preview-4, findings F6 F7 F8 in docs/review/W3/ui-onlyfans-preview-4.md). Team's Claude owns the fixes.
// F6 components/onlyfans-preview/VaultAssetPreview.tsx:12: every `refreshKey` bump (VaultManager bumps it on each successful read, incl.
//    the 20 s background poll, VaultManager.tsx:87) re-arms a failed tile, also for states PREVIEW_COPY marks retryable:false (here
//    "unavailable", a 404): one image GET + one probe GET per failed tile per poll, forever (REVIEW: unbounded client retries).
// F7 VaultUploader.tsx:44 + VaultMediaPicker.tsx:92-94: `setInterval(read, 3000)` for the whole mount with no active job, and the picker
//    mounts the uploader hidden, so it polls while the operator browses the vault tab.
// F8 VaultVideoPlayer.tsx:18: after the video is `ready` it re-GETs every 15 s for as long as the dialog is open.
// Not wired into npm scripts; init.sh does not run it yet (shared file; wiring decided at window close).
// Offline: jsdom, global fetch stubbed (https://fixture.invalid); timers faked by tests/helpers/w3-preview4-clock.tsx (no real waiting).
import { calls, close, json, mount, q, rerender, serve, settle, unmount } from "../helpers/w3-preview4-dom";
import { ACCOUNT, MEDIA, contentBase, uploadsBody, vaultReads, videoBody } from "../helpers/w3-preview4-vault";
import { advance, install, uninstall } from "../helpers/w3-preview4-clock";
import assert from "node:assert/strict";
import test, { after } from "node:test";
import React, { act } from "react";
import { parseUploads, parseVideo } from "../../lib/onlyfans/vault-media";
import { PREVIEW_COPY, nextPreviewStep } from "../../lib/onlyfans/section8";

after(close);
Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
const gets = (path: string) => calls.filter(call => call.method === "GET" && call.url.split("?")[0] === path).length;

test("control: fixtures are accepted by the real parsers, and a 404 preview is a terminal non-retryable state", () => {
  assert.ok(parseUploads(uploadsBody(), ACCOUNT), "uploads");
  assert.ok(parseVideo(videoBody("ready", true), ACCOUNT, MEDIA), "ready video");
  assert.ok(parseVideo(videoBody("running", false), ACCOUNT, MEDIA), "running video");
  assert.deepEqual(nextPreviewStep(1, { status: 404 }), { action: "stop", state: "unavailable" });
  assert.equal(PREVIEW_COPY.unavailable.retryable, false);
});

// ---- F6 ----
const preview = `${contentBase}/vault/previews/${MEDIA}`;
/** The browser's image GET for the preview: jsdom loads no images, so the test fires the error a 404 image source produces. */
async function imageFails() {
  const img = q<HTMLImageElement>(`[data-of-vault-image="${MEDIA}"] img`);
  if (!img) return false;
  await act(async () => { img.dispatchEvent(new window.Event("error")); });
  await settle();
  return true;
}
async function failedTile() {
  serve(() => new Response(null, { status: 404 }));
  const { default: VaultAssetPreview } = await import("../../components/onlyfans-preview/VaultAssetPreview");
  const tile = (refreshKey: number) => <VaultAssetPreview accountId={ACCOUNT} mediaId={MEDIA} kind="photo" refreshKey={refreshKey} />;
  await mount(tile(0), "/onlyfans/content");
  assert.ok(await imageFails(), "the tile rendered its image");
  return tile;
}

test("control: a preview image that fails with 404 is probed once and shows Source unavailable", async () => {
  await failedTile();
  assert.equal(gets(preview), 1, "one probe");
  assert.equal(q(`[data-of-preview-pending="${MEDIA}"]`)?.getAttribute("data-of-preview-state"), "unavailable");
  assert.equal(q(`[data-of-preview-pending="${MEDIA}"] button`), null, "no Retry preview button: the state is not retryable");
});

test("F6: five background refreshes do not re-request a preview whose failure is not retryable", async () => {
  const tile = await failedTile();
  let imageRequests = 1;
  for (let key = 1; key <= 5; key++) {
    await rerender(tile(key), "/onlyfans/content");
    if (await imageFails()) imageRequests++;
  }
  assert.equal(gets(preview), 1, `a non-retryable preview failure (404, unavailable) is probed once, not once per refresh (probes ${gets(preview)}, image GETs ${imageRequests})`);
  assert.equal(imageRequests, 1, "the failed image is not re-requested on every refresh");
});

// ---- F7 ----
const uploads = `${contentBase}/vault/uploads`;
async function picker(initialMode: "vault" | "upload") {
  await unmount();
  install();
  serve(call => call.url.split("?")[0] === uploads ? json(uploadsBody()) : vaultReads(call) ?? json({ ok: false }, 404));
  const { default: VaultMediaPicker } = await import("../../components/onlyfans-preview/VaultMediaPicker");
  await mount(<VaultMediaPicker accountId={ACCOUNT} connectionRevision={3} selected={new Map()} initialMode={initialMode}
    onToggle={() => {}} onClose={() => {}} onChanged={() => {}} onDenied={() => {}} />, "/onlyfans/content");
  await settle(60);
}

test("control: the media picker opened on Upload reads the upload status and shows the upload form", async () => {
  try {
    await picker("upload");
    assert.ok(gets(uploads) >= 1, "the upload tab reads the upload status");
    assert.ok(q("[data-of-vault-uploader] input[type=file]"), "upload form is shown (enabled, no jobs)");
  } finally { await unmount(); uninstall(); }
});

test("F7: the media picker on its vault tab does not poll the hidden uploader for a minute", async () => {
  try {
    await picker("vault");
    assert.ok(q(`[data-of-picker-item="${MEDIA}"]`), "the vault tab shows the vault grid");
    await advance(60_000);
    const count = gets(uploads);
    assert.ok(count <= 2, `while the operator browses the vault tab with no active upload job, the hidden uploader does not poll every 3 s (upload status GETs in 60 s: ${count}, bound 2)`);
  } finally { await unmount(); uninstall(); }
});

// ---- F8 ----
const video = `${contentBase}/vault/videos/${MEDIA}`;
async function player(answer: () => unknown) {
  serve(call => call.url === video ? json(answer()) : json({ ok: false }, 404));
  const { default: VaultVideoPlayer } = await import("../../components/onlyfans-preview/VaultVideoPlayer");
  // readOnly: the player only reads (GET), so every request counted here is a status read.
  await mount(<VaultVideoPlayer accountId={ACCOUNT} mediaId={MEDIA} poster={`${contentBase}/vault/previews/${MEDIA}`} readOnly />, "/onlyfans/content");
}

test("control: a video still preparing is re-read after 2 s, then plays once ready", async () => {
  await unmount();
  install();
  try {
    let ready = false;
    await player(() => ready ? videoBody("ready", true) : videoBody("running", false));
    assert.equal(gets(video), 1);
    assert.equal(q("[data-of-video-player] video"), null, "not playable yet");
    ready = true;
    await advance(2000);
    assert.equal(gets(video), 2, "the fake clock drives the player's re-read");
    assert.ok(q("[data-of-video-player] video"), "the ready video plays");
  } finally { await unmount(); uninstall(); }
});

test("F8: a ready video is not re-read every 15 s while the dialog stays open", async () => {
  await unmount();
  install();
  try {
    await player(() => videoBody("ready", true));
    assert.ok(q("[data-of-video-player] video"), "the ready video plays");
    await advance(10 * 60_000);
    const count = gets(video);
    assert.ok(count <= 2, `once the video is ready its status is not polled for as long as it plays (GETs in 10 min: ${count}, bound 2)`);
  } finally { await unmount(); uninstall(); }
});
