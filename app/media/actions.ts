"use server";

import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { captionPhoto, captionVideo, type Caption } from "@/lib/caption";
import { priceFromGuide, MEDIA_TAGS } from "@/lib/pricing";
import { assertPhotoSendable } from "@/lib/photo-guard";

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

// Photo size AND dimensions are both enforced by assertPhotoSendable (see
// lib/photo-guard.ts), which owns the byte ceiling too, so there is one gate
// rather than a byte check here and a dimension check somewhere else.
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

  // Convert any format (HEIC, PNG, WebP, etc.) → JPEG, then gate on what
  // Telegram will actually accept: size AND dimensions. This runs before the
  // storage upload and before the row insert on purpose. A photo past
  // Telegram's dimension limits is refused by sendPaidMedia every time
  // (PHOTO_INVALID_DIMENSIONS), so admitting one would put an item in the
  // library that can never be sold, however it is priced.
  const raw = Buffer.from(await file.arrayBuffer());
  const jpeg = await sharp(raw).jpeg({ quality: 90 }).toBuffer();
  await assertPhotoSendable(jpeg);

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
    // 0 stars is always free. The bot only ever treats an item as unlocked via
    // is_free (flows/media.ts), never by price, so a 0-priced item must carry
    // it too or the runtime would try to invoice a 0-star payment.
    is_free: fd.get("is_free") === "true" || starValue <= 0,
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
    // 0 stars is always free, see the matching comment in uploadPhoto.
    is_free: fd.get("is_free") === "true" || starValue <= 0,
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
  const starValue = Number(fd.get("star_value") ?? 25);
  const update: Record<string, unknown> = {
    caption: String(fd.get("caption") ?? "").trim() || null,
    teaser_caption: String(fd.get("teaser_caption") ?? "").trim() || null,
    star_value: starValue,
    image_name: String(fd.get("image_name") ?? "").trim() || null,
  };
  // 0 stars is always free, see the matching comment in uploadPhoto.
  if (fd.has("is_free")) update.is_free = fd.get("is_free") === "true" || starValue <= 0;
  else if (starValue <= 0) update.is_free = true;
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
  const starValue = Number(fd.get("star_value") ?? 50);
  const update: Record<string, unknown> = {
    caption: String(fd.get("caption") ?? "").trim() || null,
    teaser_caption: String(fd.get("teaser_caption") ?? "").trim() || null,
    star_value: starValue,
  };
  // 0 stars is always free, see the matching comment in uploadPhoto.
  if (fd.has("is_free")) update.is_free = fd.get("is_free") === "true" || starValue <= 0;
  else if (starValue <= 0) update.is_free = true;
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
  // BUG 5: never leave the onboarding free preview pointing at a deleted photo.
  // The bot picks that one photo and only that one (runFreePreview in
  // ../bot/src/onboarding.ts). A dangling reference means the preview can never
  // land, which used to freeze every fan mid-onboarding forever: credits pinned,
  // paywall suppressed, nothing in the logs. The bot now ends onboarding rather
  // than freezing, so this is no longer a money bug, but leaving the reference
  // dangling still silently switches the free preview off with no sign in the UI.
  // Scoped to this clone AND this photo id, so it can only ever clear its own.
  const { error: refErr } = await supabaseAdmin
    .from("clones")
    .update({ onboarding_free_preview_media_id: null })
    .eq("id", cloneId)
    .eq("onboarding_free_preview_media_id", photoId);
  if (refErr) throw new Error(refErr.message);
  revalidatePath("/media");
  revalidatePath("/flows");
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
  // Bundle items are paid media too (sendPaidPhotoGroup), so they get the same
  // gate as a single photo. One oversized item makes the whole bundle unsendable.
  await assertPhotoSendable(bytes);

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

// ── Category pricing guide (moved here from Config/Money — lives with the
// media it prices, per-clone) ───────────────────────────────────────────────
export async function updateCategoryPricing(cloneId: string, guide: Record<string, number>) {
  const { error } = await supabaseAdmin.from("clones").update({ category_pricing: guide }).eq("id", cloneId);
  if (error) throw new Error(error.message);
  revalidatePath("/media");
}

// ── Reprice existing media from the CURRENT guide ────────────────────────────
// Same derivation new uploads use (priceFromGuide, see lib/pricing.ts), just
// run backwards over rows that already exist instead of at upload time. A
// changed guide only ever affected future uploads before this; this is what
// makes it retroactive. Manual price edits are NOT protected here on purpose:
// "reprice" means what it says, every item in scope gets recomputed. Rows
// whose tags don't match anything in the guide keep their price (priceFromGuide
// returns the sfw floor in that case, never null, so this only skips a row
// when the guide itself is unusable).
async function repriceTable(table: "photos" | "videos", cloneId: string, guide: unknown): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select("id, tags, nsfw")
    .eq("clone_id", cloneId);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { id: string; tags: string[] | null; nsfw: boolean | null }[];
  let updated = 0;
  for (const row of rows) {
    const price = priceFromGuide(guide, row.tags ?? [], !!row.nsfw);
    if (price == null) continue;
    const { error: updErr } = await supabaseAdmin
      .from(table)
      .update({ star_value: price, is_free: price <= 0 })
      .eq("id", row.id);
    if (updErr) throw new Error(updErr.message);
    updated++;
  }
  return updated;
}

export async function repriceMedia(cloneId: string, target: "photos" | "videos" | "all"): Promise<{ photos: number; videos: number }> {
  const { data: clone, error } = await supabaseAdmin.from("clones").select("category_pricing").eq("id", cloneId).maybeSingle();
  if (error) throw new Error(error.message);
  const guide = (clone as { category_pricing?: unknown } | null)?.category_pricing;
  const result = { photos: 0, videos: 0 };
  if (target === "photos" || target === "all") result.photos = await repriceTable("photos", cloneId, guide);
  if (target === "videos" || target === "all") result.videos = await repriceTable("videos", cloneId, guide);
  revalidatePath("/media");
  return result;
}
