"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { guardDashboardAction } from "@/lib/agency-management";
import { mtDb } from "@/lib/mtproto/db";
import { requireUuid, validateCaps } from "@/lib/mtproto/validate";
import { createDryRun, getRun, queueRun } from "@/lib/mtproto/runs";
import { parseMediaBundleCampaign, sameMediaBundleCampaign } from "@/lib/mtproto/media-campaign";
import { readMp4Dims } from "@/lib/mtproto/mp4-dims";
import { preparePhotoForTelegram } from "@/lib/photo-prepare";

export type CampaignAsset = {
  path: string; sha256: string; kind: "photo" | "video";
  width?: number; height?: number; durationSeconds?: number;
};
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : "Campaign action failed" });
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

async function checkCreator(cloneId: string) {
  requireUuid(cloneId, "creator");
  const { data, error } = await mtDb().from("clones").select("id,status").eq("id", cloneId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.status !== "active") throw new Error("Choose an active creator");
}

/** Each request uploads one file, under the existing 50 MB action limit. */
export async function uploadCampaignAsset(cloneId: string, uploadId: string, preview: boolean, fd: FormData): Promise<Result<CampaignAsset>> {
  await guardDashboardAction("app/mtproto-campaign/media/actions.ts#uploadCampaignAsset", [cloneId]);
  try {
    await checkCreator(cloneId);
    requireUuid(uploadId, "upload");
    if (typeof preview !== "boolean") throw new Error("Invalid upload role");
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size || file.size > 49 * 1024 * 1024) throw new Error("Choose a file smaller than 49 MB");
    let bytes: Buffer = Buffer.from(await file.arrayBuffer());
    const isVideo = bytes.length > 12 && bytes.toString("ascii", 4, 8) === "ftyp";
    if (preview && !isVideo) throw new Error("The free preview must be an MP4 video");
    const dims = isVideo ? readMp4Dims(bytes) : null;
    if (isVideo && (!dims || dims.duration <= 0 || dims.duration > 3600 || dims.width > 8192 || dims.height > 8192)) throw new Error("This MP4 has no readable video dimensions or duration");
    if (!isVideo) bytes = await preparePhotoForTelegram(bytes);
    const hash = sha(bytes);
    const path = preview ? `${cloneId}/${hash}.mp4` : `${cloneId}/campaigns/${uploadId}/${hash}.${isVideo ? "mp4" : "jpg"}`;
    const bucket = preview ? "reengage-media" : "media";
    const { error } = await mtDb().storage.from(bucket).upload(path, bytes, { contentType: isVideo ? "video/mp4" : "image/jpeg", upsert: false });
    if (error) {
      // A retry may find the same content-addressed object. Never overwrite it.
      const existing = await mtDb().storage.from(bucket).download(path);
      if (existing.error || !existing.data || sha(Buffer.from(await existing.data.arrayBuffer())) !== hash) throw new Error(error.message);
    }
    return { ok: true, value: { path, sha256: hash, kind: isVideo ? "video" : "photo",
      ...(dims ? { width: dims.width, height: dims.height, durationSeconds: dims.duration } : {}) } };
  } catch (e) { return fail(e); }
}

export async function createMediaCampaign(input: {
  id: string; cloneId: string; name: string; previews: CampaignAsset[]; paid: CampaignAsset[];
  segment: "lapsed_buyers" | "all_silent"; allowRecontact: boolean;
  previewCaption: string; paidCaption: string; starPrice: number; dailyCap: number; runCap: number | null;
}): Promise<Result<{ id: string }>> {
  await guardDashboardAction("app/mtproto-campaign/media/actions.ts#createMediaCampaign", [input.cloneId]);
  try {
    requireUuid(input.id, "campaign");
    await checkCreator(input.cloneId);
    validateCaps({ dailyCap: input.dailyCap, runCap: input.runCap, holdoutPct: 0 });
    if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 200) throw new Error("Enter a campaign name (up to 200 characters)");
    if (typeof input.allowRecontact !== "boolean") throw new Error("Choose the recontact setting");
    if (input.segment !== "lapsed_buyers" && input.segment !== "all_silent") throw new Error("Choose a supported audience");
    if (!Array.isArray(input.previews) || input.previews.length < 1 || input.previews.length > 10 || input.previews.some(a => a.kind !== "video")) throw new Error("Choose 1 to 10 free MP4 videos");
    if (!Array.isArray(input.paid) || input.paid.length < 1 || input.paid.length > 10 || input.paid.some(a => a.kind !== "photo" && a.kind !== "video")) throw new Error("Choose 1 to 10 paid files");
    if (input.previews.some(f => input.paid.some(p => p.sha256 === f.sha256))) throw new Error("The paid bundle cannot include a free preview");
    const campaign = parseMediaBundleCampaign({ version: 1, cloneId: input.cloneId, kind: "video", caption: input.previewCaption,
      assets: input.previews.map((a, index) => ({ id: `${input.id}-${index}`, sha256: a.sha256, width: a.width, height: a.height, durationSeconds: a.durationSeconds })),
      bundle: { id: input.id, caption: input.paidCaption, starPrice: input.starPrice, itemPaths: input.paid.map(a => a.path) },
    }, input.cloneId);
    if (input.previews.some(a => a.path !== `${input.cloneId}/${a.sha256}.mp4`)
      || input.paid.some(a => !a.path.startsWith(`${input.cloneId}/campaigns/${input.id}/`))) throw new Error("Files belong to another campaign");
    const previous = await getRun(input.id);
    if (previous) {
      if (!sameMediaBundleCampaign(previous.photoCampaign, campaign, input.cloneId)
        || previous.allowRecontact !== input.allowRecontact || previous.filters.segment !== input.segment || previous.dailyCap !== input.dailyCap || previous.runCap !== input.runCap) throw new Error("This campaign was already created with different content");
      if (previous.status === "draft") await queueRun(previous.id, "operator");
      return { ok: true, value: { id: previous.id } };
    }
    // Re-read the private objects. Browser-provided hashes/metadata cannot
    // grant access to unrelated files or create an offer for missing media.
    for (const [index, asset] of [...input.previews, ...input.paid].entries()) {
      const { data, error } = await mtDb().storage.from(index < input.previews.length ? "reengage-media" : "media").download(asset.path);
      if (error || !data) throw new Error("An uploaded file is missing. Upload it again.");
      if (!data.size || data.size > 49 * 1024 * 1024) throw new Error("Uploaded file exceeds the size limit");
      const bytes = Buffer.from(await data.arrayBuffer());
      if (sha(bytes) !== asset.sha256 || !asset.path.endsWith(`/${asset.sha256}.${asset.kind === "video" ? "mp4" : "jpg"}`)) throw new Error("Uploaded file changed");
      if (asset.kind === "video") {
        const dims = readMp4Dims(bytes);
        if (!dims || dims.width !== asset.width || dims.height !== asset.height || dims.duration !== asset.durationSeconds) throw new Error("Video metadata changed");
      }
    }
    const db = mtDb();
    const existing = await db.from("photo_bundles").select("id,clone_id,caption,star_price,campaign_only").eq("id", input.id).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) {
      if (existing.data.clone_id !== input.cloneId || existing.data.caption !== campaign.bundle.caption || existing.data.star_price !== campaign.bundle.starPrice || !existing.data.campaign_only) throw new Error("Bundle already exists with different details");
    } else {
      const { error } = await db.from("photo_bundles").insert({ id: input.id, clone_id: input.cloneId, name: input.name.trim(), caption: campaign.bundle.caption,
        star_price: campaign.bundle.starPrice, is_onboarding: false, campaign_only: true });
      if (error) throw new Error(error.message);
    }
    const items = await db.from("photo_bundle_items").select("storage_path,sort_order").eq("bundle_id", input.id).order("sort_order");
    if (items.error) throw new Error(items.error.message);
    if (items.data?.length) {
      if (JSON.stringify(items.data.map(a => a.storage_path)) !== JSON.stringify(campaign.bundle.itemPaths)) throw new Error("Bundle files changed");
    } else {
      const { error } = await db.from("photo_bundle_items").insert(campaign.bundle.itemPaths.map((path, index) => ({ bundle_id: input.id, storage_path: path, sort_order: index })));
      if (error) throw new Error(error.message);
    }
    const run = await createDryRun({ id: input.id, createdBy: "operator", cloneIds: [input.cloneId], filters: { segment: input.segment, includeLegacy: true },
      dailyCap: input.dailyCap, runCap: input.runCap, holdoutPct: 0, allowRecontact: input.allowRecontact, note: input.name.trim(), photoCampaign: campaign });
    await queueRun(run.id, "operator");
    revalidatePath("/mtproto-campaign");
    return { ok: true, value: { id: run.id } };
  } catch (e) { return fail(e); }
}
