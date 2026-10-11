"use client";
import RankingPanel from '@/components/overview-rankings/RankingPanel';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, CalendarDays, ChevronDown, DollarSign, ImageIcon, MoreHorizontal, RefreshCw, Users, X } from 'lucide-react';
import { useCurrency } from '../CurrencyProvider';
import BlurToggle from '../BlurToggle';
import PlatformMark from './PlatformMark';
import { fmtMoney, starsToMoneyRate } from '@/lib/money';
import { intraPeriodTrendPct } from '@/lib/revenue-trend';
import type { DashboardData, Period, RecentTransaction } from '@/lib/dashboard-data';
import type { AgencyOverviewPresentation, AgencyOverviewImage } from '@/lib/agency-overview-model';
import type { CreatorOverviewPresentation, OverviewPhoto } from '@/lib/creator-overview-model';
import styles from './CreatorOverview.module.css';

type Creator = { id: string; name: string };
type Payload = DashboardData & { cachedAt?: number; stale?: boolean };
const periods: [Period, string][] = [['1W', 'Last 7 days'], ['1M', 'Last 30 days'], ['3M', 'Last 3 months'], ['6M', 'Last 6 months'], ['1Y', 'Last year'], ['ALL', 'All time']];
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
const transactionName = (item: RecentTransaction) => item.kind === 'refund' ? 'Refund / adjustment' : ({photo:'Photo purchase',video:'Video purchase',bundle:'Bundle purchase',credits:'Credit purchase',tip:'Tip',subscription:'Subscription'}[item.kind] || 'Purchase');
const fullDate = (at: string) => new Intl.DateTimeFormat('en-AU', {dateStyle:'medium',timeStyle:'short',timeZone:'Australia/Brisbane'}).format(new Date(at));
function relativeDate(at: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(at).getTime()) / 60000));
  return minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`;
}
function Sparkline({values}:{values:number[]}) {
  if (!values.length) return null;
  const lo = Math.min(0, ...values), hi = Math.max(1, ...values), span = hi - lo;
  const points = values.map((v,i) => `${i / Math.max(1, values.length - 1) * 240},${38 - (v - lo) / span * 32}`).join(' ');
  return <svg className={styles.sparkline} viewBox="0 0 240 44" preserveAspectRatio="none" aria-hidden="true"><polygon points={`0,44 ${points} 240,44`} fill="currentColor" opacity=".09"/><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" /></svg>;
}
function Panel({title,action,children,className=''}:{title:string;action?:ReactNode;children:ReactNode;className?:string}) {
  return <section className={`${styles.panel} ${className}`}><div className={styles.panelHeading}><h2>{title}</h2>{action}</div>{children}</section>;
}
function Photo({photo,alt,className}:{photo:OverviewPhoto;alt:string;className?:string}) {
  return <img src={photo.url} alt={alt} className={className} style={{objectPosition:photo.position}} data-photo-id={photo.id} />;
}
function AgencyPhoto({photo,name,className}:{photo:AgencyOverviewImage|null;name:string;className?:string}) {
  const [failed,setFailed] = useState(false);
  useEffect(()=>setFailed(false),[photo?.url]);
  return photo&&!failed ? <span className={`${styles.portraitFrame} ${className||''}`}><img src={photo.url} alt={name} style={photo.crop?{position:'absolute',width:`${photo.crop.sourceWidth/photo.crop.width*100}%`,height:`${photo.crop.sourceHeight/photo.crop.height*100}%`,maxWidth:'none',left:`${-photo.crop.x/photo.crop.width*100}%`,top:`${-photo.crop.y/photo.crop.height*100}%`,objectFit:'fill'}:{objectPosition:photo.position,transform:`scale(${photo.zoom||1})`,transformOrigin:'50% 0%'}} data-photo-id={photo.id} onError={()=>setFailed(true)}/></span> : <span className={className} aria-label={name}>{initials(name)}</span>;
}
function Dialog({title,children,close}:{title:string;children:ReactNode;close:()=>void}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (event:KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key !== 'Tab') return;
      const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button,a[href],[tabindex="0"]') || []);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown',onKey); previous?.focus(); };
  // The mounted dialog owns focus until it closes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className={styles.backdrop} onMouseDown={e => { if(e.target === e.currentTarget)close(); }}><div ref={ref} className={styles.dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}><div className={styles.panelHeading}><h2>{title}</h2><button onClick={close} aria-label="Close details"><X size={20}/></button></div>{children}</div></div>;
}

export default function CreatorOverview({initialPresentation,initialAudience,creators,initialAgency}:{initialPresentation:CreatorOverviewPresentation|null;initialAudience:{total:number};creators:Creator[];initialAgency?:AgencyOverviewPresentation}) {
  const router = useRouter();
  const {currency,rate,setCurrency} = useCurrency();
  const [presentation,setPresentation] = useState(initialPresentation);
  const [audience,setAudience] = useState(initialAudience);
  const [agency,setAgency] = useState(initialAgency);
  const [compare,setCompare] = useState(false);
  const isAgency = !presentation;
  const allowedIds = useMemo(()=>creators.map(c=>c.id),[creators]);
  const telegramCreators = useMemo(()=>[...(agency?.creators||[])].sort((a,b)=>Number(!!b.portrait)-Number(!!a.portrait)),[agency]);
  const featuredCreators = useMemo(()=>(agency?.creators||[]).filter(c=>c.heroPhoto).slice(0,3),[agency]);
  const [period,setPeriod] = useState<Period>('1M');
  const [custom,setCustom] = useState(false), [from,setFrom] = useState(''), [to,setTo] = useState('');
  const [range,setRange] = useState<{from:string;to:string}|null>(null);
  const [data,setData] = useState<Payload|null>(null), [loading,setLoading] = useState(true), [error,setError] = useState('');
  const [revision,setRevision] = useState(0), [switching,setSwitching] = useState(false);
  const [hover,setHover] = useState<number|null>(null);
  const [detail,setDetail] = useState<{purchase:RecentTransaction}|{photo:OverviewPhoto}|null>(null);
  const id = presentation?.id || '';
  useEffect(() => {
    const abort = new AbortController();
    let first = true;
    async function refresh() {
      if (first) { setLoading(true); setData(null); }
      try {
        const params = new URLSearchParams({clone:id,period});
        if (range) { params.set('startDate',range.from); params.set('endDate',range.to); }
        if (!first || revision) params.set('fresh','1');
        const response = await fetch(`/api/dashboard?${params}`, {cache:'no-store',signal:abort.signal});
        const result = await response.json();
        if (!response.ok || (id ? !result.perClone?.[id] : !result.totals)) throw new Error('Earnings could not be refreshed. Please try again.');
        if (!abort.signal.aborted) { setData(result); setError(''); }
      } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Earnings could not be loaded.'); }
      finally { if (!abort.signal.aborted) setLoading(false); first = false; }
    }
    void refresh();
    const timer = setInterval(() => void refresh(),60000);
    return () => { abort.abort(); clearInterval(timer); };
  },[id,period,range,revision]);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/creator-overview?clone=${id}`,{cache:'no-store',signal:abort.signal});
        if (!response.ok) return;
        const result = await response.json();
        if (!id && Array.isArray(result.creators) && !abort.signal.aborted) { setAgency(result); setAudience(result.audience); }
        if (id && result.presentation?.id === id && !abort.signal.aborted) { setPresentation(result.presentation); setAudience(result.audience); }
      } catch { /* Keep the last verified presentation during a temporary failure. */ }
    },300000);
    return () => { abort.abort(); clearInterval(timer); };
  },[id]);
  const stats = id ? data?.perClone[id] : data?.totals;
  const values = useMemo(() => data?.series.map(row => id ? Number(row[id]) || 0 : allowedIds.reduce((sum,key)=>sum+(Number(row[key])||0),0)) || [],[data,id,allowedIds]);
  const recent = useMemo(() => data?.recent.filter(row => id ? row.cloneId === id : allowedIds.includes(row.cloneId)) || [],[data,id,allowedIds]);
  const trend = intraPeriodTrendPct(values);
  const money = (stars:number) => fmtMoney(starsToMoneyRate(stars,currency,rate),currency);
  const amount = stats ? money(stats.stars) : loading ? '…' : 'Unavailable';
  const comparisonValues = compare && isAgency ? data?.series.flatMap(row=>allowedIds.map(key=>Number(row[key])||0)) || [] : [];
  const chartValues = compare&&isAgency ? comparisonValues : values;
  const peak = Math.max(1,...chartValues.map(v=>starsToMoneyRate(v,currency,rate)));
  const floor = Math.min(0,...chartValues.map(v=>starsToMoneyRate(v,currency,rate)));
  const chartPoints = values.map((v,i) => `${i / Math.max(1,values.length - 1) * 1000},${180 - (starsToMoneyRate(v,currency,rate)-floor)/(peak-floor)*170}`).join(' ');
  const chartZero = 180 - (0-floor)/(peak-floor)*170;
  const choosePeriod = (value:Period) => { setPeriod(value); setRange(null); setHover(null); setCustom(false); };
  async function chooseCreator(next:string) {
    setSwitching(true);
    try {
      const response = await fetch('/agency/clone-scope',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({clone:next || null})});
      if (!response.ok) throw new Error('Could not switch creator. Please try again.');
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not switch creator.'); setSwitching(false); }
  }
  const viewCreators = () => document.getElementById('overview-creators')?.scrollIntoView({behavior:'smooth',block:'start'});
  const purchases = () => document.getElementById('overview-purchases')?.scrollIntoView({behavior:'smooth',block:'start'});
  const trendBadge = trend === null ? null : <em data-direction={trend<0?'down':'up'} title="Average earnings per interval in the second half of this range compared with the first half">{trend<0?'↓':'↑'} {Math.abs(trend)}%</em>;
  return <div className={`${styles.dashboard} ${isAgency?styles.agencyDashboard:''}`} data-creator-overview={id||'all'} data-agency-overview={isAgency?'flirt':undefined}>
    <header className={styles.header}>
      <div className={styles.identity}><>{presentation?<Photo photo={presentation.avatar} alt={`${presentation.name} profile`} />:<span className={styles.agencyIcon}><Users size={24}/></span>}</><label className={styles.creatorPicker}><span className={styles.srOnly}>Creator</span><select aria-label="Overview creator" value={id} disabled={switching} onChange={e=>void chooseCreator(e.target.value)}><option value="">All creators</option>{creators.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><ChevronDown size={15}/></label></div>
      <div className={styles.toolbar}><div className={styles.connections}>{(['telegram','onlyfans','imessage','whatsapp'] as const).map(platform=><div key={platform} className={platform==='telegram'?'':styles.disconnectedChip}><PlatformMark platform={platform} size={27}/><span><b>{platform==='onlyfans'?'OnlyFans':platform==='imessage'?'iMessage':platform==='whatsapp'?'WhatsApp':'Telegram'}</b><small><i/>{platform==='telegram'?'Connected':'Not connected'}</small></span></div>)}</div>
        <details className={styles.periodMenu}><summary><CalendarDays size={16}/><span>{range?'Custom dates':periods.find(p=>p[0]===period)?.[1]}</span><ChevronDown size={14}/></summary><div>{periods.map(([p,label])=><button key={p} aria-pressed={p===period&&!range} onClick={e=>{choosePeriod(p);e.currentTarget.closest('details')?.removeAttribute('open');}}>{label}</button>)}<button onClick={e=>{setCustom(true);e.currentTarget.closest('details')?.removeAttribute('open');}}>Custom dates</button></div></details>
      </div>
    </header>
    {custom&&<form className={styles.customRange} onSubmit={e=>{e.preventDefault();if(from&&to&&from<=to){setPeriod('CUSTOM');setRange({from,to});setCustom(false);}else setError('Choose valid start and end dates.');}}><label>From<input type="date" value={from} required onChange={e=>setFrom(e.target.value)}/></label><label>To<input type="date" value={to} min={from} required onChange={e=>setTo(e.target.value)}/></label><button className={styles.primaryButton}>Apply dates</button></form>}
    {isAgency?<section className={`${styles.hero} ${styles.agencyHero}`}><div className={styles.heroCopy}><span>FLIRT CREATOR MANAGEMENT</span><h1>Agency overview</h1><p>Your creators. One clear picture.</p><button className={styles.heroButton} onClick={viewCreators}>View creators<ArrowRight size={16}/></button><div className={styles.heroAgencyMeta}><PlatformMark platform="telegram" size={16}/><span>{creators.length} creators on Telegram</span></div></div><div className={styles.agencyHeroPortraits} aria-label="Featured creators">{featuredCreators.map(c=><button key={c.id} className={styles.heroPortraitCard} data-hero-creator={c.id} aria-label={`View ${c.name} overview`} onClick={()=>void chooseCreator(c.id)} disabled={switching}><AgencyPhoto photo={c.heroPhoto} name={c.name}/><span className={styles.heroPortraitName}>{c.name}</span></button>)}</div></section>:<section className={styles.hero}><Photo photo={presentation!.hero} alt={`${presentation!.name} banner`} className={styles.heroPhoto}/><div className={styles.heroCopy}><span>CREATOR OVERVIEW</span><h1 className="creator-name">{presentation!.name}</h1><Link href={`/clones/${id}?tab=identity`} className={styles.heroButton}>View profile<ArrowRight size={16}/></Link></div></section>}
    <div className={styles.summaryCards} aria-label="Overview summary" aria-busy={loading}>
      <button className={styles.summaryCard} onClick={purchases}><span className={styles.summaryIcon}><DollarSign size={25}/></span><span className={styles.summaryCopy}><span>Total earnings</span><strong>{amount}</strong><span className={styles.summaryMeta}>{trendBadge}<small>{stats?`${stats.sales.toLocaleString()} purchases`:'Loading earnings'}</small></span></span><Sparkline values={values}/></button>
      <Link href="/users" className={styles.summaryCard}><span className={styles.summaryIcon}><Users size={24}/></span><span className={styles.summaryCopy}><span>Total fans</span><strong>{audience.total.toLocaleString()}</strong><span className={styles.summaryMeta}><small>{isAgency?'All time · across creators':'All time'}</small></span></span><ArrowUpRight size={16} className={styles.cardArrow}/></Link>
      {isAgency?<div className={`${styles.summaryCard} ${styles.telegramCard} ${styles.agencyTelegram}`}><div className={styles.telegramHeading}><span className={styles.summaryIcon}><PlatformMark platform="telegram" size={27}/></span><span className={styles.summaryCopy}><span>Telegram</span><strong>{amount}</strong></span></div><div className={styles.creatorFaces} aria-label="Telegram creators">{telegramCreators.slice(0,5).map(c=><button key={c.id} disabled={switching} onClick={()=>void chooseCreator(c.id)} aria-label={`Open ${c.name} overview`}><AgencyPhoto photo={c.portrait} name={c.name}/><span className={styles.faceTooltip}>{c.name}</span></button>)}{(agency?.creators.length||0)>5&&<button className={styles.moreFaces} onClick={viewCreators} aria-label="View all creators">+{agency!.creators.length-5}</button>}</div><button className={styles.telegramCreatorsLink} onClick={viewCreators}><i/>Connected<ArrowRight size={11}/></button></div>:<button className={`${styles.summaryCard} ${styles.telegramCard}`} onClick={purchases}><span className={styles.summaryIcon}><PlatformMark platform="telegram" size={27}/></span><span className={styles.summaryCopy}><span>Telegram</span><strong>{amount}</strong><span className={styles.summaryMeta}>{trendBadge}<small>Connected</small></span></span><Sparkline values={values}/></button>}
      {(['onlyfans','imessage','whatsapp'] as const).map(platform=><div key={platform} className={`${styles.summaryCard} ${styles.disconnectedCard}`} data-platform={platform} aria-label={`${platform==='onlyfans'?'OnlyFans':platform==='imessage'?'iMessage':'WhatsApp'} not connected`}><span className={styles.summaryIcon}><PlatformMark platform={platform} size={27}/></span><span className={styles.summaryCopy}><span>{platform==='onlyfans'?'OnlyFans':platform==='imessage'?'iMessage':'WhatsApp'}</span><strong className={styles.unavailable}>–</strong><span className={styles.disconnectedLabel}>Not connected</span></span></div>)}
    </div>
    {error&&<div role="alert" className={styles.error}>{error}<button onClick={()=>setRevision(v=>v+1)}>Try again</button></div>}
    <div className={styles.spotlightGrid}>
      <Panel title="Earnings overview" className={styles.earningsPanel} action={<div className={styles.segmented}>{(['1W','1M','6M','ALL'] as Period[]).map((p,i)=><button key={p} aria-pressed={period===p&&!range} onClick={()=>choosePeriod(p)}>{['7 days','30 days','6 months','All time'][i]}</button>)}</div>}>
        {isAgency&&<div className={styles.chartComparison}><div className={styles.segmented}><button aria-pressed={!compare} onClick={()=>setCompare(false)}>Combined</button><button aria-pressed={compare} onClick={()=>setCompare(true)}>Compare creators</button></div>{compare&&<div className={styles.chartLegend}>{agency?.creators.map(c=><span key={c.id}><i style={{background:c.color}}/>{c.name}</span>)}</div>}</div>}
        <div className={styles.chartMeta}><span><i/>{compare&&isAgency?'All creators total':'Telegram'}</span><strong>{hover===null?amount:money(values[hover]||0)}</strong><small>{hover===null?'':data?.bucketLabels[hover]}</small></div>
        <div className={styles.areaChart} aria-label="Telegram earnings by reporting interval"><div className={styles.axis}>{[1,.75,.5,.25,0].map(f=><span key={f}>{fmtMoney(floor+(peak-floor)*f,currency).replace(/\.00$/,'')}</span>)}</div><div className={styles.plot}>
          <svg viewBox="0 0 1000 195" preserveAspectRatio="none" role="img" aria-label={stats?'Recorded Telegram earnings':'Loading earnings chart'}><defs><linearGradient id="flirt-earnings-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#e51872" stopOpacity=".22"/><stop offset="100%" stopColor="#e51872" stopOpacity=".01"/></linearGradient></defs>{[10,52.5,95,137.5,180].map(y=><line key={y} x1="0" x2="1000" y1={y} y2={y} stroke="#edf0f5" strokeDasharray="3 5"/>)}{values.length>0&&!(compare&&isAgency)&&<><polygon points={`0,${chartZero} ${chartPoints} 1000,${chartZero}`} fill="url(#flirt-earnings-fill)"/><polyline points={chartPoints} fill="none" stroke="#df126b" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round"/></>}{compare&&isAgency&&agency?.creators.map(c=><polyline key={c.id} data-comparison-creator={c.id} points={(data?.series||[]).map((row,i)=>`${i/Math.max(1,values.length-1)*1000},${180-(starsToMoneyRate(Number(row[c.id])||0,currency,rate)-floor)/(peak-floor)*170}`).join(' ')} fill="none" stroke={c.color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round"/>)}</svg>
          <div className={styles.chartTargets}>{values.map((v,i)=><button key={i} aria-label={`${data?.bucketLabels[i]}: ${money(v)}`} onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)} onFocus={()=>setHover(i)} onBlur={()=>setHover(null)} onClick={()=>setHover(i)}/>)}</div>
          <div className={styles.dates}>{(data?.bucketLabels||[]).filter((_,i,a)=>i===0||i===a.length-1||i%Math.max(1,Math.ceil(a.length/6))===0).map((label,i)=><span key={i}>{label}</span>)}</div>
          {loading&&<span className={styles.chartLoading}>Loading recorded earnings…</span>}
        </div></div>
      </Panel>
      <RankingPanel kind="fans" rankings={data?.rankings} cloneIds={id?[id]:allowedIds} agency={isAgency} money={money} error={data?.rankingsError} loading={loading} />
      {presentation&&<><Panel title="Content library" className={styles.libraryPanel} action={<Link className={styles.textLink} href={`/clones/${id}?tab=ppvs`}>View library<ArrowRight size={13}/></Link>}><div className={styles.libraryTiles}>{presentation.library.map(photo=><button key={photo.id} className={styles.libraryTile} onClick={()=>setDetail({photo})}><Photo photo={photo} alt={`${presentation.name}: ${photo.label}`}/><ImageIcon size={16}/><span><strong>{photo.label}</strong><small>Photo · {photo.stars>0?money(photo.stars):'Vault content'}</small></span></button>)}</div></Panel>
</>}
      <RankingPanel kind="content" rankings={data?.rankings} cloneIds={id?[id]:allowedIds} agency={isAgency} money={money} error={data?.rankingsError} loading={loading} />
    </div>
    {isAgency&&<section id="overview-creators" className={styles.creatorSection}><div className={styles.panelHeading}><div><h2>Creator performance</h2><p>Earnings for this period · fans across all time</p></div><Link href="/clones" className={styles.textLink}>Manage creators<ArrowRight size={13}/></Link></div><div className={styles.creatorGrid}>{agency?.creators.map(c=><article key={c.id} className={styles.creatorCard} data-performance-creator={c.id}><div className={styles.creatorCardHeader}><AgencyPhoto photo={c.cardPhoto} name={c.name} className={styles.performancePortrait}/><div><h3>{c.name}</h3><span><PlatformMark platform="telegram" size={14}/>Telegram</span></div><ArrowUpRight size={16}/></div><div className={styles.creatorMetrics}><div><span>Earnings</span><strong>{data?.perClone[c.id]?money(data.perClone[c.id].stars):loading?'…':'Unavailable'}</strong></div><div><span>Total fans</span><strong>{c.totalFans.toLocaleString()}</strong><small>All time</small></div></div><div className={styles.creatorCardFooter}><span>{data?.perClone[c.id]?.sales.toLocaleString()??'–'} purchases</span><button onClick={()=>void chooseCreator(c.id)} disabled={switching}>Open overview<ArrowRight size={13}/></button></div></article>)}</div></section>}
    <div className={styles.utilityBar}><span>{data?.cachedAt?`Updated ${new Intl.DateTimeFormat('en-AU',{hour:'numeric',minute:'2-digit',timeZone:'Australia/Brisbane'}).format(new Date(data.cachedAt))}`:'Reading live records'} · Telegram</span><div><label><span className={styles.srOnly}>Currency</span><select aria-label="Overview currency" value={currency} onChange={e=>setCurrency(e.target.value as 'USD'|'AUD')}><option>USD</option><option>AUD</option></select></label><BlurToggle/><button aria-label="Refresh overview" title="Refresh overview" onClick={()=>setRevision(v=>v+1)}><RefreshCw size={15}/></button><form action="/agency/logout" method="post"><button type="submit">Sign out</button></form></div></div>
    <section id="overview-purchases" className={`${styles.panel} ${styles.purchasePanel}`}><div className={styles.panelHeading}><h2>Recent purchases</h2><span>{stats ? `${stats.sales.toLocaleString()} in selected period` : 'Loading purchases'}</span></div><div className={styles.tableWrap}><table><thead><tr><th>Fan</th>{isAgency&&<th>Creator</th>}<th>Purchase</th><th>Platform</th><th>Date</th><th>Amount</th><th/></tr></thead><tbody>{recent.slice(0,12).map((item,i)=><tr key={`${item.paidAt}-${i}`}><td><Link href={`/users?q=${item.telegramId??''}`}>{item.buyerName}</Link></td>{isAgency&&<td><button className={styles.textLink} disabled={switching} onClick={()=>void chooseCreator(item.cloneId)}>{item.cloneName}</button></td>}<td>{transactionName(item)}</td><td><span className={styles.tablePlatform}><PlatformMark platform="telegram" size={16}/>Telegram</span></td><td>{fullDate(item.paidAt)}</td><td>{money(item.stars)}</td><td><button aria-label={`View ${item.buyerName}'s purchase`} onClick={()=>setDetail({purchase:item})}><MoreHorizontal size={18}/></button></td></tr>)}</tbody></table>{!recent.length&&<p className={styles.empty}>{loading?'Loading purchases…':'No purchases in this period.'}</p>}</div></section>
    {detail&&<Dialog title={'photo'in detail?detail.photo.label:'Purchase details'} close={()=>setDetail(null)}>{'photo'in detail?<><Photo photo={detail.photo} alt={detail.photo.label} className={styles.previewPhoto}/><Link href={`/clones/${id}?tab=ppvs`} className={styles.primaryButton}>Open content library<ArrowRight size={16}/></Link></>:<><dl className={styles.purchaseDetails}>{isAgency&&<div><dt>Creator</dt><dd>{detail.purchase.cloneName}</dd></div>}<div><dt>Fan</dt><dd>{detail.purchase.buyerName}</dd></div><div><dt>Purchase</dt><dd>{transactionName(detail.purchase)}</dd></div><div><dt>Amount</dt><dd>{money(detail.purchase.stars)}</dd></div><div><dt>Platform</dt><dd>Telegram</dd></div><div><dt>Date</dt><dd>{fullDate(detail.purchase.paidAt)}</dd></div></dl><Link className={styles.primaryButton} href={`/users?q=${detail.purchase.telegramId??''}`}>Open fan conversation<ArrowRight size={16}/></Link></>}</Dialog>}
  </div>;
}
