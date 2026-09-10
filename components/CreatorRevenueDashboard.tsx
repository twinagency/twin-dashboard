'use client';

import { useEffect, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LayoutDashboard, ChartColumnIncreasing, ReceiptText, ClipboardCheck, LogOut, RefreshCw, Download, Menu, X } from 'lucide-react';
import TwinWordmark from '@/components/TwinWordmark';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fmtMoney, fmtNum, starsToMoney } from '@/lib/money';
import type { CreatorReport, CreatorReportResponse } from '@/lib/creator-report-contract';

const PERIODS = ['1D', '1W', '2W', '1M', '3M', '6M', '1Y', 'ALL'] as const;
const LABELS: Record<string, string> = { '1D': '24H', '1W': '7D', '2W': '14D', '1M': '30D', '3M': '3M', '6M': '6M', '1Y': '1Y', ALL: 'All', CUSTOM: 'Custom' };
const money = (stars: number) => fmtMoney(starsToMoney(stars, 'USD'), 'USD');
const percent = (value: number | null) => value === null ? 'Not available' : `${value.toFixed(1)}%`;
const ratioPercent = (value: number | null) => percent(value === null ? null : value * 100);
const EMPTY = 'Not available';

type Props = { displayName: string; cloneName: string | null; connected: boolean; onboardingComplete: boolean };
function Metric({ label, value, hint, financial = false }: { label: string; value: string; hint: string; financial?: boolean }) {
  return <Card className="border border-line bg-white"><CardHeader className="pb-0"><CardTitle className="flex items-center justify-between text-sm text-muted">{label}<span className="cursor-help text-xs font-normal" title={hint} aria-label={hint}>ⓘ</span></CardTitle></CardHeader><CardContent><div className={`font-heading text-3xl font-semibold tracking-tight ${financial ? 'text-good' : 'text-ink'}`}>{value}</div></CardContent></Card>;
}

export default function CreatorRevenueDashboard({ displayName, cloneName, connected, onboardingComplete }: Props) {
  const [period, setPeriod] = useState('1M');
  const [dates, setDates] = useState<{ start: string; end: string } | null>(null);
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [result, setResult] = useState<CreatorReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(connected);
  const [refresh, setRefresh] = useState(0);
  const [fanQuery, setFanQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const requestNumber = useRef(0);
  const previousQuery = useRef('');
  const params = new URLSearchParams(dates ? { startDate: dates.start, endDate: dates.end } : { period });
  const query = params.toString();
  const exportUrl = `/creator/report-data?${query}&format=csv`;

  useEffect(() => {
    if (!connected) { setResult({ state: 'awaiting_connection', report: null }); setLoading(false); return; }
    const number = ++requestNumber.current;
    const controller = new AbortController();
    setLoading(true); setError(null);
    if (previousQuery.current !== query) { setResult(null); previousQuery.current = query; }
    fetch(`/creator/report-data?${query}`, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async response => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || (response.status === 401 ? 'Please sign in again.' : 'Report data is temporarily unavailable.'));
        }
        if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Please sign in again to view your report.');
        const payload = await response.json() as CreatorReportResponse;
        if (!['ready', 'awaiting_connection'].includes(payload.state) || (payload.state === 'ready' && !payload.report?.metrics)) {
          throw new Error('The report could not be loaded. Please try again.');
        }
        if (number === requestNumber.current) setResult(payload);
      })
      .catch(err => { if (!controller.signal.aborted && number === requestNumber.current) setError(err instanceof Error ? err.message : 'Report data is temporarily unavailable.'); })
      .finally(() => { if (!controller.signal.aborted && number === requestNumber.current) setLoading(false); });
    return () => controller.abort();
  }, [connected, query, refresh]);

  // Only refresh in a visible tab; each request rechecks account/clone ownership.
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') setRefresh(value => value + 1); }, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const report: CreatorReport | null = result?.state === 'ready' ? result.report : null;
  const m = report?.metrics;
  const nav = [
    { href: '#overview', label: 'Overview', Icon: LayoutDashboard },
    { href: '#reports', label: 'Advanced reports', Icon: ChartColumnIncreasing },
    { href: '#transactions', label: 'Transactions', Icon: ReceiptText },
    { href: '/creator/onboarding', label: 'Onboarding', Icon: ClipboardCheck },
  ];
  const matches = report?.transactions.filter(t => `${t.buyerName} ${t.kind}`.toLowerCase().includes(fanQuery.toLowerCase())) || [];
  const transactions = matches.slice(0, showAll ? 100 : 10);
  const navItems = <>{nav.filter(item => connected || item.href === '#overview' || item.href === '/creator/onboarding').map(({ href, label, Icon }) => <a key={href} href={href} onClick={() => setMobileOpen(false)} className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"><Icon size={18} />{label}</a>)}</>;
  const dataAge = report ? `Updated ${new Date(report.cachedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${report.stale ? ' (older snapshot)' : ''}` : 'Read-only reporting';
  const chartChildren = <><CartesianGrid strokeDasharray="3 3" stroke="#e3e8ef" vertical={false} /><XAxis dataKey="label" tick={{ fill: '#607086', fontSize: 11 }} minTickGap={36} axisLine={false} tickLine={false} /><YAxis width={64} tick={{ fill: '#607086', fontSize: 11 }} tickFormatter={value => `$${starsToMoney(Number(value), 'USD').toFixed(0)}`} axisLine={false} tickLine={false} /><Tooltip formatter={(value: unknown) => [money(Number(value)), 'Clone revenue']} contentStyle={{ borderRadius: 12, border: '1px solid #e3e8ef' }} /></>;

  return <div className="min-h-screen bg-bg text-ink lg:flex">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-[#071a2f] px-4 py-6 lg:flex">
      <div className="px-3"><TwinWordmark inverse /></div>
      <div className="mt-8 rounded-xl border border-white/10 bg-white/5 px-4 py-3"><p className="text-xs text-white/50">Creator workspace</p><p className="mt-1 truncate text-sm font-semibold text-white">{cloneName || displayName}</p></div>
      <nav aria-label="Creator navigation" className="mt-6 space-y-1">{navItems}</nav>
      <div className="mt-auto border-t border-white/10 pt-5"><p className="px-4 text-xs text-white/50">Your account. Your results.</p><form action="/creator-auth/logout" method="post"><button className="mt-2 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-white/80 hover:bg-white/10"><LogOut size={17} />Sign out</button></form></div>
    </aside>
    <div className="min-w-0 flex-1 lg:ml-60">
      <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-line bg-white/95 px-4 backdrop-blur sm:px-8">
        <div className="flex min-w-0 items-center gap-3"><button className="p-2 lg:hidden" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle creator navigation" aria-expanded={mobileOpen}>{mobileOpen ? <X size={20} /> : <Menu size={20} />}</button><span className="truncate text-sm font-semibold">{cloneName || displayName}<span className="ml-3 font-normal text-muted">/ Creator dashboard</span></span></div>
        <span className="shrink-0 rounded-full border border-line px-3 py-1 text-xs text-muted">USD</span>
      </header>
      {mobileOpen && <nav aria-label="Mobile creator navigation" className="sticky top-16 z-20 bg-[#071a2f] p-3 lg:hidden">{navItems}<form action="/creator-auth/logout" method="post"><button className="px-4 py-3 text-sm text-white">Sign out</button></form></nav>}
      <main className="mx-auto max-w-[1440px] p-4 sm:p-8">
        <section id="overview" className="scroll-mt-24">
          <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-2">Creator workspace</p><h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">Your performance</h1><p className="mt-2 text-sm text-muted">{displayName}, here is how your Twin is performing.</p></div><div className="flex items-center gap-3"><span className="text-xs text-muted">{dataAge}</span><Button variant="outline" disabled={loading || !connected} onClick={() => setRefresh(v => v + 1)}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Refresh</Button></div></div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-line bg-white p-1">{PERIODS.map(p => <Button key={p} size="sm" variant={!dates && p === period ? 'default' : 'ghost'} onClick={() => { setDates(null); setPeriod(p); }}>{LABELS[p]}</Button>)}<Button size="sm" variant={dates ? 'default' : 'ghost'} onClick={() => setCustomOpen(v => !v)}>Custom</Button></div>{report && <a href={exportUrl} className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium" title="Exports the latest available transactions, up to 100, in this reporting period."><Download size={15} />Export latest transactions</a>}</div>
          {customOpen && <form className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-white p-4" onSubmit={e => { e.preventDefault(); if (draftStart && draftEnd) { setDates({ start: draftStart, end: draftEnd }); setCustomOpen(false); } }}><label className="grid gap-1 text-xs font-medium">Start date<Input type="date" required value={draftStart} onChange={e => setDraftStart(e.target.value)} /></label><label className="grid gap-1 text-xs font-medium">End date<Input type="date" required min={draftStart || undefined} value={draftEnd} onChange={e => setDraftEnd(e.target.value)} /></label><Button type="submit">Apply dates</Button></form>}
          {(!connected || result?.state === 'awaiting_connection') && <Card className="mt-6 border border-line"><CardHeader><CardTitle>{onboardingComplete ? 'Your onboarding has been received' : 'Complete your onboarding'}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted">{onboardingComplete ? 'Your results will appear when Twin links this account to your live clone.' : 'Submit your onboarding so the team can prepare and connect your clone.'}</p><a className="mt-4 inline-block font-medium text-primary" href="/creator/onboarding">{onboardingComplete ? 'View onboarding' : 'Continue onboarding'}</a></CardContent></Card>}
          {error && <div role="alert" className="mt-6 rounded-xl border border-crit/30 bg-white p-5 text-sm"><p>{error}</p><div className="mt-3 flex gap-4"><button className="font-medium text-primary" onClick={() => setRefresh(v => v + 1)}>Try again</button><a href="/creator/login" className="font-medium text-primary">Sign in</a></div></div>}
          {loading && !report && <div role="status" aria-live="polite" className="mt-6 rounded-xl border border-line bg-white p-6 text-sm text-muted">Loading your report...</div>}
          {report && m && <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Clone revenue" value={money(m.revenueStars)} hint="Recorded clone revenue after refunds and adjustments, before your revenue share. Converted at the platform's Star rate." financial />
              <Metric label="Estimated earnings" value={m.estimatedEarningsStars === null ? 'Not configured' : money(m.estimatedEarningsStars)} hint="Estimate using your configured revenue-share percentage. Not a payable balance or a confirmed payout." financial />
              <Metric label="Paid sales" value={fmtNum(m.sales)} hint="Positive paid orders in the selected period. Refunds do not count as new sales." />
              <Metric label="Buyers" value={fmtNum(m.buyers)} hint="Distinct buyers in the selected reporting period." />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white px-4 py-3 text-xs text-muted"><span>{m.revenueSharePercent === null ? 'A revenue share has not been configured for this account.' : `Your configured share: ${m.revenueSharePercent}%. Estimated earnings use recorded net revenue.`}</span><span>Estimates only. Paid and pending settlements are not shown.</span></div>
            <Card className="mt-5 border border-line"><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle>Revenue over time</CardTitle><p className="mt-1 text-xs text-muted">{dates ? `${dates.start} to ${dates.end}` : LABELS[period]} · Reporting dates use Sydney time</p></div><div className="flex gap-1"><Button size="sm" variant={chartType === 'bar' ? 'secondary' : 'ghost'} onClick={() => setChartType('bar')}>Bars</Button><Button size="sm" variant={chartType === 'line' ? 'secondary' : 'ghost'} onClick={() => setChartType('line')}>Line</Button></div></div></CardHeader><CardContent><div className="h-72 min-w-0" role="img" aria-label="Clone revenue over the selected period">{report.series.length ? <ResponsiveContainer width="100%" height="100%">{chartType === 'bar' ? <BarChart data={report.series} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>{chartChildren}<Bar dataKey="stars" fill="#138a63" radius={[3, 3, 0, 0]} /></BarChart> : <LineChart data={report.series} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>{chartChildren}<Line dataKey="stars" type="monotone" stroke="#138a63" strokeWidth={2.5} dot={false} /></LineChart>}</ResponsiveContainer> : <p className="py-20 text-center text-sm text-muted">No recorded revenue in this period.</p>}</div></CardContent></Card>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Active fans" value={fmtNum(m.activeUsers)} hint="Fans who messaged in the selected reporting period." /><Metric label="Messages" value={fmtNum(m.messages)} hint="Messages in the selected period." /><Metric label="Repeat buyers" value={percent(m.repeatPct)} hint="Buyers who made repeat purchases divided by buyers, inside this period." /><Metric label="Average paid order" value={m.averageOrderStars === null ? EMPTY : money(m.averageOrderStars)} hint="Positive payment volume divided by positive paid orders, not net revenue divided by orders." financial /></div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3"><Metric label="Total fans" value={fmtNum(m.totalFans)} hint="All-time audience. This number does not follow the period filter." /><Metric label="New fans" value={fmtNum(m.newFans)} hint="New fans in the selected period, excluding historical migration imports." /><Metric label="Messageable now" value={fmtNum(m.reachable24h)} hint="Fans who are currently within the 24-hour messaging window, regardless of the selected reporting period." /></div>
          </>}
        </section>
        {report && <>
          <section id="reports" className="mt-9 scroll-mt-24"><div className="mb-4"><h2 className="font-heading text-2xl font-semibold">Advanced reports</h2></div>
            <div className="grid items-start gap-5 xl:grid-cols-3"><Card className="border border-line xl:col-span-2"><CardHeader><CardTitle>Revenue by product</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-line text-xs text-muted"><tr><th className="pb-3 font-medium">Product</th><th className="pb-3 text-right font-medium">Sales</th><th className="pb-3 text-right font-medium">Revenue</th><th className="pb-3 text-right font-medium">Avg order</th></tr></thead><tbody>{report.byFeature.map(row => <tr key={row.key} className="border-b border-line last:border-0"><td className="py-3 pr-3 font-medium">{row.label}</td><td className="py-3 text-right">{fmtNum(row.sales)}</td><td className="py-3 text-right font-medium text-good">{money(row.stars)}</td><td className="py-3 text-right">{row.averageStars === null ? 'N/A' : money(row.averageStars)}</td></tr>)}</tbody></table></div></CardContent></Card>
              <div className="grid gap-4"><Metric label="Active-chat buyer conversion" value={ratioPercent(report.conversion.activeChatBuyerRate)} hint="Buyers among fans who chatted in the selected reporting period. No denominator is shown as unavailable, not zero." /><Metric label="Lifetime buyer conversion" value={ratioPercent(report.conversion.lifetimeBuyerRate)} hint="Lifetime buyer profiles divided by lifetime fan profiles. This is an all-time measure." /><Card className="border border-line"><CardHeader><CardTitle>Active-chat cohort</CardTitle></CardHeader><CardContent><div className="flex justify-between text-sm"><span className="text-muted">Chatters</span><strong>{fmtNum(report.conversion.activeChatters)}</strong></div><div className="mt-3 flex justify-between text-sm"><span className="text-muted">Chatters who bought</span><strong>{fmtNum(report.conversion.activeChatBuyers)}</strong></div></CardContent></Card></div>
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">{[{ title: 'Revenue by weekday', rows: report.byDayOfWeek }, { title: 'Revenue by hour', rows: report.byHour }].map(group => <Card key={group.title} className="border border-line"><CardHeader><CardTitle>{group.title}</CardTitle></CardHeader><CardContent><div className="h-56" role="img" aria-label={group.title}><ResponsiveContainer width="100%" height="100%"><BarChart data={group.rows}><CartesianGrid vertical={false} stroke="#e3e8ef" /><XAxis dataKey="label" tick={{ fontSize: 10, fill: '#607086' }} minTickGap={16} axisLine={false} tickLine={false} /><Tooltip formatter={(value: unknown) => [money(Number(value)), 'Revenue']} /><Bar dataKey="stars" fill="#138a63" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></CardContent></Card>)}</div>
          </section>
          <section id="transactions" className="mt-9 scroll-mt-24"><Card className="border border-line"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Recent transactions</CardTitle><Input className="w-full sm:w-64" aria-label="Search displayed transactions" placeholder="Search fan or transaction type" value={fanQuery} onChange={e => setFanQuery(e.target.value)} /></div></CardHeader><CardContent><p className="mb-4 text-xs text-muted">Latest available transactions in this period, up to 100. Exports use this same limited set, not the complete ledger.</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-line text-xs text-muted"><tr><th className="pb-3 font-medium">Fan</th><th className="pb-3 font-medium">Type</th><th className="pb-3 font-medium">Date</th><th className="pb-3 text-right font-medium">Amount</th></tr></thead><tbody>{transactions.map((t, i) => <tr key={`${t.paidAt}-${i}`} className="border-b border-line last:border-0"><td className="max-w-40 truncate py-3 pr-3 font-medium">{t.buyerName}</td><td className="whitespace-nowrap py-3 pr-3 text-muted">{t.kind}</td><td className="whitespace-nowrap py-3 pr-3 text-muted">{new Date(t.paidAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Sydney' })}</td><td className="py-3 text-right font-semibold text-good">{money(t.stars)}</td></tr>)}</tbody></table>{transactions.length === 0 && <p className="py-8 text-center text-sm text-muted">No matching transactions in this period.</p>}</div>{!showAll && matches.length > 10 && <Button className="mt-4" variant="outline" onClick={() => setShowAll(true)}>Show all {matches.length} available transactions</Button>}</CardContent></Card></section>
        </>}
        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-xs text-muted"><span>{onboardingComplete ? 'Onboarding submitted' : 'Onboarding in progress'}</span><a className="font-medium text-primary" href="/creator/onboarding">{onboardingComplete ? 'View your onboarding' : 'Continue onboarding'}</a></footer>
      </main>
    </div>
  </div>;
}
