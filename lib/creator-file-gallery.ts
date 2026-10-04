import { isAnyCreatorContentKind, creatorContentCompleted } from "./creator-content-requirements";
import { serviceClient } from "./supabase-service";

export type CreatorGalleryFile = { id: string; creator_account_id: string; kind: string; bucket: string; storage_path: string; original_name: string; mime_type: string; size_bytes: number; storage_transfer_status: string | null; created_at: string };
export const CREATOR_FILE_FIELDS = "id,creator_account_id,kind,bucket,storage_path,original_name,mime_type,size_bytes,storage_transfer_status,created_at";
export function galleryKind(kind: string) { return kind === "voice" || isAnyCreatorContentKind(kind); }
export function ownedPrivateFile(file: CreatorGalleryFile, accountId: string) {
  return file.creator_account_id === accountId && galleryKind(file.kind)
    && file.bucket === (file.kind === "voice" ? "voice-samples" : "onboarding-content")
    && file.storage_path.startsWith(`creators/${accountId}/`) && !file.storage_path.split("/").some(part => part === ".." || part === ".");
}
/** Reservations are private owner-scoped state, never raw object paths. */
export async function creatorFileRemovalStates(accountId: string, fileIds: string[]) {
  if (!fileIds.length) return { states: new Map<string, string>(), error: false };
  const result = await serviceClient().from("creator_file_removals").select("file_id,state")
    .eq("creator_account_id", accountId).in("file_id", fileIds);
  return { states: new Map<string, string>((result.data || []).map(row => [row.file_id, row.state])), error: !!result.error };
}
export async function refreshCreatorFileProgress(accountId: string) {
  const db = serviceClient();
  const progress = await db.from("creator_onboarding_progress").select("content_completed,voice_completed").eq("creator_account_id", accountId).maybeSingle();
  if (progress.error) return false;
  const rows: { kind: string; storage_transfer_status: string | null }[] = [];
  for (let start = 0; start <= 5000; start += 500) {
    const batch = await db.from("creator_files").select("kind,storage_transfer_status").eq("creator_account_id", accountId).order("id").range(start, start + 499);
    if (batch.error) return false;
    rows.push(...(batch.data || []));
    if ((batch.data?.length || 0) < 500) break;
    if (start === 5000) return false;
  }
  const now = new Date().toISOString();
  const result = await db.from("creator_onboarding_progress").upsert({ creator_account_id: accountId,
    content_completed: creatorContentCompleted(rows, !!progress.data?.content_completed),
    voice_completed: !!progress.data?.voice_completed || (rows).some(file => file.kind === "voice" && file.storage_transfer_status === "verified"), updated_at: now }, { onConflict: "creator_account_id" });
  return !result.error;
}
