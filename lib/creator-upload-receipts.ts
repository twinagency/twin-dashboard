import { createHash } from "node:crypto";
import { createReadStream, openAsBlob } from "node:fs";
import { serviceClient } from "./supabase-service";
import { CreatorUploadError, type StagedCreatorFile } from "./creator-upload-stream";
import { uploadStage } from "./creator-upload-diagnostics";

export const isUploadId = (id: string | null | undefined): id is string => !!id && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
/** Content digest + creator-owned random key bind a retry to these actual bytes. */
export async function saveIdempotentCreatorUpload(accountId: string, uploadId: string, kind: string, file: StagedCreatorFile, mime: string) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file.path)) digest.update(chunk);
  const db = serviceClient();
  const claim = await db.rpc("claim_creator_upload", { p_creator_id: accountId, p_upload_id: uploadId, p_kind: kind, p_name: file.name, p_mime: mime, p_bytes: file.size, p_sha256: digest.digest("hex") });
  if (claim.error || !claim.data) throw new CreatorUploadError(claim.error?.message === "upload_quota" ? "upload_quota" : claim.error?.message === "upload_conflict" ? "upload_conflict" : "upload_metadata_error");
  const receipt = claim.data;
  if (receipt.state === "saved") return;
  if (receipt.state === "busy") throw new CreatorUploadError("upload_busy");
  if (receipt.state === "removed") throw new CreatorUploadError("upload_removed");
  try {
    uploadStage("storage");
    // Unique deterministic path: a lost success response cannot create another object.
    const bucket = db.storage.from(receipt.bucket);
    const existing = await bucket.info(receipt.storage_path);
    if (existing.error && String((existing.error as { statusCode?: string }).statusCode) !== "404") throw new CreatorUploadError("upload_storage_error");
    if (existing.data) {
      if (Number(existing.data.size) !== file.size) throw new CreatorUploadError("upload_conflict");
    } else {
      const uploaded = await bucket.upload(receipt.storage_path, await openAsBlob(file.path, { type: mime }), { contentType: mime, upsert: false, cacheControl: "3600" });
      if (uploaded.error) throw new CreatorUploadError("upload_storage_error");
    }
    const stored = await db.from("creator_upload_receipts").update({ state: "stored", updated_at: new Date().toISOString() })
      .eq("id", uploadId).eq("creator_account_id", accountId).eq("lease_token", receipt.lease_token);
    if (stored.error) throw new CreatorUploadError("upload_metadata_error");
    uploadStage("metadata");
    const parameters = { p_creator_id: accountId, p_upload_id: uploadId, p_lease_token: receipt.lease_token };
    let finalized = await db.rpc("finish_creator_upload", parameters);
    if (finalized.error) finalized = await db.rpc("finish_creator_upload", parameters);
    if (finalized.error || !finalized.data) throw new CreatorUploadError("upload_metadata_error");
  } catch (error) {
    // Keep the object/path and journal for reconciliation. Never erase the
    // only durable reference when a storage or database response is ambiguous.
    await db.from("creator_upload_receipts").update({ lease_until: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", uploadId).eq("creator_account_id", accountId).eq("lease_token", receipt.lease_token);
    throw error;
  }
}
