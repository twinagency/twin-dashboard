// KNOWN RED (W6 app-media-1, high, configured but inert): the video upload queue shows "Caption (for AI matching)" and
// "Teaser caption (shown to fan)" and appends them (app/media/MediaManager.tsx:497-514, 435-436), but uploadVideo reads
// neither (app/media/actions.ts:366-374: `...analysisRowFields(analysis), teaser_caption: null`).
// CONDITION: any operator who types in them. EFFECT: the row shows "Done" and the text is gone.
// FIXED LOOKS LIKE: either the two inputs are removed from the queue (the photo queue already did this, :319-321), or
// uploadVideo's body reads both "caption" and "teaser_caption" (any call taking the literal key, e.g. fd.get or a
// helper). Either turns this green.
// Not wired into npm scripts; init.sh does not list it. Offline: jsdom, server actions faked at the module boundary.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import { baseProps, chooseFiles, load, mount, tabBody, teardown } from "./W6-app-media-1-harness";

before(load);
after(teardown);

const queueBody = () => tabBody(/Add videos/);
async function oneQueuedVideo() {
  await mount(baseProps("clone-a"));
  await chooseFiles(queueBody().querySelector<HTMLInputElement>('input[type="file"]'), [new File(["v"], "clip.mp4", { type: "video/mp4" })]);
  return [...queueBody().querySelectorAll<HTMLInputElement>("input:not([type=file])")]
    .map(input => [input.name, input.placeholder, input.closest("label")?.textContent ?? ""].join(" | "));
}
function uploadVideoReadsCaptions(): boolean {
  const source = readFileSync(new URL("../../app/media/actions.ts", import.meta.url), "utf8");
  const start = source.indexOf("export async function uploadVideo(");
  assert.ok(start >= 0, "uploadVideo found in app/media/actions.ts");
  const next = source.indexOf("\nexport ", start + 1);
  const body = source.slice(start, next < 0 ? undefined : next);
  // Any read that passes the literal key as a call argument: fd.get("caption"), fd.getAll('caption'), text(fd, "caption").
  const readsKey = (key: string) => new RegExp(`[(,]\\s*["'\`]${key}["'\`]\\s*[,)]`).test(body);
  return readsKey("caption") && readsKey("teaser_caption");
}

test("control: a queued video row renders its price input", async () => {
  const inputs = await oneQueuedVideo();
  assert.ok(inputs.some(desc => /Price/.test(desc)), `price input rendered: ${inputs.join(" || ")}`);
});

test("video caption inert: the queue offers no caption field that uploadVideo then drops", async () => {
  const inputs = await oneQueuedVideo();
  const captionFields = inputs.filter(desc => /caption|teaser/i.test(desc));
  if (uploadVideoReadsCaptions()) return;
  assert.deepEqual(captionFields, [],
    `the video queue offers caption/teaser inputs but uploadVideo (app/media/actions.ts) never reads the "caption" or "teaser_caption" keys, so typed text is silently dropped`);
});
