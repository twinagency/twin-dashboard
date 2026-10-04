import { NextRequest, NextResponse } from "next/server";
import { CREATOR_SESSION_COOKIE } from "@/lib/creator-session";
import { creatorDashboardIdentity } from "@/lib/creator-dashboard-identity";
import { serviceClient } from "@/lib/supabase-service";
import { activeViewAs } from "@/lib/view-as";
import { CREATOR_FILE_FIELDS, galleryKind, ownedPrivateFile, type CreatorGalleryFile } from "@/lib/creator-file-gallery";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
export async function GET(req: NextRequest) {
  if (await activeViewAs(req.cookies)) return reply({ error: "read_only" }, 403);
  const creator = await creatorDashboardIdentity(req.cookies.get(CREATOR_SESSION_COOKIE)?.value);
  if (!creator || creator.readOnly) return reply({ error: "session_expired" }, 401);
  const kind = req.nextUrl.searchParams.get("kind") || "";
  const page = Number(req.nextUrl.searchParams.get("page") || 0);
  if (!galleryKind(kind) || !Number.isSafeInteger(page) || page < 0 || page > 100) return reply({ error: "invalid_category" }, 400);
  const result = await serviceClient().from("creator_files").select(CREATOR_FILE_FIELDS).eq("creator_account_id", creator.accountId).eq("kind", kind)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).range(page * 50, page * 50 + 50);
  if (result.error) return reply({ error: "gallery_unavailable" }, 503);
  return reply({ files: ((result.data || []) as CreatorGalleryFile[]).slice(0, 50).filter(file => file.creator_account_id === creator.accountId).map(file => ({
    id: file.id, name: file.original_name, bytes: file.size_bytes, mime: file.mime_type, createdAt: file.created_at,
    status: file.storage_transfer_status === "verified" ? "verified" : "unverified",
    previewAvailable: file.storage_transfer_status === "verified" && ownedPrivateFile(file, creator.accountId),
    removalAvailable: !creator.cloneIds.length && !creator.applicationState?.submitted && ownedPrivateFile(file, creator.accountId),
  })), hasMore: (result.data?.length || 0) > 50 });
}
