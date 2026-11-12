// KNOWN RED (W6 app-media-1, high, false refusal): measurePhoto (app/media/MediaManager.tsx:173-184, used at :282-283)
// checks the ORIGINAL dimensions with checkPhotoDimensions, but the server compresses first (2560 long side,
// lib/media-compress.ts) and gates the result (app/media/actions.ts:264-265). The comment at :165-168 says this is
// "NOT THE GATE … only saves a round trip".
// CONDITION: any photo with width + height > 10000, e.g. a 48 MP phone shot 8064x6048 (server stores 2560x1920).
// EFFECT: a terminal error row "Telegram will not send this photo" for a file the server accepts.
// FIXED LOOKS LIKE: the client drops the sum check (the ratio survives a resize) or checks the post-2560 size, so the
// photo is queued pending like any other.
// Not wired into npm scripts; init.sh does not list it. Offline: jsdom, server actions faked at the module boundary,
// createImageBitmap stubbed to report the dimensions under test.
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { baseProps, bitmap, button, chooseFiles, load, mount, tabBody, teardown, text } from "./W6-app-media-1-harness";

before(load);
after(teardown);

async function queuePhoto(width: number, height: number) {
  Object.assign(bitmap, { width, height });
  await mount(baseProps("clone-a"));
  await chooseFiles(tabBody(/Add photos/).querySelector<HTMLInputElement>('input[type="file"]'),
    [new File(["jpeg bytes"], "shot.jpg", { type: "image/jpeg" })]);
}

test("control: a 1000x1000 photo is queued pending with no error", async () => {
  await queuePhoto(1000, 1000);
  assert.ok(button(/^Upload 1 photo$/), "queued pending");
  assert.doesNotMatch(text(), /Telegram will not send this photo/);
});

test("measure photo: a 48 MP 8064x6048 phone shot, which the server shrinks to 2560x1920, is queued pending", async () => {
  await queuePhoto(8064, 6048);
  const refusal = /Telegram will not send this photo\. It is [^,]+/.exec(text())?.[0];
  assert.ok(button(/^Upload 1 photo$/) && !refusal,
    `the browser pre-flight refused a photo the server would accept after its 2560px resize: ${refusal ?? "no Upload button"}`);
});
