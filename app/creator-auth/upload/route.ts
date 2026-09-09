import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { CREATOR_SESSION_COOKIE, verifyCreatorSession } from "@/lib/creator-session";

function back(req: Request, status: string) {
  const url = new URL("/creator/onboarding", req.url);
  url.searchParams.set("status", status);
  return NextResponse.redirect(url, 303);
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "upload";
}

export async function POST(req: Request) {
  const session = await verifyCreatorSession((await cookies()).get(CREATOR_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.redirect(new URL("/creator/login", req.url), 303);

  const form = await req.formData();
  const kind = String(form.get("kind") || "");
  if (kind !== "content" && kind !== "voice") return back(req, "upload_error");
  const files = form.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
  if (!files.length) return back(req, "upload_empty");
  if (files.length > 25) return back(req, "upload_too_many");

  const maxBytes = kind === "voice" ? 100 * 1024 * 1024 : 250 * 1024 * 1024;
  const bucket = kind === "voice" ? "voice-samples" : "onboarding-content";
  const now = new Date().toISOString();

  for (const file of files) {
    if (file.size > maxBytes) return back(req, "upload_too_large");
    const objectPath = `creators/${session.accountId}/${kind}/${Date.now()}-${randomUUID()}-${safeName(file.name)}`;
    const body = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await supabaseAdmin.storage.from(bucket).upload(objectPath, body, {
      contentType: file.type || "application/octet-stream",
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) return back(req, "upload_error");

    const { error: rowError } = await supabaseAdmin.from("creator_files").insert({
      creator_account_id: session.accountId,
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
      return back(req, "upload_error");
    }
  }

  const patch = kind === "content" ? { content_completed: true, updated_at: now } : { voice_completed: true, updated_at: now };
  await supabaseAdmin.from("creator_onboarding_progress").upsert({ creator_account_id: session.accountId, ...patch }, { onConflict: "creator_account_id" });
  return back(req, kind === "content" ? "content_saved" : "voice_saved");
}
