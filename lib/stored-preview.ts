// Ready-made blurred preview JPEGs, stored once per media object rather than
// rendered on demand: the Telegram bot has no ffmpeg/sharp of its own, so it
// cannot call lib/catalogue-preview.ts's blurPreview() at send time the way
// the Mini App catalogue does. Instead the dashboard (which has both) makes
// one blurred JPEG per photo/video at upload time (app/media/actions.ts) and
// via the backfill script (scripts/backfill-stored-previews.ts), and stores
// it in the same `media` bucket at `previews/${storage_path}.jpg`. The bot
// then just downloads that fixed object and sends it, no transform needed.
//
// Deliberately NOT the same code path as lib/catalogue-preview.ts's
// blurPreview(): that one targets a small live in-chat WebP thumbnail
// (420x560, blur param chosen per creator) cached in memory for 5 minutes.
// This one targets a larger, permanent, content-unrecognizable JPEG sent as
// a standalone Telegram photo message. Sharing the sigma/size constants would
// couple two different products; each stays tuned for what it is for.
import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

// Same reasoning as lib/catalogue-video-transform.ts and lib/media-compress.ts:
// an uploaded file must never make ffmpeg fetch a URL or open a playlist.
const INPUT_OPTIONS = [
  "-protocol_whitelist",
  "file,pipe",
  "-format_whitelist",
  "mov,mp4,m4a,3gp,3g2,mj2,matroska,webm,avi,asf,mpegts,mpeg",
] as const;

const FFMPEG_TIMEOUT_MS = 30_000;
const FFPROBE_TIMEOUT_MS = 15_000;

// Long side after resize, blur sigma, and JPEG quality for the stored
// preview. Sigma 30 at 800px is aggressive on purpose: this image is handed
// to a fan unlock decision, not a taste-test, and must not be recognizable.
export const PREVIEW_MAX_LONG_SIDE = 800;
export const PREVIEW_BLUR_SIGMA = 30;
export const PREVIEW_JPEG_QUALITY = 70;

export type StoredPreviewType = "photo" | "video";

async function probeDuration(inputPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "error", ...INPUT_OPTIONS, "-show_entries", "format=duration", "-of", "json", inputPath],
      { timeout: FFPROBE_TIMEOUT_MS, maxBuffer: 64 * 1024 },
    );
    const parsed = JSON.parse(stdout) as { format?: { duration?: string } };
    const duration = Number(parsed.format?.duration);
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  } catch {
    return 0;
  }
}

// Extract a single frame around ~1s in (0s if the clip is shorter than that).
// A trivial `-vf` filtergraph is included on purpose, not just for the even
// dimensions: ffmpeg only bakes in a rotation display-matrix/tag when a
// filtergraph is present (same note as lib/media-compress.ts), so this frame
// comes out right-side-up even for a sideways phone recording, with no
// separate rotation-detection step needed here.
async function extractVideoFrame(inputPath: string, outputPath: string): Promise<void> {
  const duration = await probeDuration(inputPath);
  const at = duration > 1 ? 1 : 0;
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      ...INPUT_OPTIONS,
      "-ss", String(at), "-i", inputPath,
      "-frames:v", "1",
      "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-map_metadata", "-1",
      outputPath,
    ],
    { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
  );
}

async function blurToJpeg(input: Buffer): Promise<Buffer> {
  return sharp(input, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(PREVIEW_MAX_LONG_SIDE, PREVIEW_MAX_LONG_SIDE, { fit: "inside", withoutEnlargement: true })
    .blur(PREVIEW_BLUR_SIGMA)
    .jpeg({ quality: PREVIEW_JPEG_QUALITY })
    .toBuffer();
}

/**
 * Build the stored, ready-to-send blurred preview JPEG for a photo or video's
 * ORIGINAL bytes (before any main-file compression/re-encode; either works,
 * the preview only needs to look like the content).
 *
 * Photo: sharp auto-orient, resize to max 800px on the long side, blur sigma
 * 30, JPEG q70.
 *
 * Video: extract one frame near 1s (or 0s for a clip shorter than that) with
 * ffmpeg, then run it through the same sharp blur pass as a photo.
 *
 * Never throws on unrecoverable input past the frame-extraction/decode step;
 * callers (upload actions, the backfill script) treat this as best-effort.
 */
export async function makeBlurredPreview(bytes: Buffer, type: StoredPreviewType): Promise<Buffer> {
  if (type === "photo") return blurToJpeg(bytes);

  const dir = await mkdtemp(path.join(tmpdir(), "stored-preview-"));
  try {
    const inputPath = path.join(dir, "in");
    const framePath = path.join(dir, "frame.jpg");
    await writeFile(inputPath, bytes);
    await extractVideoFrame(inputPath, framePath);
    const frame = await readFile(framePath);
    return blurToJpeg(frame);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Exact, fixed path convention for the stored preview object, shared by the
// upload actions and the backfill script so there is exactly one formula for
// where a preview lives.
export function storedPreviewPath(storagePath: string): string {
  return `previews/${storagePath}.jpg`;
}
