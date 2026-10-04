import { NextRequest, NextResponse } from "next/server";
import { CREATOR_SESSION_COOKIE } from "@/lib/creator-session";
import { creatorDashboardIdentity } from "@/lib/creator-dashboard-identity";
import { serviceClient } from "@/lib/supabase-service";
import { activeViewAs } from "@/lib/view-as";
import { trustedFormOrigin } from "@/lib/form-origin";
import { isUploadId } from "@/lib/creator-upload-receipts";
import { CREATOR_FILE_FIELDS, ownedPrivateFile, creatorFileRemovalAllowed, refreshCreatorFileProgress, type CreatorGalleryFile } from "@/lib/creator-file-gallery";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (req.headers.has("next-action") || !trustedFormOrigin(req)) return reply({ error: "forbidden" }, 403);
  if (await activeViewAs(req.cookies)) return reply({ error: "read_only" }, 403);
  const creator = await creatorDashboardIdentity(req.cookies.get(CREATOR_SESSION_COOKIE)?.value);
  if (!creator || creator.readOnly) return reply({ error: "session_expired" }, 401);
  const { id } = await context.params;
  if (!isUploadId(id)) return reply({ error: "file_not_found" }, 404);
  const db = serviceClient();
  const result = await db.from("creator_files").select(CREATOR_FILE_FIELDS).eq("creator_account_id", creator.accountId).eq("id", id).maybeSingle();
  if (result.error) return reply({ error: "removal_unavailable" }, 503);
  const file = result.data as CreatorGalleryFile | null;
  if (!file) return reply({ removed: true });
  if (!ownedPrivateFile(file, creator.accountId)) return reply({ error: "file_not_found" }, 404);
  if (!(await creatorFileRemovalAllowed(file, creator))) return reply({ error: "content_in_use", message: "Submitted or connected content requires support review before removal." }, 409);
  // Remove the object with the authorized Storage API first. Keep its metadata
  // until storage confirms success, including when retrying partial failures.
  const removed = await db.storage.from(file.bucket).remove([file.storage_path]);
  if (removed.error) return reply({ error: "storage_removal_failed" }, 503);
  const marked = await db.from("creator_files").update({ storage_transfer_status: "failed", source_object_status: "missing", source_object_checked_at: new Date().toISOString() }).eq("creator_account_id", creator.accountId).eq("id", id);
  if (marked.error) return reply({ error: "removal_pending", message: "The stored file was removed. Retry to finish updating your gallery." }, 503);
  const journal = await db.from("creator_upload_receipts").update({ state: "removed", lease_until: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("creator_account_id", creator.accountId).eq("id", id);
  if (journal.error) return reply({ error: "removal_pending", message: "The stored file was removed. Retry to finish updating your gallery." }, 503);
  const deleted = await db.from("creator_files").delete().eq("creator_account_id", creator.accountId).eq("id", id);
  if (deleted.error) return reply({ error: "removal_pending", message: "The stored file was removed. Retry to finish updating your gallery." }, 503);
  const progressSaved = await refreshCreatorFileProgress(creator.accountId);
  return reply({ removed: true, progressSaved });
}
