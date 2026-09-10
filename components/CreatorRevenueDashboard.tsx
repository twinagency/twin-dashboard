'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DollarSign, ClipboardCheck, LogOut, Menu, X, Eye, ExternalLink, ChevronDown, Search, Download } from 'lucide-react';
import TwinWordmark from '@/components/TwinWordmark';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fmtMoney, fmtNum, starsToMoney } from '@/lib/money';
import type { CreatorReport, CreatorReportResponse } from '@/lib/creator-report-contract';

const PERIODS = [
  { key: 'ALL', label: 'All' }, { key: '1Y', label: '1Y' }, { key: '6M', label: '6M' },
  { key: '3M', label: '3M' }, { key: '1M', label: '1M' }, { key: '2W', label: '2W' },
  { key: '1W', label: '1W' }, { key: '1D', label: '1D', live: true },
] as const;
const money = (stars: number) => fmtMoney(starsToMoney(stars, 'USD'), 'USD');
const pct = (n: number | null) => n === null ? '-' : `${(n * 100).toFixed(n * 100 < 10 ? 1 : 0)}%`;

type Props = { displayName: string; cloneName: string | null; connected: boolean; onboardingComplete: boolean };

function Info({ text }: { text: string }) {
  return <span className="cursor-help text-[11px] font-normal text-muted" title={text} aria-label={text}>ⓘ</span>;
}

function Stat({ label, value, sub, hint }: { label: string; value: string; sub?: string; hint: string }) {
  return <Card size="sm" className="relative min-h-[112px] overflow-hidden border border-line bg-white shadow-sm before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-[#3657f5]">
    <CardContent className="px-5 py-4">
      <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.025em] text-muted">{label}<Info text={hint} /></div>
      {sub && <div className="mt-2 text-[11px] text-muted">{sub}</div>}
      <div className="mt-3 font-heading text-[24px] font-semibold leading-none tracking-[-0.025em] text-[#17181d]">{value}</div>
    </CardContent>
  </Card>;
}

export default function CreatorRevenueDashboard({ displayName, cloneName, connected, onboardingComplete }: Props) {
  const [period, setPeriod] = useState('1M');
  const [customRange, setCustomRange] = useState<{ start: string; end: string } | null>(null);
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [result, setResult] = useState<CreatorReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(connected);
  const [refresh, setRefresh] = useState(0);
  const [transactionQuery, setTransactionQuery] = useState('');
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const requestNumber = useRef(0);

  const params = new URLSearchParams(customRange ? { startDate: customRange.start, endDate: customRange.end } : { period });
  const query = params.toString();

  useEffect(() => {
    if (!connected) { setResult({ state: 'awaiting_connection', report: null }); setLoading(false); return; }
    const number = ++requestNumber.current;
    const controller = new AbortController();
    setLoading(true); setError(null);
    fetch(`/creator/report-data?${query}`, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async response => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error || 'Report data is temporarily unavailable.');
        if (number === requestNumber.current) setResult(body as CreatorReportResponse);
      })
      .catch(err => { if (!controller.signal.aborted && number === requestNumber.current) setError(err instanceof Error ? err.message : 'Report data is temporarily unavailable.'); })
      .finally(() => { if (!controller.signal.aborted && number === requestNumber.current) setLoading(false); });
    return () => controller.abort();
  }, [connected, query, refresh]);

  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === 'visible' && connected) setRefresh(v => v + 1); }, 60_000);
    return () => window.clearInterval(id);
  }, [connected]);

  const report: CreatorReport | null = result?.state === 'ready' ? result.report : null;
  const m = report?.metrics;
  const transactions = useMemo(() => {
    const q = transactionQuery.trim().toLowerCase();
    const rows = report?.transactions.filter(t => !q || `${t.buyerName} ${t.kind}`.toLowerCase().includes(q)) || [];
    return rows.slice(0, showAllTransactions ? 100 : 10);
  }, [report, transactionQuery, showAllTransactions]);
  const revenuePerUser = m && m.activeUsers > 0 ? m.revenueStars / m.activeUsers : null;
  const revenuePerBuyer = m && m.buyers > 0 ? m.revenueStars / m.buyers : null;
  const topFeature = report?.byFeature.reduce((best, row) => !best || row.stars > best.stars ? row : best, null as CreatorReport['byFeature'][number] | null) || null;
  const featureTotal = report?.byFeature.reduce((sum, row) => sum + Math.max(0, row.stars), 0) || 0;
  const topFeatureShare = topFeature && featureTotal > 0 ? Math.round(topFeature.stars / featureTotal * 100) : 0;
  const name = cloneName || displayName;

  const nav = <>
    <a href="#earnings" onClick={() => setMobileOpen(false)} className="flex items-center gap-4 rounded-[18px] border border-[#3657f5]/15 bg-gradient-to-r from-[#f3f4ff] to-[#fff1f4] px-5 py-4 text-[17px] font-semibold text-[#304bf4]"><DollarSign size={25} strokeWidth={1.8}/>Earnings</a>
    <a href="/creator/onboarding" onClick={() => setMobileOpen(false)} className="flex items-center gap-4 rounded-xl px-5 py-3.5 text-[16px] font-medium text-[#646575] hover:bg-[#f7f7fa]"><ClipboardCheck size={22} strokeWidth={1.8}/>Onboarding</a>
  </>;

  return <div className="min-h-screen bg-[#f8f8fb] text-[#17181d]" data-creator-brand="lynq">
    <header className="sticky top-0 z-40 flex h-[112px] items-center justify-between border-b border-[#dedee8] bg-white px-6 sm:px-10 lg:hidden">
      <TwinWordmark agencyName="LYNQ" />
      <div className="flex items-center gap-5"><form action="/creator-auth/logout" method="post"><button className="text-[15px] font-medium text-[#17181d]">Sign out</button></form><button aria-label="Open creator navigation" onClick={() => setMobileOpen(true)}><Menu size={29} strokeWidth={1.7}/></button></div>
    </header>

    {mobileOpen && <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[1px]" onClick={() => setMobileOpen(false)}>
      <aside className="h-full w-[min(75vw,360px)] bg-white px-7 py-8 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between"><TwinWordmark agencyName="LYNQ"/><button className="grid h-11 w-11 place-items-center rounded-full border border-line bg-white shadow" onClick={() => setMobileOpen(false)}><X size={24}/></button></div>
        <p className="mt-10 px-1 text-[15px] text-muted">LYNQ · Creator dashboard</p>
        <nav className="mt-7 space-y-2">{nav}</nav>
        <div className="mt-8 border-t border-line pt-6"><form action="/creator-auth/logout" method="post"><button className="flex items-center gap-4 px-5 py-3 text-[16px] text-[#646575]"><LogOut size={21}/>Sign out</button></form></div>
      </aside>
    </div>}

    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] border-r border-[#dedee8] bg-white px-6 py-7 lg:flex lg:flex-col">
      <TwinWordmark agencyName="LYNQ" />
      <p className="mt-10 px-2 text-sm text-muted">LYNQ · Creator dashboard</p>
      <nav className="mt-7 space-y-2">{nav}</nav>
      <div className="mt-auto border-t border-line pt-5"><form action="/creator-auth/logout" method="post"><button className="flex items-center gap-3 px-4 py-3 text-sm text-[#646575]"><LogOut size={18}/>Sign out</button></form></div>
    </aside>

    <div className="lg:ml-[260px]">
      <div className="sticky top-[112px] z-30 border-b border-[#dedee8] bg-[#fbfbfd]/95 px-5 py-5 backdrop-blur lg:top-0">
        <div className="mx-auto flex max-w-[1500px] items-center justify-center lg:justify-between">
          <div className="inline-flex min-w-[280px] items-center gap-3 rounded-[22px] border border-[#d9dae5] bg-white px-5 py-3 shadow-sm">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#ececf2] text-[10px] font-semibold text-[#676875]">YOU</span>
            <strong className="min-w-0 flex-1 truncate text-[15px]">{name}</strong>
            <span className="h-7 w-px bg-line"/><span className="rounded-full bg-[#f0f0f4] px-3 py-1.5 text-xs font-semibold">$USD</span><Eye size={18} className="text-[#686978]"/><ExternalLink size={18} className="text-[#686978]"/>
          </div>
        </div>
      </div>

      <main id="earnings" className="earnings-aurora min-h-screen px-4 py-6 sm:px-7 sm:py-8">
        <div className="mx-auto max-w-[1500px]">
          <div className="flex items-start justify-between gap-4">
            <div><h1 className="flex items-center gap-2 font-heading text-[31px] font-semibold tracking-[-0.035em] sm:text-[38px]">Earnings overview <Info text="Revenue, audience, buyer activity and conversion performance for your creator account."/></h1><div className="mt-2 flex items-center gap-2 text-[12px] text-muted">{report ? (report.stale ? 'Refreshing latest data…' : report.ageSeconds < 10 ? 'Updated just now' : `Updated ${report.ageSeconds}s ago`) : 'Loading latest data'} <button onClick={() => setRefresh(v => v + 1)} disabled={loading} className="font-semibold text-[#28658f] underline decoration-[#28658f]/35 underline-offset-2">{loading ? 'Refreshing…' : 'Refresh'}</button></div></div>
          </div>

          <div className="mt-10 h-1 w-[84px] rounded-full bg-[#3b57f5]"/>
          <div className="mt-7 rounded-[22px] border border-[#dcdde7] bg-white p-3 shadow-sm sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex flex-wrap gap-0.5 rounded-full bg-[#f1f1f5] p-1">
                {PERIODS.map(p => <button key={p.key} onClick={() => { setCustomRange(null); setPeriod(p.key); }} className={`flex items-center gap-1 rounded-full px-3 py-2 text-[12px] font-medium ${!customRange && period === p.key ? 'bg-[#304bf4] text-white shadow' : 'text-[#666878]'}`}>{p.live && <span className="h-2 w-2 rounded-full bg-[#149a70]"/>}{p.label}</button>)}
                <button onClick={() => setCustomOpen(v => !v)} className={`rounded-full px-3 py-2 text-[12px] font-medium ${customRange ? 'bg-[#304bf4] text-white' : 'text-[#666878]'}`}>▣ Custom</button>
              </div>
              <div className="inline-flex rounded-full bg-[#f1f1f5] p-1"><button aria-label="Bar chart" onClick={() => setChartType('bar')} className={`grid h-9 w-9 place-items-center rounded-full ${chartType === 'bar' ? 'bg-[#304bf4] text-white' : 'text-[#666878]'}`}>▥</button><button aria-label="Line chart" onClick={() => setChartType('line')} className={`grid h-9 w-9 place-items-center rounded-full ${chartType === 'line' ? 'bg-[#304bf4] text-white' : 'text-[#666878]'}`}>⌁</button></div>
            </div>
            {customOpen && <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-line pt-3"><label className="grid gap-1 text-xs text-muted">From<Input type="date" value={draftStart} onChange={e => setDraftStart(e.target.value)}/></label><label className="grid gap-1 text-xs text-muted">To<Input type="date" min={draftStart || undefined} value={draftEnd} onChange={e => setDraftEnd(e.target.value)}/></label><Button size="sm" onClick={() => { if (draftStart && draftEnd) { setCustomRange({ start: draftStart, end: draftEnd }); setCustomOpen(false); } }}>Apply</Button></div>}
          </div>

          {(!connected || result?.state === 'awaiting_connection') && <Card className="mt-5"><CardHeader><CardTitle>{onboardingComplete ? 'Your onboarding has been received' : 'Complete your onboarding'}</CardTitle></CardHeader><CardContent className="text-sm text-muted">{onboardingComplete ? 'Your earnings will appear here once your creator account is connected to your live clone.' : 'Complete your onboarding so Twin can prepare your creator account.'}</CardContent></Card>}
          {error && <div className="mt-5 rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700">{error}</div>}

          {report && m && <>
            <Card className="mt-5 overflow-hidden border border-[#d8d9e5] bg-white shadow-sm">
              <div className="h-1 bg-[#3657f5]"/>
              <CardHeader className="pb-1"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-[12px] text-muted">{name} · Star revenue, {customRange ? 'custom range' : PERIODS.find(p => p.key === period)?.label}<Info text="Recorded Star payments after refunds and adjustments. This is not a wallet balance or confirmed payout."/></div><div className="mt-2 font-heading text-[34px] font-semibold tracking-[-0.03em] text-[#138a63]">{money(m.revenueStars)}</div><button className="mt-2 text-[12px] font-medium text-[#304bf4] underline">Your creator earnings view</button></div><div className="flex items-center gap-5"><div><div className="text-[11px] text-muted">Telegram Stars</div><div className="mt-1 text-[18px] font-semibold">⭐ {fmtNum(m.revenueStars)}</div></div></div></div></CardHeader>
              <CardContent><div className="h-[210px] sm:h-[270px]">{report.series.length ? <ResponsiveContainer width="100%" height="100%">{chartType === 'bar' ? <BarChart data={report.series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#dfe2ea" vertical={false}/><XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={28} tick={{ fontSize: 11, fill: '#6d7080' }}/><YAxis width={64} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#25262b' }} tickFormatter={(v:number)=>money(v).replace('.00','')}/><Tooltip formatter={(v:unknown)=>[money(Number(v)),'Revenue']} contentStyle={{ borderRadius: 12, border: '1px solid #dfe2ea' }}/><Bar dataKey="stars" fill="#29cabb" radius={[2,2,0,0]}>{report.series.map((_,i)=><Cell key={i} fill={i === report.series.length - 1 ? '#37b9b1' : '#2dc7b9'}/>)}</Bar></BarChart> : <LineChart data={report.series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#dfe2ea" vertical={false}/><XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={28} tick={{ fontSize: 11, fill: '#6d7080' }}/><YAxis width={64} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#25262b' }} tickFormatter={(v:number)=>money(v).replace('.00','')}/><Tooltip formatter={(v:unknown)=>[money(Number(v)),'Revenue']}/><Line type="monotone" dataKey="stars" stroke="#304bf4" strokeWidth={2.5} dot={false}/></LineChart>}</ResponsiveContainer> : <div className="grid h-full place-items-center text-sm text-muted">No recorded revenue in this period.</div>}</div></CardContent>
            </Card>

            <Card className="mt-4 border border-[#d8d9e5] bg-white shadow-sm"><button className="flex w-full items-center justify-between px-5 py-4 text-left" onClick={() => setAdvancedOpen(v => !v)}><div><div className="text-[17px] font-semibold">Daily earnings analysis compared to previous days & weeks</div><div className="mt-1 text-[12px] text-muted">Review buyers, orders, audience activity, major payments, and product mix for any day.</div></div><div className="flex items-center gap-2 text-sm font-medium text-[#28658f]">{advancedOpen ? 'Close' : 'Open'}<ChevronDown size={18} className={advancedOpen ? 'rotate-180' : ''}/></div></button>{advancedOpen && <CardContent className="border-t border-line pt-4"><div className="grid gap-3 sm:grid-cols-3"><Stat label="Current revenue" value={money(m.revenueStars)} hint="Revenue in the selected period."/><Stat label="Unique buyers" value={fmtNum(m.buyers)} hint="Distinct buyers in this period."/><Stat label="Average paid order" value={m.averageOrderStars === null ? '-' : money(m.averageOrderStars)} hint="Average positive paid order value."/></div></CardContent>}</Card>

            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
              <Stat label="All-time users" value={fmtNum(m.totalFans)} hint="All fan profiles for this creator, ever."/>
              <Stat label="New users" value={fmtNum(m.newFans)} hint="Fan profiles first seen during the selected period."/>
              <Stat label="Users who messaged" value={fmtNum(m.activeUsers)} hint="Fans who sent an inbound message during the selected period."/>
              <Stat label="Revenue / user who messaged" value={revenuePerUser === null ? '-' : money(revenuePerUser)} hint="Recorded revenue divided by users who messaged in the same period."/>
              <Stat label="Purchases" value={fmtNum(m.sales)} hint="Positive paid orders during the selected period."/>
              <Stat label="Active users (24h)" sub="messaged in last 24h" value={fmtNum(m.reachable24h)} hint="Fans currently messageable based on recent inbound activity."/>
              <Stat label="Messages" value={fmtNum(m.messages)} hint="Messages recorded for this creator during the selected period."/>
              <Stat label="Unique buyers" sub="paid this period" value={fmtNum(m.buyers)} hint="Distinct fans who made a purchase in this period."/>
              <Stat label="Revenue / buyer" value={revenuePerBuyer === null ? '-' : money(revenuePerBuyer)} hint="Recorded revenue divided by unique buyers in the selected period."/>
              <Stat label="Avg paid order" value={m.averageOrderStars === null ? '-' : money(m.averageOrderStars)} hint="Positive paid receipt volume divided by paid orders."/>
              <Stat label="Multi-order buyers" sub="2+ paid orders" value={`${Math.round(m.repeatPct * 100)}%`} hint="Share of buyers with more than one paid order in this period."/>
              <Stat label="Top revenue type" value={topFeature ? `${topFeature.label} ${topFeatureShare}%` : '-'} hint="Highest revenue-producing purchase type in this period."/>
            </div>

            <button onClick={() => setAdvancedOpen(true)} className="mt-4 rounded-[18px] bg-[#071a2f] px-5 py-4 text-left text-white shadow"><span className="block text-[15px] font-semibold">Full revenue report →</span><span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-white/70">What makes the money</span></button>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <Card className="border border-[#d8d9e5] bg-white shadow-sm"><CardHeader><CardTitle className="text-[17px] uppercase tracking-[0.02em]">Paying customers</CardTitle><p className="text-[12px] text-muted">Did people buy after messaging, and did past buyers come back?</p></CardHeader><CardContent className="grid grid-cols-2 gap-3"><Stat label="Active chatters" value={fmtNum(report.conversion.activeChatters)} hint="Distinct active chatters in the period."/><Stat label="Active buyers" value={fmtNum(report.conversion.activeChatBuyers)} hint="Active chatters who purchased."/><Stat label="Chat → buyer" value={pct(report.conversion.activeChatBuyerRate)} hint="Active buyers divided by active chatters."/><Stat label="Lifetime buyer rate" value={pct(report.conversion.lifetimeBuyerRate)} hint="Lifetime buyer profiles divided by fan profiles."/></CardContent></Card>
              <Card className="border border-[#d8d9e5] bg-white shadow-sm"><CardHeader><CardTitle className="text-[17px] uppercase tracking-[0.02em]">What sells</CardTitle><p className="text-[12px] text-muted">Revenue mix across paid messages, photos, videos, bundles, tips and subscriptions.</p></CardHeader><CardContent>{report.byFeature.slice(0,6).map(row => <div key={row.key} className="border-b border-line py-3 last:border-0"><div className="flex items-center justify-between text-sm"><span>{row.label}</span><strong>{money(row.stars)}</strong></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#ececf2]"><div className="h-full rounded-full bg-[#3657f5]" style={{ width: `${featureTotal ? Math.max(2, Math.round(Math.max(0,row.stars)/featureTotal*100)) : 0}%` }}/></div></div>)}</CardContent></Card>
            </div>

            <Card className="mt-5 border border-[#d8d9e5] bg-white shadow-sm"><CardHeader><CardTitle className="text-[17px] uppercase tracking-[0.02em]">Chat activity & purchases</CardTitle><p className="text-[12px] text-muted">See what people do in chats during the dates you picked.</p></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-3"><Stat label="Users who messaged" value={fmtNum(m.activeUsers)} hint="Fans who messaged."/><Stat label="Messages" value={fmtNum(m.messages)} hint="Messages in the selected period."/><Stat label="Purchases" value={fmtNum(m.sales)} hint="Paid orders in the selected period."/></div></CardContent></Card>

            <Card className="mt-5 border border-[#d8d9e5] bg-white shadow-sm" id="transactions"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="text-[17px] uppercase tracking-[0.02em]">Recent ledger activity <Info text="Latest available creator transactions in this reporting period."/></CardTitle><a href={`/creator/report-data?${query}&format=csv`} className="inline-flex items-center gap-2 text-xs font-medium text-[#304bf4]"><Download size={14}/>Export</a></div><div className="relative mt-3 max-w-[300px]"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"/><Input value={transactionQuery} onChange={e=>setTransactionQuery(e.target.value)} placeholder="Search ledger activity" className="pl-9"/></div></CardHeader><CardContent className="px-0">{transactions.map((t,i)=><div key={`${t.paidAt}-${i}`} className="flex items-center justify-between gap-4 border-t border-line px-5 py-4 first:border-t-0"><div className="min-w-0"><div className="truncate text-[16px] font-medium">{t.buyerName}</div><div className="mt-1 text-[12px] text-muted">{t.kind}</div></div><div className="shrink-0 text-right"><div className="text-[17px] font-semibold">{money(t.stars)}</div><div className="mt-1 text-[12px] text-[#d7a615]">⭐ {fmtNum(t.stars)}</div><div className="mt-1 text-[11px] text-muted">{new Date(t.paidAt).toLocaleString()}</div></div></div>)}{!transactions.length && <div className="px-5 py-8 text-sm text-muted">No matching ledger activity.</div>}{(report.transactions.length > 10 || showAllTransactions) && <div className="border-t border-line p-4"><button className="text-sm font-medium text-[#304bf4]" onClick={()=>setShowAllTransactions(v=>!v)}>{showAllTransactions ? 'Show less' : 'Show more'}</button></div>}</CardContent></Card>
          </>}
        </div>
      </main>
    </div>
  </div>;
}
