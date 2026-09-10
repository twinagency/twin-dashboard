'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronDown, CircleUserRound, ClipboardCheck, DollarSign, Download, Eye, EyeOff, LogOut, Menu, Search, X } from 'lucide-react';
import TwinWordmark from '@/components/TwinWordmark';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fmtMoney, fmtNum, starsToMoney } from '@/lib/money';

const PERIODS = [
  { key: 'ALL', label: 'All', live: false },
  { key: '1Y', label: '1Y', live: false },
  { key: '6M', label: '6M', live: false },
  { key: '3M', label: '3M', live: false },
  { key: '1M', label: '1M', live: false },
  { key: '2W', label: '2W', live: false },
  { key: '1W', label: '1W', live: false },
  { key: '1D', label: '1D', live: true },
];

const aud = stars => fmtMoney(starsToMoney(Number(stars || 0), 'AUD'), 'AUD');
const ratio = value => value == null ? '-' : `${(value * 100).toFixed(value > 0 && value < 0.1 ? 1 : 0)}%`;

function Info({ text }) {
  return <span className="cursor-help text-[11px] font-normal text-[#7b7c8b]" title={text} aria-label={text}>ⓘ</span>;
}

function MetricCard({ label, value, sub, hint, privateMode = false }) {
  return (
    <Card size="sm" className="relative min-h-[114px] overflow-hidden border border-[#dddde7] bg-white shadow-[0_8px_24px_rgba(46,39,70,0.06)] before:absolute before:inset-y-0 before:left-0 before:w-[4px] before:bg-[#3e55ff]">
      <CardContent className="px-5 py-4">
        <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.025em] text-[#6f7080]">{label}<Info text={hint} /></div>
        {sub ? <div className="mt-2 text-[11px] text-[#777887]">{sub}</div> : null}
        <div className={`mt-3 font-heading text-[25px] font-semibold leading-none tracking-[-0.025em] text-[#17181d] ${privateMode ? 'blur-[6px] select-none' : ''}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function ReportSection({ title, description, open, onToggle, children }) {
  return (
    <Card className="mt-4 border border-[#d8d9e5] bg-white shadow-[0_10px_28px_rgba(46,39,70,0.06)]">
      <button className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left" onClick={onToggle}>
        <div><div className="text-[17px] font-semibold uppercase tracking-[0.02em]">{title}</div><div className="mt-1 text-[12px] leading-5 text-[#777887]">{description}</div></div>
        <div className="flex items-center gap-2 text-sm font-medium text-[#28658f]">{open ? 'Close' : 'Open'}<ChevronDown size={18} className={open ? 'rotate-180' : ''} /></div>
      </button>
      {open ? <CardContent className="border-t border-[#e6e2ed] pt-4">{children}</CardContent> : null}
    </Card>
  );
}

export default function CreatorLinkEarningsDashboard({ displayName, cloneName, connected, onboardingComplete }) {
  const [period, setPeriod] = useState('1M');
  const [customRange, setCustomRange] = useState(null);
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [chartType, setChartType] = useState('bar');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [privateMode, setPrivateMode] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [payingOpen, setPayingOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(connected);
  const [refreshKey, setRefreshKey] = useState(0);
  const [transactionQuery, setTransactionQuery] = useState('');
  const [transactionLimit, setTransactionLimit] = useState(10);
  const requestNumber = useRef(0);

  const params = new URLSearchParams(customRange ? { startDate: customRange.start, endDate: customRange.end } : { period });
  const query = params.toString();

  useEffect(() => {
    if (!connected) {
      setResult({ state: 'awaiting_connection', report: null });
      setLoading(false);
      return;
    }
    const request = ++requestNumber.current;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/creator/report-data?${query}`, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async response => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error || 'Report data is temporarily unavailable.');
        if (request === requestNumber.current) setResult(body);
      })
      .catch(reason => {
        if (!controller.signal.aborted && request === requestNumber.current) setError(reason instanceof Error ? reason.message : 'Report data is temporarily unavailable.');
      })
      .finally(() => {
        if (!controller.signal.aborted && request === requestNumber.current) setLoading(false);
      });
    return () => controller.abort();
  }, [connected, query, refreshKey]);

  useEffect(() => {
    if (!connected || customRange) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') setRefreshKey(value => value + 1);
    }, 60_000);
    return () => window.clearInterval(id);
  }, [connected, customRange]);

  const report = result?.state === 'ready' ? result.report : null;
  const metrics = report?.metrics;
  const creatorName = cloneName || displayName;
  const share = metrics?.revenueSharePercent ?? null;
  const displayedEarningsStars = metrics ? (metrics.estimatedEarningsStars ?? metrics.revenueStars) : 0;
  const revenuePerMessaged = metrics && metrics.activeUsers > 0 ? metrics.revenueStars / metrics.activeUsers : null;
  const revenuePerBuyer = metrics && metrics.buyers > 0 ? metrics.revenueStars / metrics.buyers : null;

  const topFeature = useMemo(() => {
    if (!report?.byFeature?.length) return null;
    return report.byFeature.reduce((best, row) => row.stars > best.stars ? row : best, report.byFeature[0]);
  }, [report]);
  const featureTotal = useMemo(() => report?.byFeature?.reduce((sum, row) => sum + Math.max(0, row.stars), 0) ?? 0, [report]);
  const topFeatureShare = topFeature && featureTotal > 0 ? Math.round(Math.max(0, topFeature.stars) / featureTotal * 100) : 0;
  const bestDay = useMemo(() => report?.byDayOfWeek?.length ? report.byDayOfWeek.reduce((best, row) => row.stars > best.stars ? row : best, report.byDayOfWeek[0]) : null, [report]);
  const bestHour = useMemo(() => report?.byHour?.length ? report.byHour.reduce((best, row) => row.stars > best.stars ? row : best, report.byHour[0]) : null, [report]);
  const transactions = useMemo(() => {
    const needle = transactionQuery.trim().toLowerCase();
    return (report?.transactions ?? []).filter(row => !needle || `${row.buyerName} ${row.kind}`.toLowerCase().includes(needle)).slice(0, transactionLimit);
  }, [report, transactionQuery, transactionLimit]);

  const nav = <>
    <a href="#earnings" onClick={() => setMobileOpen(false)} className="flex items-center gap-4 rounded-[18px] border border-[#4057ff]/15 bg-gradient-to-r from-[#f1f3ff] to-[#fff0f7] px-5 py-4 text-[17px] font-semibold text-[#304bf4]"><DollarSign size={25} strokeWidth={1.8} /> Earnings</a>
    <a href="/creator/onboarding" onClick={() => setMobileOpen(false)} className="flex items-center gap-4 rounded-xl px-5 py-3.5 text-[16px] font-medium text-[#656575] hover:bg-[#f5f3fb]"><ClipboardCheck size={22} strokeWidth={1.8} /> Onboarding</a>
  </>;

  return (
    <div className="min-h-screen bg-[#faf9fc] text-[#19191f]">
      <header className="sticky top-0 z-40 flex h-[114px] items-center justify-between border-b border-[#e6e2ed] bg-white px-7 lg:hidden">
        <TwinWordmark agencyName="LYNQ" />
        <div className="flex items-center gap-5"><form action="/creator-auth/logout" method="post"><button className="text-[15px] font-medium">Sign out</button></form><button aria-label="Open creator navigation" onClick={() => setMobileOpen(true)}><Menu size={29} strokeWidth={1.7} /></button></div>
      </header>

      {mobileOpen ? <div className="fixed inset-0 z-50 bg-[#111322]/20 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)}><aside className="h-full w-[min(76vw,390px)] bg-white px-7 py-8 shadow-2xl" onClick={event => event.stopPropagation()}><div className="flex items-center justify-between"><TwinWordmark agencyName="LYNQ" /><button aria-label="Close navigation" className="grid h-11 w-11 place-items-center rounded-full border border-[#e6e2ed] bg-[#f7f6fa]" onClick={() => setMobileOpen(false)}><X size={23} /></button></div><p className="mt-10 px-1 text-[15px] text-[#656575]">LYNQ · Creator dashboard</p><nav className="mt-7 space-y-2">{nav}</nav><div className="mt-8 border-t border-[#e6e2ed] pt-6"><a href="/creator/forgot-password" className="flex items-center gap-4 px-5 py-3 text-[16px] text-[#656575]"><CircleUserRound size={21} /> Account</a><form action="/creator-auth/logout" method="post"><button className="flex items-center gap-4 px-5 py-3 text-[16px] text-[#656575]"><LogOut size={21} /> Sign out</button></form></div></aside></div> : null}

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] border-r border-[#e6e2ed] bg-white px-6 py-7 lg:flex lg:flex-col"><TwinWordmark agencyName="LYNQ" /><p className="mt-10 px-2 text-sm text-[#656575]">LYNQ · Creator dashboard</p><nav className="mt-7 space-y-2">{nav}</nav><div className="mt-auto border-t border-[#e6e2ed] pt-5"><a href="/creator/forgot-password" className="flex items-center gap-3 px-4 py-3 text-sm text-[#656575]"><CircleUserRound size={18} /> Account</a><form action="/creator-auth/logout" method="post"><button className="flex items-center gap-3 px-4 py-3 text-sm text-[#656575]"><LogOut size={18} /> Sign out</button></form></div></aside>

      <div className="lg:ml-[264px]">
        <div className="sticky top-[114px] z-30 border-b border-[#e6e2ed] bg-white/95 px-5 py-5 backdrop-blur lg:top-0"><div className="mx-auto flex max-w-[1500px] items-center justify-center lg:justify-end"><div className="relative inline-flex min-w-[292px] items-center gap-3 rounded-[22px] border border-[#dcdbe6] bg-white px-5 py-3 shadow-[0_7px_22px_rgba(37,31,56,0.06)]"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#eeeef3] text-[10px] font-semibold text-[#6b6c7a]">YOU</span><strong className="min-w-0 flex-1 truncate text-[15px]">{creatorName}</strong><span className="h-7 w-px bg-[#e6e2ed]" /><span className="rounded-full bg-[#f0eff4] px-3 py-1.5 text-xs font-semibold">$AUD</span><button aria-label={privateMode ? 'Show earnings' : 'Hide earnings'} onClick={() => setPrivateMode(value => !value)} className="text-[#686978]">{privateMode ? <EyeOff size={18} /> : <Eye size={18} />}</button><button aria-label="Open profile" onClick={() => setProfileOpen(value => !value)} className="text-[#686978]"><CircleUserRound size={19} /></button>{profileOpen ? <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[220px] rounded-2xl border border-[#dedee8] bg-white p-2 shadow-[0_18px_45px_rgba(38,32,57,0.16)]"><div className="px-3 py-2"><div className="truncate text-sm font-semibold">{displayName}</div><div className="mt-0.5 text-xs text-[#777887]">Creator account</div></div><a href="/creator/onboarding" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[#5f6070] hover:bg-[#f5f3fb]"><ClipboardCheck size={17} /> View onboarding</a><a href="/creator/forgot-password" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[#5f6070] hover:bg-[#f5f3fb]"><CircleUserRound size={17} /> Change password</a><form action="/creator-auth/logout" method="post"><button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[#5f6070] hover:bg-[#f5f3fb]"><LogOut size={17} /> Sign out</button></form></div> : null}</div></div></div>

        <main id="earnings" className="min-h-screen px-4 py-7 sm:px-7 sm:py-9" style={{ backgroundColor: '#faf9fc', backgroundImage: 'radial-gradient(ellipse 70% 32% at 0% 7%, rgba(255,139,53,.58), transparent 100%), radial-gradient(ellipse 65% 35% at 0% 44%, rgba(233,75,156,.40), transparent 100%), radial-gradient(ellipse 62% 34% at 7% 82%, rgba(63,85,255,.18), transparent 100%)', backgroundRepeat: 'no-repeat', backgroundSize: '100% 74rem' }}>
          <div className="mx-auto max-w-[1500px]">
            <h1 className="flex items-center gap-2 font-heading text-[31px] font-semibold tracking-[-0.035em] sm:text-[38px]">Earnings overview <Info text="Revenue, audience, buyer activity and conversion performance for your creator account." /></h1>
            <div className="mt-2 flex items-center gap-2 text-[12px] text-[#777887]">{report ? (report.stale ? 'Refreshing latest data...' : report.ageSeconds < 10 ? 'Updated just now' : `Updated ${report.ageSeconds}s ago`) : 'Loading latest data'} <button onClick={() => setRefreshKey(value => value + 1)} disabled={loading} className="font-semibold text-[#28658f] underline decoration-[#28658f]/35 underline-offset-2">{loading ? 'Refreshing...' : 'Refresh'}</button></div>
            <div className="mt-10 h-1 w-[84px] rounded-full bg-[#3f55ff]" />

            <div className="mt-7 rounded-[22px] border border-[#dcdde7] bg-white p-3 shadow-[0_8px_28px_rgba(46,39,70,0.06)] sm:p-4"><div className="flex flex-wrap items-center gap-2"><div className="inline-flex max-w-full flex-wrap gap-0.5 rounded-full bg-[#f1f0f5] p-1">{PERIODS.map(item => <button key={item.key} onClick={() => { setCustomRange(null); setPeriod(item.key); }} className={`flex items-center gap-1 rounded-full px-3 py-2 text-[12px] font-medium ${!customRange && period === item.key ? 'bg-[#304bf4] text-white shadow' : 'text-[#666878]'}`}>{item.live ? <span className="h-2 w-2 rounded-full bg-[#149a70]" /> : null}{item.label}</button>)}<button onClick={() => setCustomOpen(value => !value)} className={`rounded-full px-3 py-2 text-[12px] font-medium ${customRange ? 'bg-[#304bf4] text-white' : 'text-[#666878]'}`}>▣ Custom</button></div><div className="inline-flex rounded-full bg-[#f1f0f5] p-1"><button aria-label="Bar chart" onClick={() => setChartType('bar')} className={`grid h-9 w-9 place-items-center rounded-full ${chartType === 'bar' ? 'bg-[#304bf4] text-white' : 'text-[#666878]'}`}>▥</button><button aria-label="Line chart" onClick={() => setChartType('line')} className={`grid h-9 w-9 place-items-center rounded-full ${chartType === 'line' ? 'bg-[#304bf4] text-white' : 'text-[#666878]'}`}>⌁</button></div></div>{customOpen ? <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-[#e6e2ed] pt-3"><label className="grid gap-1 text-xs text-[#656575]">From<Input type="date" value={draftStart} onChange={event => setDraftStart(event.target.value)} /></label><label className="grid gap-1 text-xs text-[#656575]">To<Input type="date" min={draftStart || undefined} value={draftEnd} onChange={event => setDraftEnd(event.target.value)} /></label><Button size="sm" onClick={() => { if (draftStart && draftEnd) { setCustomRange({ start: draftStart, end: draftEnd }); setCustomOpen(false); } }}>Apply</Button></div> : null}</div>

            {!connected || result?.state === 'awaiting_connection' ? <Card className="mt-5 border border-[#dddde7] bg-white"><CardHeader><CardTitle>{onboardingComplete ? 'Your onboarding has been received' : 'Complete your onboarding'}</CardTitle></CardHeader><CardContent className="text-sm text-[#656575]">{onboardingComplete ? 'Your earnings will appear here once your creator account is connected to your live clone.' : 'Complete your onboarding so LYNQ can prepare your creator account.'}</CardContent></Card> : null}
            {error ? <div className="mt-5 rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700">{error}</div> : null}

            {report && metrics ? <>
              <Card className="mt-5 overflow-hidden border border-[#d8d9e5] bg-white shadow-[0_12px_34px_rgba(46,39,70,0.07)]"><div className="h-1 bg-[#3f55ff]" /><CardHeader className="pb-1"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-[12px] text-[#6f7080]">{creatorName} · {share == null ? 'Clone revenue' : 'Creator earnings'}, {customRange ? 'custom range' : PERIODS.find(item => item.key === period)?.label}<Info text={share == null ? 'Revenue share has not been configured yet, so clone revenue is shown.' : `Estimated creator earnings use the configured ${share}% revenue share.`} /></div><div className={`mt-2 font-heading text-[35px] font-semibold tracking-[-0.03em] text-[#138a63] ${privateMode ? 'blur-[8px] select-none' : ''}`}>{aud(displayedEarningsStars)}</div><div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#6f7080]"><span>Gross clone revenue <strong className={privateMode ? 'blur-[5px] select-none' : 'text-[#19191f]'}>{aud(metrics.revenueStars)}</strong></span>{share != null ? <span>Your share <strong className="text-[#19191f]">{share}%</strong></span> : <span>Revenue share not configured</span>}</div></div><div><div className="text-[11px] text-[#777887]">Telegram Stars</div><div className={`mt-1 text-[18px] font-semibold ${privateMode ? 'blur-[6px] select-none' : ''}`}>⭐ {fmtNum(metrics.revenueStars)}</div></div></div></CardHeader><CardContent><div className={`h-[210px] sm:h-[270px] ${privateMode ? 'blur-[5px]' : ''}`}>{report.series?.length ? <ResponsiveContainer width="100%" height="100%">{chartType === 'bar' ? <BarChart data={report.series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#dfe2ea" vertical={false} /><XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={28} tick={{ fontSize: 11, fill: '#6d7080' }} /><YAxis width={68} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#25262b' }} tickFormatter={value => aud(value).replace('.00', '')} /><Tooltip formatter={value => [aud(Number(value)), 'Clone revenue']} contentStyle={{ borderRadius: 12, border: '1px solid #dfe2ea' }} /><Bar dataKey="stars" fill="#29cabb" radius={[2, 2, 0, 0]}>{report.series.map((_, index) => <Cell key={index} fill={index === report.series.length - 1 ? '#37b9b1' : '#2dc7b9'} />)}</Bar></BarChart> : <LineChart data={report.series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#dfe2ea" vertical={false} /><XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={28} tick={{ fontSize: 11, fill: '#6d7080' }} /><YAxis width={68} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#25262b' }} tickFormatter={value => aud(value).replace('.00', '')} /><Tooltip formatter={value => [aud(Number(value)), 'Clone revenue']} /><Line type="monotone" dataKey="stars" stroke="#304bf4" strokeWidth={2.5} dot={false} /></LineChart>}</ResponsiveContainer> : <div className="grid h-full place-items-center text-sm text-[#777887]">No recorded revenue in this period.</div>}</div></CardContent></Card>

              <ReportSection title="Daily earnings analysis compared to previous days & weeks" description="Review buyers, orders, audience activity, major payments, and product mix for any day." open={dailyOpen} onToggle={() => setDailyOpen(value => !value)}><div className="grid gap-3 sm:grid-cols-3"><MetricCard privateMode={privateMode} label="Current earnings" value={aud(displayedEarningsStars)} hint="Estimated creator earnings for the selected period." /><MetricCard label="Unique buyers" value={fmtNum(metrics.buyers)} hint="Distinct buyers in the selected period." /><MetricCard privateMode={privateMode} label="Average paid order" value={metrics.averageOrderStars == null ? '-' : aud(metrics.averageOrderStars)} hint="Average positive paid order value before revenue share." /></div></ReportSection>

              <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6"><MetricCard label="All-time users" value={fmtNum(metrics.totalFans)} hint="All fan profiles for this creator, ever." /><MetricCard label="New users" value={fmtNum(metrics.newFans)} hint="Fan profiles first seen during the selected reporting period." /><MetricCard label="Users who messaged" value={fmtNum(metrics.activeUsers)} hint="Fans who sent an inbound message during the selected reporting period." /><MetricCard privateMode={privateMode} label="Revenue / user who messaged" value={revenuePerMessaged == null ? '-' : aud(revenuePerMessaged)} hint="Gross clone revenue divided by users who messaged in the same period." /><MetricCard label="Purchases" value={fmtNum(metrics.sales)} hint="Positive paid orders during the selected reporting period." /><MetricCard label="Active users (24h)" sub="messaged in last 24h" value={fmtNum(metrics.reachable24h)} hint="Fans currently messageable based on recent inbound activity." /><MetricCard label="Messages" value={fmtNum(metrics.messages)} hint="Messages recorded for this creator during the selected period." /><MetricCard label="Unique buyers" sub="paid this period" value={fmtNum(metrics.buyers)} hint="Distinct fans who made a purchase in this period." /><MetricCard privateMode={privateMode} label="Revenue / buyer" value={revenuePerBuyer == null ? '-' : aud(revenuePerBuyer)} hint="Gross clone revenue divided by unique buyers in the selected period." /><MetricCard privateMode={privateMode} label="Avg paid order" value={metrics.averageOrderStars == null ? '-' : aud(metrics.averageOrderStars)} hint="Positive paid receipt volume divided by paid orders." /><MetricCard label="Multi-order buyers" sub="2+ paid orders" value={`${Math.round(metrics.repeatPct * 100)}%`} hint="Share of buyers with more than one paid order in this period." /><MetricCard label="Top revenue type" value={topFeature ? `${topFeature.label} ${topFeatureShare}%` : '-'} hint="Highest revenue-producing purchase type in this period." /></div>

              <button onClick={() => setReportOpen(value => !value)} className="mt-4 rounded-[18px] bg-[#071a2f] px-5 py-4 text-left text-white shadow-[0_12px_28px_rgba(7,26,47,0.18)]"><span className="block text-[15px] font-semibold">Full revenue report →</span><span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-white/70">What makes the money</span></button>
              {reportOpen ? <div className="mt-5 grid gap-4 lg:grid-cols-2"><Card className="border border-[#dddde7] bg-white"><CardHeader><CardTitle className="text-[17px] uppercase">What sells</CardTitle></CardHeader><CardContent>{report.byFeature.slice(0, 8).map(row => <div key={row.key} className="border-b border-[#e6e2ed] py-3 last:border-0"><div className="flex items-center justify-between gap-4 text-sm"><span>{row.label}</span><strong className={privateMode ? 'blur-[5px] select-none' : ''}>{aud(row.stars)}</strong></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#ececf2]"><div className="h-full rounded-full bg-[#3f55ff]" style={{ width: `${featureTotal ? Math.max(2, Math.round(Math.max(0, row.stars) / featureTotal * 100)) : 0}%` }} /></div></div>)}</CardContent></Card><Card className="border border-[#dddde7] bg-white"><CardHeader><CardTitle className="text-[17px] uppercase">Best selling times</CardTitle></CardHeader><CardContent><div className="grid grid-cols-2 gap-3"><MetricCard label="Best weekday" value={bestDay?.label ?? '-'} hint="Weekday with the highest recorded revenue." /><MetricCard label="Best hour" value={bestHour?.label ?? '-'} hint="Hour with the highest recorded revenue." /><MetricCard label="Top revenue type" value={topFeature?.label ?? '-'} hint="Highest revenue-producing product type." /><MetricCard label="Buyer conversion" value={ratio(report.conversion.activeChatBuyerRate)} hint="Active buyers divided by active chatters." /></div></CardContent></Card></div> : null}

              <ReportSection title="Paying customers" description="Did people buy after messaging, and did past buyers come back?" open={payingOpen} onToggle={() => setPayingOpen(value => !value)}><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><MetricCard label="Active chatters" value={fmtNum(report.conversion.activeChatters)} hint="Distinct active chatters in the selected period." /><MetricCard label="Active buyers" value={fmtNum(report.conversion.activeChatBuyers)} hint="Active chatters who purchased." /><MetricCard label="Chat → buyer" value={ratio(report.conversion.activeChatBuyerRate)} hint="Active buyers divided by active chatters." /><MetricCard label="Lifetime buyer rate" value={ratio(report.conversion.lifetimeBuyerRate)} hint="Lifetime buyer profiles divided by all fan profiles." /></div></ReportSection>
              <ReportSection title="Chat activity & purchases" description="See what people do in chats during the dates you picked." open={chatOpen} onToggle={() => setChatOpen(value => !value)}><div className="grid gap-3 sm:grid-cols-3"><MetricCard label="Users who messaged" value={fmtNum(metrics.activeUsers)} hint="Fans who messaged during the selected period." /><MetricCard label="Messages" value={fmtNum(metrics.messages)} hint="Messages in the selected period." /><MetricCard label="Purchases" value={fmtNum(metrics.sales)} hint="Paid orders in the selected period." /></div></ReportSection>

              <Card id="transactions" className="mt-5 border border-[#d8d9e5] bg-white shadow-[0_10px_28px_rgba(46,39,70,0.06)]"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="text-[17px] uppercase tracking-[0.02em]">Recent ledger activity <Info text="Latest available creator transactions in this reporting period." /></CardTitle><a href={`/creator/report-data?${query}&format=csv`} className="inline-flex items-center gap-2 text-xs font-medium text-[#304bf4]"><Download size={14} /> Export</a></div><div className="relative mt-3 max-w-[300px]"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#777887]" /><Input value={transactionQuery} onChange={event => { setTransactionQuery(event.target.value); setTransactionLimit(10); }} placeholder="Search ledger activity" className="pl-9" /></div></CardHeader><CardContent className="px-0">{transactions.length ? <div className="divide-y divide-[#e6e2ed]">{transactions.map((row, index) => <div key={`${row.paidAt}-${index}`} className="flex items-start justify-between gap-4 px-5 py-4"><div className="flex min-w-0 gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#2bcdbd] text-sm font-semibold text-white">{row.buyerName.trim().charAt(0).toUpperCase() || 'F'}</span><div className="min-w-0"><div className="truncate text-[15px] font-semibold">{row.buyerName || 'Fan'}</div><div className="mt-1 text-[13px] text-[#6f7080]">{row.kind}</div></div></div><div className={`shrink-0 text-right ${privateMode ? 'blur-[5px] select-none' : ''}`}><div className="text-[16px] font-semibold">{aud(row.stars)}</div><div className="mt-1 text-[12px] text-[#777887]">⭐ {fmtNum(row.stars)}</div><div className="mt-1 text-[11px] text-[#8a8b98]">{new Date(row.paidAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</div></div></div>)}</div> : <div className="px-5 py-8 text-sm text-[#777887]">No ledger activity matches this search.</div>}{(report.transactions?.length ?? 0) > transactionLimit ? <div className="px-5 pb-5 pt-3"><button onClick={() => setTransactionLimit(limit => Math.min(100, limit + 20))} className="text-sm font-medium text-[#304bf4]">Show more</button></div> : null}</CardContent></Card>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dddde7] bg-white px-5 py-4 text-sm shadow-sm"><div><span className="font-medium">Onboarding complete.</span> <span className="text-[#777887]">You can still view what you submitted.</span></div><a href="/creator/onboarding" className="font-medium text-[#304bf4]">View onboarding</a></div>
            </> : null}
          </div>
        </main>
      </div>
    </div>
  );
}
