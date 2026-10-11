"use server";

import { guardDashboardAction } from "@/lib/agency-management";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { analysePhoto, analyseVideo } from "@/lib/caption";
import type { AnalysisResult } from "@/lib/media-analysis-contract";
import {
  analysisRowFields,
  applyFactEdit,
  completeReviewUpdate,
  insertMediaRowWithFallback,
  isMissingColumnError,
  priceForAnalysis,
  withoutOptionalMediaColumns,
} from "@/lib/media-analysis-row";
import { stripBannedDashes } from "@/lib/media-classification";
import {
  buildSafeRepricePlan,
  requirePhotoBundlePrice,
  isAllowedPaidOrFreePrice,
  MEDIA_TAGS,
  MIN_PAID_MEDIA_PRICE_STARS,
  normalizeSafeCategoryGuide,
  priceFromGuide,
  type RepriceableMediaRow,
  type SafeRepriceChange,
  type SafeRepricePlan,
} from "@/lib/pricing";
import { preparePhotoForTelegram } from "@/lib/photo-prepare";
import { repriceConfirmationPhrase } from "@/lib/reprice-confirmation";
import { mediaStoragePath } from "@/lib/media-storage-path";
import { compressPhoto, compressVideo } from "@/lib/media-compress";
import { makeBlurredPreview, makeStoredVideoPreviewClip, storedPreviewClipPath, storedPreviewPath } from "@/lib/stored-preview";
import { DEFAULT_BLUR, validBlur } from "@/lib/catalogue-core";

const TAG_SET = new Set<string>(MEDIA_TAGS);

export type MediaUploadResult =
  | { ok: true }
  | { ok: false; error: string };

function uploadFailure(error: unknown): MediaUploadResult {
  const message = error instanceof Error && error.message.trim()
    ? error.message.trim()
    : "Upload failed. Please try again.";
  console.error("Media upload failed", error);
  return { ok: false, error: message };
}

function isExistingStorageObject(error: unknown): boolean {
  const value = error as { statusCode?: string | number; message?: string; error?: string } | null;
  const text = `${value?.message ?? ""} ${value?.error ?? ""}`;
  return String(value?.statusCode ?? "") === "409" || /already exists|duplicate/i.test(text);
}

async function uploadContentAddressedMedia(
  path: string,
  bytes: Buffer,
  contentType: string,
): Promise<"created" | "existing"> {
  // Agency sessions deliberately cannot replace Storage objects. These paths
  // are derived from the file bytes, so create-only upload is sufficient: a
  // 409 means this exact content was already written by an earlier attempt.
  const { error } = await supabaseAdmin.storage
    .from("media")
    .upload(path, bytes, { contentType, upsert: false });
  if (!error) return "created";
  if (isExistingStorageObject(error)) return "existing";
  throw new Error(error.message);
}

// The un-compressed bytes exactly as the creator uploaded them, kept forever
// under an `originals/` prefix beside the compressed file that lives at the
// normal `storage_path`. Nothing is ever lost to a bad compression pass; the
// bot only ever reads `storage_path`, so this is invisible to fans. Reuses
// the same create-only helper above rather than a second `.upload()` call
// site, so there is still exactly one place dashboard writes touch Storage.
async function uploadOriginalMedia(path: string, bytes: Buffer, contentType: string): Promise<void> {
  await uploadContentAddressedMedia(`originals/${path}`, bytes, contentType);
}

// Best-effort: the bot has no ffmpeg/sharp of its own, so it cannot blur a
// preview at send time (see lib/stored-preview.ts). This stores a ready-made
// one at upload time so the bot can just send it. A blur failure (bad ffmpeg
// build, corrupt-but-still-Telegram-sendable file, transient error) must
// never block the actual media upload, which is why this is fire-and-log
// rather than awaited-and-thrown. Reuses uploadContentAddressedMedia, the
// same single Storage-write helper as the main file and the original, so
// there is still exactly one `.upload()` call site.
async function cloneBlurStrength(cloneId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("creator_catalogue_settings")
    .select("blur_strength")
    .eq("clone_id", cloneId)
    .maybeSingle();
  return validBlur(data?.blur_strength) ? (data!.blur_strength as number) : DEFAULT_BLUR;
}

async function storePreviewBestEffort(
  cloneId: string,
  path: string,
  bytes: Buffer,
  type: "photo" | "video",
): Promise<void> {
  try {
    const preview = await makeBlurredPreview(bytes, type);
    await uploadContentAddressedMedia(storedPreviewPath(path), preview, "image/jpeg");
  } catch (error) {
    console.warn("Stored preview unavailable; upload continues without it", error);
  }
  // Moving clip, video only. Same fire-and-log discipline: never blocks the
  // upload, and stays a fully separate try/catch from the still preview above
  // so one failing does not take out the other.
  if (type === "video") {
    try {
      const blur = await cloneBlurStrength(cloneId);
      const clip = await makeStoredVideoPreviewClip(bytes, blur);
      await uploadContentAddressedMedia(storedPreviewClipPath(path), clip, "video/mp4");
    } catch (error) {
      console.warn("Stored video preview clip unavailable; upload continues without it", error);
    }
  }
}

// Vision analysis improves matching and automatic pricing, but it must never decide whether an otherwise valid media upload
// is saved. The analysis has its own per-call timeout and a bounded total (lib/caption.ts); here we only guarantee that
// whatever happens becomes a row state: analysed, needs_review, or failed with the error. A failure is never written as
// "checked, clean" (see analysisRowFields) and never throws.
async function safeAnalysis(run: () => Promise<AnalysisResult>, model: string): Promise<AnalysisResult> {
  try {
    return await run();
  } catch (error) {
    console.warn("Media vision analysis unavailable; saving upload as failed", error);
    return { status: "failed", model, provider: null, latencyMs: 0, costUsd: null, error: String((error as Error)?.message ?? error).slice(0, 300), version: 2 };
  }
}

// New columns (visual_description, the analysis_* state, visual_facts, metadata_edited_at) may not exist yet. Mirrors the
// OPTIONAL_COLUMNS / isMissingColumnError retry pattern in app/clones/actions.ts: a write issued before the migration lands
// strips those columns and still succeeds, rather than failing the whole upload or edit.
async function insertMediaRow(table: "photos" | "videos", row: Record<string, unknown>): Promise<void> {
  await insertMediaRowWithFallback(supabaseAdmin, table, row);
}

async function updateMediaRow(table: "photos" | "videos", id: string, cloneId: string, update: Record<string, unknown>): Promise<void> {
  const run = (u: Record<string, unknown>) => supabaseAdmin.from(table).update(u).eq("id", id).eq("clone_id", cloneId);
  let { error } = await run(update);
  if (error && isMissingColumnError(error.message)) ({ error } = await run(withoutOptionalMediaColumns(update)));
  if (error) throw new Error(error.message);
}

// A manual edit of any fact field protects the row from automatic repair (metadata_edited_at) and carries the correction into
// visual_facts, which the bots match on (applyFactEdit). Only a value that actually changed counts, so re-saving an untouched form
// does not, hence the read before the write. analysis_status is never written by an edit: see completeReview.
async function markIfFactsEdited(table: "photos" | "videos", id: string, cloneId: string, update: Record<string, unknown>): Promise<void> {
  const select = (cols: string) => supabaseAdmin.from(table).select(cols).eq("id", id).eq("clone_id", cloneId).maybeSingle();
  let { data, error } = await select("caption, tags, auto_desc, visual_description, explicitness, is_nude, nsfw, visual_facts, analysis_status");
  if (error && isMissingColumnError(error.message)) ({ data, error } = await select("caption, tags, auto_desc, visual_description, explicitness, is_nude, nsfw"));
  if (error && isMissingColumnError(error.message)) ({ data, error } = await select("caption, tags, auto_desc, explicitness, is_nude, nsfw"));
  if (error) throw new Error(error.message);
  applyFactEdit(data as unknown as Record<string, unknown> | null, update);
}

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

// Path builder moved to lib/media-storage-path.ts (content-hash prefix, not
// Date.now()) — see that file for why. Kept as a thin alias here so the three
// call sites below read the same as before.
const storagePath = mediaStoragePath;

// Pull the clone's vision model + category-pricing guide in one read (both needed
// on every upload: one to tag the item, the other to price it from those tags).
async function uploadConfig(cloneId: string): Promise<{ model: string; guide: unknown }> {
  const { data, error } = await supabaseAdmin
    .from("clones")
    .select("vision_model, category_pricing")
    .eq("id", cloneId)
    .maybeSingle();
  if (error) throw new Error(`Could not load creator pricing: ${error.message}`);
  if (!data) throw new Error("Creator not found");
  return { model: data?.vision_model || "qwen/qwen3-vl-235b-a22b-instruct", guide: data?.category_pricing };
}

// Resolve the item's price. If the uploader typed a price, use it verbatim (a
// manual price is NEVER overridden). Otherwise derive it from the operator's
// category-pricing guide + the AI tags. If the guide is empty/missing, fall back
// to the given default so behavior is unchanged. Money is code-locked: the number
// always comes from the operator (their typed price, or their guide, or default).
function manualUploadPrice(fd: FormData): number | null {
  const raw = fd.get("star_value");
  const manual = raw !== null && String(raw).trim() !== "";
  if (manual) {
    const n = Number(raw);
    if (!isAllowedPaidOrFreePrice(n)) {
      throw new Error(`Paid media must cost at least ${MIN_PAID_MEDIA_PRICE_STARS} Stars, or use 0 for free`);
    }
    return n;
  }
  return null;
}

function assertUploadPricingReady(fd: FormData, guide: unknown): void {
  if (manualUploadPrice(fd) !== null) return;
  if (!normalizeSafeCategoryGuide(guide)) {
    throw new Error(`This creator's pricing guide is missing or outdated. Save a complete guide in PPVs, or enter a manual price of ${MIN_PAID_MEDIA_PRICE_STARS} Stars or more.`);
  }
}

function resolvePrice(fd: FormData, analysis: AnalysisResult, guide: unknown): number {
  const manual = manualUploadPrice(fd);
  if (manual !== null) return manual;
  if (!normalizeSafeCategoryGuide(guide)) {
    throw new Error("This creator's pricing guide changed during upload. Save it in PPVs and try again.");
  }
  // Not fully analysed (failed or needs_review) prices at the guide's highest category, never from blank tags.
  const derived = priceForAnalysis(guide, analysis);
  if (derived == null) throw new Error("Could not derive a price from this creator's pricing guide");
  return derived;
}

// ── Upload a single photo ────────────────────────────────────────────────────
export async function uploadPhoto(cloneId: string, fd: FormData): Promise<MediaUploadResult> {
  await guardDashboardAction("app/media/actions.ts#uploadPhoto", [cloneId, fd]);
  try {
  const file = fd.get("file") as File | null;
  if (!file) throw new Error("no file");

  // Convert any format (HEIC, PNG, WebP, etc.) → JPEG, then gate on what
  // Telegram will actually accept: size AND dimensions. This runs before the
  // storage upload and before the row insert on purpose. A photo past
  // Telegram's dimension limits is refused by sendPaidMedia every time
  // (PHOTO_INVALID_DIMENSIONS), so admitting one would put an item in the
  // library that can never be sold, however it is priced.
  const raw = Buffer.from(await file.arrayBuffer());
  // Standardize size/orientation/quality first (lib/media-compress.ts — max
  // 2560 long side, quality 85, metadata stripped), then run the existing
  // Telegram-sendability gate on the RESULT. Order matters: preparePhotoForTelegram
  // is the real gate (assertPhotoSendable) and must be the last thing that
  // touches the bytes before they're hashed and stored, so a compressed photo
  // can never bypass it. In the common case the compressed photo is already
  // well inside Telegram's limits, so this second pass is a no-op re-encode.
  const compressed = await compressPhoto(raw);
  const jpeg = await preparePhotoForTelegram(compressed.bytes);
  const { model, guide } = await uploadConfig(cloneId);
  assertUploadPricingReady(fd, guide);

  const baseName = file.name.replace(/\.[^.]+$/, "");
  const path = storagePath(cloneId, "photos", baseName + ".jpg", jpeg);

  const storageResult = await uploadContentAddressedMedia(path, jpeg, "image/jpeg");
  if (compressed.changed) await uploadOriginalMedia(path, raw, file.type || "application/octet-stream");
  await storePreviewBestEffort(cloneId, path, jpeg, "photo");
  if (storageResult === "existing") {
    const { data: existingPhoto, error: existingError } = await supabaseAdmin
      .from("photos")
      .select("id")
      .eq("clone_id", cloneId)
      .eq("storage_path", path)
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existingPhoto) {
      revalidatePath("/media");
      return { ok: true };
    }
  }

  // Best-effort INTERNAL analysis only. A model outage must not reject a valid
  // upload, and the fan-facing message is generated later from the live chat.
  const analysis = await safeAnalysis(() => analysePhoto(jpeg, model), model);

  // Price from the operator's guide via the AI tags (manual price wins if set; an unanalysed item prices conservatively).
  const starValue = resolvePrice(fd, analysis, guide);
  const imageName = String(fd.get("image_name") ?? "").trim() || file.name;

  await insertMediaRow("photos", {
    clone_id: cloneId,
    storage_path: path,
    // The analysis columns: facts, flags, tags, descriptions, the legacy send caption (null unless analysed) and the
    // analysis_* state. A failed analysis is marked failed, never written as "clean".
    ...analysisRowFields(analysis),
    // New uploads never persist a generic customer-facing line. The bot builds the outgoing caption from the current
    // conversation when it sends media.
    teaser_caption: null,
    star_value: starValue,
    // 0 stars is always free. The bot only ever treats an item as unlocked via
    // is_free (flows/media.ts), never by price, so a 0-priced item must carry
    // it too or the runtime would try to invoice a 0-star payment.
    is_free: fd.get("is_free") === "true" || starValue <= 0,
    image_name: imageName,
  });

  revalidatePath("/media");
    return { ok: true };
  } catch (error) {
    return uploadFailure(error);
  }
}

// ── Upload a single video ────────────────────────────────────────────────────
export async function uploadVideo(cloneId: string, fd: FormData): Promise<MediaUploadResult> {
  await guardDashboardAction("app/media/actions.ts#uploadVideo", [cloneId, fd]);
  try {
  const file = fd.get("file") as File | null;
  if (!file) throw new Error("no file");

  const raw = Buffer.from(await file.arrayBuffer());
  // Compress before the size gate, not after: this is the whole point (a
  // 45MB 4K phone clip re-encodes to H.264/1280p/CRF23 and easily clears the
  // cap it would otherwise blow through). See lib/media-compress.ts for the
  // skip condition that leaves an already-compliant file untouched.
  const compressedVideo = await compressVideo(raw);
  const bytes = compressedVideo.bytes;
  if (bytes.byteLength > VIDEO_MAX_BYTES) throw new Error(`Video too large (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB) even after compression. Telegram max is 50 MB.`);
  const { model, guide } = await uploadConfig(cloneId);
  assertUploadPricingReady(fd, guide);

  const path = storagePath(cloneId, "videos", file.name, bytes);

  const contentType = compressedVideo.changed ? "video/mp4" : (file.type || "video/mp4");
  const storageResult = await uploadContentAddressedMedia(path, bytes, contentType);
  if (compressedVideo.changed) await uploadOriginalMedia(path, raw, file.type || "application/octet-stream");
  await storePreviewBestEffort(cloneId, path, bytes, "video");
  if (storageResult === "existing") {
    const { data: existingVideo, error: existingError } = await supabaseAdmin
      .from("videos")
      .select("id")
      .eq("clone_id", cloneId)
      .eq("storage_path", path)
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existingVideo) {
      revalidatePath("/media");
      return { ok: true };
    }
  }

  // Best-effort INTERNAL analysis only. See the matching photo path above.
  const analysis = await safeAnalysis(() => analyseVideo(bytes, model), model);
  // Price from the operator's guide via the AI tags (manual price wins if set; an unanalysed item prices conservatively).
  const starValue = resolvePrice(fd, analysis, guide);

  await insertMediaRow("videos", {
    clone_id: cloneId,
    storage_path: path,
    ...analysisRowFields(analysis),
    teaser_caption: null,
    star_value: starValue,
    // 0 stars is always free, see the matching comment in uploadPhoto.
    is_free: fd.get("is_free") === "true" || starValue <= 0,
  });

  revalidatePath("/media");
    return { ok: true };
  } catch (error) {
    return uploadFailure(error);
  }
}

// ── Update photo metadata ───────────────────────────────────────────────────
export async function updatePhoto(
  cloneId: string,
  photoId: string,
  fd: FormData,
) {
  await guardDashboardAction("app/media/actions.ts#updatePhoto", [cloneId, photoId, fd]);
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
  // The operator's correction of the facts the bots read (same dash rule as the upload); only sent when the row has the column.
  if (fd.has("visual_description")) update.visual_description = stripBannedDashes(String(fd.get("visual_description") ?? "")) || null;
  await markIfFactsEdited("photos", photoId, cloneId, update);
  await updateMediaRow("photos", photoId, cloneId, update);
  revalidatePath("/media");
}

// ── Update video metadata ───────────────────────────────────────────────────
export async function updateVideo(
  cloneId: string,
  videoId: string,
  fd: FormData,
) {
  await guardDashboardAction("app/media/actions.ts#updateVideo", [cloneId, videoId, fd]);
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
  if (fd.has("visual_description")) update.visual_description = stripBannedDashes(String(fd.get("visual_description") ?? "")) || null;
  await markIfFactsEdited("videos", videoId, cloneId, update);
  await updateMediaRow("videos", videoId, cloneId, update);
  revalidatePath("/media");
}

// ── Mark a needs_review item as reviewed ─────────────────────────────────────
// The ONLY way a needs_review item becomes analysed (so matchable and trusted by the bots). Edits never do it. Deliberately has no
// missing-column fallback: if the analysis columns are not migrated there is nothing to approve, and a silent no-op would lie.
export async function completeReview(cloneId: string, id: string, kind: "photo" | "video") {
  await guardDashboardAction("app/media/actions.ts#completeReview", [cloneId, id, kind]);
  const table = kind === "photo" ? "photos" : kind === "video" ? "videos" : null;
  if (!table) throw new Error("Invalid media type");
  const { data, error } = await supabaseAdmin.from(table).select("analysis_status, visual_facts").eq("id", id).eq("clone_id", cloneId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Item not found");
  const update = completeReviewUpdate(data as unknown as Record<string, unknown>);
  // Guarded on the status read above: a concurrent change makes this a no-op error rather than an approval of something else.
  const { data: done, error: writeError } = await supabaseAdmin.from(table).update(update).eq("id", id).eq("clone_id", cloneId)
    .eq("analysis_status", "needs_review").select("id");
  if (writeError) throw new Error(writeError.message);
  if (!done?.length) throw new Error("The item changed while you were reviewing it. Reload and try again.");
  revalidatePath("/media");
}

// ── Delete photo ─────────────────────────────────────────────────────────────
export async function deletePhoto(cloneId: string, photoId: string, storagePath: string) {
  await guardDashboardAction("app/media/actions.ts#deletePhoto", [cloneId, photoId, storagePath]);
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
  await guardDashboardAction("app/media/actions.ts#deleteVideo", [cloneId, videoId, storagePath]);
  await supabaseAdmin.storage.from("media").remove([storagePath]);
  const { error } = await supabaseAdmin
    .from("videos")
    .delete()
    .eq("id", videoId)
    .eq("clone_id", cloneId);
  if (error) throw new Error(error.message);
  revalidatePath("/media");
}

// ── Bulk media edits ─────────────────────────────────────────────────────────
// The browser submits only selected row ids. Every database operation also
// scopes itself to clone_id, so a stale selection cannot affect another
// creator's PPVs.
type BulkMediaType = "photos" | "videos";

function selectedMediaIds(ids: string[]): string[] {
  const unique = [...new Set(ids.filter((id) => typeof id === "string" && id.trim() !== ""))];
  if (!unique.length) throw new Error("Select at least one item first");
  return unique;
}

function revalidateMediaPages(cloneId: string, includesPhotos = false) {
  revalidatePath("/media");
  revalidatePath(`/clones/${cloneId}`);
  if (includesPhotos) revalidatePath("/flows");
}

// Zero is the one deliberate free-content value. The live media flow uses
// is_free to decide whether an item is unlocked, so bulk repricing keeps the
// two values in sync.
export async function bulkSetMediaPrice(
  cloneId: string,
  type: BulkMediaType,
  mediaIds: string[],
  starValue: number,
): Promise<number> {
  await guardDashboardAction("app/media/actions.ts#bulkSetMediaPrice", [cloneId, type, mediaIds, starValue]);
  const ids = selectedMediaIds(mediaIds);
  if (!isAllowedPaidOrFreePrice(starValue)) {
    throw new Error(`Price must be 0 for free, or a whole number of at least ${MIN_PAID_MEDIA_PRICE_STARS} Stars`);
  }

  const { data, error } = await supabaseAdmin
    .from(type)
    .update({ star_value: starValue, is_free: starValue <= 0 })
    .eq("clone_id", cloneId)
    .in("id", ids)
    .select("id");
  if (error) throw new Error(error.message);

  revalidateMediaPages(cloneId);
  return data?.length ?? 0;
}

// Permanently removes the private storage files and their matching rows. Storage
// paths are read from the clone-scoped database query, never trusted from the
// browser. Photos also clear a selected free-preview reference.
export async function bulkDeleteMedia(
  cloneId: string,
  type: BulkMediaType,
  mediaIds: string[],
): Promise<number> {
  await guardDashboardAction("app/media/actions.ts#bulkDeleteMedia", [cloneId, type, mediaIds]);
  const ids = selectedMediaIds(mediaIds);
  const { data: rows, error: readError } = await supabaseAdmin
    .from(type)
    .select("id, storage_path")
    .eq("clone_id", cloneId)
    .in("id", ids);
  if (readError) throw new Error(readError.message);

  const selected = (rows ?? []) as { id: string; storage_path: string }[];
  if (!selected.length) throw new Error("None of those selected items belong to this creator");

  const { error: storageError } = await supabaseAdmin.storage
    .from("media")
    .remove(selected.map((row) => row.storage_path));
  if (storageError) throw new Error(storageError.message);

  const resolvedIds = selected.map((row) => row.id);
  const { error: deleteError } = await supabaseAdmin
    .from(type)
    .delete()
    .eq("clone_id", cloneId)
    .in("id", resolvedIds);
  if (deleteError) throw new Error(deleteError.message);

  if (type === "photos") {
    const { error: previewError } = await supabaseAdmin
      .from("clones")
      .update({ onboarding_free_preview_media_id: null })
      .eq("id", cloneId)
      .in("onboarding_free_preview_media_id", resolvedIds);
    if (previewError) throw new Error(previewError.message);
  }

  revalidateMediaPages(cloneId, type === "photos");
  return resolvedIds.length;
}

// ── Create bundle ────────────────────────────────────────────────────────────
export async function createBundle(cloneId: string, fd: FormData): Promise<string> {
  await guardDashboardAction("app/media/actions.ts#createBundle", [cloneId, fd]);
  const name = String(fd.get("name") ?? "").trim();
  if (!name) throw new Error("name required");
  // Validate before the welcome-bundle demotion below. An invalid price must
  // not make any database change, even when the form marks this as onboarding.
  const starPrice = requirePhotoBundlePrice(fd.get("star_price"));

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
    star_price: starPrice,
    is_onboarding: isOnboarding,
  }).select("id").single();
  if (error) throw new Error(error.message);
  revalidatePath("/media");
  return data.id;
}

// ── Update bundle (name / caption / price / welcome) ─────────────────────────
export async function updateBundle(cloneId: string, bundleId: string, fd: FormData) {
  await guardDashboardAction("app/media/actions.ts#updateBundle", [cloneId, bundleId, fd]);
  const name = String(fd.get("name") ?? "").trim();
  if (!name) throw new Error("name required");
  // Keep the guard ahead of every write, including demoting another welcome
  // bundle, so a rejected form leaves the creator's current state untouched.
  const starPrice = requirePhotoBundlePrice(fd.get("star_price"));

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
      star_price: starPrice,
      is_onboarding: isOnboarding,
    })
    .eq("id", bundleId)
    .eq("clone_id", cloneId);
  if (error) throw new Error(error.message);
  revalidatePath("/media");
}

// ── Delete bundle ────────────────────────────────────────────────────────────
export async function deleteBundle(cloneId: string, bundleId: string) {
  await guardDashboardAction("app/media/actions.ts#deleteBundle", [cloneId, bundleId]);
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
  await guardDashboardAction("app/media/actions.ts#addBundleItem", [bundleId, cloneId, fd]);
  const file = fd.get("file") as File | null;
  if (!file) throw new Error("no file");

  const raw = Buffer.from(await file.arrayBuffer());
  // Bundle items are paid media too (sendPaidPhotoGroup), so they get the same
  // normalization as single photos. One oversized item must not make the whole
  // bundle unsendable.
  const bytes = await preparePhotoForTelegram(raw);
  const baseName = file.name.replace(/\.[^.]+$/, "");
  const path = storagePath(cloneId, "photos", baseName + ".jpg", bytes);

  const storageResult = await uploadContentAddressedMedia(path, bytes, "image/jpeg");
  if (storageResult === "existing") {
    const { data: existingItem, error: existingError } = await supabaseAdmin
      .from("photo_bundle_items")
      .select("id")
      .eq("bundle_id", bundleId)
      .eq("storage_path", path)
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existingItem) {
      revalidatePath("/media");
      return;
    }
  }

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
  await guardDashboardAction("app/media/actions.ts#removeBundleItem", [cloneId, itemId, storagePath]);
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
  await guardDashboardAction("app/media/actions.ts#getSignedUrl", [path]);
  const { data, error } = await supabaseAdmin.storage
    .from("media")
    .createSignedUrl(path, 300); // 5 min
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// ── Category pricing guide (moved here from Config/Money — lives with the
// media it prices, per-clone) ───────────────────────────────────────────────
export async function updateCategoryPricing(cloneId: string, guide: Record<string, number>) {
  await guardDashboardAction("app/media/actions.ts#updateCategoryPricing", [cloneId, guide]);
  const safeGuide = normalizeSafeCategoryGuide(guide);
  if (!safeGuide) {
    throw new Error(`Every category price must be a whole number of at least ${MIN_PAID_MEDIA_PRICE_STARS} Stars`);
  }
  const { data, error } = await supabaseAdmin
    .from("clones")
    .update({ category_pricing: safeGuide })
    .eq("id", cloneId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Creator not found");
  revalidatePath("/media");
}

// ── Guarded reprice preview + apply ──────────────────────────────────────────
// The apply action recomputes the preview and requires the exact confirmation
// phrase, so a stale browser or a direct server-action call cannot skip review.
export type RepriceTarget = "photos" | "videos" | "all";
type RepriceTable = "photos" | "videos";

export type RepricePreview = {
  target: RepriceTarget;
  total: number;
  changes: number;
  unchanged: number;
  protectedFree: number;
  protectedFromDecrease: number;
  increaseStars: number;
  confirmationPhrase: string;
  byType: Record<RepriceTable, { total: number; changes: number }>;
};

type LoadedRepricePlan = RepricePreview & {
  rows: Record<RepriceTable, SafeRepriceChange[]>;
};

function assertRepriceTarget(target: string): asserts target is RepriceTarget {
  if (target !== "photos" && target !== "videos" && target !== "all") {
    throw new Error("Invalid reprice target");
  }
}

function publicPlan(
  target: RepriceTarget,
  photos: SafeRepricePlan,
  videos: SafeRepricePlan,
  confirmationPhrase: string,
): RepricePreview {
  const changes = photos.changes.length + videos.changes.length;
  return {
    target,
    total: photos.total + videos.total,
    changes,
    unchanged: photos.unchanged + videos.unchanged,
    protectedFree: photos.protectedFree + videos.protectedFree,
    protectedFromDecrease: photos.protectedFromDecrease + videos.protectedFromDecrease,
    increaseStars: photos.increaseStars + videos.increaseStars,
    confirmationPhrase,
    byType: {
      photos: { total: photos.total, changes: photos.changes.length },
      videos: { total: videos.total, changes: videos.changes.length },
    },
  };
}

async function loadRepriceRows(table: RepriceTable, cloneId: string, included: boolean): Promise<RepriceableMediaRow[]> {
  if (!included) return [];
  const { data, error } = await supabaseAdmin
    .from(table)
    .select("id, tags, nsfw, star_value, is_free")
    .eq("clone_id", cloneId);
  if (error) throw new Error(`Could not preview ${table}: ${error.message}`);
  return (data ?? []) as RepriceableMediaRow[];
}

async function loadRepricePlan(cloneId: string, target: RepriceTarget): Promise<LoadedRepricePlan> {
  assertRepriceTarget(target);
  const { data: clone, error } = await supabaseAdmin
    .from("clones")
    .select("category_pricing")
    .eq("id", cloneId)
    .maybeSingle();
  if (error) throw new Error(`Could not load pricing guide: ${error.message}`);
  if (!clone) throw new Error("Creator not found");
  const guide = normalizeSafeCategoryGuide((clone as { category_pricing?: unknown }).category_pricing);
  if (!guide) {
    throw new Error(`Save a complete pricing guide with every category at ${MIN_PAID_MEDIA_PRICE_STARS} Stars or more before repricing`);
  }

  const [photoRows, videoRows] = await Promise.all([
    loadRepriceRows("photos", cloneId, target === "photos" || target === "all"),
    loadRepriceRows("videos", cloneId, target === "videos" || target === "all"),
  ]);
  const photos = buildSafeRepricePlan(photoRows, guide);
  const videos = buildSafeRepricePlan(videoRows, guide);
  const rows = { photos: photos.changes, videos: videos.changes };
  const confirmationPhrase = repriceConfirmationPhrase({ cloneId, target, guide, changes: rows });
  return {
    ...publicPlan(target, photos, videos, confirmationPhrase),
    rows,
  };
}

export async function previewRepriceMedia(cloneId: string, target: RepriceTarget): Promise<RepricePreview> {
  await guardDashboardAction("app/media/actions.ts#previewRepriceMedia", [cloneId, target]);
  const { rows: _rows, ...preview } = await loadRepricePlan(cloneId, target);
  return preview;
}

export async function repriceMedia(
  cloneId: string,
  target: RepriceTarget,
  confirmationPhrase: string,
): Promise<{ photos: number; videos: number; skippedConcurrent: number; failed: number }> {
  await guardDashboardAction("app/media/actions.ts#repriceMedia", [cloneId, target, confirmationPhrase]);
  const plan = await loadRepricePlan(cloneId, target);
  if (!plan.changes) throw new Error("There are no safe price changes to apply");
  if (confirmationPhrase !== plan.confirmationPhrase) {
    throw new Error(`Confirmation changed. Preview again and type ${plan.confirmationPhrase}`);
  }

  const result = { photos: 0, videos: 0, skippedConcurrent: 0, failed: 0 };
  for (const table of ["photos", "videos"] as const) {
    for (const change of plan.rows[table]) {
      // Optimistic guards stop a concurrent manual edit or free toggle from
      // being overwritten after the preview was shown.
      const { data, error } = await supabaseAdmin
        .from(table)
        .update({ star_value: change.nextPrice, is_free: false })
        .eq("id", change.id)
        .eq("clone_id", cloneId)
        .eq("star_value", change.currentPrice)
        .eq("is_free", false)
        .select("id");
      if (error) {
        result.failed++;
        continue;
      }
      if (data?.length !== 1) {
        result.skippedConcurrent++;
        continue;
      }
      result[table]++;
    }
  }

  revalidatePath("/media");
  revalidatePath(`/clones/${cloneId}`);
  return result;
}
