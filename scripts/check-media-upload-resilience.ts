import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function main() {
  const [manager, actions, caption, openrouter] = await Promise.all([
    readFile(new URL("../app/media/MediaManager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/media/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/caption.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/openrouter.ts", import.meta.url), "utf8"),
  ]);

  const photoQueue = manager.slice(
    manager.indexOf("function PhotoUploadQueue"),
    manager.indexOf("function VideoUploadQueue"),
  );

  assert.ok(photoQueue.length > 0, "photo upload queue must exist");
  assert.ok(!photoQueue.includes('/api/caption'), "selecting a photo must not trigger a duplicate vision request");
  assert.ok(!photoQueue.includes('fd.append("caption"'), "photo upload must not submit a fixed caption");
  assert.ok(!photoQueue.includes('fd.append("teaser_caption"'), "photo upload must not submit a fixed fan teaser");
  assert.match(actions, /bestEffortUploadAnalysis/, "server upload must tolerate vision failure");
  assert.match(actions, /preparePhotoForTelegram/, "photo uploads must be normalized before storage");
  assert.match(actions, /return uploadFailure\(error\)/, "server upload failures must be returned to the dashboard");
  assert.match(actions, /controller\.abort\(\)/, "vision analysis must have a hard timeout");
  assert.ok((actions.match(/teaser_caption: null/g) ?? []).length >= 2, "new photo and video uploads must not persist generic fan-facing captions");
  assert.match(caption, /signal\?: AbortSignal/, "caption processing must accept cancellation");
  assert.match(openrouter, /signal: opts\.signal/, "OpenRouter vision requests must receive the timeout signal");

  console.log("media upload resilience checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
