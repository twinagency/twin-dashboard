/**
 * One-off v2: apply the owner's 2026-09-10 agency PPV price sheets to Kyla and
 * Riley as clones.category_pricing guides, and reprice live media against them.
 *
 * Two candidate guides were derived from the same USD sheets:
 *   literal  straight USD x (1/STAR_USD). Retained for reference only.
 *   banded   sheet ordering + ratios preserved, compressed log-uniformly into
 *            400..2400 stars (the band that actually earns; 2500+ sells zero).
 * The owner chose BANDED.
 *
 * Repricing uses buildSafeRepricePlan, so it is monotonic: free media stays
 * free, a higher/manual price is never lowered, and each UPDATE re-matches the
 * exact current price so a concurrent edit is skipped rather than clobbered.
 *
 * Run: node --env-file=.env ../twin-bot/node_modules/.bin/tsx \
 *   --tsconfig scripts/tsconfig.json scripts/tmp-reprice-kyla-riley-v2.ts \
 *   --clone kyla|riley --guide banded [--dry-run]
 */
import { supabaseAdmin } from "@/lib/supabase";
import { buildSafeRepricePlan, normalizeSafeCategoryGuide, type RepriceableMediaRow, type CategoryPricing } from "@/lib/pricing";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DRY = process.argv.includes("--dry-run");
// Riley's guide was authorised, repricing her live catalogue was NOT (the brief
// assumed she had no media; she has 456 photos + 6 videos). Guide-only writes
// the guide and leaves every existing row's price untouched.
const GUIDE_ONLY = process.argv.includes("--guide-only");
const CLONE = (arg("clone") ?? "").toLowerCase();
const GUIDE_NAME = (arg("guide") ?? "banded").toLowerCase();

// Straight USD x (1/0.013), rounded to 10. Reference only; not applied.
const LITERAL: Record<string, CategoryPricing> = {
  kyla: {
    sfw: 1150, mirror_selfie: 1310, outdoor: 1460, pool: 1620, bed: 1770, shower: 6920,
    solo: 1920, bikini: 2310, feet: 2310, lingerie: 2150, ass: 4620, topless: 4620,
    tits: 15380, full_nude: 6150, pussy: 38460, anal: 38460,
  },
  riley: {
    sfw: 920, mirror_selfie: 1080, outdoor: 1230, pool: 1380, bed: 1540, shower: 3850,
    solo: 1690, bikini: 2690, feet: 1920, lingerie: 2690, ass: 3080, topless: 3850,
    tits: 11540, full_nude: 6920, pussy: 15380, anal: 15380,
  },
};

// Log-uniform compression of the same USD map onto 400..2400 stars, anchored at
// each clone's own cheapest and dearest category. Ratios survive as a uniform
// power, so the sheet's ORDER is exact and its ratios are proportionally damped.
const BANDED: Record<string, CategoryPricing> = {
  kyla: {
    sfw: 400, mirror_selfie: 430, outdoor: 450, pool: 480, bed: 500, shower: 1000,
    solo: 520, bikini: 570, feet: 570, lingerie: 550, ass: 810, topless: 810,
    tits: 1500, full_nude: 940, pussy: 2400, anal: 2400,
  },
  riley: {
    sfw: 400, mirror_selfie: 440, outdoor: 480, pool: 520, bed: 550, shower: 990,
    solo: 590, bikini: 790, feet: 640, lingerie: 790, ass: 860, topless: 990,
    tits: 2000, full_nude: 1440, pussy: 2400, anal: 2400,
  },
};

const CLONE_IDS: Record<string, string> = {
  kyla: "d2678dce-6a4e-4f1c-b54a-86057bba427c",
  riley: "20ef9407-83f2-4351-8d3c-48cc0ed54e0b",
};

async function setGuide(cloneId: string, label: string, guide: CategoryPricing) {
  const { data: before } = await supabaseAdmin.from("clones").select("category_pricing").eq("id", cloneId).single();
  console.log(`${label} guide currently: ${JSON.stringify(before?.category_pricing)}`);
  if (DRY) { console.log(`  [dry] would set: ${JSON.stringify(guide)}`); return; }
  const { error } = await supabaseAdmin.from("clones").update({ category_pricing: guide }).eq("id", cloneId);
  if (error) throw new Error(error.message);
  console.log(`  saved ${GUIDE_NAME} guide on ${label}`);
}

async function repriceTable(table: "photos" | "videos", cloneId: string, label: string, guide: CategoryPricing) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select("id,tags,nsfw,star_value,is_free")
    .eq("clone_id", cloneId);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as RepriceableMediaRow[];
  const plan = buildSafeRepricePlan(rows, guide);
  console.log(
    `${label} ${table}: total=${plan.total} changes=${plan.changes.length} unchanged=${plan.unchanged} ` +
    `protectedFree=${plan.protectedFree} protectedFromDecrease=${plan.protectedFromDecrease} increaseStars=${plan.increaseStars}`,
  );
  const hist: Record<string, number> = {};
  for (const c of plan.changes) hist[`${c.currentPrice}->${c.nextPrice}`] = (hist[`${c.currentPrice}->${c.nextPrice}`] ?? 0) + 1;
  for (const [k, v] of Object.entries(hist).sort((a, b) => b[1] - a[1])) console.log(`    ${v}x  ${k}`);
  if (DRY) return;
  let applied = 0, skipped = 0, failed = 0;
  for (const c of plan.changes) {
    const { data: upd, error: updErr } = await supabaseAdmin
      .from(table)
      .update({ star_value: c.nextPrice, is_free: false })
      .eq("id", c.id).eq("clone_id", cloneId)
      .eq("star_value", c.currentPrice).eq("is_free", false)
      .select("id");
    if (updErr) { failed++; console.log(`    ! ${c.id}: ${updErr.message}`); continue; }
    if (upd?.length !== 1) { skipped++; continue; }
    applied++;
  }
  console.log(`    applied=${applied} skippedConcurrent=${skipped} failed=${failed}`);
}

async function main() {
  const cloneId = CLONE_IDS[CLONE];
  if (!cloneId) throw new Error("--clone must be kyla or riley");
  const table = GUIDE_NAME === "literal" ? LITERAL : GUIDE_NAME === "banded" ? BANDED : null;
  if (!table) throw new Error("--guide must be literal or banded");
  const guide = table[CLONE];
  if (!normalizeSafeCategoryGuide(guide)) throw new Error(`${CLONE}/${GUIDE_NAME} is not a safe complete guide`);
  console.log(`=== ${CLONE} / ${GUIDE_NAME}${DRY ? " / DRY-RUN" : " / LIVE"} ===`);
  await setGuide(cloneId, CLONE, guide);
  if (GUIDE_ONLY) {
    console.log(`  --guide-only: leaving ${CLONE}'s existing media prices untouched`);
    return;
  }
  await repriceTable("photos", cloneId, CLONE, guide);
  await repriceTable("videos", cloneId, CLONE, guide);
}
main().catch((e) => { console.error("ERR", e); process.exit(1); });
