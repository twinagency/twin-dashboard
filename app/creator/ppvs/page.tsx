import CreatorPpvLibrary, { type CreatorPpv } from "@/components/creator/CreatorPpvLibrary";
import { requireCreatorDashboard } from "@/lib/creator-dashboard-access";
import { serviceClient } from "@/lib/supabase-service";
export const dynamic = "force-dynamic";
export default async function CreatorPpvsPage() {
  const identity = await requireCreatorDashboard();
  if (!identity.cloneId) return <CreatorPpvLibrary items={[]} />;
  const db = serviceClient();
  const [photos, videos, bundles] = await Promise.all([
    db.from("photos").select("id,image_name,caption,teaser_caption,star_value,storage_path").eq("clone_id", identity.cloneId).order("created_at", { ascending: false }).limit(1000),
    db.from("videos").select("id,caption,teaser_caption,star_value,storage_path").eq("clone_id", identity.cloneId).order("created_at", { ascending: false }).limit(1000),
    db.from("photo_bundles").select("id,name,caption,star_price,photo_bundle_items(storage_path,sort_order)").eq("clone_id", identity.cloneId).order("created_at", { ascending: false }).limit(1000),
  ]);
  if (photos.error || videos.error || bundles.error) throw new Error("Unable to load your PPV library.");
  const items: CreatorPpv[] = [
    ...(photos.data || []).map(row => ({ id: row.id, type: "photo" as const, name: row.image_name || "Photo", caption: row.teaser_caption || row.caption || "", stars: row.star_value || 0, path: row.storage_path, items: [] })),
    ...(videos.data || []).map((row, index) => ({ id: row.id, type: "video" as const, name: `Video ${index + 1}`, caption: row.teaser_caption || row.caption || "", stars: row.star_value || 0, path: row.storage_path, items: [] })),
    ...(bundles.data || []).map(row => { const paths = [...(row.photo_bundle_items || [])].sort((a, b) => a.sort_order - b.sort_order).map(item => item.storage_path); return { id: row.id, type: "bundle" as const, name: row.name, caption: row.caption || "", stars: row.star_price || 0, path: paths[0] || null, items: paths }; }),
  ];
  return <CreatorPpvLibrary items={items} />;
}
