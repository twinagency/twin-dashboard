import { AdminOnly } from "@/components/DashboardAccessProvider";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import type { Clone } from "@/lib/types";
import ClonesGrid, { type CloneCard } from "@/components/ClonesGrid";
import { chartColorForClone, profileImagePathForClone } from "@/lib/colors";
import { cloneCohortFromPromotionFlag } from "@/lib/clone-cohort";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ClonesPage() {
  const { data, error } = await supabaseAdmin
    .from("clones")
    .select("id,slug,name,status,photos_enabled,videos_enabled,voice_enabled,voice_id,created_at,intake,intent_classic_promotions_enabled,intent_classic_promotions_enabled_at,intent_classic_promotion_version")
    .order("created_at", { ascending: true });

  if (error) {
    return (
      <div className="rounded-lg border border-crit/30 bg-crit/10 p-4 text-sm text-crit">
        Failed to load creators: {error.message}
      </div>
    );
  }

  const clones = (data ?? []) as Partial<Clone>[];
  const cloneIds = clones.map((c) => c.id).filter(Boolean) as string[];

  // Per-clone cover photo for the avatar.
  const avatarUrlByCloneId = new Map<string, string>();

  if (cloneIds.length > 0) {
    const photosRes = await supabaseAdmin
      .from("photos")
      .select("clone_id, storage_path")
      .in("clone_id", cloneIds)
      .order("created_at", { ascending: true });

    const firstPath = new Map<string, string>();
    for (const clone of clones) {
      if (!clone.id) continue;
      const customPath = profileImagePathForClone(clone.intake);
      if (customPath) firstPath.set(clone.id, customPath);
    }
    for (const p of photosRes.data ?? []) {
      if (p.clone_id && !firstPath.has(p.clone_id)) firstPath.set(p.clone_id, p.storage_path);
    }
    for (const [cloneId, path] of firstPath) {
      const { data: signed } = await supabaseAdmin.storage.from("media").createSignedUrl(path, 3600);
      if (signed?.signedUrl) avatarUrlByCloneId.set(cloneId, signed.signedUrl);
    }
  }

  const cards: CloneCard[] = clones.map((c, i) => ({
    id: c.id as string,
    name: c.name ?? "",
    slug: c.slug ?? "",
    status: c.status ?? "paused",
    active: c.status === "active",
    cohort: cloneCohortFromPromotionFlag(
      c.intent_classic_promotions_enabled,
      c.intent_classic_promotion_version,
    ),
    cohortEnrolledAt: c.intent_classic_promotions_enabled_at ?? null,
    color: chartColorForClone(c.intake, i),
    photoUrl: c.id ? avatarUrlByCloneId.get(c.id) : undefined,
    features: [
      c.photos_enabled && "📷 Photo",
      c.videos_enabled && "🎬 Video",
      c.voice_enabled && (c.voice_id ? "🎙️ Voice" : "🎙️ Voice ⚠️"),
    ].filter(Boolean) as string[],
  }));

  return (
    <div className="dashboard-page">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Creators</h1>
        <span className="text-sm font-medium text-muted">{clones.length} total</span>
      </div>

      {clones.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-panel p-12 text-center">
          <p className="mb-4 text-muted">No creators yet.</p>
          <AdminOnly><Button nativeButton={false} render={<Link href="/clones/new" />}>Create the first creator</Button></AdminOnly>
        </div>
      ) : (
        <ClonesGrid clones={cards} />
      )}
    </div>
  );
}
