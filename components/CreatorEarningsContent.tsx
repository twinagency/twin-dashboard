'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fmtNum, starsToMoney, AUD_PER_USD } from '@/lib/money';
import type { CreatorReport, CreatorReportResponse } from '@/lib/creator-report-contract';

const PERIODS = [
  { key: 'ALL', label: 'All' }, { key: '1Y', label: '1Y' }, { key: '6M', label: '6M' }, { key: '3M', label: '3M' },
  { key: '1M', label: '1M' }, { key: '2W', label: '2W' }, { key: '1W', label: '1W' }, { key: '1D', label: '1D', live: true },
] as const;

const aud = (stars: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(starsToMoney(stars, 'USD') * AUD_PER_USD);
const pct = (n: number | null) => n == null ? '-' : `${(n * 100).toFixed(n > 0 && n < .1 ? 1 : 0)}%`;
const Info = ({ text }: { text: string }) => <span title={text} aria-label={text} className="cursor-help text-[11px] font-normal text-[#858690]">ⓘ</span>;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <Card className="relative min-h-[88px] overflow-hidden rounded-[18px] border border-[#dddde7] bg-white shadow-sm before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[#3657f5]">
    <CardContent className="px-4 py-3.5">
      <div className="text-[10.5px] font-medium uppercase leading-[1.25] tracking-[0.035em] text-[#6e6f7c]">{label} <Info text={label}/></div>
      {sub && <div className="mt-1.5 text-[10.5px] leading-tight text-[#7d7e89]">{sub}</div>}
      <div className="mt-2.5 text-[22px] font-semibold leading-none tracking-[-0.025em] text-[#17181d]">{value}</div>
    </CardContent>
  </Card>;
}

function ExpandCard({ title, description, open, onToggle, children }: { title: string; description: string; open: boolean; onToggle: () => void; children?: React.ReactNode }) {
  return <Card className="rounded-[18px] border border-[#dedee7] bg-white shadow-sm"><CardContent className="p-4">
    <button type="button" onClick={onToggle} className="flex w-full items-start justify-between gap-4 text-left">
      <span><strong className="block text-[15px] leading-tight">{title}</strong><span className="mt-1 block text-[12px] leading-snug text-[#747580]">{description}</span></span>
      <span className="shrink-0 pt-0.5 text-[14px] font-semibold text-[#28658f]">{open ? 'Close' : 'Open'}⌄</span>
    </button>
    {open && children ? <div className="mt-4 border-t border-[#e4e4ea] pt-4">{children}</div> : null}
  </CardContent></Card>;
}

export default function CreatorEarningsContent({ name, connected, onboardingComplete }: { name: string; connected: boolean; onboardingComplete: boolean }) {
  const [period, setPeriod] = useState('1M');
  const [chartType, setChartType] = useState<'bar'|'line'>('bar');
  const [customOpen, setCustomOpen] = useState(false);
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const [range, setRange] = useState<{start:string;end:string}|null>(null);
  const [result, setResult] = useState<CreatorReportResponse|null>(null);
  const [loading, setLoading] = useState(connected);
  const [error, setError] = useState<string|null>(null);
  const [refresh, setRefresh] = useState(0);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);
  const [buyerOpen, setBuyerOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [txQuery, setTxQuery] = useState('');
  const [txLimit, setTxLimit] = useState(10);
  const request = useRef(0);
  const query = new URLSearchParams(range ? { startDate: range.start, endDate: range.end } : { period }).toString();

  useEffect(() => {
    if (!connected) { setResult({state:'awaiting_connection',report:null}); setLoading(false); return; }
    const n = ++request.current;
    const controller = new AbortController();
    setLoading(true); setError(null);
    fetch(`/creator/report-data?${query}`, { cache:'no-store', credentials:'same-origin', signal:controller.signal })
      .then(async r => { const body = await r.json().catch(()=>null); if (!r.ok) throw new Error(body?.error || 'Report data is temporarily unavailable.'); if (n === request.current) setResult(body); })
      .catch(e => { if (!controller.signal.aborted && n === request.current) setError(e instanceof Error ? e.message : 'Report data is temporarily unavailable.'); })
      .finally(() => { if (!controller.signal.aborted && n === request.current) setLoading(false); });
    return () => controller.abort();
  }, [connected, query, refresh]);

  useEffect(() => { const id = setInterval(() => { if (document.visibilityState === 'visible' && connected && !range) setRefresh(v=>v+1); }, 60000); return () => clearInterval(id); }, [connected, range]);

  const report: CreatorReport|null = result?.state === 'ready' ? result.report : null;
  const m = report?.metrics;
  const featureTotal = report?.byFeature.reduce((s,r)=>s+Math.max(0,r.stars),0) || 0;
  const topFeature = report?.byFeature.reduce((best,row)=>!best || row.stars > best.stars ? row : best, null as CreatorReport['byFeature'][number] | null) || null;
  const bestDay = report?.byDayOfWeek.reduce((best,row)=>!best || row.stars > best.stars ? row : best, null as CreatorReport['byDayOfWeek'][number] | null) || null;
  const bestHour = report?.byHour.reduce((best,row)=>!best || row.stars > best.stars ? row : best, null as CreatorReport['byHour'][number] | null) || null;
  const txs = useMemo(() => {
    const q = txQuery.trim().toLowerCase();
    return (report?.transactions || []).filter(t => !q || `${t.buyerName} ${t.kind}`.toLowerCase().includes(q)).slice(0, txLimit);
  }, [report, txQuery, txLimit]);
  const revPerUser = m && m.activeUsers > 0 ? m.revenueStars / m.activeUsers : null;
  const revPerBuyer = m && m.buyers > 0 ? m.revenueStars / m.buyers : null;
  const topShare = topFeature && featureTotal > 0 ? Math.round(topFeature.stars / featureTotal * 100) : 0;
  const selectedLabel = range ? 'Custom' : PERIODS.find(p=>p.key===period)?.label || period;

  return <main className="earnings-aurora min-h-screen px-[14px] py-5 sm:px-7 sm:py-8"><div className="mx-auto max-w-[1500px]">
    <h1 className="flex items-center gap-2 text-[27px] font-semibold tracking-[-0.04em] sm:text-[38px]">Earnings overview <Info text="Revenue, buyer activity, audience activity and conversion performance for your creator account."/></h1>
    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[#737480]">{report ? (report.stale ? 'Refreshing latest data…' : report.ageSeconds <= 5 ? 'Updated just now' : `Updated ${report.ageSeconds}s ago`) : 'Loading latest data'} <button onClick={()=>setRefresh(v=>v+1)} disabled={loading} className="font-semibold text-[#28658f] underline decoration-[#28658f]/35 underline-offset-2 disabled:opacity-50">{loading ? 'Refreshing…' : 'Refresh'}</button></div>
    <div className="mt-8 h-[3px] w-[58px] rounded-full bg-[#3657f5]"/>

    <div className="mt-5 rounded-[18px] border border-[#dcdde7] bg-white p-2.5 shadow-sm">
      <div className="flex flex-wrap gap-2">
        <div className="inline-flex min-w-0 flex-wrap gap-0.5 rounded-full bg-[#f1f1f5] p-[3px]">
          {PERIODS.map(p => <button key={p.key} onClick={()=>{setRange(null);setPeriod(p.key);setTxLimit(10)}} className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-medium transition ${!range && period===p.key ? 'bg-[#304bf4] text-white shadow' : 'text-[#666878]'}`}>{p.live&&<span className="h-1.5 w-1.5 rounded-full bg-[#149a70]"/>}{p.label}</button>)}
          <button onClick={()=>setCustomOpen(v=>!v)} className={`rounded-full px-2.5 py-1.5 text-[11px] font-medium ${range?'bg-[#304bf4] text-white':'text-[#666878]'}`}>▣ Custom</button>
        </div>
        <div className="inline-flex shrink-0 rounded-full bg-[#f1f1f5] p-[3px]"><button aria-label="Bar chart" onClick={()=>setChartType('bar')} className={`grid h-8 w-8 place-items-center rounded-full ${chartType==='bar'?'bg-[#304bf4] text-white shadow':'text-[#666878]'}`}>▥</button><button aria-label="Line chart" onClick={()=>setChartType('line')} className={`grid h-8 w-8 place-items-center rounded-full ${chartType==='line'?'bg-[#304bf4] text-white shadow':'text-[#666878]'}`}>⌁</button></div>
      </div>
      {customOpen && <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-[#e3e3ea] pt-3"><label className="grid gap-1 text-[11px] text-[#747580]">From<Input type="date" value={draftStart} onChange={e=>setDraftStart(e.target.value)}/></label><label className="grid gap-1 text-[11px] text-[#747580]">To<Input type="date" min={draftStart||undefined} value={draftEnd} onChange={e=>setDraftEnd(e.target.value)}/></label><Button size="sm" onClick={()=>{if(draftStart&&draftEnd){setRange({start:draftStart,end:draftEnd});setCustomOpen(false);setTxLimit(10)}}}>Apply</Button></div>}
    </div>

    {(!connected || result?.state === 'awaiting_connection') && <Card className="mt-4 rounded-[18px]"><CardContent className="p-5 text-sm text-[#747580]">{onboardingComplete ? 'Your earnings will appear when LYNQ connects this account to your live creator clone.' : 'Complete onboarding to continue.'}</CardContent></Card>}
    {error && <div className="mt-4 rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700">{error}</div>}

    {report && m && <>
      <Card className="mt-4 overflow-hidden rounded-[18px] border border-[#d8d9e5] bg-white shadow-sm"><div className="h-[3px] bg-[#3657f5]"/><CardContent className="p-4">
        <div className="flex items-start gap-4"><div className="min-w-0 flex-1"><div className="text-[11px] text-[#737480]">{name} · Star revenue, {selectedLabel} <Info text="Recorded Star payments after refunds and adjustments."/></div><div className="mt-1.5 text-[30px] font-semibold tracking-[-0.035em] text-[#138a63]">{aud(m.revenueStars)}</div></div><div className="shrink-0 border-l border-[#e3e3ea] pl-4"><div className="text-[10.5px] text-[#737480]">Telegram Stars</div><div className="mt-1 text-[15px] font-semibold">⭐ {fmtNum(m.revenueStars)}</div></div></div>
        <div className="mt-4 h-[170px]">{report.series.length ? <ResponsiveContainer width="100%" height="100%">{chartType==='bar' ? <BarChart data={report.series} margin={{top:6,right:2,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e3e8ef"/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fontSize:10,fill:'#607086'}} minTickGap={32}/><YAxis width={54} axisLine={false} tickLine={false} tick={{fontSize:10,fill:'#152033'}} tickFormatter={v=>aud(Number(v)).replace('.00','')}/><Tooltip formatter={(v)=>[aud(Number(v)),'Revenue']}/><Bar dataKey="stars" fill="#2cc7ba" radius={[2,2,0,0]}/></BarChart> : <LineChart data={report.series} margin={{top:6,right:2,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e3e8ef"/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fontSize:10,fill:'#607086'}} minTickGap={32}/><YAxis width={54} axisLine={false} tickLine={false} tick={{fontSize:10,fill:'#152033'}} tickFormatter={v=>aud(Number(v)).replace('.00','')}/><Tooltip formatter={(v)=>[aud(Number(v)),'Revenue']}/><Line dataKey="stars" stroke="#2cc7ba" strokeWidth={2.2} dot={false}/></LineChart>}</ResponsiveContainer> : <div className="grid h-full place-items-center text-xs text-[#747580]">No revenue in this period.</div>}</div>
      </CardContent></Card>

      <div className="mt-3"><ExpandCard title="Daily earnings analysis compared to previous days & weeks" description="Review buyers, orders, audience activity, major payments, and product mix for any day." open={dailyOpen} onToggle={()=>setDailyOpen(v=>!v)}><div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><Stat label="Best revenue day" value={bestDay?.label || '-'}/><Stat label="Best selling hour" value={bestHour?.label || '-'}/><Stat label="Repeat buyers" value={`${Math.round(m.repeatPct*100)}%`}/></div></ExpandCard></div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6"><Stat label="All-time users" value={fmtNum(m.totalFans)}/><Stat label="New users" value={fmtNum(m.newFans)}/><Stat label="Users who messaged" value={fmtNum(m.activeUsers)}/><Stat label="Revenue / user who messaged" value={revPerUser==null?'-':aud(revPerUser)}/><Stat label="Purchases" value={fmtNum(m.sales)}/><Stat label="Active users (24H)" value={fmtNum(m.reachable24h)} sub="messaged in last 24h"/><Stat label="Messages" value={fmtNum(m.messages)}/><Stat label="Unique buyers" value={fmtNum(m.buyers)} sub="paid this period"/><Stat label="Revenue / buyer" value={revPerBuyer==null?'-':aud(revPerBuyer)}/><Stat label="Avg paid order" value={m.averageOrderStars==null?'-':aud(m.averageOrderStars)}/><Stat label="Multi-order buyers" value={`${Math.round(m.repeatPct*100)}%`} sub="2+ paid orders"/><Stat label="Top revenue type" value={topFeature?`${topFeature.label} ${topShare}%`:'-'}/></div>

      <button type="button" onClick={()=>setFullOpen(v=>!v)} aria-expanded={fullOpen} className="mt-3 w-[min(100%,320px)] rounded-[16px] bg-[#071a2f] px-5 py-3.5 text-left text-white shadow-sm"><span className="block text-[15px] font-semibold">Full revenue report →</span><span className="mt-1 block text-[11px] font-semibold tracking-[0.04em] text-white/65">WHAT MAKES THE MONEY</span></button>
      {fullOpen && <Card className="mt-3 rounded-[18px]"><CardContent className="p-4"><div className="grid gap-4 md:grid-cols-3"><section><h3 className="text-sm font-semibold">Revenue by type</h3><div className="mt-2 space-y-2">{report.byFeature.map(r=><div key={r.key} className="flex justify-between gap-4 border-b border-[#ececf1] py-2 text-xs"><span>{r.label}</span><strong>{aud(r.stars)}</strong></div>)}</div></section><section><h3 className="text-sm font-semibold">Best weekdays</h3><div className="mt-2 space-y-2">{report.byDayOfWeek.map(r=><div key={r.label} className="flex justify-between gap-4 border-b border-[#ececf1] py-2 text-xs"><span>{r.label}</span><strong>{aud(r.stars)}</strong></div>)}</div></section><section><h3 className="text-sm font-semibold">Best hours</h3><div className="mt-2 space-y-2">{report.byHour.slice().sort((a,b)=>b.stars-a.stars).slice(0,8).map(r=><div key={r.label} className="flex justify-between gap-4 border-b border-[#ececf1] py-2 text-xs"><span>{r.label}</span><strong>{aud(r.stars)}</strong></div>)}</div></section></div></CardContent></Card>}

      <div className="mt-5 space-y-3"><ExpandCard title="PAYING CUSTOMERS" description="Did people buy after messaging, and did past buyers come back?" open={buyerOpen} onToggle={()=>setBuyerOpen(v=>!v)}><div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><Stat label="Active chatters" value={fmtNum(report.conversion.activeChatters)}/><Stat label="Active chat buyers" value={fmtNum(report.conversion.activeChatBuyers)}/><Stat label="Chat to buyer" value={pct(report.conversion.activeChatBuyerRate)}/></div></ExpandCard><ExpandCard title="CHAT ACTIVITY & PURCHASES" description="See what people do in chats during the dates you picked." open={chatOpen} onToggle={()=>setChatOpen(v=>!v)}><div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><Stat label="Messages" value={fmtNum(m.messages)}/><Stat label="Users who messaged" value={fmtNum(m.activeUsers)}/><Stat label="Revenue / user" value={revPerUser==null?'-':aud(revPerUser)}/></div></ExpandCard></div>

      <Card className="mt-3 rounded-[18px] border border-[#dedee7] bg-white shadow-sm"><CardContent className="p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-[15px] font-semibold">RECENT LEDGER ACTIVITY <Info text="Latest recorded paid activity for your creator account."/></h2><Input className="h-9 max-w-[260px] text-xs" placeholder="Search ledger activity" value={txQuery} onChange={e=>{setTxQuery(e.target.value);setTxLimit(10)}}/></div><div className="mt-3 divide-y divide-[#e4e4ea]">{txs.map((t,i)=><div key={`${t.paidAt}-${i}`} className="flex items-center gap-3 py-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#27cbbb] text-xs font-semibold text-white">{(t.buyerName||'F').slice(0,1).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="truncate text-[14px] font-medium">{t.buyerName}</div><div className="mt-0.5 truncate text-[11px] text-[#747580]">{t.kind}</div></div><div className="shrink-0 text-right"><div className="text-[14px] font-semibold">{aud(t.stars)}</div><div className="mt-0.5 text-[10.5px] text-[#747580]">⭐ {fmtNum(t.stars)}</div></div></div>)}{txs.length===0&&<div className="py-6 text-center text-xs text-[#747580]">No matching ledger activity.</div>}</div>{report.transactions.length>txLimit && <button className="mt-3 text-xs font-semibold text-[#28658f]" onClick={()=>setTxLimit(v=>Math.min(v+20,100))}>Show more</button>}</CardContent></Card>
    </>}
  </div></main>;
}