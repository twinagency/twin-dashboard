// Server-only data layer for the Mini App rollout board (app/miniapp-rollout)
// and scripts/miniapp-readiness.ts. Keeps every Supabase/Storage call in one
// place so both the page and the CLI script see exactly the same numbers.
//
// Storage reads are prefix listings grouped by clone (list() on
// `<cloneId>/photos`, `previews/<cloneId>/photos`, `originals/<cloneId>/photos`
// and the /videos equivalents), never a per-file existence check. Six calls
// per clone, each returning the whole folder in one page (Supabase's Storage
// list() caps at 1000 entries; the fleet's biggest clone is nowhere near
// that). DB reads are two bulk selects (all photos, all videos) plus one
// query each for clones, creator_catalogue_settings and catalogue_bundles,
// paged with lib/select-all.ts so nothing silently truncates.
import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import { selectAllRows } from "@/lib/select-all";
import { safeMiniAppUrl } from "@/lib/catalogue-core";
import {
  type BundleRow,
  type CatalogueSettingsRow,
  type CloneRollout,
  type MediaCounts,
  type PriceStats,
  bundlesStatus,
  mediaReadiness,
  miniAppLiveStatus,
  priceStats,
  sellViaMiniAppStatus,
  tonStatus,
  isFullyOn,
} from "@/lib/miniapp-rollout";
import { projectBundle, type CatalogueBundle } from "@/lib/catalogue-commerce";
import { projectItem } from "@/lib/catalogue-core";

export type CloneLite = { id: string; name: string; slug: string; sell_via_mini_app: boolean | null };

export type CloneRolloutRow = {
  clone: CloneLite;
  settings: CatalogueSettingsRow;
  bundles: BundleRow[];
  mediaCounts: { photo: MediaCounts; video: MediaCounts };
  photoPrices: PriceStats;
  videoPrices: PriceStats;
  rollout: CloneRollout;
  fullyOn: boolean;
};

const OVERSIZE_VIDEO_BYTES = 20 * 1024 * 1024;

async function listFullPaths(prefix: string): Promise<Map<string, number>> {
  const sizes = new Map<string, number>();
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabaseAdmin.storage.from("media").list(prefix, { limit: pageSize, offset });
    if (error || !data) break;
    for (const entry of data) sizes.set(`${prefix}/${entry.name}`, entry.metadata?.size ?? 0);
    if (data.length < pageSize) break;
  }
  return sizes;
}

type MediaRow = { id: string; clone_id: string; caption: string | null; star_value: number | null; is_free: boolean | null; storage_path: string };

async function loadMediaRows(table: "photos" | "videos"): Promise<MediaRow[]> {
  const { rows } = await selectAllRows<MediaRow>(
    supabaseAdmin.from(table).select("id,clone_id,caption,star_value,is_free,storage_path").order("id", { ascending: true }),
    { label: `miniapp-rollout ${table}` },
  );
  return rows;
}

function bundleIsValid(row: BundleRow, itemsByCloneId: Map<string, ReturnType<typeof projectItem>[]>): boolean {
  const items = itemsByCloneId.get(row.id) ?? [];
  return projectBundle(row, items as any) !== null;
}

/** Fetch readiness data for the given clone ids, or every active clone when omitted. */
export async function fetchMiniAppRollout(cloneIds?: string[]): Promise<CloneRolloutRow[]> {
  let clonesQuery = supabaseAdmin.from("clones").select("id,name,slug,sell_via_mini_app,status").eq("status", "active");
  if (cloneIds && cloneIds.length) clonesQuery = supabaseAdmin.from("clones").select("id,name,slug,sell_via_mini_app,status").in("id", cloneIds);
  const clonesRes = await clonesQuery.order("name", { ascending: true });
  if (clonesRes.error) throw new Error(clonesRes.error.message);
  const clones = (clonesRes.data ?? []) as (CloneLite & { status: string })[];
  const ids = clones.map((c) => c.id);
  if (ids.length === 0) return [];

  const [settingsRes, bundlesRes, allPhotos, allVideos] = await Promise.all([
    supabaseAdmin.from("creator_catalogue_settings").select("*").in("clone_id", ids),
    supabaseAdmin
      .from("catalogue_bundles")
      .select("id,clone_id,title,enabled,photo_ids,price_stars,regular_stars")
      .in("clone_id", ids),
    loadMediaRows("photos"),
    loadMediaRows("videos"),
  ]);
  if (settingsRes.error) throw new Error(settingsRes.error.message);
  if (bundlesRes.error) throw new Error(bundlesRes.error.message);

  const settingsByClone = new Map((settingsRes.data ?? []).map((s: any) => [s.clone_id, s as CatalogueSettingsRow]));
  const bundlesByClone = new Map<string, BundleRow[]>();
  for (const b of (bundlesRes.data ?? []) as (BundleRow & { clone_id: string })[]) {
    if (!bundlesByClone.has(b.clone_id)) bundlesByClone.set(b.clone_id, []);
    bundlesByClone.get(b.clone_id)!.push(b);
  }
  const photosByClone = new Map<string, MediaRow[]>();
  for (const p of allPhotos) { if (!photosByClone.has(p.clone_id)) photosByClone.set(p.clone_id, []); photosByClone.get(p.clone_id)!.push(p); }
  const videosByClone = new Map<string, MediaRow[]>();
  for (const v of allVideos) { if (!videosByClone.has(v.clone_id)) videosByClone.set(v.clone_id, []); videosByClone.get(v.clone_id)!.push(v); }

  const rows = await Promise.all(clones.map(async (clone): Promise<CloneRolloutRow> => {
    const settings = settingsByClone.get(clone.id) ?? null;
    const bundles = bundlesByClone.get(clone.id) ?? [];
    const photos = photosByClone.get(clone.id) ?? [];
    const videos = videosByClone.get(clone.id) ?? [];

    const [previewPhotos, previewVideos, originalPhotos, originalVideos, currentVideos] = await Promise.all([
      listFullPaths(`previews/${clone.id}/photos`),
      listFullPaths(`previews/${clone.id}/videos`),
      listFullPaths(`originals/${clone.id}/photos`),
      listFullPaths(`originals/${clone.id}/videos`),
      listFullPaths(`${clone.id}/videos`),
    ]);

    const photoCounts: MediaCounts = {
      total: photos.length,
      captioned: photos.filter((p) => typeof p.caption === "string" && p.caption.trim().length > 0).length,
      previewed: photos.filter((p) => previewPhotos.has(`previews/${p.storage_path}.jpg`)).length,
      compressed: photos.filter((p) => originalPhotos.has(`originals/${p.storage_path}`)).length,
      oversizeVideos: 0,
    };
    const oversizeVideos = videos.filter((v) => (currentVideos.get(v.storage_path) ?? 0) > OVERSIZE_VIDEO_BYTES).length;
    const videoCounts: MediaCounts = {
      total: videos.length,
      captioned: videos.filter((v) => typeof v.caption === "string" && v.caption.trim().length > 0).length,
      previewed: videos.filter((v) => previewVideos.has(`previews/${v.storage_path}.jpg`)).length,
      compressed: videos.filter((v) => originalVideos.has(`originals/${v.storage_path}`)).length,
      oversizeVideos,
    };

    const paidPhotoStars = photos.filter((p) => !p.is_free && typeof p.star_value === "number" && p.star_value > 0).map((p) => p.star_value!);
    const paidVideoStars = videos.filter((v) => !v.is_free && typeof v.star_value === "number" && v.star_value > 0).map((v) => v.star_value!);

    // Combine photo+video counts into one "media" bucket for the readiness chips
    // (caption/preview/compression apply fleet-uniformly across both types).
    const combinedCounts: MediaCounts = {
      total: photoCounts.total + videoCounts.total,
      captioned: photoCounts.captioned + videoCounts.captioned,
      previewed: photoCounts.previewed + videoCounts.previewed,
      compressed: photoCounts.compressed + videoCounts.compressed,
      oversizeVideos,
    };

    const items = photos.map((p) => projectItem(p as any, "photo")).concat(videos.map((v) => projectItem(v as any, "video")));
    const isValid = (b: BundleRow) => projectBundle(b, items) !== null;

    const rollout: CloneRollout = {
      miniApp: miniAppLiveStatus(settings, safeMiniAppUrl),
      ton: tonStatus(settings),
      sellViaMiniApp: sellViaMiniAppStatus(clone),
      media: mediaReadiness(combinedCounts),
      bundles: bundlesStatus(bundles, isValid),
    };

    return {
      clone,
      settings,
      bundles,
      mediaCounts: { photo: photoCounts, video: videoCounts },
      photoPrices: priceStats(paidPhotoStars),
      videoPrices: priceStats(paidVideoStars),
      rollout,
      fullyOn: isFullyOn(rollout),
    };
  }));

  return rows;
}
