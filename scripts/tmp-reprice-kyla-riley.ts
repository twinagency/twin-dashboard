/**
 * One-off: set a shared 400-1200 photo guide for Kyla + Riley, reprice Kyla's
 * live photos against it (guarded update, mirrors app/media/actions.ts
 * repriceMedia), and reprice Kyla's live videos on a duration band (1000-2000)
 * since videos carry no per-category guide of their own.
 *
 * Run: node --env-file=.env ../twin-bot/node_modules/.bin/tsx
 *   --tsconfig scripts/tsconfig.json scripts/tmp-reprice-kyla-riley.ts [--dry-run]
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { supabaseAdmin } from "@/lib/supabase";
import { buildSafeRepricePlan, type RepriceableMediaRow, type CategoryPricing } from "@/lib/pricing";
import { priceForDuration, PRICE_BAND_SHORT_SECONDS, PRICE_BAND_LONG_SECONDS } from "@/lib/video-import";

const execFileAsync = promisify(execFile);
const DRY = process.argv.includes("--dry-run");

// PRICING_CATEGORIES soft->hard order, spread 400..1200 in ~53-star steps,
// rounded to the nearest 10. Replaces both creators' stale 15-100 ladder.
const GUIDE: CategoryPricing = {
  sfw: 400, mirror_selfie: 450, outdoor: 510, pool: 560, bed: 610, shower: 670,
  solo: 720, bikini: 770, feet: 830, lingerie: 880, ass: 930, topless: 990,
  tits: 1040, full_nude: 1090, pussy: 1150, anal: 1200,
};

const KYLA = "d2678dce-6a4e-4f1c-b54a-86057bba427c";
const RILEY = "20ef9407-83f2-4351-8d3c-48cc0ed54e0b";

async function setGuide(cloneId: string, label: string) {
  if (DRY) { console.log(`[dry] would save guide on ${label}`); return; }
  const { error } = await supabaseAdmin.from("clones").update({ category_pricing: GUIDE }).eq("id", cloneId);
  if (error) throw new Error(error.message);
  console.log(`saved 400-1200 guide on ${label}`);
}

async function repricePhotos(cloneId: string, label: string) {
  const { data, error } = await supabaseAdmin
    .from("photos")
    .select("id,tags,nsfw,star_value,is_free")
    .eq("clone_id", cloneId);
  if (error) throw new Error(error.message);
  const plan = buildSafeRepricePlan((data ?? []) as RepriceableMediaRow[], GUIDE);
  console.log(`${label} photos: total=${plan.total} changes=${plan.changes.length} unchanged=${plan.unchanged} protectedFree=${plan.protectedFree} protectedFromDecrease=${plan.protectedFromDecrease}`);
  if (DRY) {
    for (const c of plan.changes.slice(0, 5)) console.log(`  [dry] ${c.id} ${c.currentPrice} -> ${c.nextPrice}`);
    return;
  }
  let applied = 0, skipped = 0, failed = 0;
  for (const c of plan.changes) {
    const { data: upd, error: updErr } = await supabaseAdmin
      .from("photos")
      .update({ star_value: c.nextPrice, is_free: false })
      .eq("id", c.id).eq("clone_id", cloneId)
      .eq("star_value", c.currentPrice).eq("is_free", false)
      .select("id");
    if (updErr) { failed++; continue; }
    if (upd?.length !== 1) { skipped++; continue; }
    applied++;
  }
  console.log(`  applied=${applied} skippedConcurrent=${skipped} failed=${failed}`);
}

async function probeDurationSeconds(url: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", url,
    ], { maxBuffer: 1024 * 1024 });
    const n = Number(stdout.trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

async function repriceVideosByDuration(cloneId: string, label: string, min: number, max: number) {
  const { data, error } = await supabaseAdmin
    .from("videos")
    .select("id,storage_path,star_value,is_free")
    .eq("clone_id", cloneId);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  console.log(`${label} videos: ${rows.length} rows`);
  let applied = 0, skipped = 0, failed = 0, unresolved = 0;
  for (const row of rows) {
    if (row.is_free || row.star_value === 0) { skipped++; continue; }
    let dur: number | null = null;
    for (let attempt = 1; attempt <= 4 && dur == null; attempt++) {
      const { data: signed, error: signErr } = await supabaseAdmin.storage
        .from("media").createSignedUrl(row.storage_path, 300);
      if (signErr || !signed) {
        if (attempt === 4) console.log(`  ! sign failed ${row.storage_path}: ${signErr?.message}`);
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      dur = await probeDurationSeconds(signed.signedUrl);
      if (dur == null && attempt < 4) await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
    if (dur == null) { unresolved++; console.log(`  ! duration unresolved after retries ${row.storage_path}`); continue; }
    const next = priceForDuration(dur, min, max, PRICE_BAND_SHORT_SECONDS, PRICE_BAND_LONG_SECONDS);
    if (DRY) { console.log(`  [dry] ${row.storage_path} dur=${dur.toFixed(1)}s ${row.star_value} -> ${next}`); continue; }
    const { data: upd, error: updErr } = await supabaseAdmin
      .from("videos")
      .update({ star_value: next, is_free: false })
      .eq("id", row.id).eq("clone_id", cloneId)
      .eq("star_value", row.star_value).eq("is_free", false)
      .select("id");
    if (updErr) { failed++; continue; }
    if (upd?.length !== 1) { skipped++; continue; }
    applied++;
  }
  console.log(`  applied=${applied} skippedConcurrent/free=${skipped} failed=${failed} unresolved=${unresolved}`);
}

async function main() {
  await setGuide(KYLA, "kyla");
  await setGuide(RILEY, "riley");
  await repricePhotos(KYLA, "kyla");
  await repriceVideosByDuration(KYLA, "kyla", 1000, 2000);
}
main().catch((e) => { console.error("ERR", e); process.exit(1); });
