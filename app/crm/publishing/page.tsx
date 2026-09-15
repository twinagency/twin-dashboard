import Link from "next/link";
import { getCloneScope } from "@/lib/clone-scope";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function scopedCount(table: "photos" | "videos" | "photo_bundles", cloneId: string | null) {
  let query = supabaseAdmin.from(table).select("id", { count: "exact", head: true });
  if (cloneId) query = query.eq("clone_id", cloneId);
  return query;
}

export default async function CrmPublishingPage() {
  const cloneId = await getCloneScope();
  const [photos, videos, bundles] = await Promise.all([
    scopedCount("photos", cloneId),
    scopedCount("videos", cloneId),
    scopedCount("photo_bundles", cloneId),
  ]);
  const contentUnavailable = Boolean(photos.error || videos.error || bundles.error);
  const total = contentUnavailable ? null : (photos.count ?? 0) + (videos.count ?? 0) + (bundles.count ?? 0);
  const inventoryDetail = total == null
    ? "The vault inventory could not be loaded. Refresh to try again."
    : total === 0
      ? "There are no recorded vault items in the current creator scope. Twin does not currently have a verified post scheduler or publishing connector."
      : `The current creator scope contains ${new Intl.NumberFormat("en-US").format(total)} vault records. Twin does not currently have a verified post scheduler or publishing connector.`;

  return (
    <div className="dashboard-page space-y-5 text-ink">
      <header className="border-b border-line pb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Content</p>
        <h1 className="mt-1 font-heading text-2xl font-semibold tracking-[-0.03em]">Publishing</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Prepare vault content for a controlled cross-platform publishing queue.</p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
        <div className="rounded-xl border border-line bg-panel p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">Queue</p>
          <h2 className="mt-2 font-heading text-lg font-semibold">Publishing is not connected</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">{inventoryDetail} Nothing will be posted automatically from this page.</p>
          <Link href="/crm/vault" className="mt-5 inline-flex rounded-md bg-ink px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-90">Open vault</Link>
        </div>
        <div className="rounded-xl border border-line bg-panel p-6">
          <p className="text-xs font-medium text-muted">Vault records in scope</p>
          <p className="mt-2 font-mono text-3xl font-semibold tabular-nums">{total == null ? "—" : new Intl.NumberFormat("en-US").format(total)}</p>
          <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
            {[["Photos", photos.error ? null : photos.count], ["Videos", videos.error ? null : videos.count], ["Bundles", bundles.error ? null : bundles.count]].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] text-muted">{label}</dt>
                <dd className="mt-1 font-mono text-sm font-semibold tabular-nums">{value == null ? "—" : value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}
