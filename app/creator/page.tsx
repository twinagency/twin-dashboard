import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import TwinWordmark from "@/components/TwinWordmark";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { supabaseAdmin } from "@/lib/supabase";
import { getDashboard, type CloneStats, type DashboardData, type Period } from "@/lib/dashboard-data";
import { fmtMoney, fmtNum, starsToMoney } from "@/lib/money";
import { CREATOR_SESSION_COOKIE, verifyCreatorSession } from "@/lib/creator-session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Creator Dashboard · Twin" };

const PERIODS: { key: Period; label: string }[] = [
  { key: "1D", label: "24H" }, { key: "1W", label: "7D" }, { key: "2W", label: "14D" },
  { key: "1M", label: "30D" }, { key: "3M", label: "3M" }, { key: "6M", label: "6M" },
  { key: "1Y", label: "1Y" }, { key: "ALL", label: "All" },
];
const VALID_PERIODS = new Set(PERIODS.map((p) => p.key));

type TrendPoint = { label: string; stars: number };

function cloneStats(data: DashboardData | null, cloneId: string | null): CloneStats | null {
  if (!data || !cloneId) return null;
  return data.perClone[cloneId] || null;
}
function money(stars: number | null | undefined) { return fmtMoney(starsToMoney(Number(stars || 0), "USD"), "USD"); }
function metric(label: string, value: string, sub?: string) {
  return <Card className="border border-border bg-white shadow-sm"><CardHeader className="pb-1 text-sm text-muted">{label}</CardHeader><CardContent><div className="font-heading text-3xl font-semibold tracking-[-0.03em] text-ink">{value}</div>{sub ? <div className="mt-1 text-xs text-muted">{sub}</div> : null}</CardContent></Card>;
}

function aggregateTrend(points: TrendPoint[], period: Period): TrendPoint[] {
  if (points.length === 0) return [];
  let chunk = 1;
  if (period === "3M" || period === "6M") chunk = 7;
  if (period === "1Y" || period === "ALL") chunk = Math.max(1, Math.ceil(points.length / 12));
  if (chunk === 1) return points;

  const out: TrendPoint[] = [];
  for (let i = 0; i < points.length; i += chunk) {
    const group = points.slice(i, i + chunk);
    out.push({
      label: group.length === 1 ? group[0].label : `${group[0].label}–${group[group.length - 1].label}`,
      stars: group.reduce((sum, p) => sum + p.stars, 0),
    });
  }
  return out;
}

function RevenueTrend({ points, periodLabel }: { points: TrendPoint[]; periodLabel: string }) {
  if (points.length === 0) {
    return <div className="rounded-xl bg-muted/10 px-4 py-8 text-center text-sm text-muted">No revenue data available for this period.</div>;
  }

  const max = Math.max(1, ...points.map((p) => p.stars));
  const width = 100;
  const height = 34;
  const chartTop = 3;
  const chartBottom = 29;
  const usable = chartBottom - chartTop;
  const coords = points.map((p, i) => {
    const x = points.length === 1 ? width / 2 : (i / (points.length - 1)) * width;
    const y = chartBottom - (Math.max(0, p.stars) / max) * usable;
    return { x, y };
  });
  const line = coords.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const area = `0,${chartBottom} ${line} ${width},${chartBottom}`;
  const total = points.reduce((sum, p) => sum + p.stars, 0);
  const best = points.reduce((a, b) => b.stars > a.stars ? b : a, points[0]);
  const labelIndexes = Array.from(new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]));

  return <div>
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div><div className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Revenue · {periodLabel}</div><div className="mt-1 font-heading text-3xl font-semibold tracking-[-0.03em] text-ink">{money(total)}</div></div>
      <div className="text-right"><div className="text-xs text-muted">Best period</div><div className="mt-1 text-sm font-semibold text-ink">{money(best.stars)}</div><div className="text-xs text-muted">{best.label}</div></div>
    </div>
    <div className="rounded-2xl border border-border bg-[#fbfcfe] px-3 pb-3 pt-4">
      <svg viewBox="0 0 100 34" className="h-48 w-full overflow-visible" preserveAspectRatio="none" role="img" aria-label={`Revenue trend for ${periodLabel}`}>
        <line x1="0" y1="29" x2="100" y2="29" stroke="currentColor" className="text-border" strokeWidth="0.35" />
        <line x1="0" y1="16" x2="100" y2="16" stroke="currentColor" className="text-border/60" strokeWidth="0.25" />
        <polygon points={area} fill="currentColor" className="text-primary/10" />
        <polyline points={line} fill="none" stroke="currentColor" className="text-primary" strokeWidth="1.25" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="0.75" fill="currentColor" className="text-primary" />)}
      </svg>
      <div className="mt-1 grid grid-cols-3 text-[11px] text-muted">
        {labelIndexes.map((idx, pos) => <span key={idx} className={pos === 1 ? "text-center" : pos === 2 ? "text-right" : ""}>{points[idx]?.label}</span>)}
      </div>
    </div>
  </div>;
}

export default async function CreatorHomePage({ searchParams }: { searchParams?: Promise<{ period?: string }> }) {
  const session = await verifyCreatorSession((await cookies()).get(CREATOR_SESSION_COOKIE)?.value);
  if (!session) redirect("/creator/login");
  const params = (await searchParams) || {};
  const requested = (params.period || "1W").toUpperCase() as Period;
  const period: Period = VALID_PERIODS.has(requested) ? requested : "1W";

  const [{ data: account }, { data: application }, { data: assignment }, { data: link }] = await Promise.all([
    supabaseAdmin.from("creator_accounts").select("id,display_name,email,account_status").eq("id", session.accountId).single(),
    supabaseAdmin.from("creator_applications").select("status").eq("creator_account_id", session.accountId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("creator_agency_assignments").select("agency_id,partner_agencies(name)").eq("creator_account_id", session.accountId).maybeSingle(),
    supabaseAdmin.from("creator_clone_links").select("clone_id,twin_slug,clones(name)").eq("creator_account_id", session.accountId).maybeSingle(),
  ]);
  if (!account) redirect("/creator-auth/logout");

  const cloneId = link?.clone_id || null;
  const cloneName = (link as any)?.clones?.name || link?.twin_slug || "Not linked yet";
  const agencyName = (assignment as any)?.partner_agencies?.name || "Twin Direct";
  let selected: DashboardData | null = null;
  let performanceError = false;
  if (cloneId) {
    try { selected = await getDashboard(period); }
    catch (error) { performanceError = true; console.error("creator dashboard performance load failed", { period, error }); }
  }
  const stats = cloneStats(selected, cloneId);
  const recent = cloneId ? (selected?.recent || []).filter((tx) => tx.cloneId === cloneId).slice(0, 10) : [];
  const submitted = ["submitted", "reviewing", "approved"].includes(application?.status || "");
  const periodLabel = PERIODS.find((p) => p.key === period)?.label || period;

  const rawTrend: TrendPoint[] = cloneId && selected
    ? selected.series.map((row, i) => ({ label: selected!.bucketLabels[i] || String(row.bucket || ""), stars: Number(row[cloneId] || 0) }))
    : [];
  const firstActivity = rawTrend.findIndex((r) => r.stars !== 0);
  const trimmedTrend = firstActivity >= 0 ? rawTrend.slice(firstActivity) : [];
  const trend = aggregateTrend(trimmedTrend, period);
  const dataSince = trimmedTrend[0]?.label || null;

  return <div className="min-h-screen bg-[#f6f8fb]">
    <header className="sticky top-0 z-20 border-b border-border bg-white/95 backdrop-blur"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4"><TwinWordmark /><div className="flex items-center gap-4"><Link href="/creator/onboarding" className="text-sm font-medium text-muted hover:text-ink">Onboarding</Link><form action="/creator-auth/logout" method="post"><button className="text-sm font-medium text-muted hover:text-ink">Sign out</button></form></div></div></header>
    <main className="mx-auto max-w-7xl px-5 py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-2">Creator dashboard</p><h1 className="mt-2 font-heading text-4xl font-semibold tracking-[-0.04em] text-ink">Hi, {account.display_name || "creator"}</h1><p className="mt-2 text-muted">Track your Twin performance, audience and sales in one place.</p></div><div className="rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-ink">{cloneId ? cloneName : "Awaiting clone connection"}</div></div>

      <div className="mt-7 overflow-x-auto pb-1"><div className="flex min-w-max gap-2">{PERIODS.map((p) => <Link key={p.key} href={`/creator?period=${p.key}`} className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${period === p.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-white text-muted hover:text-ink"}`}>{p.label}</Link>)}</div></div>

      {!cloneId ? <div className="mt-7 rounded-2xl border border-border bg-white p-6 shadow-sm"><div className="text-lg font-semibold text-ink">Your onboarding is submitted</div><p className="mt-2 text-sm leading-6 text-muted">Performance data will populate automatically as soon as this account is linked to your live clone.</p></div> : null}
      {performanceError ? <div className="mt-7 rounded-2xl border border-amber-200 bg-white p-5 text-sm text-muted shadow-sm"><span className="font-semibold text-ink">Performance data failed to load for {periodLabel}.</span> The clone link is intact. Try another period or refresh while we resolve the data read.</div> : null}

      <section className="mt-8"><div className="mb-4"><h2 className="font-heading text-2xl font-semibold text-ink">Performance · {periodLabel}</h2><p className="mt-1 text-sm text-muted">Every metric below follows the selected period, except messageable now and total fans.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {metric(`Revenue · ${periodLabel}`, cloneId && stats ? money(stats.stars) : "—", cloneId ? "Gross clone revenue" : undefined)}
          {metric(`Sales · ${periodLabel}`, cloneId && stats ? fmtNum(stats.sales) : "—")}
          {metric(`Buyers · ${periodLabel}`, cloneId && stats ? fmtNum(stats.buyers) : "—")}
          {metric(`Active users · ${periodLabel}`, cloneId && stats ? fmtNum(stats.activeUsers) : "—")}
          {metric(`Messages · ${periodLabel}`, cloneId && stats ? fmtNum(stats.messages) : "—")}
          {metric(`New fans · ${periodLabel}`, cloneId && stats ? fmtNum(stats.newFans) : "—")}
          {metric("Total fans", cloneId && stats ? fmtNum(stats.totalFans) : "—", "All-time audience")}
          {metric("Messageable now", cloneId && stats ? fmtNum(stats.reachable24h) : "—", "Last 24 hours")}
          {metric("Repeat buyers", cloneId && stats ? `${stats.repeatPct.toFixed(1)}%` : "—", `Within ${periodLabel}`)}
        </div>
        {cloneId ? <p className="mt-3 text-xs leading-5 text-muted">Revenue currently shows gross clone sales. Creator payout/earnings will replace this once the creator revenue-share percentage is configured.</p> : null}
      </section>

      <section className="mt-8"><Card className="border border-border bg-white shadow-sm"><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-heading text-xl font-semibold text-ink">Earnings trend</h2><p className="mt-1 text-sm text-muted">A simple view of how revenue moved across the selected period.</p></div>{dataSince && period !== "1D" ? <span className="rounded-full bg-muted/10 px-3 py-1.5 text-xs font-medium text-muted">Data available from {dataSince}</span> : null}</div></CardHeader><CardContent><RevenueTrend points={trend} periodLabel={periodLabel} /></CardContent></Card></section>

      <section className="mt-8 grid gap-5 lg:grid-cols-3"><Card className="border border-border bg-white shadow-sm lg:col-span-2"><CardHeader><h2 className="font-heading text-xl font-semibold text-ink">Paid activity · {periodLabel}</h2><p className="mt-1 text-sm text-muted">Latest transactions inside this period.</p></CardHeader><CardContent>{recent.length === 0 ? <div className="rounded-xl bg-muted/10 px-4 py-8 text-center text-sm text-muted">No paid activity available for this period.</div> : <div className="divide-y divide-border">{recent.map((tx, index) => <div key={`${tx.paidAt}-${index}`} className="flex items-center justify-between gap-4 py-3"><div className="min-w-0"><div className="truncate text-sm font-medium text-ink">{tx.buyerName || tx.username || "Fan"}</div><div className="mt-0.5 text-xs capitalize text-muted">{tx.kind || "purchase"} · {new Date(tx.paidAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</div></div><div className="shrink-0 text-right"><div className="text-sm font-semibold text-ink">{money(tx.stars)}</div><div className="text-xs text-muted">{fmtNum(tx.stars)} stars</div></div></div>)}</div>}</CardContent></Card>
        <div className="grid gap-5"><Card className="border border-border bg-white shadow-sm"><CardHeader><h2 className="font-heading text-xl font-semibold text-ink">Your Twin</h2></CardHeader><CardContent className="grid gap-3 text-sm"><div className="flex justify-between gap-4"><span className="text-muted">Clone</span><span className="text-right font-medium text-ink">{cloneName}</span></div><div className="flex justify-between gap-4"><span className="text-muted">Agency</span><span className="text-right font-medium text-ink">{agencyName}</span></div><div className="flex justify-between gap-4"><span className="text-muted">Status</span><span className="text-right font-medium capitalize text-ink">{account.account_status}</span></div></CardContent></Card>
          <Card className="border border-border bg-white shadow-sm"><CardHeader><h2 className="font-heading text-xl font-semibold text-ink">Quick stats</h2></CardHeader><CardContent className="grid gap-3 text-sm"><div className="flex justify-between"><span className="text-muted">Avg order</span><span className="font-medium text-ink">{stats && stats.sales > 0 ? money(stats.grossPaymentStars / stats.sales) : "—"}</span></div><div className="flex justify-between"><span className="text-muted">AI calls</span><span className="font-medium text-ink">{stats ? fmtNum(stats.aiCalls) : "—"}</span></div><div className="flex justify-between"><span className="text-muted">AI errors</span><span className="font-medium text-ink">{stats ? fmtNum(stats.aiErrors) : "—"}</span></div></CardContent></Card></div>
      </section>
      {submitted ? <div className="mt-8 flex items-center justify-between gap-4 rounded-2xl border border-border bg-white px-5 py-4 text-sm shadow-sm"><div><span className="font-medium text-ink">Onboarding complete.</span> <span className="text-muted">You can still view what you submitted.</span></div><Link href="/creator/onboarding" className="shrink-0 font-medium text-primary hover:underline">View onboarding</Link></div> : null}
    </main>
  </div>;
}
