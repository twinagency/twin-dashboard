import { createHash } from "node:crypto";
import { MAX_CHUNK_BYTES, type UploadJob } from "./onlyfans/vault-media";
export const SHARED_MEDIA_LIMIT = 64 * 1024 * 1024;
export const sharedDigest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
export const sharedSourceKind = (value: unknown): value is "photo" | "video" => value === "photo" || value === "video";
export function sharedFileName(sourceId: string, kind: "photo" | "video", contentType: string | null) {
  const types: Record<string, ["photo" | "video", string]> = { "image/jpeg": ["photo", "jpg"], "image/png": ["photo", "png"], "image/webp": ["photo", "webp"], "image/gif": ["photo", "gif"], "video/mp4": ["video", "mp4"], "video/quicktime": ["video", "mov"], "video/webm": ["video", "webm"] };
  const type = types[contentType?.split(";")[0].trim().toLowerCase() ?? ""];
  if (!type || type[0] !== kind) throw Error("source_type_unsupported");
  return `${sourceId}.${type[1]}`;
}
export function sharedStoragePath(path: unknown, cloneId: string): path is string {
  return typeof path === "string" && path.startsWith(cloneId + "/") && path.length < 1024 && !/[\\%\x00-\x1f]/.test(path) && !path.split("/").some(part => !part || part === "." || part === "..");
}
export async function boundedMediaBytes(response: Response, limit: number) {
  const declared = response.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) { await response.body?.cancel(); throw Error("source_too_large"); }
  if (!response.body) throw Error("source_unavailable");
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length;
      if (size > limit) throw Error("source_too_large"); chunks.push(part.value); }
  } catch (error) { await reader.cancel(); throw error; }
  if (!size || declared && size !== Number(declared)) throw Error("source_incomplete");
  return Buffer.concat(chunks, size);
}
export function sharedChunkDigests(bytes: Uint8Array) {
  const result: string[] = []; for (let offset = 0; offset < bytes.length; offset += MAX_CHUNK_BYTES) result.push(sharedDigest(bytes.subarray(offset, offset + MAX_CHUNK_BYTES))); return result;
}
export type SharedTransfer = {
  id: string; clone_id: string; source_kind: "photo" | "video"; source_id: string; account_id: string;
  storage_path: string; file_name: string; size_bytes: number; source_sha256: string; chunk_sha256: string[];
  file_id: string; connection_revision: number; actor: string; job_id: string | null; media_id: string | null;
  status: string; processing: boolean; received_bytes: number; error_code: string | null;
};
// A retry mints a new file_id and commandKey, so retrying a file that may already be in the vault uploads it twice. A receipt
// is therefore history (the same file may be shared again) ONLY when its stored row proves the provider never received the
// file: no vault media id and one of these exact (status, error_code) pairs. The backend's vault_media_worker.recover() writes
// them only for a job still receiving or pending, before the worker ever claimed it, and neither status is ever left again;
// sharedUploadProgress stores that lastError verbatim (no file error, no cleanup is possible on a job that never ran).
// Every other receipt is LIVE and blocks a new one: active, complete, failed or complete-with-anomaly (provider_review_required),
// provider_cleanup_required, interrupted (the worker was running), superseded by a binding change (may hit a running job),
// expired by an operator cancel (null error_code), any unknown code. The same predicate is the route's lookup filter and the
// partial unique index in supabase/migrations/20261113100300_shared_media_retry_after_failure.sql
// (tests/rules/G30b-shared-media-retry-index.test.mjs, G30b-shared-media-retry-route.test.ts).
export const RETRYABLE_SHARED_OUTCOMES = [["expired", "media_request_expired"], ["superseded", "media_connection_changed"]] as const;
export const SHARED_CLEANUP_HOLD = "provider_cleanup_required";
// Live = not retryable, written null-safe (two-valued for every row): status is NOT NULL, and a null media_id/error_code is
// decided by its own term before any comparison.
/** The live predicate as a PostgREST `.or()` filter. */
export const LIVE_SHARED_FILTER = `media_id.not.is.null,error_code.is.null,and(${RETRYABLE_SHARED_OUTCOMES.map(([s, e]) => `or(status.neq.${s},error_code.neq.${e})`).join(",")})`;
/** Held (G04c1): live, terminal and not adopted (complete with a vault media id). Only a held receipt may be refreshed in the UI. */
export const SHARED_ACTIVE: readonly string[] = ["prepared", "receiving", "pending", "running"];
export const sharedHeld = (row: Pick<SharedTransfer, "status" | "media_id" | "error_code">) => !SHARED_ACTIVE.includes(row.status) && !(row.status === "complete" && row.media_id != null)
  && (row.media_id != null || !RETRYABLE_SHARED_OUTCOMES.some(([status, code]) => row.status === status && row.error_code === code));
/** The same predicate as SQL, the partial index's WHERE. */
export const LIVE_SHARED_SQL = `media_id is not null or error_code is null or (${RETRYABLE_SHARED_OUTCOMES.map(([s, e]) => `(status <> '${s}' or error_code <> '${e}')`).join(" and ")})`;
export function sharedUploadProgress(row: SharedTransfer, job: UploadJob) {
  if (row.job_id && row.job_id !== job.jobId || job.files.length !== 1) throw Error("upload_mismatch");
  const file = job.files[0];
  if (file.fileId !== row.file_id || file.name !== row.file_name || file.size !== row.size_bytes) throw Error("upload_mismatch");
  // The backend publishes the chunk-prefix proof only while receiving. Once
  // queued it reports the full byte count and a null prefix, retaining the job.
  if (job.status === "receiving" && file.receivedBytes > 0 && (file.receivedBytes !== row.size_bytes && file.receivedBytes % MAX_CHUNK_BYTES !== 0
    || file.prefixDigest !== sharedDigest(row.chunk_sha256.slice(0, Math.ceil(file.receivedBytes / MAX_CHUNK_BYTES)).join("")))) throw Error("upload_prefix_mismatch");
  const cleanup = job.cleanupRequired && !["receiving", "pending", "running"].includes(job.status);
  const status = job.status === "complete" && (cleanup || file.status !== "done" || !file.mediaId) ? "failed" : job.status;
  return { job_id: job.jobId, status, media_id: file.mediaId, processing: file.processing, received_bytes: file.receivedBytes, error_code: cleanup ? "provider_cleanup_required" : file.error || status === "failed" ? "provider_review_required" : job.lastError };
}
/** `stored` is the row as saved, before any provider overlay (GET): `held` describes the receipt, not the overlay. */
export function publicSharedTransfer(row: SharedTransfer, stored = row) {
  return { id: row.id, held: sharedHeld(stored), sourceId: row.source_id, kind: row.source_kind, status: row.status, mediaId: row.media_id, processing: row.processing, receivedBytes: row.received_bytes, sizeBytes: row.size_bytes, error: row.error_code === "provider_cleanup_required" ? "OnlyFans scheduled-post cleanup needs review. Check the account's upload history before continuing." : row.error_code ? "This transfer needs review. Refresh its status before retrying." : null };
}
