import { NextRequest, NextResponse } from "next/server";
import { CREATOR_SESSION_COOKIE } from "@/lib/creator-session";
import { creatorDashboardIdentity } from "@/lib/creator-dashboard-identity";
import { serviceClient } from "@/lib/supabase-service";
import { trustedFormOrigin } from "@/lib/form-origin";
import { isUploadId } from "@/lib/creator-upload-receipts";
import { refreshCreatorFileProgress } from "@/lib/creator-file-gallery";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (req.headers.has("next-action") || !trustedFormOrigin(req)) return reply({ error: "forbidden" }, 403);
  const creator = await creatorDashboardIdentity(req.cookies.get(CREATOR_SESSION_COOKIE)?.value);
  if (!creator || (creator.readOnly && !creator.contentUploadsAllowed)) return reply({ error: "session_expired" }, 401);
  const { id } = await context.params;
  if (!isUploadId(id)) return reply({ error: "file_not_found" }, 404);
  const db = serviceClient();
  // The transaction reserves removal and rechecks ownership, draft status and
  // downstream use under the same locks as submission/connection/reference writes.
  const claimed = await db.rpc("begin_creator_file_removal", { p_creator_id: creator.accountId, p_file_id: id });
  if (claimed.error || !claimed.data) {
    const reason = claimed.error?.message;
    if (reason === "file_not_found") return reply({ error: "file_not_found" }, 404);
    if (reason === "content_in_use") return reply({ error: "content_in_use", message: "Submitted or connected content requires support review before removal." }, 409);
    return reply({ error: "removal_unavailable" }, 503);
  }
  const file = claimed.data;
  if (file.state === "removed") return reply({ removed: true, progressSaved: await refreshCreatorFileProgress(creator.accountId) });
  if (file.state !== "removing" || file.creator_account_id !== creator.accountId || file.file_id !== id
    || !["onboarding-content", "voice-samples"].includes(file.bucket) || !file.storage_path?.startsWith(`creators/${creator.accountId}/`)) return reply({ error: "removal_unavailable" }, 503);
  // Preserve metadata and the durable reservation until Storage confirms absence.
  // An ambiguous failure can be retried without reconnecting/deleting new content.
  const removed = await db.storage.from(file.bucket).remove([file.storage_path]);
  if (removed.error) return reply({ error: "removal_pending", message: "Removal has not finished. Retry this file's removal before submitting onboarding." }, 503);
  const absent = await db.storage.from(file.bucket).info(file.storage_path);
  if (absent.data || Number((absent.error as { statusCode?: string } | null)?.statusCode) !== 404) return reply({ error: "removal_pending", message: "Storage has not confirmed removal. Retry this file's removal before submitting onboarding." }, 503);
  const finished = await db.rpc("finish_creator_file_removal", { p_creator_id: creator.accountId, p_file_id: id });
  if (finished.error || finished.data !== true) return reply({ error: "removal_pending", message: "The stored file was removed. Retry to finish updating your gallery." }, 503);
  const progressSaved = await refreshCreatorFileProgress(creator.accountId);
  return reply({ removed: true, progressSaved });
}
