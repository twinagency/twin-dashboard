import { AdminOnly } from "@/components/DashboardAccessProvider";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import type { Clone } from "@/lib/types";
import ClonesGrid, { type CloneCard } from "@/components/ClonesGrid";
import { chartColorForClone, profileImagePathForClone } from "@/lib/colors";
import { cloneCohortFromPromotionFlag } from "@/lib/clone-cohort";
import { Button } from "@/components/ui/button";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { isMoxy } from "@/lib/agency-brand";

export const dynamic = "force-dynamic";

// Presentation-only roster for the Moxy Creators page. Existing agency
// assignments, bot status, earnings and the creator switcher stay unchanged.
const MOXY_VISIBLE_CREATOR_IDS = new Set([
  "20ef9407-83f2-4351-8d3c-48cc0ed54e0b", // Riley Mae Lewis
  "d2678dce-6a4e-4f1c-b54a-86057bba427c", // Kyla Yesenosky
]);

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

  const access = await getDashboardAccess();
  const clones = ((data ?? []) as Partial<Clone>[]).filter(
    (clone) => !isMoxy(access?.name) || (clone.id !== undefined && MOXY_VISIBLE_CREATOR_IDS.has(clone.id)),
  );
  const cloneIds = clones.map((c) => c.id).filter(Boolean) as string[];

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
    // Batched (createSignedUrls, plural), same as app/users/page.tsx. The old
    // code called createSignedUrl once per clone in a serial for loop, ~30-80ms
    // each, adding up to 1-1.5s of pure round trip latency for ten clones.
    const pathEntries = [...firstPath.entries()];
    if (pathEntries.length > 0) {
      const { data: signed } = await supabaseAdmin.storage
        .from("media")
        .createSignedUrls(pathEntries.map(([, path]) => path), 3600);
      pathEntries.forEach(([cloneId], i) => {
        const url = signed?.[i]?.signedUrl;
        if (url) avatarUrlByCloneId.set(cloneId, url);
      });
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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Creators</h1>
        <div className="flex items-center gap-3">
          <AdminOnly>
            <Button nativeButton={false} variant="outline" render={<Link href="/creator-management" />}>Review onboarding</Button>
            <Button nativeButton={false} render={<Link href="/agency/creator-invites" />}>Invite creator</Button>
          </AdminOnly>
          <span className="text-sm font-medium text-muted">{clones.length} total</span>
        </div>
      </div>

      <AdminOnly>
        <nav aria-label="Creator directory" className="mb-6 flex gap-5 border-b border-line text-sm">
          <Link href="/clones" aria-current="page" className="border-b-2 border-accent pb-3 font-semibold text-ink">Creators</Link>
          <Link href="/agency-admin/creator-codes" className="pb-3 text-muted hover:text-ink">Invitations</Link>
        </nav>
      </AdminOnly>

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

