import { NextRequest, NextResponse } from "next/server";
import { CREATOR_SESSION_COOKIE } from "@/lib/creator-session";
import { creatorDashboardIdentity } from "@/lib/creator-dashboard-identity";
import { serviceClient } from "@/lib/supabase-service";
import { isUploadId } from "@/lib/creator-upload-receipts";

const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
export async function GET(req: NextRequest) {
  const creator = await creatorDashboardIdentity(req.cookies.get(CREATOR_SESSION_COOKIE)?.value);
  if (!creator || creator.readOnly) return reply({ error: "session_expired" }, 401);
  const ids = (req.nextUrl.searchParams.get("ids") || "").split(",").filter(Boolean);
  if (!ids.length || ids.length > 100 || !ids.every(isUploadId)) return reply({ error: "invalid_upload_ids" }, 400);
  const db = serviceClient();
  const [receipts, saved] = await Promise.all([
    db.from("creator_upload_receipts").select("id,state,file_id,lease_until").eq("creator_account_id", creator.accountId).in("id", ids),
    db.from("creator_files").select("id,storage_transfer_status").eq("creator_account_id", creator.accountId).in("id", ids),
  ]);
  if (receipts.error || saved.error) return reply({ error: "status_unavailable" }, 503);
  const verified = new Set((saved.data || []).filter(row => row.storage_transfer_status === "verified").map(row => row.id));
  return reply({ uploads: ids.map(id => {
    const receipt = receipts.data?.find(row => row.id === id);
    const state = ["removed", "removing"].includes(receipt?.state || "") || (receipt?.state === "saved" && !receipt.file_id) ? "removed" : verified.has(id) ? "saved"
      : receipt && Date.parse(receipt.lease_until) > Date.now() ? "processing" : "needs_file";
    return { id, state };
  }) });
}
