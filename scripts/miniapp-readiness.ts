/**
 * Per-clone Mini App rollout readiness checklist. Prints the same checklist
 * shown on the /miniapp-rollout operator page for one clone, and, with
 * --fix, runs the existing idempotent backfill jobs (stored previews, then
 * compression) so a re-run of this script shows the improved numbers.
 *
 * Never flips sell_via_mini_app or any TON setting (ton_wallet_address,
 * ton_star_usd, ton_nanoton_per_star, ton_discount_percent) — those are
 * printed as "needs a human" with the exact dashboard place to set them.
 * BotFather Mini App registration and thin bundle themes are also reported
 * as human steps; there is nothing here that could safely automate them.
 *
 * Usage:
 *   npx tsx --env-file=.env --tsconfig scripts/tsconfig.json \
 *     scripts/miniapp-readiness.ts --clone <slug-or-uuid> [--fix] [--dry-run]
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchMiniAppRollout, type CloneRolloutRow } from "@/lib/miniapp-rollout-data";
import { ALLOWED_BUNDLE_THEMES, bundleTitleAllowed } from "@/lib/miniapp-rollout";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function resolveCloneId(slugOrId: string): Promise<{ id: string; name: string; slug: string }> {
  const byId = await supabaseAdmin.from("clones").select("id,name,slug").eq("id", slugOrId).maybeSingle();
  if (byId.data) return byId.data as any;
  const bySlug = await supabaseAdmin.from("clones").select("id,name,slug").eq("slug", slugOrId).maybeSingle();
  if (bySlug.data) return bySlug.data as any;
  throw new Error(`No clone found for --clone ${slugOrId}`);
}

const TSX_BIN = path.join(process.cwd(), "node_modules/.bin/tsx");
const TSCONFIG = path.join(process.cwd(), "scripts/tsconfig.json");

function runBackfill(script: string, cloneSlug: string, dryRun: boolean): void {
  const scriptPath = path.join(process.cwd(), "scripts", script);
  const args = ["--tsconfig", TSCONFIG, scriptPath, "--clone", cloneSlug];
  if (dryRun) args.push("--dry-run");
  console.log(`\n--- running ${script} ${dryRun ? "(dry run) " : ""}---`);
  const result = spawnSync(TSX_BIN, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) {
    console.error(`${script} exited with status ${result.status}`);
  }
}

function printRow(row: CloneRolloutRow): void {
  const r = row.rollout;
  const m = row.mediaCounts;
  const total = m.photo.total + m.video.total;
  console.log(`\n=== ${row.clone.name} (${row.clone.slug}) ===`);
  console.log(`Mini App live:     [${r.miniApp.chip.toUpperCase()}] ${r.miniApp.label}`);
  console.log(`TON:               [${r.ton.chip.toUpperCase()}] ${r.ton.label}`);
  console.log(`Sell via chat app: [${r.sellViaMiniApp.chip.toUpperCase()}] ${r.sellViaMiniApp.label}`);
  console.log(`Captions:          [${r.media.captionChip.toUpperCase()}] ${r.media.captionPct}% (${m.photo.captioned + m.video.captioned}/${total})`);
  console.log(`Stored previews:   [${r.media.previewChip.toUpperCase()}] ${r.media.previewPct}% (${m.photo.previewed + m.video.previewed}/${total})`);
  console.log(`Compressed:        [${r.media.compressedChip.toUpperCase()}] ${r.media.compressedPct}% (${m.photo.compressed + m.video.compressed}/${total})`);
  console.log(`Oversize videos:   [${r.media.oversizeChip.toUpperCase()}] ${r.media.oversizeVideos} over 20MB`);
  console.log(`Bundles:           [${r.bundles.chip.toUpperCase()}] ${r.bundles.enabledAllowedCount} enabled from allowed themes, ${r.bundles.invalidEnabledCount} failing validation`);
  console.log(`Photo stars (min/avg/max): ${row.photoPrices ? `${row.photoPrices.min}/${row.photoPrices.avg}/${row.photoPrices.max}` : "no paid photos"}`);
  console.log(`Video stars (min/avg/max): ${row.videoPrices ? `${row.videoPrices.min}/${row.videoPrices.avg}/${row.videoPrices.max}` : "no paid videos"}`);
  console.log(`Fully on: ${row.fullyOn ? "YES" : "no"}`);
}

function printHumanSteps(row: CloneRolloutRow): void {
  const clonePath = `/clones/${row.clone.id}`;
  console.log(`\n--- needs a human ---`);
  const settings = row.settings;
  if (!settings || !settings.ton_wallet_address) {
    console.log(`- Set TON wallet address: ${clonePath} (creator_catalogue_settings.ton_wallet_address, no automated way to generate/verify a wallet)`);
  }
  if (!settings || (!settings.ton_star_usd && !settings.ton_nanoton_per_star)) {
    console.log(`- Set a TON rate (ton_star_usd or ton_nanoton_per_star): ${clonePath}`);
  }
  if (!settings || !settings.ton_discount_percent) {
    console.log(`- Set ton_discount_percent (Alanna reference: 50): ${clonePath}`);
  }
  if (!settings || !settings.mini_app_url) {
    console.log(`- Register the Mini App with BotFather (/newapp on the clone's bot) and set mini_app_url: ${clonePath}`);
  }
  if (!row.clone.sell_via_mini_app) {
    console.log(`- Turn on "Sell via Mini App" in chat: ${clonePath} (clone settings, sell_via_mini_app toggle)`);
  }
  const enabledTitles = new Set(row.bundles.filter((b) => b.enabled).map((b) => b.title));
  const missingThemes = ALLOWED_BUNDLE_THEMES.filter((theme) => !enabledTitles.has(`${theme} Photos`));
  if (missingThemes.length) {
    console.log(`- No enabled "<Theme> Photos" bundle for: ${missingThemes.join(", ")} (not enough tagged/priced content yet, or not built)`);
  }
  const invalidBundles = row.bundles.filter((b) => b.enabled && bundleTitleAllowed(b.title) && b.photo_ids.length < 2);
  if (invalidBundles.length) {
    console.log(`- Fix or disable enabled bundles with too few photos: ${invalidBundles.map((b) => b.title).join(", ")}`);
  }
  const totalMedia = row.mediaCounts.photo.total + row.mediaCounts.video.total;
  const captioned = row.mediaCounts.photo.captioned + row.mediaCounts.video.captioned;
  if (totalMedia - captioned > 0) {
    console.log(`- ${totalMedia - captioned} media item(s) have no caption; caption them in Media before they can be sold in the app`);
  }
  console.log(`- After the above, do one real test buy on Stars and one on TON before calling this girl live.`);
}

async function main(): Promise<void> {
  const cloneArg = arg("clone");
  if (!cloneArg) {
    console.error("Usage: miniapp-readiness.ts --clone <slug|uuid> [--fix] [--dry-run]");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run");
  const fix = process.argv.includes("--fix");

  const clone = await resolveCloneId(cloneArg);

  if (fix) {
    runBackfill("backfill-stored-previews.ts", clone.slug, dryRun);
    runBackfill("backfill-compress-media.ts", clone.slug, dryRun);
  }

  const [row] = await fetchMiniAppRollout([clone.id]);
  if (!row) throw new Error(`No rollout data for ${clone.name}`);
  printRow(row);
  printHumanSteps(row);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
