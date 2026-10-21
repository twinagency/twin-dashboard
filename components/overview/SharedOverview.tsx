"use client";

import { useEffect, useState, type FormEvent, type ComponentType } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, MessageCircle, Plus, RefreshCw, UserRound, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDashboardAccess } from "@/components/DashboardAccessProvider";
import RankingPanel from "@/components/overview-rankings/RankingPanel";
import type { FullData } from "@/components/RevenueDashboard";
import type { Period } from "@/lib/dashboard-data";
import { REPORT_TZ, reportTzLabel } from "@/lib/report-time";
import styles from "./SharedOverview.module.css";

export type SharedOverviewCreator = {
  id: string; name: string; color?: string; photoUrl?: string | null;
  position?: string; zoom?: number; onboarding?: boolean;
};
export type SharedOverviewConfig = {
  creators: SharedOverviewCreator[];
  creatorsHref: string;
  chatHref?: string;
  brand?: "twin" | "moxy" | "flirt";
  creatorOverviewPath?: string;
  onSelectCreator?: (id: string | null) => Promise<void>;
};
type Range = { start: string; end: string };
type Props = SharedOverviewConfig & {
  cloneId?: string | null; data: FullData | null; loading: boolean; error: string | null;
  period: Period; range: Range | null; currency: string;
  money: (stars: number, cloneId?: string | null) => string;
  onPeriod: (period: Period) => void; onRange: (range: Range) => void;
  onRefresh: () => void; onDetails: () => void;
};
export type SharedOverviewRenderer = SharedOverviewConfig & { component: ComponentType<Props> };
const periods: [Period, string][] = [["1D", "Last 24 hours"], ["1W", "Last 7 days"], ["2W", "Last 2 weeks"], ["1M", "Last month"], ["3M", "Last 3 months"], ["6M", "Last 6 months"], ["1Y", "Last year"], ["ALL", "All time"]];
const count = (value: number) => value.toLocaleString("en-AU");
const kindLabel: Record<string, string> = { photo: "Photo", video: "Video", bundle: "Bundle", credits: "Paid messages", tip: "Tip", subscription: "Subscription", refund: "Adjustment" };

function Portrait({ creator }: { creator: SharedOverviewCreator }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [creator.photoUrl]);
  return creator.photoUrl && !failed
    ? <img src={creator.photoUrl} alt={creator.name} onError={() => setFailed(true)} style={{ objectPosition: creator.position ?? "50% 35%", transform: `scale(${creator.zoom ?? 1})`, transformOrigin: creator.position ?? "50% 35%" }} />
    : <UserRound aria-label={`${creator.name}, profile photo unavailable`} />;
}

/** Shared presentation only. RevenueDashboard retains each deployment's reader,
 * revenue projection, currency rates, refresh lifecycle and report state. */
export default function SharedOverview({ creators, creatorsHref, chatHref, brand: configuredBrand, creatorOverviewPath, onSelectCreator, cloneId, data, loading, error, period, range, currency, money, onPeriod, onRange, onRefresh, onDetails }: Props) {
  const router = useRouter();
  const { isAgency, agencyName } = useDashboardAccess();
  const brand = configuredBrand ?? (agencyName?.trim().toLowerCase() === "moxy" ? "moxy" : agencyName?.trim().toLowerCase() === "flirt" ? "flirt" : "twin");
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const [chartType, setChartType] = useState<"line" | "bar">("line");
  const [byCreator, setByCreator] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [draft, setDraft] = useState<Range>({ start: "", end: "" });
  const [dateError, setDateError] = useState("");
  const selected = creators.find(c => c.id === cloneId);
  const stats = cloneId ? data?.perClone[cloneId] : data?.totals;
  const conversion = data?.analytics?.buyerConversion;
  const reportingWindow = range ? `${range.start} to ${range.end}` : periods.find(([key]) => key === period)?.[1] ?? "Selected period";
  const chartCreators = (data?.clones ?? []).filter(c => !cloneId || c.id === cloneId);
  const chartRows = (data?.series ?? []).map(row => ({ ...row, __total: chartCreators.reduce((sum, creator) => sum + (Number(row[creator.id]) || 0), 0) }));
  const recent = (data?.recent ?? []).filter(row => !cloneId || row.cloneId === cloneId).slice(0, 5);
  const profileCreators = creators.slice(0, 5);
  const loadingValue = loading ? "…" : "Unavailable";
  const metrics = [
    ["Net revenue", stats ? money(stats.stars) : loadingValue, "After refunds and adjustments", true],
    [cloneId ? "Buyers" : "Unique buyers", stats ? count(stats.buyers) : loadingValue, "Positive paid orders", false],
    ["Messaged → buyer", conversion?.activeChatBuyerRate == null ? "Unavailable" : `${(conversion.activeChatBuyerRate * 100).toFixed(1)}%`, conversion ? `${count(conversion.activeChatBuyers)} of ${count(conversion.activeChatters)}` : "Selected period", false],
    ["Revenue / buyer", stats ? stats.buyers ? money(stats.stars / stats.buyers) : "No buyers" : loadingValue, "Net revenue per buyer", true],
    ["Paid orders", stats ? count(stats.sales) : loadingValue, stats?.sales ? `${money(stats.grossPaymentStars / stats.sales)} average` : "Selected period", false],
    ["Total fans", stats ? count(stats.totalFans) : loadingValue, stats ? `${count(stats.activeUsers)} messaged this period` : "All-time fan relationships", false],
  ] as const;

  async function chooseCreator(id: string) {
    if (switching) return;
    if (creators.find(c => c.id === id)?.onboarding) { router.push("/agency/creators"); return; }
    setSwitching(true); setSwitchError("");
    try {
      if (isAgency) {
        const response = await fetch("/agency/clone-scope", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clone: id }) });
        if (!response.ok) throw new Error("Creator selection could not be changed. Please try again.");
      } else if (onSelectCreator) await onSelectCreator(id || null);
      else throw new Error("Creator selection is unavailable. Please refresh and try again.");
      if (creatorOverviewPath) router.push(id ? `${creatorOverviewPath}?clone=${encodeURIComponent(id)}` : creatorOverviewPath);
      router.refresh();
    } catch (e) { setSwitchError(e instanceof Error ? e.message : "Could not open this creator."); }
    finally { setSwitching(false); }
  }
  function openDates() { setDraft(range ?? { start: "", end: "" }); setDateError(""); setDateOpen(true); }
  function applyDates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.start || !draft.end || draft.start > draft.end) { setDateError("Choose a start date on or before the end date."); return; }
    onRange(draft); setDateOpen(false);
  }
  const chartAxes = [<CartesianGrid key="grid" stroke="var(--overview-line)" strokeDasharray="3 4" vertical={false} />, <XAxis key="x" dataKey="bucket" axisLine={false} tickLine={false} minTickGap={45} tick={{ fill: "var(--overview-muted)", fontSize: 12 }} />, <YAxis key="y" width={78} axisLine={false} tickLine={false} tick={{ fill: "var(--overview-muted)", fontSize: 12 }} tickFormatter={value => money(Number(value)).replace(/\.00$/, "")} />, <Tooltip key="tooltip" formatter={(value, name) => [money(Number(value), name === "__total" ? cloneId : String(name)), name === "__total" ? "Total" : chartCreators.find(c => c.id === name)?.name ?? String(name)]} contentStyle={{ borderRadius: 10, borderColor: "var(--overview-line)", color: "var(--overview-ink)", background: "var(--overview-panel)" }} />];

  return <div className={styles.page} data-shared-overview={brand} data-live-overview="true" aria-busy={switching}>
    {cloneId && <button type="button" className={styles.textButton} disabled={switching} onClick={() => void chooseCreator("")}>All creators overview</button>}
    <section className={styles.hero} aria-label="Dashboard overview">
      <div className={styles.heroCopy}><p>{selected ? "CREATOR OVERVIEW" : "DASHBOARD OVERVIEW"}</p><h1 className={selected ? "creator-name" : undefined}>{selected?.name ?? "Your creators, at a glance."}</h1><span>{reportingWindow} · Telegram earnings, fans and activity.</span><div className={styles.heroActions}>
        <Link className={styles.primary} href={selected ? `/clones/${selected.id}?tab=identity` : creatorsHref}>{selected ? "View creator" : "View creators"}<ArrowRight size={17} /></Link>
        {chatHref && <Link className={styles.secondary} href={chatHref}>Live Telegram Chat<MessageCircle size={17} /></Link>}
      </div></div>
      {selected ? <div className={styles.selectedPortrait}><Portrait key={selected.id} creator={selected} /></div> : <div className={styles.creatorDisplay}><nav className={styles.portraits} aria-label="Creator dashboards">
        {profileCreators.map(creator => <button type="button" key={creator.id} disabled={switching} onClick={() => void chooseCreator(creator.id)} className={`${styles.creatorShortcut} creator-name`} aria-label={`Open ${creator.name} dashboard`}><span className={styles.portrait}><Portrait creator={creator} /></span><span>{creator.name}</span></button>)}
        <Link href={creatorsHref} className={styles.creatorShortcut}><span className={styles.morePortrait}>{profileCreators.some(c => c.photoUrl) ? <span className={styles.collage}>{profileCreators.filter(c => c.photoUrl).slice(0, 4).map(c => <Portrait key={c.id} creator={c} />)}</span> : <Users size={30} />}<span className={styles.plus}><Plus size={15} /></span></span><span>View more</span></Link>
      </nav><span className={styles.creatorCount}><Users size={16} />{count(creators.length)} creators</span></div>}
    </section>
    {switchError && <div className={styles.error} role="alert">{switchError}</div>}
    {error && <div className={styles.error} role="alert"><span>Earnings could not be refreshed.{data ? " Showing the last successfully loaded figures." : " Please try again."}</span><button type="button" onClick={onRefresh} disabled={loading}>Retry</button></div>}
    <div className={styles.reporting}><div><h2>Earnings overview</h2><p>{currency} · {reportTzLabel()}{data?.stale ? " · Updating figures" : ""}</p></div><div className={styles.reportingActions}><label className={styles.period}><CalendarDays size={17} /><select aria-label="Reporting period" value={range ? "CUSTOM" : period} onChange={event => event.target.value === "CUSTOM" ? openDates() : onPeriod(event.target.value as Period)}>{periods.map(([key, label]) => <option key={key} value={key}>{label}</option>)}<option value="CUSTOM">Custom dates</option></select></label><button className={styles.refresh} type="button" onClick={onRefresh} disabled={loading} aria-label="Refresh earnings"><RefreshCw size={17} /><span>{loading ? "Refreshing…" : "Refresh"}</span></button></div></div>
    {range && <button type="button" className={styles.rangeLabel} onClick={openDates}>{reportingWindow}<CalendarDays size={14} /></button>}
    <section className={styles.metrics} aria-label="Earnings summary">{metrics.map(([label, value, meta, isMoney]) => <article key={label} className={styles.metric} data-overview-metric={label}><h3>{label}</h3><strong className={isMoney ? "money-value" : undefined}>{value}</strong><small>{meta}</small></article>)}</section>
    <div className={styles.mainGrid}>
      <section className={styles.panel} aria-label="Revenue performance"><header className={styles.panelHeading}><div><h2>Revenue performance</h2><p>{selected?.name ?? "All creators"} · {reportingWindow}</p></div><div className={styles.quickPeriods} role="group" aria-label="Chart period">{([["1W", "7 days"], ["1M", "30 days"], ["6M", "6 months"], ["ALL", "All time"]] as [Period, string][]).map(([value, label]) => <button type="button" key={value} aria-pressed={!range && period === value} onClick={() => onPeriod(value)}>{label}</button>)}</div></header>
        <div className={styles.chartToolbar}><div className={styles.legend}><span />Telegram<strong className="money-value">{stats ? money(stats.stars) : loadingValue}</strong></div><div className={styles.chartOptions}>{!cloneId && chartCreators.length > 1 && <button type="button" aria-pressed={byCreator} onClick={() => setByCreator(value => !value)}>By creator</button>}<div role="group" aria-label="Chart type">{(["line", "bar"] as const).map(value => <button type="button" key={value} aria-pressed={chartType === value} onClick={() => setChartType(value)}>{value === "line" ? "Line" : "Bar"}</button>)}</div></div></div>
        <div className={styles.chart} role="img" aria-label={`Telegram revenue for ${reportingWindow}`}>
          {!data ? <div className={styles.empty}>{loading ? "Loading earnings…" : "Earnings are unavailable. Use Refresh to try again."}</div> : chartRows.length ? <ResponsiveContainer width="100%" height="100%">{chartType === "line" ? <LineChart data={chartRows} margin={{ top: 12, right: 14, bottom: 5, left: 0 }}>{chartAxes}{byCreator && !cloneId ? chartCreators.map(c => <Line key={c.id} dataKey={c.id} stroke={c.color} dot={false} strokeWidth={2} isAnimationActive={false} />) : <Line dataKey="__total" stroke="var(--overview-accent)" dot={false} strokeWidth={2.5} isAnimationActive={false} />}</LineChart> : <BarChart data={chartRows} margin={{ top: 12, right: 14, bottom: 5, left: 0 }}>{chartAxes}{byCreator && !cloneId ? chartCreators.map(c => <Bar key={c.id} dataKey={c.id} stackId="creators" fill={c.color} isAnimationActive={false} />) : <Bar dataKey="__total" fill="var(--overview-accent)" radius={[3, 3, 0, 0]} isAnimationActive={false} />}</BarChart>}</ResponsiveContainer> : <div className={styles.empty}>No revenue recorded in this period.</div>}
        </div>{byCreator && !cloneId && <div className={styles.creatorLegend}>{chartCreators.map(c => <span key={c.id}><i style={{ background: c.color }} />{c.name}</span>)}</div>}
      </section>
      <section className={styles.panel} aria-label="Recent purchases"><header className={styles.panelHeading}><h2>Recent purchases</h2><button type="button" className={styles.textButton} onClick={onDetails}>View all<ArrowRight size={15} /></button></header><div className={styles.purchases}>{recent.map((row, index) => <div className={styles.purchase} key={`${row.cloneId}:${row.telegramId}:${row.paidAt}:${index}`}><span className={styles.fanAvatar}><UserRound size={20} /></span><div><strong>{row.buyerName}</strong><span><span className="creator-name">{row.cloneName}</span> · {kindLabel[row.kind] ?? "Payment"}</span><time dateTime={row.paidAt}>{new Date(row.paidAt).toLocaleString("en-AU", { timeZone: REPORT_TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</time></div><b className="money-value">{money(row.stars, row.cloneId)}</b></div>)}{!recent.length && <div className={styles.empty}>{data ? "No purchases recorded in this period." : "Loading purchases…"}</div>}</div></section>
    </div>
    <div className={styles.rankings}>{(["fans", "content"] as const).map(kind => <RankingPanel key={kind} kind={kind} rankings={data?.rankings} cloneIds={chartCreators.map(c => c.id)} agency={!cloneId} money={money} loading={loading} error={data?.rankingsError} />)}</div>
    <footer className={styles.footer}><span>Times shown in {reportTzLabel()}</span><button type="button" className={styles.textButton} onClick={onDetails}>Detailed reporting<ArrowRight size={16} /></button></footer>
    <Dialog open={dateOpen} onOpenChange={setDateOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Custom date range</DialogTitle></DialogHeader><form className={styles.dateForm} onSubmit={applyDates}><label>From<input aria-label="Start date" type="date" required value={draft.start} max={draft.end || undefined} onChange={e => setDraft(value => ({ ...value, start: e.target.value }))} /></label><label>To<input aria-label="End date" type="date" required value={draft.end} min={draft.start || undefined} onChange={e => setDraft(value => ({ ...value, end: e.target.value }))} /></label>{dateError && <p role="alert">{dateError}</p>}<button type="submit">Apply dates</button></form></DialogContent></Dialog>
  </div>;
}
