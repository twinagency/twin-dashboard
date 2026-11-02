// Pure logic behind scripts/import-videos.ts, split out so it can be asserted
// without running ffmpeg, touching storage or spending an AI call.
//
// The rules that matter live here: what counts as a video, what counts as
// already imported, and where a price is allowed to come from.
import { normalizeSafeCategoryGuide, priceFromGuide, isAllowedPaidOrFreePrice, MIN_PAID_MEDIA_PRICE_STARS } from "./pricing";

/** Mirrors app/media/actions.ts:42. Telegram's limit is 50MB; keep a 1MB margin. */
export const VIDEO_MAX_BYTES = 49 * 1024 * 1024;

export const VIDEO_EXTS = [".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"] as const;

export function isVideoFile(filename: string): boolean {
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return false;
  return (VIDEO_EXTS as readonly string[]).includes(filename.slice(dot).toLowerCase());
}

/**
 * Dedup key for an already-imported row.
 *
 * The importer used to write `<cloneId>/videos/<timestamp>-<originalName>`,
 * and the dashboard's own uploader had historically written a second
 * timestamp too (`<ts>-<ts>-<name>`) — strip both. Since 2026-09-16 both write
 * a content-hash prefix instead (`<32-hex-hash>-<originalName>`, see
 * lib/media-storage-path.ts) — strip that too. Old rows keep their old
 * timestamp-prefixed paths forever, so both forms have to be recognised
 * side by side, not just the current one. Drop the extension, lowercase.
 * Extension is dropped on purpose: a .mov submitted today was stored as .mp4
 * after transcoding, and it is the same content.
 */
export function importedStem(storagePath: string): string {
  const base = storagePath.split("/").pop() ?? storagePath;
  return base
    .replace(/^\d+-(\d+-)?/, "")
    .replace(/^[0-9a-f]{32}-/, "")
    .replace(/\.[A-Za-z0-9]+$/, "")
    .toLowerCase();
}

/** The same normalisation applied to a local file about to be imported. */
export function localStem(filename: string): string {
  return filename.replace(/\.[A-Za-z0-9]+$/, "").toLowerCase();
}

/**
 * Every reading of a stored path that could correspond to one local file.
 *
 * WHY THIS IS NOT ONE STRING. The importer stores `<timestamp>-<original>`, and
 * the dashboard's older uploads are `<timestamp>-<timestamp>-<original>`, so the
 * prefix-stripping regex has to allow two. But a submission export names its
 * files `01-clip.MOV`, `02-clip.MOV`, and that leading `01-` is part of the
 * ORIGINAL name — the two-prefix rule eats it. Stored then reads `clip` while
 * the local file reads `01-clip`, they never match, and a re-run imports the
 * whole submission a second time. That happened: nine of Tru Kait's videos were
 * duplicated in production on 2026-09-09.
 *
 * So both sides offer every plausible reading and a match on any one counts.
 * The bias is deliberate: a false "already imported" costs one skipped file that
 * an operator can re-add, while a false "new" charges fans for duplicates.
 */
export function importedStemVariants(storagePath: string): string[] {
  const base = (storagePath.split("/").pop() ?? storagePath)
    .replace(/\.[A-Za-z0-9]+$/, "")
    .toLowerCase();
  const oneStripped = base.replace(/^\d+-/, "");
  const twoStripped = oneStripped.replace(/^\d+-/, "");
  // Since 2026-09-16, new uploads are prefixed with a 32-hex content hash
  // (lib/media-storage-path.ts) instead of a timestamp. Offer that reading too.
  const hashStripped = base.replace(/^[0-9a-f]{32}-/, "");
  return Array.from(new Set([base, oneStripped, twoStripped, hashStripped]));
}

export function localStemVariants(filename: string): string[] {
  const base = filename.replace(/\.[A-Za-z0-9]+$/, "").toLowerCase();
  return Array.from(new Set([base, base.replace(/^\d+-/, "")]));
}

/** True when this local file is already represented by a stored path. */
export function alreadyImported(storedVariants: Set<string>, filename: string): boolean {
  return localStemVariants(filename).some((s) => storedVariants.has(s));
}

/** Progressively harder re-encodes. Quality drops before resolution does. */
export const COMPRESSION_LADDER: ReadonlyArray<{ crf: number; scale: number | null }> = [
  { crf: 26, scale: null },
  { crf: 28, scale: 1280 },
  { crf: 30, scale: 1080 },
  { crf: 32, scale: 854 },
  { crf: 34, scale: 720 },
];

/** ffmpeg -vf for one ladder step. Forces even dimensions; H.264 requires it. */
export function scaleFilter(scale: number | null): string {
  const even = "scale=trunc(iw/2)*2:trunc(ih/2)*2";
  if (scale === null) return even;
  return `scale='if(gt(iw,ih),min(${scale},iw),-2)':'if(gt(iw,ih),-2,min(${scale},ih))',${even}`;
}

/**
 * Spread a price across a band by clip length: a longer clip costs more.
 *
 * The OPERATOR supplies the band (--price-min / --price-max). This only decides
 * where inside their band a given clip lands, and it is deterministic — the same
 * clip always prices the same. It never widens the band, and both ends are
 * validated against the paid-media floor before it is ever called.
 *
 * Anchors: at or below SHORT_SECONDS pays min, at or above LONG_SECONDS pays
 * max, linear in between, rounded to 10 Stars so the catalogue reads cleanly.
 */
export const PRICE_BAND_SHORT_SECONDS = 10;
export const PRICE_BAND_LONG_SECONDS = 120;

export function priceForDuration(
  durationSeconds: number,
  min: number,
  max: number,
  shortSeconds: number = PRICE_BAND_SHORT_SECONDS,
  longSeconds: number = PRICE_BAND_LONG_SECONDS,
): number {
  if (max < min) throw new Error("price band max is below min");
  if (longSeconds <= shortSeconds) throw new Error("price band long anchor must exceed the short anchor");
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return min;
  const span = longSeconds - shortSeconds;
  const clamped = Math.min(Math.max(durationSeconds, shortSeconds), longSeconds);
  const ratio = (clamped - shortSeconds) / span;
  // The operator's own numbers are returned verbatim at the anchors. Rounding
  // to 10 is a readability nicety and must never move a stated band end: at
  // min 769 the shortest clip costs 769, not 770.
  if (ratio <= 0) return min;
  if (ratio >= 1) return max;
  const raw = min + ratio * (max - min);
  const rounded = Math.round(raw / 10) * 10;
  return Math.min(Math.max(rounded, min), max);
}

export function validateManualPrice(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(raw);
  if (!isAllowedPaidOrFreePrice(n)) {
    throw new Error(`--price must be 0 (free) or at least ${MIN_PAID_MEDIA_PRICE_STARS} Stars`);
  }
  return n;
}

/**
 * Where a price is allowed to come from: the operator's typed number, or the
 * operator's saved guide. Never this code, and never the AI — the AI only
 * supplies the tags the guide is looked up by. Mirrors the dashboard's
 * resolvePrice, manual branch first.
 */
export function resolveVideoPrice(
  manual: number | null,
  cap: { tags: string[]; nsfw: boolean },
  guide: unknown,
): number {
  if (manual !== null) return manual;
  const safeGuide = normalizeSafeCategoryGuide(guide);
  if (!safeGuide) {
    throw new Error(`pricing guide is missing or outdated — save it in PPVs, or pass --price <${MIN_PAID_MEDIA_PRICE_STARS}+>`);
  }
  const derived = priceFromGuide(safeGuide, cap.tags, cap.nsfw);
  if (derived == null) throw new Error("could not derive a price from this creator's pricing guide");
  return derived;
}

/** True when the run cannot possibly price anything, so it should stop before
 *  compressing a gigabyte of video only to fail at the last step. */
export function pricingIsUsable(manual: number | null, guide: unknown): boolean {
  return manual !== null || normalizeSafeCategoryGuide(guide) !== null;
}

export const DEFAULT_CONCURRENCY = 4;

/** 1..16, from --concurrency. Anything else is refused rather than clamped
 *  silently: an operator who typed 0 or "fast" wants to know it was ignored. */
export function validateConcurrency(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_CONCURRENCY;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 1 || n > 16) {
    throw new Error("--concurrency must be a whole number between 1 and 16");
  }
  return n;
}

/**
 * Run `worker` over `items`, at most `limit` in flight, results kept in input
 * order regardless of completion order.
 *
 * The index claim `next++` is deliberately the first thing a runner does and
 * has no `await` before it. JS is single-threaded, so read-and-increment cannot
 * interleave: two runners can never be handed the same item. Everything that
 * must not race — see claimStem below — has to follow the same rule.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Reserve a file's dedup identity for this run, returning false when something
 * already holds it.
 *
 * WHY THIS EXISTS. `alreadyImported` only knows what was in the database when
 * the run started. Two files in the SAME run that share a stem variant were
 * therefore both "new", and both imported — a duplicate the cross-run dedup
 * would have caught on any later run. That hole predates concurrency (the
 * sequential loop never updated its set either), but running four workers makes
 * it far easier to hit.
 *
 * MUST be called synchronously, before the worker's first `await`. Claiming
 * after an await reopens exactly the race it closes.
 */
export function claimStem(claimed: Set<string>, filename: string): boolean {
  const variants = localStemVariants(filename);
  if (variants.some((v) => claimed.has(v))) return false;
  for (const v of variants) claimed.add(v);
  return true;
}

/** Unique suffix for the scratch files the compression ladder writes. Date.now()
 *  alone repeats freely once several encodes run at once. */
let scratchSeq = 0;
export function nextScratchSeq(): number {
  return scratchSeq++;
}
