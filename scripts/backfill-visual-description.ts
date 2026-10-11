/**
 * Backfill `visual_description` on existing photos and videos, plus a pure
 * copy onto matching photo_bundle_items (no model call for bundle items:
 * they share storage_path with a `photos` row, so the description is just
 * copied across).
 *
 * DOES NOT RUN AUTOMATICALLY. This file is committed but never invoked by
 * any script or CI path; the owner runs it by hand after reviewing.
 *
 * Run (dry run first, always):
 *   node --env-file=.env ../bot/node_modules/.bin/tsx \
 *     --tsconfig scripts/tsconfig.json scripts/backfill-visual-description.ts \
 *     --dry-run [--clone <slug>] [--limit N]
 *
 * Then for real:
 *   node --env-file=.env ../bot/node_modules/.bin/tsx \
 *     --tsconfig scripts/tsconfig.json scripts/backfill-visual-description.ts \
 *     [--clone <slug>] [--limit N]
 *
 * Behaviour:
 * - Selects photos/videos where visual_description IS NULL, in batches, and
 *   processes up to CONCURRENCY items at once within each batch.
 * - Downloads the item's bytes from the `media` storage bucket and describes
 *   it with the exact same captionPhoto/captionVideo() vision path the
 *   upload flow uses, so a backfilled row is indistinguishable from one
 *   written by a live upload.
 * - Writes the same columns the upload writes (analysis facts, flags, tags,
 *   descriptions, status/model/provider), only where visual_description is
 *   still empty and the row was not hand-edited. A failed analysis writes
 *   nothing. The storage object is never touched. Superseded by the repair
 *   batch for existing rows; kept for the one-column-missing case.
 * - Resumable: re-running only ever selects rows that are still NULL, so a
 *   killed run picks back up where it left off, and a row is never
 *   double-priced or double-billed for the same call twice.
 * - Per-item logging (ok/fail), and a failure is skipped and counted, never
 *   thrown, so one bad row cannot stop the whole backfill.
 * - --dry-run selects and counts the rows (read-only, no storage download, no
 *   model call, no write) and prints a cost/time estimate for the whole
 *   selected set.
 */
import { supabaseAdmin } from "@/lib/supabase";
import { analysePhoto, analyseVideo } from "@/lib/caption";
import { analysisRowFields, isMissingColumnError as isOptionalColumnMissing, withoutOptionalMediaColumns } from "@/lib/media-analysis-row";

// ── args ─────────────────────────────────────────────────────────────────────
function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const CLONE_SLUG = arg("--clone");
const LIMIT = arg("--limit") ? Number(arg("--limit")) : undefined;
const DRY = process.argv.includes("--dry-run");

const BATCH_SIZE = 200; // rows fetched per round trip
const CONCURRENCY = 6; // items described in flight at once

// Rough OpenRouter pricing for qwen/qwen2.5-vl-72b-instruct at the time this
// was written (see https://openrouter.ai/qwen/qwen2.5-vl-72b-instruct):
// ~$0.40/M input tokens, ~$0.40/M output tokens. An upload-analysis image at
// 768px is roughly ~600 input (image) + ~250 prompt tokens, and the JSON
// response (caption + tags + evidence + the new visual_description) is
// roughly ~350 output tokens. This is an ESTIMATE for planning only, not a
// billing guarantee; actual OpenRouter cost may differ by provider routing.
const EST_INPUT_TOKENS_PER_ITEM = 850;
const EST_OUTPUT_TOKENS_PER_ITEM = 350;
const EST_USD_PER_M_INPUT = 0.4;
const EST_USD_PER_M_OUTPUT = 0.4;
const EST_SECONDS_PER_ITEM = 4; // observed wall-clock per vision call, single item

async function resolveCloneId(slug: string): Promise<string> {
  const { data, error } = await supabaseAdmin.from("clones").select("id").eq("slug", slug).maybeSingle();
  if (error) throw new Error(`could not resolve --clone ${slug}: ${error.message}`);
  if (!data) throw new Error(`no clone with slug "${slug}"`);
  return data.id;
}

type MediaRow = { id: string; clone_id: string; storage_path: string };

// True once, for the "column not migrated yet" note printed by --dry-run.
let warnedMissingColumn = false;
function isMissingColumnError(message: string | null | undefined): boolean {
  return /column .*visual_description.* does not exist/i.test(message ?? "");
}

// NOTE: deliberately not `head: true` — a HEAD request returns no response
// body, so on an error PostgREST's JSON error body (which is where the
// missing-column signature lives) is never sent, and error.message comes
// back empty regardless of the real cause. `.limit(1)` keeps this cheap
// while still getting an accurate Content-Range-derived `count`.
async function countMissing(table: "photos" | "videos", cloneId: string | null): Promise<number> {
  let q = supabaseAdmin.from(table).select("id", { count: "exact" }).is("visual_description", null).limit(1);
  if (cloneId) q = q.eq("clone_id", cloneId);
  const { count, error } = await q;
  if (error) {
    // The migration adding this column may not be applied to this Supabase
    // project yet. Every existing row is NULL the moment the column lands,
    // so an unfiltered count of the whole table is the correct stand-in
    // estimate for "rows that will need a backfill".
    if (isMissingColumnError(error.message)) {
      if (!warnedMissingColumn) {
        console.log(`NOTE: photos/videos.visual_description does not exist on this Supabase project yet (migration not applied). Falling back to a whole-table count as the pre-migration estimate.`);
        warnedMissingColumn = true;
      }
      let fallback = supabaseAdmin.from(table).select("id", { count: "exact" }).limit(1);
      if (cloneId) fallback = fallback.eq("clone_id", cloneId);
      const { count: fallbackCount, error: fallbackError } = await fallback;
      if (fallbackError) throw new Error(`count ${table} (fallback) failed: ${fallbackError.message}`);
      return fallbackCount ?? 0;
    }
    throw new Error(`count ${table} failed: ${error.message}`);
  }
  return count ?? 0;
}

async function fetchBatch(table: "photos" | "videos", cloneId: string | null, afterId: string | null, batchSize: number): Promise<MediaRow[]> {
  let q = supabaseAdmin
    .from(table)
    .select("id, clone_id, storage_path")
    .is("visual_description", null)
    .order("id", { ascending: true })
    .limit(batchSize);
  if (cloneId) q = q.eq("clone_id", cloneId);
  if (afterId) q = q.gt("id", afterId);
  const { data, error } = await q;
  if (error) {
    if (isMissingColumnError(error.message)) {
      throw new Error(`${table}.visual_description does not exist on this Supabase project yet; apply the migration before running this for real`);
    }
    throw new Error(`fetch ${table} batch failed: ${error.message}`);
  }
  return data ?? [];
}

async function downloadBytes(storagePath: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin.storage.from("media").download(storagePath);
  if (error || !data) throw new Error(`download failed: ${error?.message ?? "no data"}`);
  return Buffer.from(await data.arrayBuffer());
}

async function visionModelFor(cloneId: string): Promise<string> {
  const { data } = await supabaseAdmin.from("clones").select("vision_model").eq("id", cloneId).maybeSingle();
  return data?.vision_model || "qwen/qwen2.5-vl-72b-instruct";
}

const modelCache = new Map<string, string>();
async function cachedVisionModelFor(cloneId: string): Promise<string> {
  const cached = modelCache.get(cloneId);
  if (cached) return cached;
  const model = await visionModelFor(cloneId);
  modelCache.set(cloneId, model);
  return model;
}

async function describeOne(table: "photos" | "videos", row: MediaRow): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const bytes = await downloadBytes(row.storage_path);
    const model = await cachedVisionModelFor(row.clone_id);
    const analysis = table === "photos" ? await analysePhoto(bytes, model) : await analyseVideo(bytes, model);
    // A failed analysis writes nothing: the row keeps whatever tags it has rather than being blanked.
    if (analysis.status === "failed" || !analysis.fields?.visual_description) return { ok: false, error: analysis.error ?? "model returned an empty visual_description" };
    // Same columns the upload writes (facts, flags, tags, descriptions, status/model/provider). Guarded: only a row that
    // still has no description and has not been hand-edited is touched.
    const fields = analysisRowFields(analysis);
    const run = (u: Record<string, unknown>, guardEdited: boolean) => {
      let q = supabaseAdmin.from(table).update(u).eq("id", row.id).is("visual_description", null);
      if (guardEdited) q = q.is("metadata_edited_at", null);
      return q;
    };
    let { error } = await run(fields, true);
    if (error && isOptionalColumnMissing(error.message)) ({ error } = await run(withoutOptionalMediaColumns(fields), false));
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  async function lane(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => lane()));
}

async function backfillTable(table: "photos" | "videos", cloneId: string | null, remainingLimit: { n: number | undefined }, tally: { ok: number; failed: number }): Promise<void> {
  let afterId: string | null = null;
  for (;;) {
    if (remainingLimit.n !== undefined && remainingLimit.n <= 0) return;
    const batchSize = remainingLimit.n !== undefined ? Math.min(BATCH_SIZE, remainingLimit.n) : BATCH_SIZE;
    const batch = await fetchBatch(table, cloneId, afterId, batchSize);
    if (batch.length === 0) return;
    afterId = batch[batch.length - 1].id;
    if (remainingLimit.n !== undefined) remainingLimit.n -= batch.length;

    await runPool(batch, CONCURRENCY, async (row) => {
      const result = await describeOne(table, row);
      if (result.ok) {
        tally.ok += 1;
        console.log(`  ok ${table}/${row.id} (${row.storage_path})`);
      } else {
        tally.failed += 1;
        console.log(`  FAILED ${table}/${row.id} (${row.storage_path}): ${result.error}`);
      }
    });
  }
}

// Pure copy, no model call: photo_bundle_items.storage_path is written by
// addBundleItem() from the SAME bytes it uploads, in the SAME `photos`-style
// storage layout, but bundle items never get their own photos row. Any bundle
// item whose storage_path also exists in `photos` (it does whenever the same
// photo was ever uploaded singly, or was itself imported via that path) can
// therefore copy that row's visual_description verbatim.
async function backfillBundleItemsFromPhotos(cloneId: string | null, dryRun: boolean): Promise<{ matched: number; updated: number }> {
  let itemsQuery = supabaseAdmin
    .from("photo_bundle_items")
    .select("id, storage_path, photo_bundles!inner(clone_id)")
    .is("visual_description", null);
  if (cloneId) itemsQuery = itemsQuery.eq("photo_bundles.clone_id", cloneId);
  const { data: items, error: itemsErr } = await itemsQuery;
  if (itemsErr) {
    if (isMissingColumnError(itemsErr.message)) {
      if (!warnedMissingColumn) {
        console.log(`NOTE: photo_bundle_items.visual_description does not exist on this Supabase project yet (migration not applied). Skipping the bundle-item copy pass for now.`);
        warnedMissingColumn = true;
      }
      return { matched: 0, updated: 0 };
    }
    throw new Error(`fetch photo_bundle_items failed: ${itemsErr.message}`);
  }
  if (!items || items.length === 0) return { matched: 0, updated: 0 };

  const paths = [...new Set(items.map((i: any) => i.storage_path as string))];
  const { data: photoRows, error: photoErr } = await supabaseAdmin
    .from("photos")
    .select("storage_path, visual_description")
    .in("storage_path", paths)
    .not("visual_description", "is", null);
  if (photoErr) throw new Error(`fetch matching photos failed: ${photoErr.message}`);

  const byPath = new Map<string, string>();
  for (const p of photoRows ?? []) byPath.set(p.storage_path, p.visual_description);

  let matched = 0;
  let updated = 0;
  for (const item of items as any[]) {
    const description = byPath.get(item.storage_path);
    if (!description) continue;
    matched += 1;
    if (dryRun) continue;
    const { error } = await supabaseAdmin
      .from("photo_bundle_items")
      .update({ visual_description: description })
      .eq("id", item.id);
    if (error) {
      console.log(`  FAILED bundle_item/${item.id} (${item.storage_path}): ${error.message}`);
      continue;
    }
    updated += 1;
    console.log(`  ok bundle_item/${item.id} <- photos (${item.storage_path})`);
  }
  return { matched, updated };
}

async function main() {
  const cloneId = CLONE_SLUG ? await resolveCloneId(CLONE_SLUG) : null;
  console.log(`backfill-visual-description: clone=${CLONE_SLUG ?? "ALL"} limit=${LIMIT ?? "none"} dry-run=${DRY}`);

  const photoCount = await countMissing("photos", cloneId);
  const videoCount = await countMissing("videos", cloneId);
  const total = LIMIT !== undefined ? Math.min(LIMIT, photoCount + videoCount) : photoCount + videoCount;

  console.log(`\nphotos missing visual_description: ${photoCount}`);
  console.log(`videos missing visual_description: ${videoCount}`);
  console.log(`total to process (capped by --limit): ${total}`);

  if (DRY) {
    const estInputM = (total * EST_INPUT_TOKENS_PER_ITEM) / 1_000_000;
    const estOutputM = (total * EST_OUTPUT_TOKENS_PER_ITEM) / 1_000_000;
    const estCostUsd = estInputM * EST_USD_PER_M_INPUT + estOutputM * EST_USD_PER_M_OUTPUT;
    const estSeconds = Math.ceil(total / CONCURRENCY) * EST_SECONDS_PER_ITEM;
    const estMinutes = (estSeconds / 60).toFixed(1);
    console.log(`\n--dry-run: read-only, no downloads, no model calls, no writes.`);
    console.log(`estimated cost: ~$${estCostUsd.toFixed(2)} (qwen/qwen2.5-vl-72b-instruct, rough per-item token estimate, actual model may differ per-clone before override)`);
    console.log(`estimated wall time: ~${estMinutes} min at concurrency ${CONCURRENCY}`);

    const bundleResult = await backfillBundleItemsFromPhotos(cloneId, true);
    console.log(`\nphoto_bundle_items with a null visual_description whose storage_path matches an already-described photos row: ${bundleResult.matched} (pure copy, no model call, no cost)`);
    return;
  }

  const tally = { ok: 0, failed: 0 };
  const remainingLimit = { n: LIMIT };

  console.log(`\n── photos ──`);
  await backfillTable("photos", cloneId, remainingLimit, tally);
  console.log(`\n── videos ──`);
  await backfillTable("videos", cloneId, remainingLimit, tally);

  console.log(`\n── photo_bundle_items (pure copy from matching photos row) ──`);
  const bundleResult = await backfillBundleItemsFromPhotos(cloneId, false);

  console.log(`\ndone. photos+videos ok=${tally.ok} failed=${tally.failed}; bundle_items matched=${bundleResult.matched} updated=${bundleResult.updated}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
