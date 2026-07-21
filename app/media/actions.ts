"use server";

import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { captionPhoto, captionVideo, type Caption } from "@/lib/caption";
import { priceFromGuide, MEDIA_TAGS } from "@/lib/pricing";

const TAG_SET = new Set<string>(MEDIA_TAGS);

// Parse a comma-joined tags field from the edit form into a clean, deduped array
// of known-vocabulary tags (invalid/unknown tags dropped, same as auto-tagging).
function parseTags(raw: FormDataEntryValue | null): string[] {
  return [
    ...new Set(
      String(raw ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t && TAG_SET.has(t)),
    ),
  ];
}

const PHOTO_MAX_BYTES = 9.5 * 1024 * 1024; // Telegram photo limit is 10MB — stay under
const VIDEO_MAX_BYTES = 49 * 1024 * 1024;  // Telegram video limit is 50MB

function storagePath(cloneId: string, type: "photos" | "videos", filename: string) {
  return `${cloneId}/${type}/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}

// Pull the clone's vision model + category-pricing guide in one read (both needed
// on every upload: one to tag the item, the other to price it from those tags).
async function uploadConfig(cloneId: string): Promise<{ model: string; guide: unknown }> {
  const { data } = await supabaseAdmin
    .from("clones")
    .select("vision_model, category_pricing")
    .eq("id", cloneId)
    .maybeSingle();
  return { model: data?.vision_model || "qwen/qwen2.5-vl-72b-instruct", guide: data?.category_pricing };
}

// Resolve the item's price. If the uploader typed a price, use it verbatim (a
// manual price is NEVER overridden). Otherwise derive it from the operator's
// category-pricing guide + the AI tags. If the guide is empty/missing, fall back
// to the given default so behavior is unchanged. Money is code-locked: the number
// always comes from the operator (their typed price, or their guide, or default).
function resolvePrice(fd: FormData, cap: Caption, guide: unknown, fallback: number): number {
  const raw = fd.get("star_value");
  const manual = raw !== null && String(raw).trim() !== "";
  if (manual) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  const derived = priceFromGuide(guide, cap.tags, cap.nsfw);
  return derived ?? fallback;
}

// ── Upload a single photo ────────────────────────────────────────────────────
export async function uploadPhoto(cloneId: string, fd: FormData) {
  const file = fd.get("file") as File | null;
  if (!file) throw new Error("no file");

  // Convert any format (HEIC, PNG, WebP, etc.) → JPEG and enforce Telegram's 10MB limit
  const raw = Buffer.from(await file.arrayBuffer());
  const jpeg = await sharp(raw).jpeg({ quality: 90 }).toBuffer();
  if (jpeg.byteLength > PHOTO_MAX_BYTES) throw new Error(`Photo too large after conversion (${(jpeg.byteLength / 1024 / 1024).toFixed(1)} MB). Telegram max is 10 MB.`);

  const baseName = file.name.replace(/\.[^.]+$/, "");
  const path = storagePath(cloneId, "photos", baseName + ".jpg");

  const { error: upErr } = await supabaseAdmin.storage
    .from("media")
    .upload(path, jpeg, { contentType: "image/jpeg", upsert: false });
  if (upErr) throw new Error(upErr.message);

  // AI caption + auto-tags in the backend (caption + teaser + nudity + tags/nsfw).
  const { model, guide } = await uploadConfig(cloneId);
  const cap = await captionPhoto(jpeg, model);

  // Price from the operator's guide via the AI tags (manual price wins if set).
  const starValue = resolvePrice(fd, cap, guide, 25);
  const imageName = String(fd.get("image_name") ?? "").trim() || file.name;

  const { error: dbErr } = await supabaseAdmin.from("photos").insert({
    clone_id: cloneId,
    storage_path: path,
    caption: cap.caption || null,
    teaser_caption: cap.teaser_caption || null,
    is_nude: cap.is_nude,
    explicitness: cap.explicitness,
    nsfw: cap.nsfw,
    tags: cap.tags,
    auto_desc: cap.auto_desc || null,
    star_value: starValue,
    is_free: fd.get("is_free") === "true",
    image_name: imageName,
  });
  if (dbErr) throw new Error(dbErr.message);

  revalidatePath("/media");
}

// ── Upload a single video ────────────────────────────────────────────────────
export async function uploadVideo(cloneId: string, fd: FormData) {
  const file = fd.get("file") as File | null;
  if (!file) throw new Error("no file");

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength > VIDEO_MAX_BYTES) throw new Error(`Video too large (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB). Telegram max is 50 MB.`);

  const path = storagePath(cloneId, "videos", file.name);

  const { error: upErr } = await supabaseAdmin.storage
    .from("media")
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (upErr) throw new Error(upErr.message);

  // AI caption + auto-tags from one extracted frame (caption + teaser + tags/nsfw).
  const { model, guide } = await uploadConfig(cloneId);
  const cap = await captionVideo(bytes, model);
  // Price from the operator's guide via the AI tags (manual price wins if set).
  const starValue = resolvePrice(fd, cap, guide, 50);

  const { error: dbErr } = await supabaseAdmin.from("videos").insert({
    clone_id: cloneId,
    storage_path: path,
    caption: cap.caption || null,
    teaser_caption: cap.teaser_caption || null,
    is_nude: cap.is_nude,
    explicitness: cap.explicitness,
    nsfw: cap.nsfw,
    tags: cap.tags,
    auto_desc: cap.auto_desc || null,
    star_value: starValue,
    is_free: fd.get("is_free") === "true",
  });
  if (dbErr) throw new Error(dbErr.message);

  revalidatePath("/media");
}

// ── Update photo metadata ───────────────────────────────────────────────────
export async function updatePhoto(
  cloneId: string,
  photoId: string,
  fd: FormData,
) {
  const update: Record<string, unknown> = {
    caption: String(fd.get("caption") ?? "").trim() || null,
    teaser_caption: String(fd.get("teaser_caption") ?? "").trim() || null,
    star_value: Number(fd.get("star_value") ?? 25),
    image_name: String(fd.get("image_name") ?? "").trim() || null,
  };
  if (fd.has("is_free")) update.is_free = fd.get("is_free") === "true";
  if (fd.has("is_nude")) update.is_nude = fd.get("is_nude") === "true";
  if (fd.has("explicitness")) update.explicitness = String(fd.get("explicitness"));
  // Manual tag edits overwrite the AI auto-tags (empty string clears them).
  if (fd.has("tags")) update.tags = parseTags(fd.get("tags"));
  if (fd.has("auto_desc")) update.auto_desc = String(fd.get("auto_desc") ?? "").trim() || null;
  const { error } = await supabaseAdmin
    .from("photos")
    .update(update)
    .eq("id", photoId)
    .eq("clone_id", cloneId);
  if (error) throw new Error(error.message);
  revalidatePath("/media");
}

// ── Update video metadata ───────────────────────────────────────────────────
export async function updateVideo(
  cloneId: string,
  videoId: string,
  fd: FormData,
) {
  const update: Record<string, unknown> = {
    caption: String(fd.get("caption") ?? "").trim() || null,
    teaser_caption: String(fd.get("teaser_caption") ?? "").trim() || null,
    star_value: Number(fd.get("star_value") ?? 50),
  };
  if (fd.has("is_free")) update.is_free = fd.get("is_free") === "true";
  if (fd.has("is_nude")) update.is_nude = fd.get("is_nude") === "true";
  if (fd.has("explicitness")) update.explicitness = String(fd.get("explicitness"));
  // Manual tag edits overwrite the AI auto-tags (empty string clears them).
  if (fd.has("tags")) update.tags = parseTags(fd.get("tags"));
  if (fd.has("auto_desc")) update.auto_desc = String(fd.get("auto_desc") ?? "").trim() || null;
  const { error } = await supabaseAdmin
    .from("videos")
    .update(update)
    .eq("id", videoId)
    .eq("clone_id", cloneId);
  if (error) throw new Error(error.message);
  revalidatePath("/media");
}

// ── Delete photo ─────────────────────────────────────────────────────────────
export async function deletePhoto(cloneId: string, photoId: string, storagePath: string) {
  await supabaseAdmin.storage.from("media").remove([storagePath]);
  const { error } = await supabaseAdmin
    .from("photos")
    .delete()
    .eq("id", photoId)
    .eq("clone_id", cloneId);
  if (error) throw new Error(error.message);
  revalidatePath("/media");
}

// ── Delete video ─────────────────────────────────────────────────────────────
export async function deleteVideo(cloneId: string, videoId: string, storagePath: string) {
  await supabaseAdmin.storage.from("media").remove([storagePath]);
  const { error } = await supabaseAdmin
    .from("videos")
    .delete()
    .eq("id", videoId)
    .eq("clone_id", cloneId);
  if (error) throw new Error(error.message);
  revalidatePath("/media");
}

// ── Create bundle ────────────────────────────────────────────────────────────
export async function createBundle(cloneId: string, fd: FormData): Promise<string> {
  const name = String(fd.get("name") ?? "").trim();
  if (!name) throw new Error("name required");

  const isOnboarding = fd.get("is_onboarding") === "on";
  // Only ONE welcome bundle per clone — demote any existing one first.
  if (isOnboarding) {
    await supabaseAdmin
      .from("photo_bundles")
      .update({ is_onboarding: false })
      .eq("clone_id", cloneId)
      .eq("is_onboarding", true);
  }

  const { data, error } = await supabaseAdmin.from("photo_bundles").insert({
    clone_id: cloneId,
    name,
    caption: String(fd.get("caption") ?? "").trim() || null,
    star_price: Number(fd.get("star_price") ?? 99),
    is_onboarding: isOnboarding,
  }).select("id").single();
  if (error) throw new Error(error.message);
  revalidatePath("/media");
  return data.id;
}

// ── Update bundle (name / caption / price / welcome) ─────────────────────────
export async function updateBundle(cloneId: string, bundleId: string, fd: FormData) {
  const name = String(fd.get("name") ?? "").trim();
  if (!name) throw new Error("name required");

  const isOnboarding = fd.get("is_onboarding") === "on";
  // Only ONE welcome bundle per clone — demote any OTHER welcome bundle first.
  if (isOnboarding) {
    await supabaseAdmin
      .from("photo_bundles")
      .update({ is_onboarding: false })
      .eq("clone_id", cloneId)
      .eq("is_onboarding", true)
      .neq("id", bundleId);
  }

  const { error } = await supabaseAdmin
    .from("photo_bundles")
    .update({
      name,
      caption: String(fd.get("caption") ?? "").trim() || null,
      star_price: Number(fd.get("star_price") ?? 99),
      is_onboarding: isOnboarding,
    })
    .eq("id", bundleId)
    .eq("clone_id", cloneId);
  if (error) throw new Error(error.message);
  revalidatePath("/media");
}

// ── Delete bundle ────────────────────────────────────────────────────────────
export async function deleteBundle(cloneId: string, bundleId: string) {
  // items + storage paths — fetch first
  const { data: items } = await supabaseAdmin
    .from("photo_bundle_items")
    .select("storage_path")
    .eq("bundle_id", bundleId);

  if (items?.length) {
    await supabaseAdmin.storage.from("media").remove(items.map((i: any) => i.storage_path));
  }

  const { error } = await supabaseAdmin
    .from("photo_bundles")
    .delete()
    .eq("id", bundleId)
    .eq("clone_id", cloneId);
  if (error) throw new Error(error.message);
  revalidatePath("/media");
}

// ── Add photo to bundle ──────────────────────────────────────────────────────
export async function addBundleItem(bundleId: string, cloneId: string, fd: FormData) {
  const file = fd.get("file") as File | null;
  if (!file) throw new Error("no file");

  const path = storagePath(cloneId, "photos", file.name);
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabaseAdmin.storage
    .from("media")
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (upErr) throw new Error(upErr.message);

  const { data: existing } = await supabaseAdmin
    .from("photo_bundle_items")
    .select("sort_order")
    .eq("bundle_id", bundleId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

  const { error: dbErr } = await supabaseAdmin.from("photo_bundle_items").insert({
    bundle_id: bundleId,
    storage_path: path,
    sort_order: nextOrder,
  });
  if (dbErr) throw new Error(dbErr.message);
  revalidatePath("/media");
}

// ── Remove bundle item ───────────────────────────────────────────────────────
export async function removeBundleItem(cloneId: string, itemId: string, storagePath: string) {
  await supabaseAdmin.storage.from("media").remove([storagePath]);
  const { error } = await supabaseAdmin
    .from("photo_bundle_items")
    .delete()
    .eq("id", itemId);
  if (error) throw new Error(error.message);
  revalidatePath("/media");
}

// ── Get signed preview URL (short-lived, private bucket) ────────────────────
export async function getSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from("media")
    .createSignedUrl(path, 300); // 5 min
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
