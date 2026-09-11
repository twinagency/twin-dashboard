import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { CREATOR_SESSION_COOKIE } from "@/lib/creator-session";
import { creatorDashboardIdentity } from "@/lib/creator-dashboard-identity";
import { creatorRequestUrl } from "@/lib/creator-origin";
import { CREATOR_PORTAL_COOKIE, creatorLoginPath } from "@/lib/creator-routing";

function back(req: Request, status: string, step?: "content" | "voice") {
  const url = creatorRequestUrl(req, "/creator/onboarding");
  url.searchParams.set("status", status);
  if (step) url.searchParams.set("step", step);
  url.hash = "step-result";
  return NextResponse.redirect(url, 303);
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "upload";
}

export async function POST(req: NextRequest) {
  const creator = await creatorDashboardIdentity(req.cookies.get(CREATOR_SESSION_COOKIE)?.value);
  if (!creator) return NextResponse.redirect(creatorRequestUrl(req, creatorLoginPath(null, req.cookies.get(CREATOR_PORTAL_COOKIE)?.value)), 303);
  if (creator.readOnly) return new NextResponse("Creator demo is read-only", { status: 403 });
  const accountId = creator.accountId;

  const form = await req.formData();
  const kind = String(form.get("kind") || "");
  if (kind !== "content" && kind !== "voice") return back(req, "upload_error");
  const files = form.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
  if (!files.length) return back(req, "upload_empty", kind);
  if (files.length > 25) return back(req, "upload_too_many", kind);

  const maxBytes = kind === "voice" ? 100 * 1024 * 1024 : 250 * 1024 * 1024;
  const bucket = kind === "voice" ? "voice-samples" : "onboarding-content";
  const now = new Date().toISOString();

  for (const file of files) {
    if (file.size > maxBytes) return back(req, "upload_too_large", kind);
    const objectPath = `creators/${accountId}/${kind}/${Date.now()}-${randomUUID()}-${safeName(file.name)}`;
    const body = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await supabaseAdmin.storage.from(bucket).upload(objectPath, body, {
      contentType: file.type || "application/octet-stream",
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) return back(req, "upload_error", kind);

    const { error: rowError } = await supabaseAdmin.from("creator_files").insert({
      creator_account_id: accountId,
      kind,
      bucket,
      storage_path: objectPath,
      mime_type: file.type || null,
      size_bytes: file.size,
      original_name: file.name,
      storage_transfer_status: "verified",
      storage_verified_at: now,
      source_object_status: "present",
      source_object_checked_at: now,
    });
    if (rowError) {
      await supabaseAdmin.storage.from(bucket).remove([objectPath]);
      return back(req, "upload_error", kind);
    }
  }

  const patch = kind === "content" ? { content_completed: true, updated_at: now } : { voice_completed: true, updated_at: now };
  const { error: progressError } = await supabaseAdmin.from("creator_onboarding_progress").upsert({ creator_account_id: accountId, ...patch }, { onConflict: "creator_account_id" });
  if (progressError) return back(req, "upload_error", kind);
  return back(req, kind === "content" ? "content_saved" : "voice_saved", kind);
}
