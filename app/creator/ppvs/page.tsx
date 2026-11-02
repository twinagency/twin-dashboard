import Link from "next/link";
import { isMoxy } from "@/lib/agency-brand";
import CreatorPpvUploads from "./CreatorPpvUploads";
import { supabaseAdmin } from "@/lib/supabase";
import { withDashboardAccess } from "@/lib/dashboard-access";
import { requireCreatorWorkspace } from "@/lib/creator-dashboard";
import { Card } from "@/components/ui/card";
export const dynamic = "force-dynamic";

export default async function CreatorPpvsPage() {
  const creator = await requireCreatorWorkspace();
  const id = creator.cloneIds[0];
  if (!id) return <Card className="space-y-3 p-6 text-sm text-muted">
    <h1 className="text-lg font-semibold text-ink">Pay Per View</h1>
    <p>Your Pay Per View catalogue will become available when your AI creator profile is connected.</p>
    <p>Your onboarding uploads are already available separately. You can review saved files and add more content there.</p>
    <Link href="/creator/onboarding?step=content" className="inline-flex min-h-11 items-center font-semibold text-ink underline underline-offset-4">Open saved uploads</Link>
  </Card>;
  // Barebones live-creator view: previews only (no prices/captions), upload-only.
  const [photos, videos] = await Promise.all([
    supabaseAdmin.from("photos").select("id,storage_path").eq("clone_id", id).order("created_at", { ascending: false }),
    supabaseAdmin.from("videos").select("id,storage_path").eq("clone_id", id).order("created_at", { ascending: false }),
  ]);
  if (photos.error) throw new Error(photos.error.message);
  if (videos.error) throw new Error(videos.error.message);
  // Sign every thumbnail in one batch instead of one request per tile; a
  // 228-photo catalogue otherwise fires 230 sign requests on load.
  const items = [...(photos.data ?? []), ...(videos.data ?? [])];
  // Paths come only from this creator's own clone rows above, so sign as the
  // system (the agency-scoped client has no batch-sign rule).
  const signed = items.length
    ? await withDashboardAccess(null, () => supabaseAdmin.storage.from("media").createSignedUrls(items.map((i) => i.storage_path), 3600))
    : { data: [] };
  const urls = new Map((signed.data ?? []).filter((s) => s.signedUrl && s.path).map((s) => [s.path as string, s.signedUrl]));
  const withUrl = (rows: { id: string; storage_path: string }[] | null) => (rows ?? []).map((r) => ({ ...r, url: urls.get(r.storage_path) ?? null }));
  return <CreatorPpvUploads moxy={isMoxy(creator.name)} cloneId={id} photos={withUrl(photos.data)} videos={withUrl(videos.data)} />;
}
