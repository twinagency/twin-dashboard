/**
 * One-off / reusable media importer.
 *
 * Imports a folder of images into a clone as SINGLE PHOTOS, and optionally a
 * second folder as ONE PHOTO BUNDLE. It deliberately mirrors the exact sequence
 * of `app/media/actions.ts` (`uploadPhoto`, `createBundle`, `addBundleItem`) and
 * imports the same helpers those server actions use (`supabaseAdmin`,
 * `captionPhoto`, `priceFromGuide`), so imported rows are shaped identically to
 * rows created through the dashboard UI. The only thing not reused is
 * `revalidatePath`, which needs a Next request context.
 *
 * Run:
 *   node --env-file=.env ../bot/node_modules/.bin/tsx \
 *     --tsconfig scripts/tsconfig.json scripts/import-media.ts \
 *     --clone <uuid> --singles <dir> [--bundle <dir>] [--bundle-name "..."] \
 *     [--name-prefix "Cat Chase"] [--dry-run]
 */
import { readdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase";
import { configuredVisionModel } from "@/lib/vision-model";
import { withPhotoVisionColumn } from "@/lib/photo-vision-config";
import { analysePhoto } from "@/lib/caption";
import type { AnalysisResult } from "@/lib/media-analysis-contract";
import { analysisRowFields, insertMediaRowWithFallback, priceForAnalysis } from "@/lib/media-analysis-row";
import {
  DEFAULT_PHOTO_BUNDLE_PRICE_STARS,
  normalizeSafeCategoryGuide,
  priceFromGuide,
  isAllowedPaidOrFreePrice,
  MIN_PAID_MEDIA_PRICE_STARS,
  type CategoryPricing,
} from "@/lib/pricing";
import { assertPhotoSendable } from "@/lib/photo-guard";
import { mediaStoragePath as storagePath } from "@/lib/media-storage-path";

// The photo size + dimension gate is NOT mirrored: it is imported, so the
// importer cannot drift into admitting a photo the dashboard would refuse.
// storagePath is imported from lib/media-storage-path.ts (shared with
// app/media/actions.ts) rather than duplicated here, for the same reason: a
// bulk import re-run over the same folder must land on the SAME objects it
// already wrote, not new ones. See that file for the fleet-wide numbers.

async function uploadConfig(cloneId: string): Promise<{ model: string; guide: unknown }> {
  const { data, error } = await withPhotoVisionColumn(include => {
    const table = supabaseAdmin.from("clones");
    const query = include
      ? table.select("vision_model, photo_vision_model, category_pricing")
      : table.select("vision_model, category_pricing");
    return query.eq("id", cloneId).maybeSingle();
  });
  if (error) throw new Error(`Could not load creator model: ${error.message}`);
  if (!data) throw new Error("Creator not found");
  return { model: configuredVisionModel(data, "photo"), guide: data.category_pricing };
}

// --price <stars>, mirroring the manual branch of app/media/actions.ts's
// resolvePrice: an operator-typed price is used verbatim and skips the guide
// entirely. Money still comes from the operator, never from this script or the
// AI, which only supplies the tags a guide would be looked up by.
const MANUAL_PRICE: number | null = (() => {
  const i = process.argv.indexOf("--price");
  if (i === -1) return null;
  const n = Number(process.argv[i + 1]);
  if (!isAllowedPaidOrFreePrice(n)) {
    throw new Error(`--price must be 0 (free) or at least ${MIN_PAID_MEDIA_PRICE_STARS} Stars`);
  }
  return n;
})();

// With --price the guide is not consulted, so a stale guide must not block the
// run. Without one the guide is still mandatory.
function requireSafeGuide(raw: unknown): CategoryPricing | null {
  if (MANUAL_PRICE !== null) return null;
  const guide = normalizeSafeCategoryGuide(raw);
  if (!guide) throw new Error("creator pricing guide is missing or outdated; save the guide in PPVs before importing, or pass --price <stars>");
  return guide;
}

function resolvePrice(analysis: AnalysisResult, guide: CategoryPricing | null): number {
  if (MANUAL_PRICE !== null) return MANUAL_PRICE;
  if (!guide) throw new Error("no pricing guide and no --price");
  // A failed or needs_review analysis prices at the guide's highest category, never from blank tags.
  const price = priceForAnalysis(guide, analysis);
  if (price == null) throw new Error("could not derive a price from the creator pricing guide");
  return price;
}

// ── args ─────────────────────────────────────────────────────────────────────
function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const CLONE_ID = arg("--clone");
const SINGLES_DIR = arg("--singles");
const BUNDLE_DIR = arg("--bundle");
const BUNDLE_NAME = arg("--bundle-name") ?? "Imported bundle";
const NAME_PREFIX = arg("--name-prefix") ?? "Photo";
const SLUG = (arg("--slug") ?? NAME_PREFIX).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const DRY = process.argv.includes("--dry-run");
if (!CLONE_ID || !SINGLES_DIR) throw new Error("--clone and --singles are required");

async function jpgsIn(dir: string): Promise<string[]> {
  const names = await readdir(dir);
  return names
    .filter((n) => /\.(jpe?g|png|webp|heic)$/i.test(n)) // .keep and videos excluded
    .sort((a, b) => a.localeCompare(b, "en"))
    .map((n) => path.join(dir, n));
}

async function main() {
  const { model, guide: rawGuide } = await uploadConfig(CLONE_ID!);
  const guide = requireSafeGuide(rawGuide);
  console.log(`clone=${CLONE_ID} vision_model=${model} guide=${JSON.stringify(guide)}`);

  const failures: string[] = [];
  const needsAnalysis: string[] = [];
  const imported: Record<string, unknown>[] = [];

  // ── singles: exact uploadPhoto() sequence ─────────────────────────────────
  const singles = await jpgsIn(SINGLES_DIR!);
  console.log(`\n${singles.length} single photos found`);
  let n = 0;
  for (const src of singles) {
    n += 1;
    const label = path.basename(src);
    // Neutral, operator-facing name. The original library filenames carry a
    // different model's name, so nothing derived from them is kept.
    const safeBase = `${SLUG}-${String(n).padStart(2, "0")}`;
    try {
      const raw = await readFile(src);
      const jpeg = await sharp(raw).jpeg({ quality: 90 }).toBuffer();
      // Same gate as uploadPhoto: size AND dimensions, before anything is
      // written, so a bulk import cannot seed the library with items that
      // sendPaidMedia will refuse.
      await assertPhotoSendable(jpeg);
      // The same analysis the dashboard upload runs (bounded retry inside). It never throws: a failure is saved as
      // analysis_status "failed" with the error so it can be repaired later, never as "checked, clean".
      const analysis = await analysePhoto(jpeg, model);
      if (analysis.status !== "analysed") { console.log(`   ${label}: analysis ${analysis.status}: ${analysis.error ?? ""}`); needsAnalysis.push(label); }
      const starValue = resolvePrice(analysis, guide);
      const autoDesc = analysis.fields?.auto_desc;
      const imageName = `${NAME_PREFIX} ${String(n).padStart(2, "0")}${autoDesc ? ` (${autoDesc})` : ""}`;
      const p = storagePath(CLONE_ID!, "photos", safeBase + ".jpg", jpeg);

      if (DRY) {
        console.log(`  [dry] ${label} -> ${p} ⭐${starValue} [${analysis.status}] "${analysis.fields?.auto_desc ?? ""}"`);
        imported.push({ label, starValue, analysis });
        continue;
      }

      const { error: upErr } = await supabaseAdmin.storage
        .from("media")
        .upload(p, jpeg, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw new Error(upErr.message);

      await insertMediaRowWithFallback(supabaseAdmin, "photos", {
        clone_id: CLONE_ID,
        storage_path: p,
        teaser_caption: null,
        ...analysisRowFields(analysis),
        star_value: starValue,
        is_free: starValue <= 0,
        image_name: imageName,
      });

      console.log(`  ok ${label} -> ${imageName} ⭐${starValue} [${analysis.fields?.tags.join(",") ?? analysis.status}]`);
      imported.push({ label, imageName, starValue, analysis });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  FAILED ${label}: ${msg}`);
      failures.push(`${label}: ${msg}`);
    }
  }

  // ── bundle: exact createBundle() + addBundleItem() sequence ───────────────
  if (BUNDLE_DIR) {
    const items = await jpgsIn(BUNDLE_DIR);
    console.log(`\nbundle "${BUNDLE_NAME}": ${items.length} items`);
    if (DRY) {
      console.log(`  [dry] would create bundle with ${items.length} items`);
    } else {
      // is_onboarding stays false: the clone is live and already has whatever
      // welcome bundle it has. No demotion of an existing welcome bundle.
      const { data: bundle, error: bErr } = await supabaseAdmin.from("photo_bundles").insert({
        clone_id: CLONE_ID,
        name: BUNDLE_NAME,
        caption: null,
        star_price: DEFAULT_PHOTO_BUNDLE_PRICE_STARS,
        is_onboarding: false,
      }).select("id").single();
      if (bErr) throw new Error(bErr.message);
      console.log(`  bundle id ${bundle.id}`);

      let i = 0;
      for (const src of items) {
        i += 1;
        const label = path.basename(src);
        try {
          const bytes = await readFile(src);
          // Bundle items are paid media too, same gate as addBundleItem.
          await assertPhotoSendable(bytes);
          const p = storagePath(CLONE_ID!, "photos", `${SLUG}-bundle-${String(i).padStart(2, "0")}.jpg`, bytes);
          const { error: upErr } = await supabaseAdmin.storage
            .from("media")
            .upload(p, bytes, { contentType: "image/jpeg", upsert: true });
          if (upErr) throw new Error(upErr.message);

          const { data: existing } = await supabaseAdmin
            .from("photo_bundle_items")
            .select("sort_order")
            .eq("bundle_id", bundle.id)
            .order("sort_order", { ascending: false })
            .limit(1);
          const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

          const { error: dbErr } = await supabaseAdmin.from("photo_bundle_items").insert({
            bundle_id: bundle.id,
            storage_path: p,
            sort_order: nextOrder,
          });
          if (dbErr) throw new Error(dbErr.message);
          console.log(`  ok bundle item ${label} -> ${p} (sort ${nextOrder})`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`  FAILED bundle item ${label}: ${msg}`);
          failures.push(`bundle/${label}: ${msg}`);
        }
      }
    }
  }

  console.log(`\ndone. imported=${imported.length} failures=${failures.length} not-analysed=${needsAnalysis.length}`);
  for (const f of needsAnalysis) console.log(`  ? saved without a finished analysis (priced at the guide maximum, repair later): ${f}`);
  for (const f of failures) console.log(`  ! ${f}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
