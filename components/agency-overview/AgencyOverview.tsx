'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ArrowUpRight, CalendarDays, DollarSign, ImageIcon, MessageCircle, Sparkles, RefreshCw, UserRound, Users, X } from 'lucide-react';
import type { OverviewCreator, OverviewImage } from '@/lib/agency-overview';
import type { DashboardData, Period, RecentTransaction } from '@/lib/dashboard-data';
import { useCurrency } from '@/components/CurrencyProvider';
import CurrencyToggle from '@/components/CurrencyToggle';
import { fmtMoney, starsToMoneyRate } from '@/lib/money';
import PlatformMark from './PlatformMark';
import styles from './AgencyOverview.module.css';

function Photo({ creator, className = '' }: { creator: OverviewCreator; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [creator.photoUrl]);
  return <span className={`${styles.photo} ${className}`} data-creator-photo={creator.id}>
    {creator.photoUrl && !failed ? <img src={creator.photoUrl} alt={creator.name} data-photo-id={creator.photoId} onError={() => setFailed(true)} style={{ objectPosition: creator.position, transform: `scale(${creator.zoom})`, transformOrigin: creator.position }} /> : <UserRound aria-label="Default profile image" />}
  </span>;
}
function VaultPhoto({ image, name, className = '' }: { image: OverviewImage; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image.url]);
  return <span className={`${styles.photo} ${className}`} data-vault-photo={image.id}>{!failed ? <img src={image.url} alt={name} onError={() => setFailed(true)} style={{ objectPosition: image.position, transform: `scale(${image.zoom})`, transformOrigin: image.position }} /> : <ImageIcon aria-label="Photo unavailable" />}</span>;
}
export function ActivityAvatar({ row }: { row: RecentTransaction }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [row.cloneId, row.telegramId]);
  return <span className={styles.fanAvatar}>{row.telegramId != null && !failed
    ? <img src={`/api/avatar?clone=${encodeURIComponent(row.cloneId)}&tg=${row.telegramId}`} alt={`${row.buyerName}'s profile`} onError={() => setFailed(true)} />
    : <UserRound aria-label="Default profile image" size={22} />}</span>;
}
function elapsed(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}
function Series({ values, small = false, labels = [], money }: { values: number[]; small?: boolean; labels?: string[]; money: (n: number) => string }) {
  const id = useId().replace(/:/g, '');
  const min = Math.min(0, ...values), max = Math.max(1, ...values), span = max - min;
  const w = small ? 110 : 760, h = small ? 34 : 210;
  const left = small ? 0 : 70, top = small ? 2 : 12, right = w - 10, bottom = h - (small ? 2 : 28);
  const y = (v: number) => bottom - (v - min) / span * (bottom - top);
  const points = values.map((v, i) => `${left + i / Math.max(1, values.length - 1) * (right - left)},${y(v)}`);
  return <svg className={small ? styles.spark : styles.chart} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={small ? 'Earnings trend' : 'Telegram earnings for the selected period'}>
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#171717" stopOpacity=".14" /><stop offset="1" stopColor="#171717" stopOpacity="0" /></linearGradient></defs>
    {!small && [0, 1, 2, 3, 4].map(i => { const v = min + span * i / 4; return <g key={i}><line x1={left} x2={right} y1={y(v)} y2={y(v)} stroke="#ebebef" strokeDasharray="2 4" /><text x={left - 12} y={y(v) + 4} textAnchor="end">{money(v)}</text></g>; })}
    {!!points.length && <><path d={`M${left},${y(0)} L${points.join(' L')} L${right},${y(0)} Z`} fill={`url(#${id})`} /><polyline points={points.join(' ')} fill="none" stroke="#181818" strokeWidth={small ? 2 : 2.2} strokeLinejoin="round" strokeLinecap="round" /></>}
    {!small && values.map((v, i) => <circle key={i} cx={left + i / Math.max(1, values.length - 1) * (right - left)} cy={y(v)} r="7" fill="transparent"><title>{labels[i]}: {money(v)}</title></circle>)}
    {!small && labels.map((label, i) => i % Math.max(1, Math.ceil(labels.length / 7)) === 0 || i === labels.length - 1 ? <text key={i} x={left + i / Math.max(1, labels.length - 1) * (right - left)} y={h - 5} textAnchor={i === labels.length - 1 ? 'end' : 'middle'}>{label}</text> : null)}
  </svg>;
}

export default function AgencyOverview({ cloneId, initialCreators }: { cloneId: string | null; initialCreators: OverviewCreator[] }) {
  const router = useRouter();
  const { currency, rate, usdPerStar } = useCurrency();
  const [creators, setCreators] = useState(initialCreators);
  const [data, setData] = useState<DashboardData | null>(null);
  const [period, setPeriod] = useState<Period>('1M');
  const [error, setError] = useState('');
  const [changing, setChanging] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<RecentTransaction | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const controller = new AbortController(); let stopped = false; let busy = false;
    setData(null); setError('');
    async function read(fresh = false) {
      if (busy) return; busy = true;
      try {
        const params = new URLSearchParams({ period }); if (cloneId) params.set('clone', cloneId); if (fresh) params.set('fresh', '1');
        const response = await fetch(`/api/dashboard?${params}`, { signal: controller.signal, cache: 'no-store' });
        const body = await response.json(); if (!response.ok || !Array.isArray(body.clones) || !body.perClone) throw new Error('Earnings are temporarily unavailable. Please try again.');
        if (!stopped) { setData(body); setError(''); }
      } catch (e) { if (!stopped) setError(e instanceof Error ? e.message : 'Could not load earnings'); }
      finally { busy = false; }
    }
    void read(refresh > 0); const interval = setInterval(() => { if (!document.hidden) void read(true); }, 60000);
    return () => { stopped = true; controller.abort(); clearInterval(interval); };
  }, [cloneId, period, refresh]);
  useEffect(() => {
    const controller = new AbortController();
    const interval = setInterval(async () => {
      try { const r = await fetch('/api/agency-overview', { signal: controller.signal, cache: 'no-store' }); if (r.ok) { const body = await r.json(); if (Array.isArray(body.creators)) setCreators(body.creators); } } catch { /* The current private images remain valid until the next refresh. */ }
    }, 300000);
    return () => { clearInterval(interval); controller.abort(); };
  }, []);
  useEffect(() => { if (detail) dialog.current?.showModal(); else dialog.current?.close(); }, [detail]);
  const selected = creators.find(c => c.id === cloneId);
  const scoped = selected ? [selected] : creators;
  const ids = new Set(scoped.map(c => c.id));
  const stars = scoped.reduce((sum, c) => sum + (data?.perClone[c.id]?.stars ?? 0), 0);
  const sales = scoped.reduce((sum, c) => sum + (data?.perClone[c.id]?.sales ?? 0), 0);
  const fans = scoped.reduce((sum, c) => sum + c.fans, 0);
  const values = data?.series.map(row => scoped.reduce((sum, c) => sum + Number(row[c.id] ?? 0), 0)) ?? [];
  const recent = data?.recent.filter(row => ids.has(row.cloneId)) ?? [];
  const money = (n: number) => fmtMoney(starsToMoneyRate(n, currency, rate, usdPerStar), currency);
  const amount = data ? money(stars) : '…';
  const connection = scoped.length && scoped.every(c => c.telegramConnected) ? 'Connected' : scoped.some(c => c.telegramConnected) ? 'Partially connected' : 'Not connected';
  async function choose(id: string) {
    if (id === (cloneId ?? "")) return;
    setChanging(true); setError('');
    try { const r = await fetch('/agency/clone-scope', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clone: id }) }); if (!r.ok) throw new Error('Could not switch creator'); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not switch creator'); setChanging(false); }
  }
  return <div className={`${styles.page} ${selected ? styles.creatorPage : ''}`} data-moxy-overview="true" aria-busy={changing}>
    <header className={styles.header}>
      <div className={styles.selector}>{selected ? <Photo creator={selected} /> : <Users size={26} />}<select aria-label="Select creator" value={cloneId ?? ''} disabled={changing} onChange={e => void choose(e.target.value)}><option value="">All creators</option>{creators.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div className={styles.headerRight}>{(['telegram', 'onlyfans', 'imessage', 'whatsapp'] as const).map(platform => <div key={platform} className={`${styles.channel} ${platform !== 'telegram' ? styles.muted : ''}`}><PlatformMark platform={platform} size={27} /><div><strong>{platform === 'telegram' ? 'Telegram' : platform === 'onlyfans' ? 'OnlyFans' : platform === 'imessage' ? 'iMessage' : 'WhatsApp'}</strong><small><i className={platform === 'telegram' && connection === 'Connected' ? styles.dot : styles.offDot} />{platform === 'telegram' ? connection : 'Not connected'}</small></div></div>)}
        <label className={styles.period}><CalendarDays size={15} /><select aria-label="Reporting period" value={period} onChange={e => setPeriod(e.target.value as Period)}>{[['1W','Last 7 days'],['1M','Last 30 days'],['3M','Last 3 months'],['6M','Last 6 months'],['1Y','Last year'],['ALL','All time']].map(([v,label]) => <option key={v} value={v}>{label}</option>)}</select></label>
      </div>
    </header>
    <section className={styles.hero}>
      <div><p>{selected ? 'CREATOR OVERVIEW' : 'AGENCY OVERVIEW'}</p><h1>{selected?.name ?? 'Your agency, at a glance.'}</h1><Link className={styles.primary} href={selected ? `/clones/${selected.id}?tab=identity` : '/clones'}>{selected ? 'View profile' : 'View creators'}<ArrowRight size={17} /></Link></div>
      {selected ? selected.banner ? <VaultPhoto image={selected.banner} name={selected.name} className={styles.heroPhoto} /> : <Photo creator={selected} className={styles.heroPhoto} /> : <img className={styles.heroLogo} src="/moxy/moxy-ai-dark.svg" alt="Moxy AI, Los Angeles and Miami" />}
    </section>
    {error && <div role="alert" className={styles.error}>{error}<button onClick={() => setRefresh(n => n + 1)}>Retry</button></div>}
    <section className={styles.metrics} aria-label="Overview statistics">
      <article className={styles.metric}><span className={styles.metricIcon}><DollarSign size={26} /></span><div><h2>Total earnings</h2><strong data-total-earnings>{amount}</strong><small>{data ? `${sales.toLocaleString()} purchases` : 'Loading earnings'}</small></div><Series small values={values} money={money} /></article>
      <article className={styles.metric}><span className={styles.metricIcon}><Users size={25} /></span><div><h2>Total fans</h2><strong data-total-fans>{fans.toLocaleString()}</strong><small title="All-time fan relationships across the selected creators, excluding test accounts">All time</small></div><ArrowUpRight className={styles.metricArrow} size={16} /></article>
      <article className={`${styles.metric} ${styles.telegramMetric}`}><PlatformMark platform="telegram" size={34} /><div><h2>Telegram</h2><strong data-telegram-earnings>{amount}</strong><small><i className={connection === 'Connected' ? styles.dot : styles.offDot} />{connection}</small></div>{selected ? <Series small values={values} money={money} /> : <div className={styles.creatorStack}>{scoped.slice(0, 4).map(c => <button key={c.id} title={`Open ${c.name}'s overview`} aria-label={`Open ${c.name}'s overview`} onClick={() => void choose(c.id)} disabled={changing}><Photo creator={c} /></button>)}<Link href="/clones">View creators<ArrowRight size={13} /></Link></div>}</article>
      {(['onlyfans', 'imessage', 'whatsapp'] as const).map(platform => <article key={platform} className={`${styles.metric} ${styles.disconnected}`} aria-label={`${platform === 'onlyfans' ? 'OnlyFans' : platform === 'imessage' ? 'iMessage' : 'WhatsApp'}, not connected`}><PlatformMark platform={platform} size={31} /><div><h2>{platform === 'onlyfans' ? 'OnlyFans' : platform === 'imessage' ? 'iMessage' : 'WhatsApp'}</h2><strong>–</strong><span className={styles.notConnected}>Not connected</span></div></article>)}
    </section>
    <div className={styles.middle}>
      <section className={styles.panel}><div className={styles.panelHeading}><h2>Earnings overview</h2><div className={styles.tabs} aria-label="Chart period">{[['1W','7 days'],['1M','30 days'],['6M','6 months'],['ALL','All time']].map(([v,label]) => <button key={v} aria-pressed={period === v} onClick={() => setPeriod(v as Period)}>{label}</button>)}</div></div><div className={styles.chartLegend}><span>● Telegram</span><strong>{amount}</strong></div>{data ? <Series values={values} labels={data.bucketLabels} money={money} /> : <div className={styles.loading} role="status">Loading earnings…</div>}</section>
      <section className={styles.panel}><div className={styles.panelHeading}><h2>Recent activity</h2><button className={styles.textButton} onClick={() => setExpanded(v => !v)}>{expanded ? 'Show less' : 'View all'}<ArrowRight size={14} /></button></div><div className={styles.activity}>
        {recent.slice(0, expanded ? 12 : 3).map((row, i) => <button className={styles.activityRow} key={`${row.cloneId}:${row.telegramId}:${row.paidAt}:${i}`} onClick={() => setDetail(row)}><ActivityAvatar key={`${row.cloneId}:${row.telegramId}`} row={row} /><span className={styles.activityText}><strong>{row.buyerName}</strong><small><PlatformMark platform="telegram" size={13} />{row.kind === 'credits' ? 'Message credits' : row.kind === 'refund' ? 'Refund' : `${row.kind.charAt(0).toUpperCase()}${row.kind.slice(1)} purchase`} · {money(row.stars)}</small><small hidden={!!selected}>{creators.find(c => c.id === row.cloneId) && <Photo creator={creators.find(c => c.id === row.cloneId)!} />}{row.cloneName}</small></span><time dateTime={row.paidAt} title={new Date(row.paidAt).toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })}>{elapsed(row.paidAt)}</time></button>)}
        {!recent.length && <p className={styles.empty}>{data ? 'No purchases in this period.' : 'Loading activity…'}</p>}
      </div></section>
    </div>
    {selected ? <div className={styles.middle}>
      <section className={styles.panel}><div className={styles.panelHeading}><h2>From your library</h2><Link className={styles.textButton} href="/content">View library<ArrowRight size={14} /></Link></div>
        <div className={styles.libraryGrid}>{(selected.library ?? []).map((photo, index) => <Link href="/content" key={photo.id} className={styles.libraryTile} aria-label={`Open ${selected.name}'s content library, photo ${index + 1}`}><VaultPhoto image={photo} name={`${selected.name}, vault photo ${index + 1}`} /><span><ImageIcon size={14} />Photo<ArrowUpRight size={16} /></span></Link>)}</div>
        {!selected.library?.length && <p className={styles.empty}>No preview photos selected.</p>}
      </section>
      <section className={`${styles.panel} ${styles.flowPanel}`}><div className={styles.panelHeading}><h2>Automations</h2><Sparkles size={17} /></div><div className={styles.flowVisual}><span><PlatformMark platform="telegram" size={25} /></span><i /><span><MessageCircle size={23} /></span><i /><span><Sparkles size={23} /></span></div><div className={styles.flowHeading}><h3>Follow-up flow</h3><span className={styles.flowStatus}><i className={selected.automation?.enabled ? styles.dot : styles.offDot} />{selected.automation?.enabled ? 'Enabled' : 'Off'}</span></div><p className={styles.flowSummary}>{selected.automation?.steps ?? 0} configured steps</p><Link href="/flows" className={styles.primary}>Manage flows<ArrowRight size={17} /></Link></section>
    </div> : <>
    <section className={styles.panel}><div className={styles.panelHeading}><h2>Creator performance</h2><Link className={styles.textButton} href="/clones">View creators<ArrowRight size={14} /></Link></div><div className={styles.creatorGrid}>{scoped.map(c => <article key={c.id} className={styles.creatorCard}><Photo creator={c} className={styles.creatorPortrait} /><div><h3>{c.name}</h3><span className={styles.creatorStatus}><PlatformMark platform="telegram" size={18} />Telegram · {c.telegramConnected ? 'Connected' : 'Not connected'}</span><dl><div><dt>Total earnings</dt><dd>{data ? money(data.perClone[c.id]?.stars ?? 0) : '…'}</dd></div><div><dt>Total fans</dt><dd>{c.fans.toLocaleString()}</dd></div></dl><button className={styles.primary} disabled={changing} onClick={() => selected ? router.push(`/clones/${c.id}?tab=identity`) : void choose(c.id)}>{selected ? 'View profile' : 'Open overview'}<ArrowRight size={17} /></button></div></article>)}</div></section>
    </>}
    <footer className={styles.footer}><CurrencyToggle /><span>Times shown in Brisbane time</span><button className={styles.textButton} onClick={() => setRefresh(n => n + 1)}><RefreshCw size={14} />Refresh</button></footer>
    <dialog ref={dialog} className={styles.dialog} onClose={() => setDetail(null)}>{detail && <><div className={styles.panelHeading}><h2>Purchase details</h2><button aria-label="Close details" onClick={() => setDetail(null)}><X size={20} /></button></div><dl>{[['Fan',detail.buyerName],['Creator',detail.cloneName],['Platform','Telegram'],['Type',detail.kind],['Amount',money(detail.stars)],['Purchased',new Date(detail.paidAt).toLocaleString('en-AU',{timeZone:'Australia/Brisbane'})]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></>}</dialog>
  </div>;
}
