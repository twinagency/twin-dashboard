import Link from "next/link";
import { isAuthed } from "@/lib/auth";
import { getDashboardAccess } from "@/lib/dashboard-access";
import CloneScopeForm from "@/components/CloneScopeForm";
import { supabaseAdmin } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import MediaManager from "@/app/media/MediaManager";
import DashboardAccessProvider from "@/components/DashboardAccessProvider";

export default async function CloneMediaPage({ cloneId, creatorMode = false }: { cloneId: string; creatorMode?: boolean }) {
  const [cloneRes, photosRes, videosRes, bundlesRes] = await Promise.all([
    supabaseAdmin.from("clones").select("id,name,slug,category_pricing,browse_enabled").eq("id", cloneId).maybeSingle(),
    supabaseAdmin.from("photos").select("*").eq("clone_id", cloneId).order("created_at", { ascending: false }),
    supabaseAdmin.from("videos").select("*").eq("clone_id", cloneId).order("created_at", { ascending: false }),
    supabaseAdmin.from("photo_bundles").select("*, photo_bundle_items(*)").eq("clone_id", cloneId).order("created_at", { ascending: true }),
  ]);

  if (cloneRes.error) throw new Error(cloneRes.error.message);
  if (!cloneRes.data) return <div className="text-muted">Creator not found.</div>;
  const clone = cloneRes.data as { id: string; name: string; slug: string; category_pricing: Record<string, number> | null; browse_enabled: boolean };

  const catalogueOwner = !creatorMode && clone.browse_enabled && !(await getDashboardAccess()) && await isAuthed();

  return (
    <div className="dashboard-page">
      {creatorMode ? (
        <div className="mb-5">
          <h1 className="text-2xl font-semibold text-ink">Pay Per View</h1>
          <p className="mt-1 text-sm text-muted">Your photos, videos, bundles and current prices. Upload new content below.</p>
        </div>
      ) : (
        <div className="mb-2 flex items-center justify-end gap-3">
          {catalogueOwner && <Link className="text-sm font-medium text-accent" href={`/catalogue/${clone.slug}?preview=1`}>Catalogue preview & blur</Link>}
          <CloneScopeForm cloneId={null}>
            <Button type="submit" variant="ghost" size="sm">← All bots</Button>
          </CloneScopeForm>
        </div>
      )}
      {creatorMode ? (
        <DashboardAccessProvider audience="admin">
          <MediaManager cloneId={cloneId} photos={photosRes.data ?? []} videos={videosRes.data ?? []} bundles={bundlesRes.data ?? []} categoryPricing={clone.category_pricing} />
        </DashboardAccessProvider>
      ) : (
        <MediaManager cloneId={cloneId} photos={photosRes.data ?? []} videos={videosRes.data ?? []} bundles={bundlesRes.data ?? []} categoryPricing={clone.category_pricing} />
      )}
    </div>
  );
}
