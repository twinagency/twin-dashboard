import Link from "next/link";
import CreatorPpvUploads from "./CreatorPpvUploads";
import { supabaseAdmin } from "@/lib/supabase";
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
  return <CreatorPpvUploads cloneId={id} photos={photos.data ?? []} videos={videos.data ?? []} />;
}
