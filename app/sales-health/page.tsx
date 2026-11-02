import { Card } from "@/components/ui/card";
import { getCloneScope } from "@/lib/clone-scope";
import { fmtNum } from "@/lib/money";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type FunnelRow = {
  day: string;
  clone_id: string;
  trigger: string;
  attempted: number;
  transport_attempted: number;
  delivered: number;
  blocked: number;
  failed: number;
  uncertain: number;
  purchased: number;
  purchased_stars: number;
};

type ReasonRow = {
  day: string;
  clone_id: string;
  trigger: string;
  reason: string;
  blocked_count: number;
};

type InventoryRow = {
  clone_id: string;
  slug: string;
  name: string;
  status: string;
  paid_photos: number;
  context_ready_photos: number;
  paid_videos: number;
  context_ready_videos: number;
  paid_bundles: number;
  context_ready_bundles: number;
  bundle_items_missing_facts: number;
  context_ready_assets: number;
};

const n = (v: unknown) => Number(v) || 0;
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "-");

export default async function SalesHealthPage() {
  const cloneId = await getCloneScope();
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();

  let funnelQ = supabaseAdmin
    .from("commercial_offer_funnel_daily_v")
    .select("*")
    .gte("day", since)
    .order("day", { ascending: false });
  let reasonsQ = supabaseAdmin
    .from("commercial_offer_block_reasons_v")
    .select("*")
    .gte("day", since)
    .order("blocked_count", { ascending: false });
  let inventoryQ = supabaseAdmin
    .from("creator_inventory_readiness_v")
    .select("*")
    .eq("status", "active")
    .order("name", { ascending: true });
  let testsQ = supabaseAdmin.from("users").select("id", { count: "exact", head: true }).eq("is_test", true);

  if (cloneId) {
    funnelQ = funnelQ.eq("clone_id", cloneId);
    reasonsQ = reasonsQ.eq("clone_id", cloneId);
    inventoryQ = inventoryQ.eq("clone_id", cloneId);
    testsQ = testsQ.eq("clone_id", cloneId);
  }

  const [funnelRes, reasonsRes, inventoryRes, testRes] = await Promise.all([
    funnelQ,
    reasonsQ,
    inventoryQ,
    testsQ,
  ]);
  if (funnelRes.error) throw new Error(funnelRes.error.message);
  if (reasonsRes.error) throw new Error(reasonsRes.error.message);
  if (inventoryRes.error) throw new Error(inventoryRes.error.message);
  if (testRes.error) throw new Error(testRes.error.message);

  const funnel = (funnelRes.data ?? []) as FunnelRow[];
  const reasons = (reasonsRes.data ?? []) as ReasonRow[];
  const inventory = (inventoryRes.data ?? []) as InventoryRow[];

  const total = funnel.reduce(
    (a, r) => ({
      attempted: a.attempted + n(r.attempted),
      transport: a.transport + n(r.transport_attempted),
      delivered: a.delivered + n(r.delivered),
      blocked: a.blocked + n(r.blocked),
      failed: a.failed + n(r.failed),
      uncertain: a.uncertain + n(r.uncertain),
      purchased: a.purchased + n(r.purchased),
      stars: a.stars + n(r.purchased_stars),
    }),
    { attempted: 0, transport: 0, delivered: 0, blocked: 0, failed: 0, uncertain: 0, purchased: 0, stars: 0 },
  );

  const byTrigger = new Map<string, typeof total>();
  for (const r of funnel) {
    const current = byTrigger.get(r.trigger) ?? { attempted: 0, transport: 0, delivered: 0, blocked: 0, failed: 0, uncertain: 0, purchased: 0, stars: 0 };
    current.attempted += n(r.attempted);
    current.transport += n(r.transport_attempted);
    current.delivered += n(r.delivered);
    current.blocked += n(r.blocked);
    current.failed += n(r.failed);
    current.uncertain += n(r.uncertain);
    current.purchased += n(r.purchased);
    current.stars += n(r.purchased_stars);
    byTrigger.set(r.trigger, current);
  }

  const byReason = new Map<string, number>();
  for (const r of reasons) byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + n(r.blocked_count));
  const reasonRows = [...byReason.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Sales Health</h1>
        <p className="mt-1 text-sm text-muted">
          Conversation-led paid offers, last 14 days. Explicit test accounts are excluded from every funnel number below.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Attempts", fmtNum(total.attempted), "Commercial opportunities"],
          ["Delivered", fmtNum(total.delivered), pct(total.delivered, total.attempted) + " of attempts"],
          ["Purchased", fmtNum(total.purchased), pct(total.purchased, total.delivered) + " of delivered"],
          ["Purchased Stars", fmtNum(total.stars), `${fmtNum(total.uncertain)} uncertain transport outcomes`],
        ].map(([label, value, hint]) => (
          <Card key={label} size="sm" className="gap-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
            <div className="text-2xl font-semibold text-ink">{value}</div>
            <div className="text-xs text-muted">{hint}</div>
          </Card>
        ))}
      </div>

      <Card>
        <div>
          <h2 className="font-semibold text-ink">Offer funnel by trigger</h2>
          <p className="text-xs text-muted">Attempt to transport to delivery to purchase. Failed and uncertain sends never count as delivered.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="text-muted"><tr>
              <th className="py-2">Trigger</th><th>Attempts</th><th>Transport</th><th>Delivered</th><th>Blocked</th><th>Failed</th><th>Uncertain</th><th>Purchased</th><th>Stars</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {[...byTrigger.entries()].sort((a,b) => b[1].attempted - a[1].attempted).map(([trigger, row]) => (
                <tr key={trigger}>
                  <td className="py-2 font-medium text-ink">{trigger.replaceAll("_", " ")}</td>
                  <td>{fmtNum(row.attempted)}</td><td>{fmtNum(row.transport)}</td><td>{fmtNum(row.delivered)}</td>
                  <td>{fmtNum(row.blocked)}</td><td>{fmtNum(row.failed)}</td><td>{fmtNum(row.uncertain)}</td>
                  <td>{fmtNum(row.purchased)}</td><td>{fmtNum(row.stars)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {byTrigger.size === 0 && <div className="py-6 text-sm text-muted">No offer events in this window yet.</div>}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div>
            <h2 className="font-semibold text-ink">Why offers were withheld</h2>
            <p className="text-xs text-muted">Top block reasons. These are fail-closed decisions, not silent missing sends.</p>
          </div>
          <div className="divide-y divide-line text-xs">
            {reasonRows.map(([reason, count]) => (
              <div key={reason} className="flex items-center justify-between gap-3 py-2">
                <span className="break-all text-ink">{reason}</span>
                <span className="font-mono text-muted">{fmtNum(count)}</span>
              </div>
            ))}
            {reasonRows.length === 0 && <div className="py-5 text-muted">No blocked offers in this window.</div>}
          </div>
        </Card>

        <Card>
          <div>
            <h2 className="font-semibold text-ink">Measurement hygiene</h2>
            <p className="text-xs text-muted">Test traffic is excluded only when an operator explicitly marks that Telegram account as test.</p>
          </div>
          <div className="text-3xl font-semibold text-ink">{fmtNum(testRes.count ?? 0)}</div>
          <div className="text-xs text-muted">
            test fan rows in the current scope. Mark or unmark a test account from Fans → Controls.
          </div>
        </Card>
      </div>

      <Card>
        <div>
          <h2 className="font-semibold text-ink">Contextual inventory readiness</h2>
          <p className="text-xs text-muted">A bundle is context-ready only when every image has verified visual facts. Unknown bundle images are excluded rather than guessed.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead className="text-muted"><tr>
              <th className="py-2">Creator</th><th>Photos ready</th><th>Videos ready</th><th>Bundles ready</th><th>Missing bundle facts</th><th>Total ready assets</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {inventory.map((r) => (
                <tr key={r.clone_id}>
                  <td className="py-2 font-medium text-ink">{r.name}</td>
                  <td>{fmtNum(r.context_ready_photos)} / {fmtNum(r.paid_photos)}</td>
                  <td>{fmtNum(r.context_ready_videos)} / {fmtNum(r.paid_videos)}</td>
                  <td>{fmtNum(r.context_ready_bundles)} / {fmtNum(r.paid_bundles)}</td>
                  <td>{fmtNum(r.bundle_items_missing_facts)}</td>
                  <td>{fmtNum(r.context_ready_assets)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}
