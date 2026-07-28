import { supabaseAdmin } from "@/lib/supabase";
import { getCloneScope } from "@/lib/clone-scope";
import { sourceLabel } from "@/app/logs/tech";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

// Read-only "what needs my attention" page. Everything here is derived from
// data that already exists (system_logs, star_transactions, users.blocked) -
// no new tables, no writes. Scoped by the same header clone switcher as
// every other data page: "All clones" shows the whole fleet, picking one
// narrows every card to her alone.
export default async function NotificationsPage() {
  const cloneId = await getCloneScope();

  const now = Date.now();
  const since1h = new Date(now - 60 * 60 * 1000).toISOString();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  let errQuery = supabaseAdmin
    .from("system_logs")
    .select("id,ts,source,message,clone_id,clones(name)")
    .eq("level", "error")
    .gte("ts", since24h)
    .order("ts", { ascending: false })
    .limit(500);
  if (cloneId) errQuery = errQuery.eq("clone_id", cloneId);

  let safetyQuery = supabaseAdmin
    .from("system_logs")
    .select("id,ts,message,detail,clone_id,telegram_id,clones(name)")
    .eq("source", "safety")
    .in("level", ["warn", "error"])
    .gte("ts", todayStart.toISOString())
    .order("ts", { ascending: false })
    .limit(50);
  if (cloneId) safetyQuery = safetyQuery.eq("clone_id", cloneId);

  let payQuery = supabaseAdmin
    .from("star_transactions")
    .select("user_id,telegram_id,amount_stars,clone_id,clones(name)")
    .gte("paid_at", todayStart.toISOString());
  if (cloneId) payQuery = payQuery.eq("clone_id", cloneId);

  let blockedQuery = supabaseAdmin.from("users").select("id", { count: "exact", head: true }).eq("blocked", true);
  if (cloneId) blockedQuery = blockedQuery.eq("clone_id", cloneId);

  const [errRes, safetyRes, payRes, blockedRes] = await Promise.all([errQuery, safetyQuery, payQuery, blockedQuery]);

  type ErrRow = { id: number; ts: string; source: string; message: string; clone_id: string | null; clones: { name: string } | null };
  type SafetyRow = {
    id: number;
    ts: string;
    message: string;
    detail: Record<string, unknown> | null;
    clone_id: string | null;
    telegram_id: number | null;
    clones: { name: string } | null;
  };
  type PayRow = { user_id: string | null; telegram_id: number | null; amount_stars: number | null; clone_id: string; clones: { name: string } | null };

  const errRows = ((errRes.data ?? []) as unknown as ErrRow[]);
  const safetyRows = ((safetyRes.data ?? []) as unknown as SafetyRow[]);
  const payRows = ((payRes.data ?? []) as unknown as PayRow[]);

  // Error spike: compare the last hour's error count against the average
  // hourly rate over the rest of the last 24h. A clone that's normally quiet
  // stands out the moment it starts throwing.
  const errLast1h = errRows.filter((r) => r.ts >= since1h).length;
  const errPrior23h = errRows.length - errLast1h;
  const avgPerHour = errPrior23h / 23;
  const isSpike = errLast1h >= 3 && errLast1h >= Math.max(3, avgPerHour * 3);

  const errBySource = new Map<string, number>();
  for (const r of errRows) errBySource.set(r.source, (errBySource.get(r.source) ?? 0) + 1);
  const topErrorSources = [...errBySource.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const payingFans = new Set(payRows.map((r) => r.user_id ?? String(r.telegram_id))).size;
  const starsToday = payRows.reduce((s, r) => s + (r.amount_stars ?? 0), 0);

  const flaggedFansToday = new Set(safetyRows.map((r) => r.telegram_id ?? r.id)).size;
  const blockedTotal = blockedRes.count ?? 0;

  return (
    <div className="text-ink">
      <h1 className="mb-1 text-2xl font-semibold">Notifications</h1>
      <p className="mb-5 text-sm text-muted">
        What needs a look, pulled from the logs, payments, and safety flags already being recorded. Read only.
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Errors (last hour)"
          value={String(errLast1h)}
          tone={isSpike ? "crit" : errLast1h > 0 ? "warn" : "good"}
          sub={isSpike ? "spike vs. the last 24h average" : `${errRows.length} in the last 24h`}
        />
        <StatCard label="Fans paid today" value={String(payingFans)} tone={payingFans > 0 ? "good" : "neutral"} sub={`${starsToday} ⭐ total`} />
        <StatCard
          label="Fans flagged today"
          value={String(flaggedFansToday)}
          tone={flaggedFansToday > 0 ? "warn" : "good"}
          sub={`${blockedTotal} blocked all-time`}
        />
        <StatCard label="Window" value="24h" tone="neutral" sub={`since ${new Date(since24h).toLocaleTimeString()}`} />
      </div>

      {isSpike && (
        <Card className="mb-4 border-crit/40 p-4">
          <div className="text-sm font-medium text-crit">Error spike</div>
          <p className="mt-1 text-sm text-muted">
            {errLast1h} errors in the last hour, well above the ~{avgPerHour.toFixed(1)}/hour average over the rest of
            the last 24h. Check the Logs page for detail.
          </p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Where errors are coming from (24h)</h2>
          </div>
          {topErrorSources.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted">No errors in the last 24h.</div>
          ) : (
            <ul className="divide-y divide-line">
              {topErrorSources.map(([source, count]) => (
                <li key={source} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span>{sourceLabel(source)}</span>
                  <Badge className="bg-crit/15 text-crit">{count}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Fans flagged today</h2>
          </div>
          {safetyRows.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted">No safety flags today.</div>
          ) : (
            <ul className="divide-y divide-line">
              {safetyRows.slice(0, 15).map((r) => (
                <li key={r.id} className="px-4 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{r.clones?.name ?? "Unknown clone"}{r.telegram_id ? ` · fan ${r.telegram_id}` : ""}</span>
                    <span className="shrink-0 text-[11px] text-muted">{new Date(r.ts).toLocaleTimeString()}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted">{r.message}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {payRows.length > 0 && (
        <Card className="mt-4 overflow-hidden p-0">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Payments today by clone</h2>
          </div>
          <ul className="divide-y divide-line">
            {[...groupPaymentsByClone(payRows).entries()].map(([name, g]) => (
              <li key={name} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span>{name}</span>
                <span className="font-mono tabular-nums text-good">
                  {g.stars} ⭐ · {g.fans} fan{g.fans === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function groupPaymentsByClone(
  rows: { user_id: string | null; telegram_id: number | null; amount_stars: number | null; clone_id: string; clones: { name: string } | null }[],
): Map<string, { stars: number; fans: number }> {
  const byClone = new Map<string, { stars: number; fanIds: Set<string> }>();
  for (const r of rows) {
    const name = r.clones?.name ?? "Unknown clone";
    const g = byClone.get(name) ?? { stars: 0, fanIds: new Set<string>() };
    g.stars += r.amount_stars ?? 0;
    g.fanIds.add(r.user_id ?? String(r.telegram_id));
    byClone.set(name, g);
  }
  const out = new Map<string, { stars: number; fans: number }>();
  for (const [name, g] of byClone) out.set(name, { stars: g.stars, fans: g.fanIds.size });
  return out;
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "good" | "warn" | "crit" | "neutral";
}) {
  const toneCls =
    tone === "crit" ? "text-crit" : tone === "warn" ? "text-warn" : tone === "good" ? "text-good" : "text-ink";
  return (
    <Card className="p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${toneCls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
    </Card>
  );
}
