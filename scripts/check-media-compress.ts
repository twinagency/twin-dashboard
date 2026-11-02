// Guards for lib/media-compress.ts, the upload-time compression that keeps a
// creator's 45MB 4K phone video from either taking forever to load in
// Telegram or outright bouncing off the Bot API's 50MB cap.
//
// Runs REAL ffmpeg/ffprobe against a small synthetic rotated "4K-ish" clip
// (built with ffmpeg's own testsrc, so nothing external is fetched) and
// asserts every claim in the spec: H.264 output, long side capped, rotation
// baked into the pixels instead of left as a tag a player might ignore,
// faststart (moov before mdat), and the result is actually smaller. The
// photo half is asserted against a synthetic oversized image with an EXIF
// orientation tag.
//
// Skips gracefully (exit 0, a clear note) when ffmpeg isn't on PATH, since a
// dev machine without it shouldn't fail `npm test` for a check that is
// otherwise this repo's ground truth for the compression behavior.
import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { compressVideo, compressPhoto } from "../lib/media-compress";

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

// Answers "does moov come before mdat" the same way lib/media-compress.ts
// does internally, but independently written here so this check doesn't just
// re-assert the module's own logic against itself.
function isFaststart(buf: Buffer): boolean {
  return buf.indexOf("moov") !== -1 && buf.indexOf("moov") < buf.indexOf("mdat");
}

async function ffprobeJson(filePath: string): Promise<{
  streams: Array<{
    codec_name?: string;
    width?: number;
    height?: number;
    tags?: Record<string, string>;
    side_data_list?: Array<{ rotation?: number }>;
  }>;
}> {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_name,width,height:stream_tags=rotate:stream_side_data=rotation",
    "-of",
    "json",
    filePath,
  ]);
  return JSON.parse(stdout);
}

async function main(): Promise<void> {
  if (!(await ffmpegAvailable())) {
    console.log("SKIP  ffmpeg/ffprobe not found on PATH — media compression checks skipped (they run for real in CI/production, which both have ffmpeg via the Dockerfile apk install).");
    return;
  }

  const dir = await mkdtemp(path.join(tmpdir(), "check-media-compress-"));
  try {
    // ── Build a rotated "4K-ish" test clip ──────────────────────────────────
    // Coded landscape 3840x2160 (a real 4K sensor resolution), then a display
    // rotation of 90deg is attached WITHOUT re-encoding (`-display_rotation`
    // as an input option + `-c copy`), exactly how a real phone video stores
    // "shot in portrait": the sensor writes landscape pixels and a rotation
    // tag/matrix tells players to display it as 2160x3840 portrait. This is
    // the real-world shape lib/media-compress.ts has to handle correctly —
    // display size 2160 x 3840, long side 3840, well past the 4K-class range.
    const basePath = path.join(dir, "base.mp4");
    const rotatedPath = path.join(dir, "rotated.mp4");
    await run("ffmpeg", [
      "-y", "-loglevel", "error",
      "-f", "lavfi", "-i", "testsrc=size=3840x2160:rate=30",
      "-t", "2",
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
      basePath,
    ]);
    await run("ffmpeg", [
      "-y", "-loglevel", "error",
      "-display_rotation", "90",
      "-i", basePath,
      "-c", "copy",
      rotatedPath,
    ]);

    const rotatedInput = await readFile(rotatedPath);
    const inputProbe = await ffprobeJson(rotatedPath);
    const inputStream = inputProbe.streams[0];
    check("fixture: coded landscape with a 90deg display rotation attached", () => {
      assert.equal(inputStream.width, 3840);
      assert.equal(inputStream.height, 2160);
      assert.ok(inputStream.side_data_list?.some((s) => typeof s.rotation === "number" && s.rotation !== 0));
    });

    // ── Compress it ──────────────────────────────────────────────────────────
    const result = await compressVideo(rotatedInput);
    const outPath = path.join(dir, "out.mp4");
    await writeFile(outPath, result.bytes);
    const outProbe = await ffprobeJson(outPath);
    const outStream = outProbe.streams[0];

    check("video: something was actually re-encoded (source wasn't already compliant)", () => {
      assert.equal(result.changed, true);
    });

    check("video: output is H.264", () => {
      assert.equal(outStream.codec_name, "h264");
    });

    check("video: long side capped at 1280", () => {
      assert.ok(outStream.width! > 0 && outStream.height! > 0);
      assert.ok(Math.max(outStream.width!, outStream.height!) <= 1280);
    });

    check("video: faststart (moov before mdat)", () => {
      assert.ok(isFaststart(result.bytes));
    });

    check("video: no rotation tag left on the output", () => {
      const tagRotate = Number(outStream.tags?.rotate ?? 0);
      const sideDataRotation = outStream.side_data_list?.some((s) => typeof s.rotation === "number" && s.rotation !== 0);
      assert.equal(tagRotate, 0);
      assert.ok(!sideDataRotation);
    });

    check("video: rotation was baked into the pixels, not discarded — displayed orientation is portrait", () => {
      // Source displays as 2160 x 3840 (portrait, 9:16). A clean re-encode
      // with the rotation applied and no rotation tag left over must still be
      // portrait (width < height) at the same aspect ratio, just downscaled —
      // NOT the raw coded 3840x2160 landscape, which is what "ignored the
      // rotation" would look like.
      assert.ok(outStream.width! < outStream.height!, `expected portrait output, got ${outStream.width}x${outStream.height}`);
      const aspect = outStream.width! / outStream.height!;
      assert.ok(Math.abs(aspect - 9 / 16) < 0.02, `expected ~9:16 aspect, got ${aspect}`);
    });

    check("video: result is reported as returned bytes actually written and smaller than the source", () => {
      assert.equal(result.width, outStream.width);
      assert.equal(result.height, outStream.height);
      assert.ok(result.bytes.byteLength < rotatedInput.byteLength, `${result.bytes.byteLength} vs ${rotatedInput.byteLength}`);
    });

    // ── Skip path: an already-compliant file is returned untouched ─────────
    const compliantPath = path.join(dir, "compliant.mp4");
    await run("ffmpeg", [
      "-y", "-loglevel", "error",
      "-f", "lavfi", "-i", "testsrc=size=640x360:rate=24",
      "-t", "1",
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      compliantPath,
    ]);
    const compliantBytes = await readFile(compliantPath);
    const compliantResult = await compressVideo(compliantBytes);
    check("video: an already H.264/faststart/small/<=1280/unrotated file is left untouched", () => {
      assert.equal(compliantResult.changed, false);
      assert.equal(compliantResult.bytes.equals(compliantBytes), true);
    });

    // ── Photo: large synthetic image with an EXIF orientation tag ──────────
    const bigPhoto = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: { r: 190, g: 60, b: 90 } },
    })
      .jpeg()
      .withMetadata({ orientation: 6 }) // 90deg CW, same shape as a phone photo shot in portrait
      .toBuffer();

    const photoResult = await compressPhoto(bigPhoto);
    const photoMeta = await sharp(photoResult.bytes).metadata();

    check("photo: something was actually re-encoded", () => {
      assert.equal(photoResult.changed, true);
    });

    check("photo: oriented correctly (portrait, matching the EXIF rotation)", () => {
      assert.ok(photoMeta.width! < photoMeta.height!, `expected portrait, got ${photoMeta.width}x${photoMeta.height}`);
    });

    check("photo: long side capped at 2560", () => {
      assert.ok(Math.max(photoMeta.width!, photoMeta.height!) <= 2560);
    });

    check("photo: EXIF metadata stripped", () => {
      assert.equal(photoMeta.orientation, undefined);
      assert.equal(photoMeta.exif, undefined);
    });

    check("photo: smaller than the source", () => {
      assert.ok(photoResult.bytes.byteLength < bigPhoto.byteLength);
    });

    // ── Skip path: an already-small, already-within-bounds photo is untouched
    const smallPhoto = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .jpeg({ quality: 80 })
      .toBuffer();
    const smallResult = await compressPhoto(smallPhoto);
    check("photo: an already small, within-bounds photo is left untouched", () => {
      assert.equal(smallResult.changed, false);
      assert.equal(smallResult.bytes.equals(smallPhoto), true);
    });

    console.log(`\n${passed} media-compress checks passed`);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
