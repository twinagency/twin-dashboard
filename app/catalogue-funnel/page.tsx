import Link from "next/link";
import { Card } from "@/components/ui/card";
import { fmtNum } from "@/lib/money";
import { supabaseAdmin } from "@/lib/supabase";
import { TEST_TELEGRAM_IDS, type CatalogueEventName } from "@/lib/catalogue-events";

export const dynamic = "force-dynamic";

type EventRow = {
  clone_id: string;
  telegram_id: number | null;
  event: CatalogueEventName;
  rail: "stars" | "ton" | null;
  amount_stars: number | null;
  amount_nanoton: string | number | null;
  detail: Record<string, unknown> | null;
  created_at: string;
};

type Bucket = {
  opens: Set<number | string>;
  itemViews: number;
  tapStars: number;
  tapTon: number;
  successStars: number;
  successStarsAmount: number;
  successTon: number;
  successTonAmount: number;
};
function emptyBucket(): Bucket {
  return { opens: new Set(), itemViews: 0, tapStars: 0, tapTon: 0, successStars: 0, successStarsAmount: 0, successTon: 0, successTonAmount: 0 };
}
function isTestRow(row: EventRow): boolean {
  return (row.telegram_id != null && TEST_TELEGRAM_IDS.has(Number(row.telegram_id))) || row.detail?.test === true;
}
function accumulate(bucket: Bucket, row: EventRow) {
  if (row.event === "open") bucket.opens.add(row.telegram_id ?? `anon:${Math.random()}`);
  else if (row.event === "view_item" || row.event === "view_bundle") bucket.itemViews += 1;
  else if (row.event === "tap_pay_stars") bucket.tapStars += 1;
  else if (row.event === "tap_pay_ton") bucket.tapTon += 1;
  else if (row.event === "pay_success" && row.rail === "stars") { bucket.successStars += 1; bucket.successStarsAmount += Number(row.amount_stars ?? 0); }
  else if (row.event === "pay_success" && row.rail === "ton") { bucket.successTon += 1; bucket.successTonAmount += Number(row.amount_nanoton ?? 0); }
}
function pct(a: number, b: number): string {
  return b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "-";
}
function tonAmount(nanoton: number): string {
  return (nanoton / 1_000_000_000).toFixed(2);
}

export default async function CatalogueFunnelPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const showTest = params.showTest === "1";

  const now = Date.now();
  const todayStart = new Date(now - 24 * 60 * 60_000).toISOString();
  const weekStart = new Date(now - 7 * 24 * 60 * 60_000).toISOString();

  const [clonesRes, eventsRes] = await Promise.all([
    supabaseAdmin.from("clones").select("id,name").eq("status", "active").order("name", { ascending: true }),
    supabaseAdmin
      .from("catalogue_events")
      .select("clone_id,telegram_id,event,rail,amount_stars,amount_nanoton,detail,created_at")
      .gte("created_at", weekStart)
      .order("created_at", { ascending: false })
      .limit(20_000),
  ]);
  if (clonesRes.error) throw new Error(clonesRes.error.message);
  if (eventsRes.error) throw new Error(eventsRes.error.message);

  const clones = clonesRes.data ?? [];
  const cloneName = new Map(clones.map((c) => [c.id, c.name]));
  const allEvents = (eventsRes.data ?? []) as EventRow[];
  const events = showTest ? allEvents : allEvents.filter((row) => !isTestRow(row));

  const today = new Map<string, Bucket>();
  const week = new Map<string, Bucket>();
  for (const row of events) {
    if (!week.has(row.clone_id)) week.set(row.clone_id, emptyBucket());
    accumulate(week.get(row.clone_id)!, row);
    if (row.created_at >= todayStart) {
      if (!today.has(row.clone_id)) today.set(row.clone_id, emptyBucket());
      accumulate(today.get(row.clone_id)!, row);
    }
  }

  const cloneIds = [...new Set([...cloneName.keys(), ...week.keys()])].sort((a, b) => (cloneName.get(a) ?? "").localeCompare(cloneName.get(b) ?? ""));

  const fleetToday = emptyBucket();
  const fleetWeek = emptyBucket();
  for (const bucket of today.values()) mergeBucket(fleetToday, bucket);
  for (const bucket of week.values()) mergeBucket(fleetWeek, bucket);
  function mergeBucket(into: Bucket, from: Bucket) {
    for (const id of from.opens) into.opens.add(id);
    into.itemViews += from.itemViews; into.tapStars += from.tapStars; into.tapTon += from.tapTon;
    into.successStars += from.successStars; into.successStarsAmount += from.successStarsAmount;
    into.successTon += from.successTon; into.successTonAmount += from.successTonAmount;
  }

  const recent = events.slice(0, 50);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Catalogue funnel</h1>
        <p className="mt-1 text-sm text-muted">Mini App opens, item views, pay taps and confirmed sales by clone. Owner and test accounts are excluded below unless shown.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Opens today", fmtNum(fleetToday.opens.size), "unique fans, fleet-wide"],
          ["Pay taps today", fmtNum(fleetToday.tapStars + fleetToday.tapTon), `${fmtNum(fleetToday.tapStars)} Stars, ${fmtNum(fleetToday.tapTon)} TON`],
          ["Sales today", fmtNum(fleetToday.successStars + fleetToday.successTon), `${fmtNum(fleetToday.successStarsAmount)} Stars, ${tonAmount(fleetToday.successTonAmount)} TON`],
          ["Open to pay, today", pct(fleetToday.successStars + fleetToday.successTon, fleetToday.opens.size), "confirmed sale per fan who opened"],
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
          <h2 className="font-semibold text-ink">By clone, last 7 days (today in parentheses)</h2>
          <p className="text-xs text-muted">Opens are distinct fans. Sales and taps are event counts. Conversion is confirmed sales / opens.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="text-muted">
              <tr>
                <th className="py-2">Creator</th><th>Opens</th><th>Item views</th><th>Taps · Stars</th><th>Taps · TON</th>
                <th>Sales · Stars</th><th>Sales · TON</th><th>Stars revenue</th><th>TON revenue</th><th>Open to pay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {cloneIds.map((id) => {
                const w = week.get(id) ?? emptyBucket();
                const t = today.get(id) ?? emptyBucket();
                const conv = pct(w.successStars + w.successTon, w.opens.size);
                return (
                  <tr key={id}>
                    <td className="py-2 font-medium text-ink">{cloneName.get(id) ?? id}</td>
                    <td>{fmtNum(w.opens.size)} <span className="text-muted">({fmtNum(t.opens.size)})</span></td>
                    <td>{fmtNum(w.itemViews)} <span className="text-muted">({fmtNum(t.itemViews)})</span></td>
                    <td>{fmtNum(w.tapStars)} <span className="text-muted">({fmtNum(t.tapStars)})</span></td>
                    <td>{fmtNum(w.tapTon)} <span className="text-muted">({fmtNum(t.tapTon)})</span></td>
                    <td>{fmtNum(w.successStars)} <span className="text-muted">({fmtNum(t.successStars)})</span></td>
                    <td>{fmtNum(w.successTon)} <span className="text-muted">({fmtNum(t.successTon)})</span></td>
                    <td>⭐{fmtNum(w.successStarsAmount)}</td>
                    <td>{tonAmount(w.successTonAmount)} TON</td>
                    <td>{conv}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {cloneIds.length === 0 && <div className="py-6 text-sm text-muted">No catalogue activity in the last 7 days.</div>}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-ink">Recent events</h2>
            <p className="text-xs text-muted">Last {recent.length} events{showTest ? "" : ", owner and test accounts excluded"}.</p>
          </div>
          <Link
            href={showTest ? "/catalogue-funnel" : "/catalogue-funnel?showTest=1"}
            className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-muted hover:bg-muted/10"
          >
            {showTest ? "Hide test accounts" : "Show test accounts"}
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead className="text-muted">
              <tr><th className="py-2">Time</th><th>Creator</th><th>Event</th><th>Rail</th><th>Fan</th><th>Detail</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {recent.map((row, i) => (
                <tr key={i}>
                  <td className="py-2 whitespace-nowrap text-muted">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="font-medium text-ink">{cloneName.get(row.clone_id) ?? row.clone_id}</td>
                  <td>{row.event}</td>
                  <td>{row.rail ?? "-"}</td>
                  <td>{row.telegram_id ?? "-"}{isTestRow(row) ? " (test)" : ""}</td>
                  <td className="max-w-[280px] truncate text-muted">
                    {row.amount_stars ? `${row.amount_stars} stars` : row.amount_nanoton ? `${tonAmount(Number(row.amount_nanoton))} TON` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {recent.length === 0 && <div className="py-6 text-sm text-muted">No events to show.</div>}
        </div>
      </Card>
    </main>
  );
}
