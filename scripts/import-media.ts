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
import { captionPhoto, type Caption } from "@/lib/caption";
import { priceFromGuide } from "@/lib/pricing";
import { assertPhotoSendable } from "@/lib/photo-guard";

// ── mirrored from app/media/actions.ts (module-private there) ────────────────
// The photo size + dimension gate is NOT mirrored: it is imported, so the
// importer cannot drift into admitting a photo the dashboard would refuse.

function storagePath(cloneId: string, type: "photos" | "videos", filename: string) {
  return `${cloneId}/${type}/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}

async function uploadConfig(cloneId: string): Promise<{ model: string; guide: unknown }> {
  const { data } = await supabaseAdmin
    .from("clones")
    .select("vision_model, category_pricing")
    .eq("id", cloneId)
    .maybeSingle();
  return { model: data?.vision_model || "qwen/qwen2.5-vl-72b-instruct", guide: data?.category_pricing };
}

// No manual price is ever typed by an importer, so this is resolvePrice() with
// the manual branch removed: guide + AI tags, else the caller's fallback.
function resolvePrice(cap: Caption, guide: unknown, fallback: number): number {
  return priceFromGuide(guide, cap.tags, cap.nsfw) ?? fallback;
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

// Caption with retries. NEVER returns a blank caption — the caller reports the
// image as failed and skips it rather than inserting an uncaptioned row.
async function captionWithRetry(jpeg: Buffer, model: string, label: string): Promise<Caption> {
  let lastErr = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const cap = await captionPhoto(jpeg, model);
      if (cap.caption.trim() && cap.teaser_caption.trim()) return cap;
      lastErr = "model returned an empty caption/teaser";
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    console.log(`   caption attempt ${attempt} failed for ${label}: ${lastErr}`);
    if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  throw new Error(`captioning failed after 3 attempts: ${lastErr}`);
}

async function main() {
  const { model, guide } = await uploadConfig(CLONE_ID!);
  console.log(`clone=${CLONE_ID} vision_model=${model} guide=${JSON.stringify(guide)}`);

  const failures: string[] = [];
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
      const cap = await captionWithRetry(jpeg, model, label);
      const starValue = resolvePrice(cap, guide, 25);
      const imageName = `${NAME_PREFIX} ${String(n).padStart(2, "0")}${cap.auto_desc ? ` (${cap.auto_desc})` : ""}`;
      const p = storagePath(CLONE_ID!, "photos", safeBase + ".jpg");

      if (DRY) {
        console.log(`  [dry] ${label} -> ${p} ⭐${starValue} "${cap.caption}"`);
        imported.push({ label, starValue, cap });
        continue;
      }

      const { error: upErr } = await supabaseAdmin.storage
        .from("media")
        .upload(p, jpeg, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw new Error(upErr.message);

      const { error: dbErr } = await supabaseAdmin.from("photos").insert({
        clone_id: CLONE_ID,
        storage_path: p,
        caption: cap.caption || null,
        teaser_caption: cap.teaser_caption || null,
        is_nude: cap.is_nude,
        explicitness: cap.explicitness,
        nsfw: cap.nsfw,
        tags: cap.tags,
        auto_desc: cap.auto_desc || null,
        star_value: starValue,
        is_free: starValue <= 0,
        image_name: imageName,
      });
      if (dbErr) throw new Error(dbErr.message);

      console.log(`  ok ${label} -> ${imageName} ⭐${starValue} [${cap.tags.join(",")}]`);
      imported.push({ label, imageName, starValue, cap });
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
        star_price: 99, // the dashboard's create-bundle default
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
          const p = storagePath(CLONE_ID!, "photos", `${SLUG}-bundle-${String(i).padStart(2, "0")}.jpg`);
          const { error: upErr } = await supabaseAdmin.storage
            .from("media")
            .upload(p, bytes, { contentType: "image/jpeg", upsert: false });
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

  console.log(`\ndone. imported=${imported.length} failures=${failures.length}`);
  for (const f of failures) console.log(`  ! ${f}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
