import Link from "next/link";
import { getCloneScope } from "@/lib/clone-scope";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const formatCount = (value: number | null) => value == null ? "—" : new Intl.NumberFormat("en-US").format(value);

export default async function CrmMassMessagesPage() {
  const cloneId = await getCloneScope();
  const reachableAfter = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let creatorsQuery = supabaseAdmin.from("clones").select("id", { count: "exact", head: true });
  let audienceQuery = supabaseAdmin.from("users").select("id", { count: "exact", head: true });
  let reachableQuery = supabaseAdmin.from("users").select("id", { count: "exact", head: true }).gte("last_message_received", reachableAfter);
  if (cloneId) {
    creatorsQuery = creatorsQuery.eq("id", cloneId);
    audienceQuery = audienceQuery.eq("clone_id", cloneId);
    reachableQuery = reachableQuery.eq("clone_id", cloneId);
  }
  const [creators, audience, reachable] = await Promise.all([
    creatorsQuery,
    audienceQuery,
    reachableQuery,
  ]);

  return (
    <div className="dashboard-page space-y-5 text-ink">
      <header className="flex flex-col gap-3 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Operate</p>
          <h1 className="mt-1 font-heading text-2xl font-semibold tracking-[-0.03em]">Mass messages</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">Build targeted creator-to-fan broadcasts from one controlled workspace.</p>
        </div>
        <span className="w-fit rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">Delivery not enabled</span>
      </header>

      <section className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
        {[
          ["Creators in scope", formatCount(creators.error ? null : creators.count)],
          ["Known fans", formatCount(audience.error ? null : audience.count)],
          ["Messaged in 24h", formatCount(reachable.error ? null : reachable.count)],
        ].map(([label, value]) => (
          <div key={label} className="bg-panel px-5 py-4">
            <p className="text-xs font-medium text-muted">{label}</p>
            <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-line bg-panel p-6 shadow-[0_12px_32px_rgb(6_23_47/0.04)]">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">Broadcast infrastructure</p>
          <h2 className="mt-2 font-heading text-lg font-semibold">No mass-message delivery service is connected yet</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Twin can already identify the real audience above, but it does not yet have the queueing, per-platform delivery, retry, suppression, and reporting layer required to send a safe broadcast. Nothing on this page sends messages until that backend exists.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/crm/fans" className="rounded-md bg-ink px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-90">Explore audience</Link>
            <Link href="/crm/automations" className="rounded-md border border-line bg-white px-3.5 py-2 text-sm font-semibold text-ink transition hover:bg-bg">Open existing automations</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
