import CloneScopeForm from "@/components/CloneScopeForm";
import { supabaseAdmin } from "@/lib/supabase";
import { getCloneScope } from "@/lib/clone-scope";
import { setCloneScope } from "@/app/actions/clone-scope";
import MediaManager from "./MediaManager";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Info } from "@/components/clone/fields";

export const dynamic = "force-dynamic";

// Media library. "All clones" shows photo/video/bundle counts per bot with a
// link to open its library; scoped to one clone it's the full MediaManager
// (uploading/tagging/pricing only ever makes sense for one clone at a time —
// used to be the separate /clones/[id]/media route).
export default async function MediaPage() {
  const cloneId = await getCloneScope();
  if (cloneId) return <CloneMedia cloneId={cloneId} />;
  return <FleetMedia />;
}

async function FleetMedia() {
  const { data: clones } = await supabaseAdmin
    .from("clones")
    .select("id,name,slug")
    .order("created_at", { ascending: true });
  const rows = (clones ?? []) as { id: string; name: string; slug: string }[];
  const ids = rows.map((r) => r.id);

  const countByClone = new Map<string, { photos: number; videos: number; bundles: number }>();
  if (ids.length) {
    const [photosRes, videosRes, bundlesRes] = await Promise.all([
      supabaseAdmin.from("photos").select("clone_id").in("clone_id", ids),
      supabaseAdmin.from("videos").select("clone_id").in("clone_id", ids),
      supabaseAdmin.from("photo_bundles").select("clone_id").in("clone_id", ids),
    ]);
    for (const r of rows) countByClone.set(r.id, { photos: 0, videos: 0, bundles: 0 });
    for (const p of photosRes.data ?? []) countByClone.get(p.clone_id)!.photos += 1;
    for (const v of videosRes.data ?? []) countByClone.get(v.clone_id)!.videos += 1;
    for (const b of bundlesRes.data ?? []) countByClone.get(b.clone_id)!.bundles += 1;
  }

  const totals = [...countByClone.values()].reduce(
    (a, c) => ({ photos: a.photos + c.photos, videos: a.videos + c.videos, bundles: a.bundles + c.bundles }),
    { photos: 0, videos: 0, bundles: 0 },
  );

  return (
    <div className="dashboard-page text-ink">
      <h1 className="mb-5 flex items-center gap-2 text-2xl font-semibold">
        Media
        <Info text="Photo/video library. Pick a creator to upload, tag, and price her content." />
      </h1>

      <div className="mb-5 grid grid-cols-3 gap-3 text-sm">
        <Card className="p-4">
          <div className="text-xs text-muted">Photos</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">{totals.photos}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted">Videos</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">{totals.videos}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted">Bundles</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">{totals.bundles}</div>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bot</TableHead>
              <TableHead className="text-right">Photos</TableHead>
              <TableHead className="text-right">Videos</TableHead>
              <TableHead className="text-right">Bundles</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => {
              const n = countByClone.get(c.id) ?? { photos: 0, videos: 0, bundles: 0 };
              return (
                <TableRow key={c.id}>
                  <TableCell className="creator-name font-medium">{c.name} <span className="text-muted">/ {c.slug}</span></TableCell>
                  <TableCell className="text-right tabular-nums">{n.photos}</TableCell>
                  <TableCell className="text-right tabular-nums">{n.videos}</TableCell>
                  <TableCell className="text-right tabular-nums">{n.bundles}</TableCell>
                  <TableCell className="text-right">
                    <CloneScopeForm cloneId={c.id}>
                      <Button type="submit" variant="link" size="sm" className="h-auto p-0 text-accent">Manage →</Button>
                    </CloneScopeForm>
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted">No creators yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

async function CloneMedia({ cloneId }: { cloneId: string }) {
  const [cloneRes, photosRes, videosRes, bundlesRes] = await Promise.all([
    supabaseAdmin.from("clones").select("id,name,slug,category_pricing").eq("id", cloneId).maybeSingle(),
    supabaseAdmin.from("photos").select("*").eq("clone_id", cloneId).order("created_at", { ascending: false }),
    supabaseAdmin.from("videos").select("*").eq("clone_id", cloneId).order("created_at", { ascending: false }),
    supabaseAdmin
      .from("photo_bundles")
      .select("*, photo_bundle_items(*)")
      .eq("clone_id", cloneId)
      .order("created_at", { ascending: true }),
  ]);

  if (cloneRes.error) throw new Error(cloneRes.error.message);
  if (!cloneRes.data) return <div className="text-muted">Creator not found.</div>;

  const clone = cloneRes.data as { id: string; name: string; slug: string; category_pricing: Record<string, number> | null };

  return (
    <div className="dashboard-page">
      <div className="mb-2 flex items-center justify-end">
        <CloneScopeForm cloneId={null}>
          <Button type="submit" variant="ghost" size="sm">← All bots</Button>
        </CloneScopeForm>
      </div>
      <MediaManager
        cloneId={cloneId}
        photos={photosRes.data ?? []}
        videos={videosRes.data ?? []}
        bundles={bundlesRes.data ?? []}
        categoryPricing={clone.category_pricing}
      />
    </div>
  );
}

