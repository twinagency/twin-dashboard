/**
 * Backfill compression for photos/videos uploaded before lib/media-compress.ts
 * existed (or uploaded through a bulk importer that bypasses it).
 *
 * For each row: download the object at `storage_path`, compress it with the
 * same rules the live upload path uses (lib/media-compress.ts), and if the
 * bytes actually changed:
 *   1. upload the CURRENT (uncompressed) bytes to `originals/<storage_path>`
 *      (create-only — skipped if that object already exists, which is also
 *      how a re-run knows this file was already handled: see isDone below)
 *   2. overwrite `storage_path` itself with the compressed bytes
 *   3. set `telegram_file_id = null` on the row, because the old file_id
 *      Telegram cached points at the now-replaced (uncompressed) bytes
 *
 * Resume-safe: a file whose `originals/<path>` object already exists is
 * skipped without re-downloading or re-encoding, so re-running after a crash
 * or a `--limit` cutoff only does the remaining work.
 *
 * NOT run as part of this change — written for the operator to run by hand.
 *
 * Usage:
 *   node --env-file=.env ../twin-bot/node_modules/.bin/tsx \
 *     --tsconfig scripts/tsconfig.json scripts/backfill-compress-media.ts \
 *     --clone <slug-or-uuid> [--type video|photo] [--limit N] [--dry-run]
 */
import { supabaseAdmin } from "@/lib/supabase";
import { compressPhoto, compressVideo } from "@/lib/media-compress";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

type MediaKind = "photo" | "video";
type Table = "photos" | "videos";

const TABLE_BY_KIND: Record<MediaKind, Table> = { photo: "photos", video: "videos" };

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

/** A file already handled by a previous run has its original saved. Checking
 *  for that object's existence (rather than, say, a flag column that doesn't
 *  exist in the schema) is what makes a re-run skip finished work without a
 *  second DB column and without ever trusting stale local state. */
async function originalAlreadySaved(storagePath: string): Promise<boolean> {
  const dir = storagePath.split("/").slice(0, -1).join("/");
  const name = storagePath.split("/").pop() ?? storagePath;
  const { data, error } = await supabaseAdmin.storage.from("media").list(`originals/${dir}`, {
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

async function uploadOriginal(storagePath: string, bytes: Buffer): Promise<void> {
  const { error } = await supabaseAdmin.storage
    .from("media")
    .upload(`originals/${storagePath}`, bytes, { upsert: false });
  if (error && !/already exists|duplicate/i.test(`${error.message}`)) {
    throw new Error(`upload original ${storagePath} failed: ${error.message}`);
  }
}

async function overwriteCompressed(storagePath: string, bytes: Buffer, contentType: string): Promise<void> {
  const { error } = await supabaseAdmin.storage
    .from("media")
    .upload(storagePath, bytes, { upsert: true, contentType });
  if (error) throw new Error(`overwrite ${storagePath} failed: ${error.message}`);
}

async function clearFileId(table: Table, id: string): Promise<void> {
  const { error } = await supabaseAdmin.from(table).update({ telegram_file_id: null }).eq("id", id);
  if (error) throw new Error(`clear telegram_file_id ${table}/${id} failed: ${error.message}`);
}

async function processKind(kind: MediaKind, cloneId: string, cloneName: string, limit: number | null, dryRun: boolean): Promise<void> {
  const table = TABLE_BY_KIND[kind];
  const allRows = await loadRows(table, cloneId);
  const rows = limit != null ? allRows.slice(0, limit) : allRows;
  console.log(`\n=== ${cloneName} / ${table}: ${rows.length} of ${allRows.length} row(s) ${limit != null ? `(--limit ${limit})` : ""} ===`);

  let compressedCount = 0;
  let skippedAlready = 0;
  let skippedNoChange = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      if (await originalAlreadySaved(row.storage_path)) {
        skippedAlready++;
        console.log(`SKIP  (already backfilled) ${row.storage_path}`);
        continue;
      }

      const before = await downloadBytes(row.storage_path);

      if (dryRun) {
        // Dry run: only estimate, write nothing. Compressing every file in a
        // large clone just to print a size is wasteful, so this samples the
        // first handful actually reached (rows are already capped by --limit
        // when the operator wants a small sample).
        const result = kind === "video" ? await compressVideo(before) : await compressPhoto(before);
        console.log(
          `DRY   ${row.storage_path}  ${mb(before.byteLength)} -> ${mb(result.bytes.byteLength)}` +
            (result.changed ? "" : "  (no change needed)"),
        );
        continue;
      }

      const result = kind === "video" ? await compressVideo(before) : await compressPhoto(before);
      if (!result.changed) {
        skippedNoChange++;
        console.log(`OK    (already compliant) ${row.storage_path}`);
        continue;
      }

      await uploadOriginal(row.storage_path, before);
      const contentType = kind === "video" ? "video/mp4" : "image/jpeg";
      await overwriteCompressed(row.storage_path, result.bytes, contentType);
      await clearFileId(table, row.id);
      compressedCount++;
      console.log(`DONE  ${row.storage_path}  ${mb(before.byteLength)} -> ${mb(result.bytes.byteLength)}`);
    } catch (error) {
      failed++;
      console.error(`FAIL  ${row.storage_path}: ${(error as Error).message}`);
    }
  }

  console.log(
    `--- ${table}: compressed ${compressedCount}, already compliant ${skippedNoChange}, already backfilled ${skippedAlready}, failed ${failed} ---`,
  );
}

async function main(): Promise<void> {
  const cloneArg = arg("clone");
  if (!cloneArg) throw new Error("usage: --clone <slug-or-uuid> [--type video|photo] [--limit N] [--dry-run]");
  const typeArgRaw = arg("type");
  if (typeArgRaw && typeArgRaw !== "video" && typeArgRaw !== "photo") throw new Error("--type must be video or photo");
  const typeArg = typeArgRaw as MediaKind | undefined;
  const limitRaw = arg("limit");
  const limit = limitRaw !== undefined ? Number(limitRaw) : null;
  if (limit !== null && (!Number.isFinite(limit) || limit <= 0)) throw new Error("--limit must be a positive number");
  const dryRun = process.argv.includes("--dry-run");

  const clone = await resolveCloneId(cloneArg);
  console.log(`Clone: ${clone.name} (${clone.id})${dryRun ? "  [DRY RUN — writes nothing]" : ""}`);

  const kinds: MediaKind[] = typeArg ? [typeArg] : ["photo", "video"];
  for (const kind of kinds) {
    await processKind(kind, clone.id, clone.name, limit, dryRun);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
