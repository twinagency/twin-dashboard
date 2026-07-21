"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { isMissingTableError, SEVERITIES, STATUSES, type FeedbackStatus, type FeedbackType } from "./shared";

// Upload a screenshot into the private `media` bucket under a feedback/ prefix,
// reusing the existing bucket + signed-URL pattern. Returns the storage path.
async function uploadScreenshot(file: File): Promise<string> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "screenshot";
  const path = `feedback/${Date.now()}-${safe}`;
  const { error } = await supabaseAdmin.storage
    .from("media")
    .upload(path, bytes, { contentType: file.type || "image/png", upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

// Create a bug report or feature suggestion (operator-submitted). Redirects to the
// queue on success; throws a readable error otherwise (surfaced by the client form).
export async function createFeedback(fd: FormData): Promise<void> {
  const type = String(fd.get("type") ?? "") as FeedbackType;
  if (type !== "bug" && type !== "suggestion") throw new Error("Pick a type (bug or suggestion).");

  const title = String(fd.get("title") ?? "").trim();
  if (!title) throw new Error("Title is required.");

  const body = String(fd.get("body") ?? "").trim() || null;
  const cloneId = String(fd.get("clone_id") ?? "").trim() || null;

  // Severity only applies to bugs.
  let severity: string | null = null;
  if (type === "bug") {
    const s = String(fd.get("severity") ?? "").trim();
    severity = (SEVERITIES as readonly string[]).includes(s) ? s : null;
  }

  // Screenshot: an uploaded file wins; otherwise fall back to a pasted URL.
  let screenshotUrl: string | null = null;
  const file = fd.get("screenshot") as File | null;
  if (file && typeof file.size === "number" && file.size > 0) {
    screenshotUrl = await uploadScreenshot(file);
  } else {
    screenshotUrl = String(fd.get("screenshot_url") ?? "").trim() || null;
  }

  const { error } = await supabaseAdmin.from("feedback_items").insert({
    type,
    title,
    body,
    clone_id: cloneId,
    severity,
    screenshot_url: screenshotUrl,
    source: "operator",
    status: "new",
  });
  if (error) {
    if (isMissingTableError(error)) throw new Error("Apply migration 026 first (feedback_items table is missing).");
    throw new Error(error.message);
  }

  revalidatePath("/feedback");
  redirect("/feedback");
}

// Move an item along the workflow: new → reviewing → building → done.
export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<void> {
  if (!STATUSES.includes(status)) throw new Error("Bad status.");
  const { error } = await supabaseAdmin
    .from("feedback_items")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/feedback");
}

// Short-lived signed URL for a screenshot stored in the private `media` bucket.
// Pasted absolute URLs (http...) are returned as-is.
export async function screenshotSignedUrl(pathOrUrl: string): Promise<string | null> {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const { data, error } = await supabaseAdmin.storage.from("media").createSignedUrl(pathOrUrl, 300);
  if (error) return null;
  return data.signedUrl;
}
