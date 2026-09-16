/**
 * Bulk video importer.
 *
 * The photo importer (`import-media.ts`) has no video path, so a creator's
 * video submission had to go through the dashboard one file at a time — and any
 * file over Telegram's 49MB ceiling could not go in at all. This does both:
 * compresses what is too big, then imports the folder.
 *
 * It deliberately mirrors `app/media/actions.ts#uploadVideo` step for step and
 * imports the same helpers that server action uses (`supabaseAdmin`,
 * `captionVideo`, `normalizeSafeCategoryGuide`, `priceFromGuide`), so imported
 * rows are shaped identically to rows created through the dashboard UI.
 *
 * MONEY: this script never invents a price. Either the operator passes
 * --price (used verbatim, mirroring the dashboard's manual-price branch), or
 * the creator's saved pricing guide supplies it. If neither is usable the file
 * is skipped and reported, never guessed at.
 *
 * COMPRESSION: a source over the cap is re-encoded to landscape/portrait-safe
 * H.264 at decreasing quality until it fits, and the ORIGINAL is left on disk
 * untouched. If it cannot be made to fit, it is skipped and reported.
 *
 * Run:
 *   node --env-file=.env ../twin-bot/node_modules/.bin/tsx \
 *     --tsconfig scripts/tsconfig.json scripts/import-videos.ts \
 *     --clone <uuid> --dir <folder> [--price <stars>] [--dry-run]
 */
import { readdir, readFile, stat, unlink, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { supabaseAdmin } from "@/lib/supabase";
import { captionVideo } from "@/lib/caption";
import { MIN_PAID_MEDIA_PRICE_STARS } from "@/lib/pricing";
import { mediaStoragePath } from "@/lib/media-storage-path";
import {
  VIDEO_MAX_BYTES,
  COMPRESSION_LADDER,
  isVideoFile,
  importedStemVariants,
  alreadyImported,
  scaleFilter,
  validateManualPrice,
  resolveVideoPrice,
  pricingIsUsable,
  priceForDuration,
  PRICE_BAND_SHORT_SECONDS,
  PRICE_BAND_LONG_SECONDS,
} from "@/lib/video-import";

const execFileAsync = promisify(execFile);

// storagePath: see lib/media-storage-path.ts — content-hash prefix, shared
// with app/media/actions.ts and the other importers, not duplicated here. A
// hash prefix is also stable across retries within one run (unlike Date.now(),
// which changed every millisecond), and importedStemVariants (lib/video-import)
// knows how to strip it when checking what is already imported.
function storagePath(cloneId: string, filename: string, bytes: Uint8Array | Buffer) {
  return mediaStoragePath(cloneId, "videos", filename, bytes);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function uploadConfig(cloneId: string): Promise<{ model: string; guide: unknown }> {
  const { data } = await supabaseAdmin
    .from("clones")
    .select("vision_model, category_pricing")
    .eq("id", cloneId)
    .maybeSingle();
  return { model: data?.vision_model || "qwen/qwen2.5-vl-72b-instruct", guide: data?.category_pricing };
}

/** Clip length in seconds, from the ORIGINAL file so compression cannot move a
 *  price. Returns 0 when it cannot be read, which prices at the band floor. */
async function probeDuration(srcPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", srcPath,
    ]);
    const n = Number(String(stdout).trim());
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Re-encode until it fits under the cap. Returns the bytes that fit, or null.
 *  The source file is never modified or deleted. */
async function fitUnderCap(srcPath: string, workDir: string): Promise<{ bytes: Buffer; note: string } | null> {
  const original = await readFile(srcPath);
  if (original.byteLength <= VIDEO_MAX_BYTES) return { bytes: original, note: "no compression needed" };

  for (const step of COMPRESSION_LADDER) {
    const out = path.join(workDir, `fit-${Date.now()}-${Math.round(Math.random() * 1e6)}.mp4`);
    const vf = scaleFilter(step.scale);
    try {
      await execFileAsync("ffmpeg", [
        "-y", "-i", srcPath,
        "-vf", vf,
        "-c:v", "libx264", "-preset", "medium", "-crf", String(step.crf),
        "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        "-c:a", "aac", "-b:a", "128k",
        out,
      ], { maxBuffer: 1024 * 1024 * 32 });
      const size = (await stat(out)).size;
      if (size <= VIDEO_MAX_BYTES) {
        const bytes = await readFile(out);
        await unlink(out).catch(() => {});
        const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
        return { bytes, note: `compressed ${mb(original.byteLength)}MB -> ${mb(size)}MB (crf ${step.crf}${step.scale ? `, ${step.scale}p` : ""})` };
      }
      await unlink(out).catch(() => {});
    } catch (err) {
      await unlink(out).catch(() => {});
      throw new Error(`ffmpeg failed: ${(err as Error).message.slice(0, 200)}`);
    }
  }
  return null;
}

async function main(): Promise<void> {
  const cloneId = arg("clone");
  const dir = arg("dir");
  const dryRun = process.argv.includes("--dry-run");
  const priceRaw = arg("price");

  if (!cloneId || !dir) throw new Error("usage: --clone <uuid> --dir <folder> [--price <stars>] [--dry-run]");

  const manualPrice = validateManualPrice(priceRaw);
  // Optional operator-supplied band: price varies with clip length inside it.
  const bandMin = validateManualPrice(arg("price-min"));
  const bandMax = validateManualPrice(arg("price-max"));
  if ((bandMin === null) !== (bandMax === null)) {
    throw new Error("--price-min and --price-max must be given together");
  }
  if (bandMin !== null && bandMax !== null && bandMax < bandMin) {
    throw new Error("--price-max must be at or above --price-min");
  }
  const band = bandMin !== null && bandMax !== null ? { min: bandMin, max: bandMax } : null;
  // Where the band's ends sit in seconds. Defaults suit long-form video; a
  // library of short clips needs its own anchors or everything prices at the
  // floor.
  const anchorShort = Number(arg("short-seconds") ?? PRICE_BAND_SHORT_SECONDS);
  const anchorLong = Number(arg("long-seconds") ?? PRICE_BAND_LONG_SECONDS);
  if (!Number.isFinite(anchorShort) || !Number.isFinite(anchorLong) || anchorLong <= anchorShort) {
    throw new Error("--long-seconds must be a number greater than --short-seconds");
  }
  if (band && manualPrice !== null) throw new Error("pass either --price or the --price-min/--price-max band, not both");

  const { data: clone } = await supabaseAdmin.from("clones").select("slug, videos_enabled").eq("id", cloneId).maybeSingle();
  if (!clone) throw new Error(`no clone with id ${cloneId}`);
  const { model, guide } = await uploadConfig(cloneId);

  // Fail before touching a single file if pricing cannot possibly work. Without
  // this the run compresses a gigabyte of video and then dies on the last step.
  if (!band && !pricingIsUsable(manualPrice, guide)) {
    throw new Error(
      `${clone.slug}: pricing guide is missing or outdated, and no --price was given.\n` +
      `Save a complete guide in PPVs, or re-run with --price <${MIN_PAID_MEDIA_PRICE_STARS} or more>.`,
    );
  }

  const entries = (await readdir(dir)).filter(isVideoFile).sort();
  if (!entries.length) throw new Error(`no video files in ${dir}`);

  // Skip anything already imported under the same original name.
  const { data: existing } = await supabaseAdmin.from("videos").select("storage_path").eq("clone_id", cloneId);
  const existingNames = new Set(
    (existing ?? []).flatMap((r: { storage_path: string }) => importedStemVariants(r.storage_path)),
  );

  const workDir = path.join(dir, ".compressed");
  await mkdir(workDir, { recursive: true });

  console.log(`clone ${clone.slug} (videos_enabled=${clone.videos_enabled})`);
  console.log(`${entries.length} video file(s) in ${dir}`);
  console.log(
    band
      ? `price: ${band.min}-${band.max} Stars, scaled by clip length`
      : manualPrice !== null
        ? `price: ${manualPrice} Stars (manual, applied to every file)`
        : "price: from the creator's pricing guide",
  );
  console.log(dryRun ? "DRY RUN — nothing will be uploaded\n" : "");

  let imported = 0;
  const skipped: string[] = [];

  for (const name of entries) {
    if (alreadyImported(existingNames, name)) {
      skipped.push(`${name}: already imported`);
      continue;
    }

    const srcPath = path.join(dir, name);
    try {
      const fitted = await fitUnderCap(srcPath, workDir);
      if (!fitted) {
        skipped.push(`${name}: cannot be compressed under ${VIDEO_MAX_BYTES / 1024 / 1024}MB`);
        continue;
      }

      const cap = await captionVideo(fitted.bytes, model);
      const seconds = band ? await probeDuration(srcPath) : 0;
      const starValue = band
        ? priceForDuration(seconds, band.min, band.max, anchorShort, anchorLong)
        : resolveVideoPrice(manualPrice, cap, guide);

      if (dryRun) {
        console.log(`WOULD IMPORT ${name} — ${starValue} Stars — ${fitted.note}`);
        console.log(`   tags=[${cap.tags.join(", ")}] nsfw=${cap.nsfw} desc="${cap.auto_desc}"`);
        imported++;
        continue;
      }

      const storedAt = storagePath(cloneId, name.replace(/\.[A-Za-z0-9]+$/, ".mp4"), fitted.bytes);
      const { error: upErr } = await supabaseAdmin.storage
        .from("media")
        .upload(storedAt, fitted.bytes, { contentType: "video/mp4", upsert: true });
      if (upErr) throw new Error(upErr.message);

      const { error: dbErr } = await supabaseAdmin.from("videos").insert({
        clone_id: cloneId,
        storage_path: storedAt,
        caption: cap.caption || null,
        teaser_caption: cap.teaser_caption || null,
        is_nude: cap.is_nude,
        explicitness: cap.explicitness,
        nsfw: cap.nsfw,
        tags: cap.tags,
        auto_desc: cap.auto_desc || null,
        star_value: starValue,
        is_free: starValue <= 0,
      });
      if (dbErr) {
        // The object is already up; leaving it would orphan a file nothing points at.
        await supabaseAdmin.storage.from("media").remove([storedAt]);
        throw new Error(dbErr.message);
      }

      console.log(`imported ${name} — ${starValue} Stars — ${fitted.note}`);
      imported++;
    } catch (err) {
      skipped.push(`${name}: ${(err as Error).message}`);
    }
  }

  console.log(`\n${dryRun ? "would import" : "imported"}: ${imported}`);
  if (skipped.length) {
    console.log(`skipped: ${skipped.length}`);
    for (const s of skipped) console.log(`  - ${s}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
