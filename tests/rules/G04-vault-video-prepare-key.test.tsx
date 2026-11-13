// RULE G04, was KNOWN RED (W3 ui-onlyfans-preview-4, finding F5 in docs/review/W3/ui-onlyfans-preview-4.md).
// F5 components/onlyfans-preview/VaultVideoPlayer.tsx:7,11,20 + VaultAssetPreview.tsx:34: opening a video POSTs a prepare whose
//    `requestId` nonce lives in a ref of the player, which unmounts when the dialog closes; every reopen mints a new key, so the same
//    "view" is a new write each time (inv 7: a retry of the same action reuses its idempotency key). The chat hosts omit `readOnly`
//    (VaultMediaPicker.tsx:79), so the default host below is the one that writes.
// Green since G04: the prepare key lives in a module map per media while its outcome is unresolved, so a reopen reuses it; opening reads the
//    recorded status first, so a ready video is not prepared again.
// G04 R1 (#390 finding 1): a definite refusal or a ready/failed video releases the key (the next prepare is new); a lost reply or a bare
//    5xx keeps it for Retry. In-page only: a reload drops the map (G04c).
// Offline: jsdom, global fetch stubbed (https://fixture.invalid); timers faked by tests/helpers/w3-preview4-clock.tsx.
import { bodyOf, calls, click, close, http502, json, lostReply, mount, posts, q, serve, settle, unmount, type Answer, type Call } from "../helpers/w3-preview4-dom";
import { ACCOUNT, MEDIA, contentBase, vaultFailure, videoBody } from "../helpers/w3-preview4-vault";
import { install, uninstall } from "../helpers/w3-preview4-clock";
import assert from "node:assert/strict";
import test, { after } from "node:test";
import React from "react";
import { parseVideo } from "../../lib/onlyfans/vault-media";

after(close);
Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
let video = `${contentBase}/vault/videos/${MEDIA}`, media = MEDIA;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

async function openVideo() {
  await click(q(`[data-of-vault-image="${media}"]`));
  await settle(30);
  assert.ok(q("[data-of-video-player]"), "the video dialog shows the player");
}
async function closeVideo() {
  const content = q("[data-slot='dialog-content']");
  await click([...(content?.querySelectorAll("button") ?? [])].find(b => b.textContent?.trim() === "Close"));
  await settle(30);
  assert.equal(q("[data-of-video-player]"), null, "the dialog closed and the player unmounted");
}
/** Each test uses its own media id, so one test's held key never reaches the next (the key map is module level by design). */
async function host(answer: (call: Call) => Response | Promise<Response> = () => json(videoBody("ready", true)), mediaId = MEDIA) {
  await unmount();
  install();
  media = mediaId; video = `${contentBase}/vault/videos/${mediaId}`;
  serve(call => call.url === video ? answer(call) : new Response(null, { status: 404 }));
  const { default: VaultAssetPreview } = await import("../../components/onlyfans-preview/VaultAssetPreview");
  // Same props as the chat picker host (VaultMediaPicker.tsx:79): no readOnly.
  await mount(<VaultAssetPreview accountId={ACCOUNT} mediaId={mediaId} kind="video" tile />, "/onlyfans/content");
}
/** GETs read `status`; the n-th prepare POST is answered by `prepare[n]`. */
const backend = (mediaId: string, prepare: Answer[], status = () => "unprepared") => {
  let n = 0;
  return (call: Call) => { const s = status(); return call.method === "GET" ? json(videoBody(s, s === "ready", mediaId)) : prepare[n++](); };
};
const retryVideo = () => click([...document.querySelectorAll("[data-of-video-player] button")].find(b => b.textContent?.trim() === "Retry video"));
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

test("finding 1: a definite refusal releases the key, so Retry prepares with a new one", async () => {
  try {
    await host(backend("201", [() => vaultFailure(409, "refused"), () => json(videoBody("pending", false, "201"))]), "201");
    await openVideo();
    await retryVideo();
    const ids = prepares().map(call => String(bodyOf(call).requestId));
    assert.equal(ids.length, 2);
    for (const id of ids) assert.match(id, UUID);
    assert.notEqual(ids[1], ids[0], "a refused prepare kept its key, so Retry repeated a request the server already refused");
  } finally { await unmount(); uninstall(); }
});

test("finding 1: a lost reply or a bare 5xx keeps the key, so Retry repeats the same prepare", async () => {
  for (const [label, first, id] of [["lost reply", lostReply, "202"], ["bare 502", http502, "203"]] as const) {
    try {
      await host(backend(id, [first, () => json(videoBody("pending", false, id))]), id);
      await openVideo();
      await retryVideo();
      const ids = prepares().map(call => bodyOf(call).requestId);
      assert.equal(ids.length, 2, label);
      assert.equal(ids[1], ids[0], `${label}: Retry minted a new key for a prepare whose outcome is unknown`);
    } finally { await unmount(); uninstall(); }
  }
});

test("finding 1: a ready video releases the key; a reopen reads it and does not prepare, a later prepare gets a new key", async () => {
  let status = "unprepared";
  try {
    await host(backend("204", [() => { status = "ready"; return json(videoBody("ready", true, "204")); }, () => json(videoBody("pending", false, "204"))], () => status), "204");
    await openVideo();
    assert.ok(q("[data-of-video-player] video"), "the ready video plays");
    await closeVideo();
    await openVideo();
    assert.equal(prepares().length, 1, "reopening a ready video prepared it again");
    await closeVideo();
    status = "expired";
    await openVideo();
    const ids = prepares().map(call => bodyOf(call).requestId);
    assert.equal(ids.length, 2);
    assert.notEqual(ids[1], ids[0], "a prepare after the video was ready reused the finished prepare's key");
  } finally { await unmount(); uninstall(); }
});
