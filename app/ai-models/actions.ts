"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { guardDashboardAction } from "@/lib/agency-management";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { isAuthed } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase-service";
import { compressPhoto } from "@/lib/media-compress";
import { makeBlurredPreview } from "@/lib/stored-preview";
import { IMAGE_MAX_MB, VIDEO_MAX_MB, PERSONA_KEYS, showBlocker, slugify, uploadKind, validPrice, validatePersona } from "@/lib/ai-models";

// Admin only, same pattern as app/tsocial/actions.ts: guard first, then a null (non agency, non creator) access AND a real admin session.
// Storage: ai-private holds every original. ai-public holds only what a fan may see without paying: an approved Free file, or the blurred
// preview of an approved Locked one. Pending and rejected files never have a public copy.
const PRIVATE = "ai-private", PUBLIC = "ai-public";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireAdmin() {
  if ((await getDashboardAccess()) !== null || !(await isAuthed())) throw new Error("Admin access required");
}
function uuid(v: unknown): string {
  if (typeof v !== "string" || !UUID.test(v)) throw new Error("Invalid request");
  return v;
}
const refresh = (id?: string) => { revalidatePath("/ai-models"); if (id) revalidatePath(`/ai-models/${id}`); };
const tablesGone = (e: { message?: string; code?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /ai_models|ai_model_images/.test(e.message ?? ""));
const nice = (e: { message?: string; code?: string }) => (tablesGone(e) ? "The AI model tables are not created yet (apply migration 20261008140000_ai_models.sql first)" : "Could not save");

async function putObject(bucket: string, path: string, bytes: Buffer, contentType: string) {
  const sb = serviceClient();
  let { error } = await sb.storage.from(bucket).upload(path, bytes, { contentType, upsert: true });
  if (error && /bucket not found/i.test(error.message)) { // first upload ever: create the bucket, then retry once
    await sb.storage.createBucket(bucket, { public: bucket === PUBLIC });
    ({ error } = await sb.storage.from(bucket).upload(path, bytes, { contentType, upsert: true }));
  }
  if (error) throw new Error(`Upload failed: ${error.message}`);
}
async function removeObjects(bucket: string, paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => !!p);
  if (!list.length) return;
  // A failed remove must not be read as removed: callers go on to record "no copy" (public_path null) or delete the row.
  const { error } = await serviceClient().storage.from(bucket).remove(list);
  if (error) throw new Error(`Could not remove the stored file: ${error.message}`);
}

type ImgRow = { id: string; model_id: string; kind: "photo" | "video"; storage_path: string; public_path: string | null; status: string; access: string; price_stars: number | null };
async function loadImage(id: string): Promise<ImgRow> {
  const { data, error } = await serviceClient().from("ai_model_images").select("id,model_id,kind,storage_path,public_path,status,access,price_stars").eq("id", id).maybeSingle();
  if (error || !data) throw new Error("Image not found");
  return data as ImgRow;
}
/** Make the public bucket match the image's state: approved Free = the file, approved Locked = blurred preview, anything else = nothing. */
async function syncPublic(img: ImgRow): Promise<string | null> {
  const sb = serviceClient();
  const want = img.status === "approved" ? img.access : null;
  const ext = img.kind === "video" ? (img.storage_path.endsWith(".webm") ? "webm" : "mp4") : "jpg";
  const freePath = `${img.model_id}/${img.id}.${ext}`, blurPath = `${img.model_id}/${img.id}.blur.jpg`;
  const keep = want === "free" ? freePath : want === "locked" ? blurPath : null;
  const stale = [freePath, blurPath].filter((p) => p !== keep);
  if (keep) {
    const dl = await sb.storage.from(PRIVATE).download(img.storage_path);
    if (dl.error || !dl.data) throw new Error("Original file is missing");
    const bytes = Buffer.from(await dl.data.arrayBuffer());
    if (want === "free") await putObject(PUBLIC, freePath, bytes, img.kind === "video" ? (ext === "webm" ? "video/webm" : "video/mp4") : "image/jpeg");
    else await putObject(PUBLIC, blurPath, await makeBlurredPreview(bytes, img.kind), "image/jpeg");
  }
  await removeObjects(PUBLIC, stale);
  const { error } = await sb.from("ai_model_images").update({ public_path: keep }).eq("id", img.id);
  if (error) throw new Error(nice(error));
  return keep;
}

export async function createAiModel(fd: FormData) {
  await guardDashboardAction("app/ai-models/actions.ts#createAiModel", [fd]);
  await requireAdmin();
  const name = String(fd.get("name") ?? "").replace(/[\u2014\u2013]/g, ",").trim().slice(0, 40);
  const slug = slugify(name);
  if (!name || !slug) throw new Error("Give her a name");
  const { data, error } = await serviceClient().from("ai_models").insert({ name, slug: `${slug}-ai`, status: "draft", tsocial_enabled: false, chat_vars: { NAME: name } }).select("id").single();
  if (error || !data) throw new Error(error?.code === "23505" ? "A model with that name already exists" : nice(error ?? {}));
  refresh();
  redirect(`/ai-models/${data.id}`);
}

export async function savePersona(modelId: string, fd: FormData) {
  await guardDashboardAction("app/ai-models/actions.ts#savePersona", [modelId, fd]);
  await requireAdmin();
  uuid(modelId);
  const input: Record<string, unknown> = { name: fd.get("name"), tagline: fd.get("tagline"), about: fd.get("about"), consent_note: fd.get("consent_note") };
  for (const k of PERSONA_KEYS) input[k] = fd.get(k);
  const r = validatePersona(input);
  if (!r.ok) throw new Error(r.error);
  const { error } = await serviceClient().from("ai_models").update({ name: r.name, tagline: r.tagline, about: r.about, consent_note: r.consent, chat_vars: r.vars }).eq("id", modelId);
  if (error) throw new Error(nice(error));
  refresh(modelId);
}

export async function setShowInTSocial(modelId: string, on: boolean) {
  await guardDashboardAction("app/ai-models/actions.ts#setShowInTSocial", [modelId, on]);
  await requireAdmin();
  uuid(modelId);
  if (typeof on !== "boolean") throw new Error("Invalid request");
  const sb = serviceClient();
  if (on) {
    const [m, imgs] = await Promise.all([
      sb.from("ai_models").select("chat_vars").eq("id", modelId).maybeSingle(),
      sb.from("ai_model_images").select("status,access,public_path").eq("model_id", modelId),
    ]);
    if (m.error || !m.data) throw new Error(nice(m.error ?? {}));
    const why = showBlocker((m.data.chat_vars ?? {}) as Record<string, string>, (imgs.data ?? []) as { status: string; access: string; public_path: string | null }[]);
    if (why) throw new Error(why);
  }
  const { error } = await sb.from("ai_models").update(on ? { tsocial_enabled: true, status: "active" } : { tsocial_enabled: false }).eq("id", modelId);
  if (error) throw new Error(nice(error));
  refresh(modelId);
}

export async function uploadAiMedia(modelId: string, fd: FormData) {
  await guardDashboardAction("app/ai-models/actions.ts#uploadAiMedia", [modelId, fd]);
  await requireAdmin();
  uuid(modelId);
  const access = fd.get("access") === "locked" ? "locked" : "free";
  let price: number | null = null;
  if (access === "locked") { price = validPrice(fd.get("price")); if (price == null) throw new Error("Locked pics need a price in Stars, 1 to 10000"); }
  const files = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) throw new Error("Choose at least one file");
  if (files.length > 20) throw new Error("20 files at a time");
  const sb = serviceClient();
  const { data: model, error: merr } = await sb.from("ai_models").select("id").eq("id", modelId).maybeSingle();
  if (merr || !model) throw new Error(nice(merr ?? {}));
  let done = 0;
  for (const file of files) {
    const k = uploadKind(file.type, file.name);
    if (!k) throw new Error(`${file.name}: only jpg, png, webp, heic, mp4, mov or webm`);
    if (file.size > (k.kind === "video" ? VIDEO_MAX_MB : IMAGE_MAX_MB) * 1024 * 1024) throw new Error(`${file.name}: too big (max ${k.kind === "video" ? VIDEO_MAX_MB : IMAGE_MAX_MB} MB)`);
    let bytes = Buffer.from(await file.arrayBuffer());
    if (k.kind === "photo") bytes = Buffer.from((await compressPhoto(bytes)).bytes); // same standardising step as the media library: jpeg, 2560px max, metadata stripped
    const id = randomUUID();
    const path = `${modelId}/${id}.${k.ext}`;
    await putObject(PRIVATE, path, bytes, k.contentType);
    const { error } = await sb.from("ai_model_images").insert({ id, model_id: modelId, kind: k.kind, storage_path: path, status: "pending", access, price_stars: price });
    if (error) { await removeObjects(PRIVATE, [path]); throw new Error(nice(error)); }
    done++;
  }
  refresh(modelId);
  return { uploaded: done };
}

/** One photo straight in as her profile pic: approved, Free (public copy made), set as profile_image_id. */
export async function uploadProfilePhoto(modelId: string, fd: FormData) {
  await guardDashboardAction("app/ai-models/actions.ts#uploadProfilePhoto", [modelId, fd]);
  await requireAdmin();
  uuid(modelId);
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a photo");
  const k = uploadKind(file.type, file.name);
  if (!k || k.kind !== "photo") throw new Error("Profile photo must be a jpg, png, webp or heic");
  if (file.size > IMAGE_MAX_MB * 1024 * 1024) throw new Error(`Too big (max ${IMAGE_MAX_MB} MB)`);
  const sb = serviceClient();
  const { data: model, error: merr } = await sb.from("ai_models").select("id").eq("id", modelId).maybeSingle();
  if (merr || !model) throw new Error(nice(merr ?? {}));
  const bytes = Buffer.from((await compressPhoto(Buffer.from(await file.arrayBuffer()))).bytes);
  const id = randomUUID();
  const path = `${modelId}/${id}.${k.ext}`;
  await putObject(PRIVATE, path, bytes, k.contentType);
  const { error } = await sb.from("ai_model_images").insert({ id, model_id: modelId, kind: "photo", storage_path: path, status: "approved", access: "free", price_stars: null });
  if (error) { await removeObjects(PRIVATE, [path]); throw new Error(nice(error)); }
  await syncPublic({ id, model_id: modelId, kind: "photo", storage_path: path, public_path: null, status: "approved", access: "free", price_stars: null });
  const { error: perr } = await sb.from("ai_models").update({ profile_image_id: id }).eq("id", modelId);
  if (perr) throw new Error(nice(perr));
  refresh(modelId);
}

export async function setImageStatus(imageId: string, status: "approved" | "rejected" | "pending") {
  await guardDashboardAction("app/ai-models/actions.ts#setImageStatus", [imageId, status]);
  await requireAdmin();
  uuid(imageId);
  if (!["approved", "rejected", "pending"].includes(status)) throw new Error("Invalid request");
  const img = await loadImage(imageId);
  if (status === "approved" && img.access === "locked" && validPrice(img.price_stars) == null) throw new Error("Set a price first");
  const { error } = await serviceClient().from("ai_model_images").update({ status }).eq("id", imageId);
  if (error) throw new Error(nice(error));
  await syncPublic({ ...img, status });
  if (status !== "approved") await serviceClient().from("ai_models").update({ profile_image_id: null }).eq("id", img.model_id).eq("profile_image_id", imageId);
  refresh(img.model_id);
}

export async function setImageAccess(imageId: string, access: "free" | "locked", price: number | null) {
  await guardDashboardAction("app/ai-models/actions.ts#setImageAccess", [imageId, access, price]);
  await requireAdmin();
  uuid(imageId);
  if (access !== "free" && access !== "locked") throw new Error("Invalid request");
  let stars: number | null = null;
  if (access === "locked") { stars = validPrice(price); if (stars == null) throw new Error("Locked pics need a price in Stars, 1 to 10000"); }
  const img = await loadImage(imageId);
  const { error } = await serviceClient().from("ai_model_images").update({ access, price_stars: stars }).eq("id", imageId);
  if (error) throw new Error(nice(error));
  await syncPublic({ ...img, access, price_stars: stars });
  if (access === "locked") await serviceClient().from("ai_models").update({ profile_image_id: null }).eq("id", img.model_id).eq("profile_image_id", imageId);
  refresh(img.model_id);
}

export async function setProfilePic(modelId: string, imageId: string) {
  await guardDashboardAction("app/ai-models/actions.ts#setProfilePic", [modelId, imageId]);
  await requireAdmin();
  uuid(modelId); uuid(imageId);
  const img = await loadImage(imageId);
  if (img.model_id !== modelId || img.status !== "approved" || img.access !== "free" || img.kind !== "photo") throw new Error("Profile pic must be an approved Free photo");
  const { error } = await serviceClient().from("ai_models").update({ profile_image_id: imageId }).eq("id", modelId);
  if (error) throw new Error(nice(error));
  refresh(modelId);
}

export async function deleteAiImage(imageId: string) {
  await guardDashboardAction("app/ai-models/actions.ts#deleteAiImage", [imageId]);
  await requireAdmin();
  uuid(imageId);
  const img = await loadImage(imageId);
  // Deleting the row cascades to ai_model_purchases, so an unknown count (error or null) refuses, it never reads as 0.
  const { count, error: cerr } = await serviceClient().from("ai_model_purchases").select("id", { count: "exact", head: true }).eq("image_id", imageId);
  if (cerr || count == null) throw new Error("Could not check whether a fan bought this one, nothing was deleted");
  if (count > 0) throw new Error("A fan bought this one, reject it instead of deleting");
  await removeObjects(PRIVATE, [img.storage_path]);
  await removeObjects(PUBLIC, [`${img.model_id}/${img.id}.jpg`, `${img.model_id}/${img.id}.mp4`, `${img.model_id}/${img.id}.webm`, `${img.model_id}/${img.id}.blur.jpg`]);
  const { error } = await serviceClient().from("ai_model_images").delete().eq("id", imageId);
  if (error) throw new Error(nice(error));
  refresh(img.model_id);
}
