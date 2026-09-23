// Deterministic storage path for a media upload, shared by the live dashboard
// upload actions (app/media/actions.ts) and the bulk importers
// (scripts/import-media.ts, scripts/import-video-media.ts,
// scripts/import-videos.ts) so all three write into the `media` bucket the
// same way. Split into its own module — no "use server", no Supabase client —
// so it can be asserted directly (see scripts/check-media-storage-paths.ts),
// same reasoning as lib/video-import.ts's split from scripts/import-videos.ts.
//
// ROOT CAUSE, measured 2026-09-16: every call site used to build the path as
// `${cloneId}/${type}/${Date.now()}-${filename}`. Date.now() makes every call
// produce a brand new path, on purpose, to dodge Supabase Storage's default
// `upsert: false` (which 409s on an existing key) whenever two DIFFERENT files
// share an original filename (two shoots both exporting "IMG_001.jpg"). But it
// also means a RETRY, a double-submit, or a re-run of a bulk import over the
// same folder never lands on the object it already wrote — it always looks
// "new" to Storage. Fleet-wide in the `media` bucket that collapsed 2,618
// objects to 2,142 canonical files once the timestamp prefix was stripped:
// 450 duplicate groups, 476 redundant copies, ~1,353MB wasted. It is also the
// reason 481 objects (1,051MB) are orphaned: earlier cleanups deleted the
// duplicate DATABASE rows but had no way to know which of the several
// timestamp-prefixed STORAGE objects for the same logical photo was the
// "real" one, so the blobs were left behind. Riley Mae Lewis: 228 orphans,
// exactly her 228 live photos — one orphan per photo, from one extra
// timestamped copy of every file.
//
// FIX: hash the actual bytes being uploaded and use that as the prefix
// instead of the clock. This keeps the exact guard Date.now() was providing
// (two different files with the same name still get different paths, because
// their content differs) while making a retry of the SAME bytes resolve to
// the SAME path. Dashboard callers use create-only Storage writes and treat an
// existing object as a safe retry; this avoids replacing agency-owned objects
// while still preventing a second copy. A 16-byte (128-bit) hex prefix is far
// more collision-resistant than this use case will ever need.
//
// EXISTING ROWS ARE UNTOUCHED: this only changes what path a NEW upload
// writes to. Nothing renames, re-uploads, or re-points already-referenced
// storage_path values, so live media already pointing at an old
// `${timestamp}-name` path keeps working exactly as before.
import { createHash } from "node:crypto";

export function mediaContentHash(bytes: Uint8Array | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 32);
}

export function mediaStoragePath(
  cloneId: string,
  type: "photos" | "videos",
  filename: string,
  bytes: Uint8Array | Buffer,
): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${cloneId}/${type}/${mediaContentHash(bytes)}-${safeName}`;
}
