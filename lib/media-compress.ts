// Compress media at upload time so fans don't wait forever for a 45MB 4K
// phone video, and so a video the Bot API would outright refuse (over 50MB;
// sendPhoto caps at 10MB) never lands in the library uncompressed in the
// first place.
//
// Reuses the ffmpeg safety patterns already proven in
// lib/catalogue-video-transform.ts (temp files, timeouts, a protocol/format
// whitelist so an uploaded file can never make ffmpeg fetch a URL or open a
// playlist) and the compression knowledge already encoded in
// lib/video-import.ts (H.264 + faststart + even dimensions), but as a single
// deterministic pass rather than a re-encode ladder: this always targets the
// same H.264/AAC/1280p/CRF23 shape so every stored file looks the same,
// re-encoding once more at a lower quality only if that first pass still
// doesn't fit Telegram's cap.
import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

// Local files only: an uploaded video cannot make ffmpeg fetch another URL or
// open a playlist. Mirrors lib/catalogue-video-transform.ts, extended to the
// container types creators actually upload (phones export mov/mp4, some
// desktop exports are mkv/webm/avi).
const INPUT_OPTIONS = [
  "-protocol_whitelist",
  "file,pipe",
  "-format_whitelist",
  "mov,mp4,m4a,3gp,3g2,mj2,matroska,webm,avi,asf,mpegts,mpeg",
] as const;

// 1280, not the more common 1080, per the 2026-09-28 media audit: raised on
// purpose so a fleet where 17% of videos are already 60fps/near-1080p+ don't
// get visibly downgraded for no size benefit; 1280 still collapses a 4K
// upload by ~9x on pixel count.
const MAX_LONG_SIDE = 1280;
const MAX_FPS = 30;
const CRF_PRIMARY = 23;
const CRF_RETRY = 28;
const TELEGRAM_VIDEO_MAX_BYTES = 49 * 1024 * 1024;
const SKIP_MAX_BYTES = 20 * 1024 * 1024;
const PHOTO_MAX_LONG_SIDE = 2560;
const PHOTO_JPEG_QUALITY = 85;
const PHOTO_SKIP_MAX_BYTES = 3 * 1024 * 1024;

const FFMPEG_TIMEOUT_MS = 5 * 60_000;
const FFPROBE_TIMEOUT_MS = 15_000;

export type VideoCompressResult = {
  bytes: Buffer;
  width: number;
  height: number;
  duration: number;
  changed: boolean;
};

export type PhotoCompressResult = {
  bytes: Buffer;
  width: number;
  height: number;
  changed: boolean;
};

type ProbedStream = {
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  tags?: { rotate?: string };
  side_data_list?: Array<{ rotation?: number }>;
};

type ProbeResult = {
  codecName: string | null;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  durationSeconds: number;
  rotationDegrees: number;
};

function parseFrameRate(raw: string | undefined): number {
  if (!raw) return 0;
  const [num, den] = raw.split("/").map(Number);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
  return num / den;
}

function rotationOf(stream: ProbedStream): number {
  const tagged = Number(stream.tags?.rotate ?? 0);
  if (Number.isFinite(tagged) && tagged !== 0) return ((tagged % 360) + 360) % 360;
  const sideData = stream.side_data_list?.find((s) => typeof s.rotation === "number");
  if (sideData && typeof sideData.rotation === "number") {
    return ((-sideData.rotation % 360) + 360) % 360;
  }
  return 0;
}

async function probeVideo(inputPath: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      ...INPUT_OPTIONS,
      "-show_entries",
      "stream=codec_name,codec_type,width,height,r_frame_rate:stream_tags=rotate:stream_side_data=rotation",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      inputPath,
    ],
    { timeout: FFPROBE_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
  );
  const parsed = JSON.parse(stdout) as {
    streams?: Array<ProbedStream & { codec_type?: string }>;
    format?: { duration?: string };
  };
  const streams = parsed.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const hasAudio = streams.some((s) => s.codec_type === "audio");
  if (!video || !video.width || !video.height) throw new Error("No readable video stream");
  const rotationDegrees = rotationOf(video);
  const swapped = rotationDegrees === 90 || rotationDegrees === 270;
  return {
    codecName: video.codec_name ?? null,
    width: swapped ? video.height : video.width,
    height: swapped ? video.width : video.height,
    fps: parseFrameRate(video.r_frame_rate),
    hasAudio,
    durationSeconds: Number(parsed.format?.duration ?? 0) || 0,
    rotationDegrees,
  };
}

// Lightweight ISO-BMFF top-level box scanner: cheap (jumps by declared box
// size, never reads the payload) and only used to answer one question — does
// `moov` appear before `mdat`? That is what "faststart" means. Containers
// that aren't mp4/mov (webm, mkv, avi) simply won't have a `moov`/`ftyp` box
// at all, so this correctly reports "not faststart" for them, which is fine:
// the codec check below already routes anything non-H.264 through a re-encode.
function isFaststartMp4(buf: Buffer): boolean {
  let offset = 0;
  let moovIndex = -1;
  let mdatIndex = -1;
  let index = 0;
  while (offset + 8 <= buf.length) {
    let size = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    let headerSize = 8;
    if (size === 1) {
      if (offset + 16 > buf.length) break;
      const high = buf.readUInt32BE(offset + 8);
      const low = buf.readUInt32BE(offset + 12);
      size = high * 2 ** 32 + low;
      headerSize = 16;
    } else if (size === 0) {
      size = buf.length - offset;
    }
    if (type === "moov" && moovIndex === -1) moovIndex = index;
    if (type === "mdat" && mdatIndex === -1) mdatIndex = index;
    if (size < headerSize) break;
    offset += size;
    index++;
  }
  return moovIndex !== -1 && mdatIndex !== -1 && moovIndex < mdatIndex;
}

// `scale='if(gt(iw,ih),min(N,iw),-2)':'if(gt(iw,ih),-2,min(N,ih))'` caps the
// LONG side at N, keeps aspect ratio, forces even dimensions on the other
// side (H.264 requires even width/height). ffmpeg auto-applies any rotation
// display-matrix/tag before this filter runs (default since ffmpeg 4.x
// whenever a filtergraph is in play), so this sees display-orientation
// pixels already, not the raw coded ones.
function scaleFilter(maxLongSide: number): string {
  return `scale='if(gt(iw,ih),min(${maxLongSide},iw),-2)':'if(gt(iw,ih),-2,min(${maxLongSide},ih))'`;
}

async function runFfmpegEncode(opts: {
  inputPath: string;
  outputPath: string;
  crf: number;
  hasAudio: boolean;
  needsScale: boolean;
  needsFpsCap: boolean;
}): Promise<void> {
  const filters = [opts.needsScale ? scaleFilter(MAX_LONG_SIDE) : null, opts.needsFpsCap ? `fps=${MAX_FPS}` : null]
    .filter((f): f is string => Boolean(f));
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    ...INPUT_OPTIONS,
    "-i",
    opts.inputPath,
    "-map_metadata",
    "-1",
    "-metadata:s:v:0",
    "rotate=0",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    String(opts.crf),
    "-pix_fmt",
    "yuv420p",
  ];
  if (filters.length) args.push("-vf", filters.join(","));
  if (opts.hasAudio) args.push("-c:a", "aac", "-b:a", "128k", "-ac", "2");
  else args.push("-an");
  args.push("-movflags", "+faststart", "-max_muxing_queue_size", "1024", opts.outputPath);

  await execFileAsync("ffmpeg", args, { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 });
}

/**
 * Re-encode a video to H.264/AAC, max 1280 on the long side, rotation baked
 * into the pixels (never a sideways/stretched player), CRF 23 preset
 * veryfast, capped at 30fps, faststart. Skips the re-encode entirely
 * (`changed: false`, original bytes returned) when the source is already
 * H.264, already <= 1280 long side, already faststart, and under 20MB — a
 * source that already meets the bar isn't worth the CPU or the quality loss.
 */
export async function compressVideo(input: Buffer): Promise<VideoCompressResult> {
  try {
    return await compressVideoOrThrow(input);
  } catch (error) {
    // Compression is a quality/deliverability improvement, not a gate: a
    // corrupt/unreadable source or an ffmpeg failure must not block an
    // otherwise-acceptable upload. Fall through with the original bytes; the
    // existing VIDEO_MAX_BYTES check in app/media/actions.ts still rejects
    // anything Telegram genuinely cannot take. Mirrors the
    // bestEffortUploadAnalysis pattern already used for AI captioning.
    console.warn("Video compression unavailable; storing upload as-is", error);
    return { bytes: input, width: 0, height: 0, duration: 0, changed: false };
  }
}

async function compressVideoOrThrow(input: Buffer): Promise<VideoCompressResult> {
  const dir = await mkdtemp(path.join(tmpdir(), "media-compress-"));
  const inputPath = path.join(dir, "in");
  try {
    await writeFile(inputPath, input);
    const probe = await probeVideo(inputPath);
    const longSide = Math.max(probe.width, probe.height);
    const alreadyFaststart = isFaststartMp4(input);
    const alreadyFits =
      probe.codecName === "h264" &&
      longSide <= MAX_LONG_SIDE &&
      alreadyFaststart &&
      input.byteLength <= SKIP_MAX_BYTES &&
      probe.rotationDegrees === 0;
    if (alreadyFits) {
      return { bytes: input, width: probe.width, height: probe.height, duration: probe.durationSeconds, changed: false };
    }

    const needsScale = longSide > MAX_LONG_SIDE;
    const needsFpsCap = probe.fps > MAX_FPS;
    let outputPath = path.join(dir, "out.mp4");
    await runFfmpegEncode({ inputPath, outputPath, crf: CRF_PRIMARY, hasAudio: probe.hasAudio, needsScale, needsFpsCap });
    let stat = await readFile(outputPath);
    if (stat.byteLength > TELEGRAM_VIDEO_MAX_BYTES) {
      const retryPath = path.join(dir, "out-retry.mp4");
      await runFfmpegEncode({ inputPath, outputPath: retryPath, crf: CRF_RETRY, hasAudio: probe.hasAudio, needsScale, needsFpsCap });
      outputPath = retryPath;
      stat = await readFile(retryPath);
    }
    // Re-probe the actual encoded output for the dimensions/duration handed
    // back — the scale filter's exact output can differ by a rounded pixel
    // from a naive division, so trust ffprobe over arithmetic when it works,
    // and fall back to the arithmetic estimate only if the probe itself fails.
    const finalProbe = await probeVideo(outputPath).catch(() => null);
    const estimate = needsScale ? scaledDimension(probe, MAX_LONG_SIDE) : probe;
    return {
      bytes: stat,
      width: finalProbe?.width ?? estimate.width,
      height: finalProbe?.height ?? estimate.height,
      duration: finalProbe?.durationSeconds || probe.durationSeconds,
      changed: true,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function scaledDimension(probe: { width: number; height: number }, maxLongSide: number): { width: number; height: number } {
  const long = Math.max(probe.width, probe.height);
  if (long <= maxLongSide) return probe;
  const scale = maxLongSide / long;
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return probe.width >= probe.height
    ? { width: maxLongSide, height: even(probe.height) }
    : { width: even(probe.width), height: maxLongSide };
}

/**
 * Auto-orient, cap the long side at 2560, JPEG quality 85 (keeping PNG/WebP
 * transparency only when the source actually has an alpha channel;
 * otherwise flattened to JPEG), metadata stripped. Skips the re-encode
 * (`changed: false`) when the source is already under 3MB and within the
 * size cap.
 */
export async function compressPhoto(input: Buffer): Promise<PhotoCompressResult> {
  // An unreadable image is not this module's problem to explain: the caller
  // (uploadPhoto -> preparePhotoForTelegram) already has a friendly,
  // actionable error for that ("This image could not be read..."). Pass the
  // bytes through untouched here so that message is the one the operator
  // sees, rather than a raw sharp/libvips exception surfacing first.
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(input).metadata();
  } catch {
    return { bytes: input, width: 0, height: 0, changed: false };
  }
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const longSide = Math.max(width, height);
  const hasAlpha = Boolean(metadata.hasAlpha);
  const alreadyFits = input.byteLength <= PHOTO_SKIP_MAX_BYTES && longSide > 0 && longSide <= PHOTO_MAX_LONG_SIDE;
  if (alreadyFits) {
    return { bytes: input, width, height, changed: false };
  }

  const pipeline = sharp(input).rotate().resize({
    width: PHOTO_MAX_LONG_SIDE,
    height: PHOTO_MAX_LONG_SIDE,
    fit: "inside",
    withoutEnlargement: true,
  });

  const keepFormat = hasAlpha ? metadata.format : null;
  const output =
    keepFormat === "png"
      ? await pipeline.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
      : keepFormat === "webp"
        ? await pipeline.webp({ quality: PHOTO_JPEG_QUALITY }).toBuffer({ resolveWithObject: true })
        : await pipeline.jpeg({ quality: PHOTO_JPEG_QUALITY, mozjpeg: true }).toBuffer({ resolveWithObject: true });

  return {
    bytes: output.data,
    width: output.info.width,
    height: output.info.height,
    changed: true,
  };
}
