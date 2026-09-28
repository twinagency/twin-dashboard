"use server";

// Mini App catalogue bundles (table catalogue_bundles). Distinct from the legacy
// chat bundle feature (photo_bundles/photo_bundle_items) managed by createBundle
// etc. in ./actions.ts, do not conflate the two.

import { guardDashboardAction } from "@/lib/agency-management";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { catalogueBundlePricing } from "@/lib/catalogue-bundle-pricing";

import { CATALOGUE_BUNDLE_MIN_ITEMS, CATALOGUE_BUNDLE_MAX_ITEMS, type CatalogueBundleKind } from "@/lib/catalogue-bundle-limits";

// ── Create a Mini App catalogue bundle ───────────────────────────────────────
export async function createCatalogueBundle(cloneId: string, fd: FormData): Promise<string> {
  await guardDashboardAction("app/media/catalogue-bundle-actions.ts#createCatalogueBundle", [cloneId, fd]);
  const title = String(fd.get("title") ?? "").trim();
  if (!title) throw new Error("Title is required.");
  const caption = String(fd.get("caption") ?? "").trim();
  const kind: CatalogueBundleKind = fd.get("kind") === "video" ? "video" : "photo";
  const enabled = fd.get("enabled") === "on";
  const ids = [...new Set(fd.getAll("itemIds").map((v) => String(v)).filter(Boolean))];
  if (ids.length < CATALOGUE_BUNDLE_MIN_ITEMS || ids.length > CATALOGUE_BUNDLE_MAX_ITEMS)
    throw new Error(`Choose between ${CATALOGUE_BUNDLE_MIN_ITEMS} and ${CATALOGUE_BUNDLE_MAX_ITEMS} items.`);

  const table = kind === "video" ? "videos" : "photos";
  const { data: items, error: itemsError } = await supabaseAdmin
    .from(table)
    .select("id,star_value,is_free")
    .eq("clone_id", cloneId)
    .in("id", ids);
  if (itemsError) throw new Error(itemsError.message);
  if (!items || items.length !== ids.length) throw new Error("Some selected items were not found for this creator.");
  const starValues: number[] = [];
  for (const item of items) {
    if (item.is_free || !Number.isInteger(item.star_value) || item.star_value <= 0)
      throw new Error("Every item in a bundle must be paid media with a Star price.");
    starValues.push(item.star_value);
  }
  const { priceStars, regularStars } = catalogueBundlePricing(starValues);

  const { data: last } = await supabaseAdmin
    .from("catalogue_bundles")
    .select("sort_order")
    .eq("clone_id", cloneId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const sortOrder = (last?.[0]?.sort_order ?? -1) + 1;

  const { data, error } = await supabaseAdmin
    .from("catalogue_bundles")
    .insert({
      clone_id: cloneId,
      title,
      caption: caption || null,
      media_kind: kind,
      photo_ids: kind === "photo" ? ids : [],
      video_ids: kind === "video" ? ids : [],
      price_stars: priceStars,
      regular_stars: regularStars,
      enabled,
      sort_order: sortOrder,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/media");
  return data.id;
}

// ── Enable/disable an existing catalogue bundle ──────────────────────────────
// Contents and price are immutable after creation (catalogue_bundle_immutable
// trigger); enabled is not, so this is the only edit a bundle ever gets.
export async function setCatalogueBundleEnabled(cloneId: string, bundleId: string, enabled: boolean) {
  await guardDashboardAction("app/media/catalogue-bundle-actions.ts#setCatalogueBundleEnabled", [cloneId, bundleId, enabled]);
  const { error } = await supabaseAdmin
    .from("catalogue_bundles")
    .update({ enabled })
    .eq("id", bundleId)
    .eq("clone_id", cloneId);
  if (error) throw new Error(error.message);
  revalidatePath("/media");
}

// ── Delete a catalogue bundle ─────────────────────────────────────────────────
// Deletes only the bundle row (photo_ids/video_ids). The underlying photos and
// videos are untouched, unlike deleteBundle's legacy-table behaviour.
export async function deleteCatalogueBundle(cloneId: string, bundleId: string) {
  await guardDashboardAction("app/media/catalogue-bundle-actions.ts#deleteCatalogueBundle", [cloneId, bundleId]);
  const { error } = await supabaseAdmin.from("catalogue_bundles").delete().eq("id", bundleId).eq("clone_id", cloneId);
  if (error) throw new Error(error.message);
  revalidatePath("/media");
}
