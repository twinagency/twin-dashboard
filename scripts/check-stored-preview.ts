// Guards for lib/stored-preview.ts, the ready-made blurred JPEG the bot sends
// as a paid-item preview since it has no ffmpeg/sharp of its own.
//
// Asserts: the blur is strong enough to genuinely hide the content (compares
// Laplacian variance, a standard sharpness/edge-energy measure, of a
// synthetic high-frequency test image before and after), output is a JPEG at
// or under the 800px cap, a video frame is extracted correctly (skipped
// cleanly if ffmpeg isn't on PATH), and the stored path formula is exactly
// `previews/${storage_path}.jpg`.
import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { makeBlurredPreview, makeStoredVideoPreviewClip, storedPreviewPath, storedPreviewClipPath, PREVIEW_MAX_LONG_SIDE } from "../lib/stored-preview";
import { MAX_VIDEO_PREVIEW_BYTES } from "../lib/catalogue-video-transform";

const run = promisify(execFile);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`PASS  ${name}`);
}

async function ffmpegAvailable(): Promise<boolean> {
  try {
    await run("ffmpeg", ["-version"]);
    await run("ffprobe", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

// Laplacian variance: convolve with a Laplacian kernel and measure the
// variance of the result. A sharp/detailed image has strong high-frequency
// edges and a HIGH variance; a heavily blurred image's edges are smeared out
// and its variance collapses toward zero. This is the standard "how blurry
// is this image" measure, and is written independently here (not imported
// from lib/stored-preview.ts) so the check doesn't just re-assert the
// module's own claim about itself.
async function laplacianVariance(input: Buffer): Promise<number> {
  const { data, info } = await sharp(input)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const at = (x: number, y: number) => data[y * width + x];
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const lap = -4 * at(x, y) + at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1);
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

// A synthetic image with plenty of high-frequency detail (a fine checkerboard
// plus diagonal stripes) — the kind of content a real photo has and a flat
// color swatch does not — so the "does blur actually destroy detail" claim is
// tested against something that has detail to destroy.
async function makeSharpTestImage(size = 640): Promise<Buffer> {
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="grid" width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="white"/>
          <rect width="4" height="4" fill="black"/>
          <rect x="4" y="4" width="4" height="4" fill="black"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)"/>
      ${Array.from({ length: 40 }, (_, i) => `<line x1="${i * 16}" y1="0" x2="0" y2="${i * 16}" stroke="red" stroke-width="1"/>`).join("")}
    </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toBuffer();
}

async function main(): Promise<void> {
  // ── Path formula ──────────────────────────────────────────────────────────
  check("path: exactly previews/${storage_path}.jpg", () => {
    assert.equal(storedPreviewPath("abc-123/photos/deadbeef-file.jpg"), "previews/abc-123/photos/deadbeef-file.jpg.jpg");
    assert.equal(storedPreviewPath("clone/videos/x.mp4"), "previews/clone/videos/x.mp4.jpg");
  });
  check("path: exactly previews/${storage_path}.mp4 for the moving clip", () => {
    assert.equal(storedPreviewClipPath("clone/videos/x.mp4"), "previews/clone/videos/x.mp4.mp4");
    assert.equal(storedPreviewClipPath("abc-123/photos/deadbeef-file.jpg"), "previews/abc-123/photos/deadbeef-file.jpg.mp4");
  });

  // ── Photo blur strength + output shape ──────────────────────────────────
  const sharpTestImage = await makeSharpTestImage();
  const originalVariance = await laplacianVariance(sharpTestImage);
  check("fixture: synthetic test image actually has high-frequency detail", () => {
    assert.ok(originalVariance > 500, `expected a detailed fixture, got variance ${originalVariance}`);
  });

  const photoPreview = await makeBlurredPreview(sharpTestImage, "photo");
  const blurredVariance = await laplacianVariance(photoPreview);
  check("photo: blur strength drops high-frequency energy by at least 90% (content not recognizable)", () => {
    assert.ok(
      blurredVariance < originalVariance * 0.1,
      `expected a big drop, got ${originalVariance} -> ${blurredVariance}`,
    );
  });

  const photoMeta = await sharp(photoPreview).metadata();
  check("photo: output is a JPEG", () => {
    assert.equal(photoMeta.format, "jpeg");
  });
  check(`photo: output is <= ${PREVIEW_MAX_LONG_SIDE}px on the long side`, () => {
    assert.ok(Math.max(photoMeta.width!, photoMeta.height!) <= PREVIEW_MAX_LONG_SIDE);
  });

  // A larger, non-square source exercises the resize-to-fit path.
  const largeLandscape = await sharp({
    create: { width: 3000, height: 1500, channels: 3, background: { r: 200, g: 40, b: 40 } },
  })
    .composite([{ input: sharpTestImage, top: 0, left: 0 }])
    .jpeg()
    .toBuffer();
  const largePreview = await makeBlurredPreview(largeLandscape, "photo");
  const largeMeta = await sharp(largePreview).metadata();
  check("photo: a large source is downscaled to the 800px cap, aspect preserved", () => {
    assert.ok(Math.max(largeMeta.width!, largeMeta.height!) <= PREVIEW_MAX_LONG_SIDE);
    assert.equal(largeMeta.width! > largeMeta.height!, true);
  });

  // ── Video: frame extraction (skip cleanly without ffmpeg) ────────────────
  if (!(await ffmpegAvailable())) {
    console.log("SKIP  ffmpeg/ffprobe not found on PATH — video preview checks skipped (real in CI/production via the Dockerfile).");
    console.log(`\n${passed} stored-preview checks passed (video checks skipped)`);
    return;
  }

  const dir = await mkdtemp(path.join(tmpdir(), "check-stored-preview-"));
  try {
    const clipPath = path.join(dir, "clip.mp4");
    // A 3s testsrc clip so both the "duration > 1s -> seek to 1s" and (via a
    // second, shorter clip below) the "duration <= 1s -> seek to 0s" branches
    // are exercised.
    await run("ffmpeg", [
      "-y", "-loglevel", "error",
      "-f", "lavfi", "-i", "testsrc=size=640x480:rate=15",
      "-t", "3",
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
      clipPath,
    ]);
    const { readFile } = await import("node:fs/promises");
    const clipBytes = await readFile(clipPath);

    const videoPreview = await makeBlurredPreview(clipBytes, "video");
    const videoMeta = await sharp(videoPreview).metadata();
    check("video: a frame was extracted and blurred into a JPEG", () => {
      assert.equal(videoMeta.format, "jpeg");
    });
    check(`video: output is <= ${PREVIEW_MAX_LONG_SIDE}px on the long side`, () => {
      assert.ok(Math.max(videoMeta.width!, videoMeta.height!) <= PREVIEW_MAX_LONG_SIDE);
    });
    const videoVariance = await laplacianVariance(videoPreview);
    check("video: extracted frame is also meaningfully blurred (not a passthrough)", () => {
      assert.ok(videoVariance < 200, `expected low edge-energy after blur, got ${videoVariance}`);
    });

    // Short clip (< 1s): must seek to 0s, not throw or produce a black/garbage frame.
    const shortClipPath = path.join(dir, "short.mp4");
    await run("ffmpeg", [
      "-y", "-loglevel", "error",
      "-f", "lavfi", "-i", "testsrc=size=320x240:rate=15",
      "-t", "0.5",
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
      shortClipPath,
    ]);
    const shortBytes = await readFile(shortClipPath);
    const shortPreview = await makeBlurredPreview(shortBytes, "video");
    const shortMeta = await sharp(shortPreview).metadata();
    check("video: a clip shorter than 1s still produces a valid preview (seeks to 0s)", () => {
      assert.equal(shortMeta.format, "jpeg");
      assert.ok(shortMeta.width! > 0 && shortMeta.height! > 0);
    });

    // ── Moving preview clip (H.264, faststart, silent, ~5s, small) ──────────
    // Same source clip as the frame-extraction checks above, run through
    // makeStoredVideoPreviewClip instead — this is the artifact the chat
    // "Unlock now" offer actually sends, and it must look exactly like the
    // Mini App's own live preview (same transform, same shape guarantees).
    const movingClip = await makeStoredVideoPreviewClip(clipBytes, 16);
    const movingClipPath = path.join(dir, "movingclip.mp4");
    await writeFile(movingClipPath, movingClip);
    const clipProbe = await run("ffprobe", [
      "-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name",
      "-of", "json", movingClipPath,
    ]);
    const clipInfo = JSON.parse(clipProbe.stdout) as {
      format?: { duration?: string };
      streams?: { codec_type?: string; codec_name?: string }[];
    };
    const clipDuration = Number(clipInfo.format?.duration);
    const clipVideoStream = clipInfo.streams?.find((s) => s.codec_type === "video");
    check("clip: <= 6s, small, H.264, faststart, silent", () => {
      assert.ok(clipDuration > 0 && clipDuration <= 6, `expected <= 6s, got ${clipDuration}`);
      assert.equal(clipVideoStream?.codec_name, "h264", "must be H.264");
      assert.ok(!clipInfo.streams?.some((s) => s.codec_type === "audio"), "must be silent, no audio stream");
      assert.ok(movingClip.length <= MAX_VIDEO_PREVIEW_BYTES, `expected a small clip, got ${(movingClip.length / 1024 / 1024).toFixed(2)}MB`);
      // Same fast-start check as scripts/check-catalogue-video.ts: moov before mdat.
      assert.ok(movingClip.indexOf("moov") < movingClip.indexOf("mdat"), "fast-start MP4 (moov before mdat)");
    });

    console.log(`\n${passed} stored-preview checks passed`);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
