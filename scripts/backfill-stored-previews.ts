/**
 * Backfill stored blurred preview JPEGs (lib/stored-preview.ts) for photos
 * and videos uploaded before that path existed.
 *
 * For each row whose object at `previews/<storage_path>.jpg` does not yet
 * exist in the `media` bucket: download the row's `storage_path`, make the
 * blurred preview, and upload it (create-only, so a same-content re-run is a
 * no-op). Never deletes or overwrites anything at `storage_path` itself.
 *
 * Resume-safe: an existing preview object is detected via Storage `list()`
 * and skipped without downloading or re-encoding, so a re-run after a crash
 * or a `--limit` cutoff only does the remaining work. Runs with up to 3
 * concurrent downloads/encodes.
 *
 * Usage:
 *   npx tsx --env-file=.env --tsconfig scripts/tsconfig.json \
 *     scripts/backfill-stored-previews.ts --clone <slug-or-uuid> \
 *     [--type photo|video] [--limit N] [--dry-run]
 */
import { supabaseAdmin } from "@/lib/supabase";
import { makeBlurredPreview, storedPreviewPath } from "@/lib/stored-preview";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

type MediaKind = "photo" | "video";
type Table = "photos" | "videos";

const TABLE_BY_KIND: Record<MediaKind, Table> = { photo: "photos", video: "videos" };
const CONCURRENCY = 3;

function mb(n: number): string {
  return (n / 1024 / 1024).toFixed(2) + "MB";
}

async function resolveCloneId(slugOrId: string): Promise<{ id: string; name: string }> {
  const byId = await supabaseAdmin.from("clones").select("id,name").eq("id", slugOrId).maybeSingle();
  if (byId.data) return byId.data;
  const bySlug = await supabaseAdmin.from("clones").select("id,name").eq("slug", slugOrId).maybeSingle();
  if (bySlug.data) return bySlug.data;
  throw new Error(`No clone found for --clone ${slugOrId}`);
}

type Row = { id: string; storage_path: string };

async function loadRows(table: Table, cloneId: string): Promise<Row[]> {
  const pageSize = 500;
  const rows: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select("id, storage_path")
      .eq("clone_id", cloneId)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

/** Same detection pattern as scripts/backfill-compress-media.ts's
 *  originalAlreadySaved: check the derivative object exists via Storage
 *  list(), rather than a flag column that doesn't exist in the schema. */
async function previewAlreadyExists(storagePath: string): Promise<boolean> {
  const previewPath = storedPreviewPath(storagePath);
  const dir = previewPath.split("/").slice(0, -1).join("/");
  const name = previewPath.split("/").pop() ?? previewPath;
  const { data, error } = await supabaseAdmin.storage.from("media").list(dir, {
    search: name,
    limit: 1,
  });
  if (error) return false;
  return (data ?? []).some((f) => f.name === name);
}

async function downloadBytes(storagePath: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin.storage.from("media").download(storagePath);
  if (error || !data) throw new Error(`download ${storagePath} failed: ${error?.message ?? "no data"}`);
  return Buffer.from(await data.arrayBuffer());
}

async function uploadPreview(storagePath: string, bytes: Buffer): Promise<void> {
  const { error } = await supabaseAdmin.storage
    .from("media")
    .upload(storedPreviewPath(storagePath), bytes, { upsert: false, contentType: "image/jpeg" });
  if (error && !/already exists|duplicate/i.test(`${error.message}`)) {
    throw new Error(`upload preview ${storagePath} failed: ${error.message}`);
  }
}

type Counts = { made: number; skipped: number; failed: number };

async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  async function runner(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
}

async function processKind(
  kind: MediaKind,
  cloneId: string,
  cloneName: string,
  limit: number | null,
  dryRun: boolean,
): Promise<Counts> {
  const table = TABLE_BY_KIND[kind];
  const allRows = await loadRows(table, cloneId);
  const counts: Counts = { made: 0, skipped: 0, failed: 0 };
  const candidates: Row[] = [];
  for (const row of allRows) {
    if (limit != null && candidates.length >= limit) break;
    if (await previewAlreadyExists(row.storage_path)) {
      counts.skipped++;
      continue;
    }
    candidates.push(row);
  }

  console.log(
    `\n=== ${cloneName} / ${table}: ${candidates.length} to process, ${counts.skipped} already have a preview (of ${allRows.length} total) ${limit != null ? `(--limit ${limit})` : ""} ===`,
  );

  await runPool(candidates, CONCURRENCY, async (row) => {
    try {
      const bytes = await downloadBytes(row.storage_path);
      const preview = await makeBlurredPreview(bytes, kind);
      if (dryRun) {
        console.log(`DRY RUN  ${row.storage_path} -> ${storedPreviewPath(row.storage_path)} (${mb(preview.byteLength)})`);
      } else {
        await uploadPreview(row.storage_path, preview);
        console.log(`OK  ${storedPreviewPath(row.storage_path)} (${mb(preview.byteLength)})`);
      }
      counts.made++;
    } catch (error) {
      counts.failed++;
      console.error(`FAIL  ${row.storage_path}:`, error instanceof Error ? error.message : error);
    }
  });

  return counts;
}

async function main(): Promise<void> {
  const cloneArg = arg("clone");
  if (!cloneArg) {
    console.error("Usage: backfill-stored-previews.ts --clone <slug|uuid> [--type photo|video] [--limit N] [--dry-run]");
    process.exit(1);
  }
  const typeArg = arg("type") as MediaKind | undefined;
  if (typeArg && typeArg !== "photo" && typeArg !== "video") {
    console.error("--type must be photo or video");
    process.exit(1);
  }
  const limitArg = arg("limit");
  const limit = limitArg != null ? Number(limitArg) : null;
  const dryRun = process.argv.includes("--dry-run");

  const { id: cloneId, name: cloneName } = await resolveCloneId(cloneArg);
  const kinds: MediaKind[] = typeArg ? [typeArg] : ["photo", "video"];

  const totals: Counts = { made: 0, skipped: 0, failed: 0 };
  for (const kind of kinds) {
    const counts = await processKind(kind, cloneId, cloneName, limit, dryRun);
    totals.made += counts.made;
    totals.skipped += counts.skipped;
    totals.failed += counts.failed;
  }

  console.log(
    `\n${dryRun ? "[dry run] " : ""}Done for ${cloneName}: made ${totals.made}, skipped (already had preview) ${totals.skipped}, failed ${totals.failed}`,
  );
  if (totals.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
