import CreatorMediaLibrary, { type CreatorMediaItem } from "@/components/CreatorMediaLibrary";
import { requireCreatorWorkspace } from "@/lib/creator-dashboard";
import { withDashboardAccess } from "@/lib/dashboard-access";
import { supabaseAdmin } from "@/lib/supabase";
export const dynamic = "force-dynamic";

type DbMedia = { id: string; storage_path: string; caption: string | null; teaser_caption: string | null; star_value: number; is_free: boolean | null; image_name?: string | null; created_at: string };
type DbBundle = { id: string; name: string; caption: string | null; star_price: number; created_at: string; photo_bundle_items: { storage_path: string; sort_order: number }[] };
async function allRows<T>(read: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset < 50000; offset += 500) {
    const page = await read(offset, offset + 499);
    if (page.error) throw new Error("Your media library could not be loaded. Refresh to try again.");
    rows.push(...(page.data || []));
    if ((page.data?.length || 0) < 500) return rows;
  }
  throw new Error("This media library is too large to load in one view. Please contact your agency.");
}
export default async function CreatorPpvsPage() {
  const creator = await requireCreatorWorkspace();
  const id = creator.cloneIds[0];
  if (!id) return <CreatorMediaLibrary items={[]} />;
  const items = await withDashboardAccess(creator, async () => {
    const [photos, videos, bundles] = await Promise.all([
      allRows<DbMedia>((start, end) => supabaseAdmin.from("photos").select("id,storage_path,caption,teaser_caption,star_value,is_free,created_at,image_name").eq("clone_id", id).order("created_at", { ascending: false }).order("id").range(start, end)),
      allRows<DbMedia>((start, end) => supabaseAdmin.from("videos").select("id,storage_path,caption,teaser_caption,star_value,is_free,created_at").eq("clone_id", id).order("created_at", { ascending: false }).order("id").range(start, end)),
      allRows<DbBundle>((start, end) => supabaseAdmin.from("photo_bundles").select("id,name,caption,star_price,created_at,photo_bundle_items(storage_path,sort_order)").eq("clone_id", id).order("created_at", { ascending: false }).order("id").range(start, end)),
    ]);
    const map = (row: DbMedia, kind: "photo" | "video"): CreatorMediaItem => ({ id: row.id, kind, name: row.image_name || (kind === "photo" ? "Photo" : "Video"), caption: row.caption, teaser: row.teaser_caption, stars: row.is_free ? 0 : row.star_value, paths: [row.storage_path], createdAt: row.created_at });
    return [...photos.map(row => map(row, "photo")), ...videos.map(row => map(row, "video")), ...bundles.map((row): CreatorMediaItem => ({ id: row.id, kind: "bundle", name: row.name, caption: row.caption, teaser: null, stars: row.star_price, paths: [...row.photo_bundle_items].sort((a, b) => a.sort_order - b.sort_order).map(item => item.storage_path), createdAt: row.created_at }))];
  });
  return <CreatorMediaLibrary items={items} />;
}
