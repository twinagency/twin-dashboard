/**
 * Bulk video importer. Mirrors uploadVideo() in app/media/actions.ts exactly
 * (same storagePath(), captionVideo(), priceFromGuide(), videos table shape),
 * the way import-media.ts mirrors uploadPhoto() for photos. Photos have their
 * own importer because bundles are photos-only; this one is videos-only,
 * always single items (no bundle concept for video in this schema).
 *
 * Run:
 *   node --env-file=.env ../bot/node_modules/.bin/tsx \
 *     --tsconfig scripts/tsconfig.json scripts/import-video-media.ts \
 *     --clone <uuid> --dir <dir> [--name-prefix "Cat Chase"] [--dry-run]
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { supabaseAdmin } from "@/lib/supabase";
import { analyseVideo } from "@/lib/caption";
import type { AnalysisResult } from "@/lib/media-analysis-contract";
import { analysisRowFields, insertMediaRowWithFallback, priceForAnalysis } from "@/lib/media-analysis-row";
import { normalizeSafeCategoryGuide, type CategoryPricing } from "@/lib/pricing";
import { mediaStoragePath as storagePath } from "@/lib/media-storage-path";

const VIDEO_MAX_BYTES = 49 * 1024 * 1024; // Telegram video limit is 50MB
// storagePath: see lib/media-storage-path.ts — content-hash prefix, shared
// with app/media/actions.ts and the other importers, not duplicated here.

async function uploadConfig(cloneId: string): Promise<{ model: string; guide: unknown }> {
  const { data } = await supabaseAdmin
    .from("clones")
    .select("vision_model, category_pricing")
    .eq("id", cloneId)
    .maybeSingle();
  return { model: data?.vision_model || "qwen/qwen3-vl-235b-a22b-instruct", guide: data?.category_pricing };
}

function requireSafeGuide(raw: unknown): CategoryPricing {
  const guide = normalizeSafeCategoryGuide(raw);
  if (!guide) throw new Error("creator pricing guide is missing or outdated; save the guide in PPVs before importing");
  return guide;
}

function resolvePrice(analysis: AnalysisResult, guide: CategoryPricing): number {
  // A failed or needs_review analysis prices at the guide's highest category, never from blank tags.
  const price = priceForAnalysis(guide, analysis);
  if (price == null) throw new Error("could not derive a price from the creator pricing guide");
  return price;
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const CLONE_ID = arg("--clone");
const DIR = arg("--dir");
const NAME_PREFIX = arg("--name-prefix") ?? "Video";
const DRY = process.argv.includes("--dry-run");
if (!CLONE_ID || !DIR) throw new Error("--clone and --dir are required");

async function videosIn(dir: string): Promise<string[]> {
  const names = await readdir(dir);
  return names
    .filter((n) => /\.(mp4|mov|m4v)$/i.test(n))
    .sort((a, b) => a.localeCompare(b, "en"))
    .map((n) => path.join(dir, n));
}

async function main() {
  const { model, guide: rawGuide } = await uploadConfig(CLONE_ID!);
  const guide = requireSafeGuide(rawGuide);
  console.log(`clone=${CLONE_ID} vision_model=${model} guide=${JSON.stringify(guide)}`);

  const files = await videosIn(DIR!);
  console.log(`\n${files.length} videos found`);

  const failures: string[] = [];
  const imported: Record<string, unknown>[] = [];
  let n = 0;
  for (const src of files) {
    n += 1;
    const label = path.basename(src);
    try {
      const { size } = await stat(src);
      if (size > VIDEO_MAX_BYTES) {
        throw new Error(`too large (${(size / 1024 / 1024).toFixed(1)} MB), Telegram max is 50 MB`);
      }
      const bytes = await readFile(src);
      // Same analysis as the dashboard upload. Never throws: a failure is saved as analysis_status "failed" (repair later).
      const analysis = await analyseVideo(bytes, model);
      if (analysis.status !== "analysed") console.log(`   ${label}: analysis ${analysis.status}: ${analysis.error ?? ""}`);
      const starValue = resolvePrice(analysis, guide);
      const ext = path.extname(src).toLowerCase();
      const contentType = ext === ".mov" ? "video/quicktime" : "video/mp4";
      const safeBase = `${NAME_PREFIX.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${String(n).padStart(2, "0")}${ext}`;
      const p = storagePath(CLONE_ID!, "videos", safeBase, bytes);

      if (DRY) {
        console.log(`  [dry] ${label} -> ${p} ⭐${starValue} [${analysis.status}] "${analysis.fields?.auto_desc ?? ""}"`);
        imported.push({ label, starValue, analysis });
        continue;
      }

      const { error: upErr } = await supabaseAdmin.storage
        .from("media")
        .upload(p, bytes, { contentType, upsert: true });
      if (upErr) throw new Error(upErr.message);

      await insertMediaRowWithFallback(supabaseAdmin, "videos", {
        clone_id: CLONE_ID,
        storage_path: p,
        teaser_caption: null,
        ...analysisRowFields(analysis),
        star_value: starValue,
        is_free: starValue <= 0,
      });

      console.log(`  ok ${label} -> ${p} ⭐${starValue} [${analysis.fields?.tags.join(",") ?? analysis.status}]`);
      imported.push({ label, starValue, analysis });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  FAILED ${label}: ${msg}`);
      failures.push(`${label}: ${msg}`);
    }
  }

  console.log(`\ndone. imported=${imported.length} failures=${failures.length}`);
  for (const f of failures) console.log(`  ! ${f}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
