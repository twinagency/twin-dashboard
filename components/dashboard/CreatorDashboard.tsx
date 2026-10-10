"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ArrowRight, CalendarDays, ChevronDown, Coins, Check, ChevronRight, CircleHelp, DollarSign, ImageIcon, Link2, MessageCircle, NotebookPen, Package, Repeat2, Search, Send, ShoppingBag, Users, Video, X } from "lucide-react";
import { useCurrency } from "../CurrencyProvider";
import { STAR_USD } from "../../lib/money";
import { conversationHref, emptyState, platformNames, profileHref, restoreState, STORAGE_KEY } from "../fans/model";
import { type Creator, type Fan, type Platform, type WorkspaceState } from "../fans/types";
import { withBriannaLedger } from "../fans/brianna-ledger";
import { buildDashboard, dayAt, displayMoney, FILTER_STORAGE_KEY, filterParams, originalMoney, parseFilters, platformOrder, REPORT_DAY, REPORT_START, validDay, valueCents, type Activity, type Filters, type LedgerEntry } from "./model";
import styles from "./CreatorDashboard.module.css";
import BlurToggle from "../BlurToggle";
import DashboardCampaign from "./DashboardCampaign";
import { dashboardPortraits, portraitUrl } from "./portraits";

const short: Record<Platform, string> = { onlyfans: "OF", telegram: "TG" };
const date = (day: string, long = false) => new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", ...(long ? { year: "numeric" as const } : {}), timeZone: "Australia/Brisbane" }).format(new Date(`${day.slice(0, 10)}T02:00:00Z`));
const time = (at: string) => new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane" }).format(new Date(at));
type Detail = { kind: "purchase"; purchase: LedgerEntry } | { kind: "content"; title: string } | { kind: "rates" };
type FanView = "all" | "paying" | "active" | "repeat" | "linked";

function PlatformBadge({ platform, compact = false }: { platform: Platform; compact?: boolean }) {
  return <span className={`${styles.badge} ${styles[platform]}`} title={platformNames[platform]}><span>{platform === "telegram" ? <Send size={12} /> : short[platform]}</span>{!compact && platformNames[platform]}</span>;
}
function Panel({ title, subtitle, action, children, className = "", id }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return <section className={`${styles.panel} ${className}`} id={id}><div className={styles.panelHeading}><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>;
}
function MediaIcon({ kind }: { kind: string }) {
  return <span className={styles.mediaIcon}>{kind === "Bundle" ? <Package size={17} /> : kind === "Video" ? <Video size={17} /> : <ImageIcon size={17} />}</span>;
}
function Dialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key !== "Tab") return;
      const controls = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input,select,[tabindex="0"]') || []);
      const first = controls[0], last = controls.at(-1);
      if (!first || !last) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handle);
    return () => { document.removeEventListener("keydown", handle); previous?.focus(); };
  // A mounted dialog owns focus until it closes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className={styles.backdrop} onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><div className={styles.dialog} ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}><div className={styles.dialogHeading}><h2>{title}</h2><button className={styles.iconButton} aria-label="Close details" onClick={close}><X size={20} /></button></div>{children}</div></div>;
}

export default function CreatorDashboard({ creators, fans: seedFans, initialFilters, includeBriannaLedger = false }: { creators: Creator[]; fans: Fan[]; initialFilters: Filters; includeBriannaLedger?: boolean }) {
  const fans = useMemo(() => includeBriannaLedger ? withBriannaLedger(seedFans) : seedFans, [includeBriannaLedger, seedFans]);
  const { rate: audRate } = useCurrency();
  const [filters, setFilters] = useState(initialFilters);
  const [workspace, setWorkspace] = useState<WorkspaceState>(emptyState);
  const [ready, setReady] = useState(false);
  const [from, setFrom] = useState(initialFilters.from), [to, setTo] = useState(initialFilters.to);
  const [rangeError, setRangeError] = useState("");
  const [showCustom, setShowCustom] = useState(initialFilters.window === "custom");
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [hoverDay, setHoverDay] = useState("");
  const [query, setQuery] = useState(""), [kind, setKind] = useState("all");
  const [purchaseLimit, setPurchaseLimit] = useState(8), [activityLimit, setActivityLimit] = useState(6), [contentLimit, setContentLimit] = useState(5);
  const [fanView, setFanView] = useState<FanView>("all");
  const [fanQuery, setFanQuery] = useState("");
  const [fanLimit, setFanLimit] = useState(12);
  const [detail, setDetail] = useState<Detail | null>(null);

  useEffect(() => {
    const current = new URLSearchParams(window.location.search);
    let next = parseFilters(current, creators);
    try {
      setWorkspace(restoreState(localStorage.getItem(STORAGE_KEY), fans));
      if (!current.toString()) {
        const saved = localStorage.getItem(FILTER_STORAGE_KEY);
        if (saved && saved.length <= 1000) next = parseFilters(new URLSearchParams(saved), creators);
      }
    } catch { /* Storage is optional; this page can run entirely in memory. */ }
    setFilters(next); setFrom(next.from); setTo(next.to); setShowCustom(next.window === "custom"); setReady(true);
    const sync = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      try { setWorkspace(restoreState(event.newValue, fans)); } catch { setWorkspace(emptyState()); }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [creators, fans]);
  useEffect(() => {
    if (!ready) return;
    const params = filterParams(filters).toString();
    try { localStorage.setItem(FILTER_STORAGE_KEY, params); } catch { /* Do not block navigation when storage is unavailable. */ }
    window.history.replaceState(window.history.state, "", `/dashboard?${params}`);
  }, [filters, ready]);

  const dashboard = useMemo(() => buildDashboard(fans, filters, audRate, workspace), [fans, filters, audRate, workspace]);
  const creator = creators.find(c => c.id === filters.creatorId)!;
  const money = (cents: number) => displayMoney(cents, filters.currency);
  const platform = filters.platform === "all" ? "All platforms" : platformNames[filters.platform];
  const focusDay = dashboard.range.days.includes(filters.day) ? filters.day : "";
  const chartFocus = dashboard.chart.find(d => d.day === (hoverDay || focusDay));
  const peak = Math.ceil(Math.max(100, ...dashboard.chart.map(d => d.cents)) / 50000) * 50000;
  const points = dashboard.chart.map((d, index) => `${(index / Math.max(1, dashboard.chart.length - 1) * 1000).toFixed(2)},${(200 - d.cents / peak * 190).toFixed(2)}`).join(" ");
  const compactMoney = (cents: number) => `${filters.currency === "AUD" ? "A$" : "US$"}${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const hasPortrait = creator.id === "briana";
  const portrait = portraitUrl("outdoor");
  const creatorProfile = creator.id === "briana" ? "/clones/0328e7b3-a1e5-465a-9a30-c9cf6519cba1?tab=identity" : "/clones";
  const recent = dashboard.activities.filter((activity, index, all) => all.findIndex(item => item.fan.id === activity.fan.id) === index).slice(0, 3);
  const periodNames = { "7d": "Last 7 days", "30d": "Last 30 days", "6m": "Last 6 months", all: "All time", custom: "Custom dates" };
  const sales = dashboard.entries.filter(p => (!focusDay || dayAt(p.at) === focusDay)
    && (kind === "all" || p.kind === kind)
    && `${p.title} ${p.fan.name} ${platformNames[p.platform]}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const activities = dashboard.activities.filter(a => !focusDay || dayAt(a.at) === focusDay);
  const relationships = dashboard.relationships.filter(r => (fanView === "all" || (fanView === "paying" ? r.paying : fanView === "active" ? r.active : fanView === "repeat" ? r.purchases >= 2 : r.accounts.length > 1))
    && `${r.fan.name} ${r.accounts.map(a => a.username).join(" ")}`.toLocaleLowerCase().includes(fanQuery.trim().toLocaleLowerCase()));
  const contentDetail = detail?.kind === "content" ? dashboard.content.find(c => c.title === detail.title) : null;
  const change = (patch: Partial<Filters>) => {
    setFilters(current => ({ ...current, ...patch, day: patch.day ?? "" }));
    setPurchaseLimit(8); setActivityLimit(6); setContentLimit(5); setHoverDay(""); setRangeError(""); setDetail(null); setQuery(""); setKind("all"); setFanView("all"); setFanQuery(""); setFanLimit(12);
  };
  const inspectFans = (view: FanView) => { setFanView(view); setFanQuery(""); setFanLimit(12); document.getElementById("dashboard-relationships")?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const inspectPurchases = () => { setFanView("all"); document.getElementById("dashboard-purchases")?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const applyRange = () => {
    if (!validDay(from) || !validDay(to) || from < REPORT_START || from > to || to > REPORT_DAY) {
      setRangeError("Choose a valid range from 10 April to 9 October 2026, with the start before the end."); return;
    }
    change({ window: "custom", from, to });
  };
  const activityHref = (activity: Activity) => activity.kind === "Conversation" ? conversationHref(activity.fan, activity.platform, activity.sourceId)
    : profileHref(activity.fan, activity.kind === "Memory" ? "memory" : activity.kind === "Account link" ? "accounts" : "purchases");

  return <div className={styles.dashboard} data-creator-dashboard data-creator={creator.id} data-platform={filters.platform}>
    <header className={styles.studioHeader}>
      <div className={styles.studioCreator}>
        {hasPortrait && !failedImages.avatar ? <img src={portrait} alt="Brianna Redd" onError={() => setFailedImages(current => ({ ...current, avatar: true }))} /> : <span className={styles.studioInitials}>{creator.initials}</span>}
        <label className={styles.creatorPicker}><span className={styles.srOnly}>Creator</span><select aria-label="Dashboard creator" value={filters.creatorId} onChange={e => change({ creatorId: e.target.value })}>{creators.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><ChevronDown size={16} /></label>
      </div>
      <div className={styles.studioToolbar}>
        <div className={styles.connectionChips} aria-label="Connected platforms">{dashboard.platforms.map(p => <button key={p.platform} aria-label={`Filter dashboard by ${platformNames[p.platform]}`} aria-pressed={filters.platform === p.platform} onClick={() => change({ platform: filters.platform === p.platform ? "all" : p.platform })}><span className={`${styles.platformSymbol} ${styles[p.platform]}`}>{p.platform === "telegram" ? <Send size={20} /> : "OF"}</span><span><b>{platformNames[p.platform]}</b><small><i />{p.connected ? "Connected" : "Not linked"}</small></span></button>)}</div>
        <details className={styles.periodMenu}><summary><CalendarDays size={17} /><span>{showCustom ? "Custom dates" : periodNames[filters.window]}</span><ChevronDown size={15} /></summary><div className={styles.periodOptions} role="group" aria-label="Dashboard reporting period">{([["7d", "7 days"], ["30d", "30 days"], ["6m", "6 months"], ["all", "All time"]] as const).map(([window, label]) => <button key={window} aria-pressed={filters.window === window && !showCustom} onClick={event => { setShowCustom(false); change({ window }); event.currentTarget.closest("details")?.removeAttribute("open"); }}>{label}</button>)}<button aria-pressed={showCustom} onClick={event => { setShowCustom(true); event.currentTarget.closest("details")?.removeAttribute("open"); }}>Custom</button></div></details>
        <select className={styles.currencyPicker} aria-label="Dashboard currency" value={filters.currency} onChange={e => change({ currency: e.target.value as Filters["currency"] })}><option value="USD">USD</option><option value="AUD">AUD</option></select>
        <BlurToggle />
      </div>
    </header>
    {showCustom && <div className={styles.customRange}><label>From<input aria-label="Dashboard start date" type="date" min={REPORT_START} max={REPORT_DAY} value={from} onChange={e => setFrom(e.target.value)} /></label><label>To<input aria-label="Dashboard end date" type="date" min={REPORT_START} max={REPORT_DAY} value={to} onChange={e => setTo(e.target.value)} /></label><button className={styles.primaryButton} onClick={applyRange}>Apply dates</button>{rangeError && <p role="alert">{rangeError}</p>}</div>}

    <section className={`${styles.creatorHero} ${!hasPortrait || failedImages.hero ? styles.heroWithoutPhoto : ""}`} aria-label={`${creator.name}'s creator workspace`}>
      {hasPortrait && !failedImages.hero && <img className={styles.heroPhoto} src={portrait} alt="Brianna Redd relaxing outdoors in a colourful hammock, wearing a white top" fetchPriority="high" onError={() => setFailedImages(current => ({ ...current, hero: true }))} />}
      <div className={styles.heroShade} />
      <div className={styles.heroCopy}><span className={styles.heroEyebrow}>YOUR CREATOR WORKSPACE</span><h1 className="creator-name">{creator.name}</h1><p>Your content. Your community.</p><Link href={creatorProfile} className={styles.heroButton}>View profile<ArrowRight size={17} /></Link></div>
    </section>

    <section className={styles.summaryCards} aria-label="Dashboard summary">
      <button className={styles.summaryCard} onClick={() => setDetail({ kind: "rates" })} aria-label="Inspect revenue valuation"><span className={styles.summaryIcon}><Coins size={23} /></span><span className={styles.summaryCopy}><span>Total earnings</span><strong data-metric="revenue">{money(dashboard.metrics.revenueCents)}</strong><small>{dashboard.metrics.purchases.toLocaleString()} completed purchases</small></span><svg className={styles.sparkline} viewBox="0 0 1000 220" aria-hidden="true"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="15" /></svg></button>
      {dashboard.platforms.map(p => <button key={p.platform} className={styles.summaryCard} onClick={() => change({ platform: filters.platform === p.platform ? "all" : p.platform })} aria-label={`Inspect ${platformNames[p.platform]} earnings`} aria-pressed={filters.platform === p.platform}><span className={`${styles.summaryIcon} ${styles[p.platform]}`}>{p.platform === "telegram" ? <Send size={22} /> : <b>OF</b>}</span><span className={styles.summaryCopy}><span>{platformNames[p.platform]}</span><strong data-platform-revenue={p.platform}>{money(p.cents)}</strong><small>{p.purchases.toLocaleString()} purchases · {p.buyers} paying fans</small></span></button>)}
      <button className={styles.summaryCard} onClick={() => inspectFans("active")} aria-label="Inspect active fans"><span className={styles.summaryIcon}><Users size={24} /></span><span className={styles.summaryCopy}><span>Active fans</span><strong data-metric="active">{dashboard.metrics.activeFans.toLocaleString()}</strong><small>{dashboard.metrics.fans.toLocaleString()} fan relationships</small></span></button>
    </section>

    <div className={styles.spotlightGrid}>
      <Panel title="Earnings" className={styles.earningsPanel} action={<div className={styles.segmented} role="group" aria-label="Dashboard platform"><button aria-pressed={filters.platform === "all"} aria-label="All platforms" onClick={() => change({ platform: "all" })}><span aria-hidden="true">Combined</span><span className={styles.srOnly}>All platforms</span></button>{platformOrder.map(p => <button key={p} aria-pressed={filters.platform === p} onClick={() => change({ platform: p })}>{platformNames[p]}</button>)}</div>}>
        <div className={styles.chartScope}>{date(dashboard.range.from)} – {date(dashboard.range.to, true)}<span>{filters.currency} · Brisbane time</span></div>
        <div className={styles.areaChart}>
          <div className={styles.areaAxis}>{[1, .75, .5, .25, 0].map(fraction => <span key={fraction}>{compactMoney(Math.round(peak * fraction))}</span>)}</div>
          <div className={styles.areaPlot}>
            <svg viewBox="0 0 1000 220" preserveAspectRatio="none" className={styles.areaSvg} aria-hidden="true"><defs><linearGradient id="dashboard-revenue-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1684ff" stopOpacity=".24"/><stop offset="100%" stopColor="#1684ff" stopOpacity=".025"/></linearGradient></defs>{[10, 57.5, 105, 152.5, 200].map(y => <line key={y} x1="0" x2="1000" y1={y} y2={y} stroke="#e9eef5" strokeWidth="1" />)}<polygon points={`0,200 ${points} 1000,200`} fill="url(#dashboard-revenue-fill)" /><polyline points={points} fill="none" stroke="#0878ff" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" /></svg>
            <div className={styles.chartTargets} role="group" aria-label="Daily revenue">{dashboard.chart.map(d => <button key={d.day} className={`${styles.dayBar} ${focusDay === d.day ? styles.selectedDay : ""}`} aria-label={`${date(d.day, true)}: ${money(d.cents)}, ${d.purchases} purchases`} aria-pressed={focusDay === d.day} title={`${date(d.day, true)} · ${money(d.cents)} · ${d.purchases} purchases`} onMouseEnter={() => setHoverDay(d.day)} onMouseLeave={() => setHoverDay("")} onFocus={() => setHoverDay(d.day)} onBlur={() => setHoverDay("")} onClick={() => { change({ day: focusDay === d.day ? "" : d.day }); inspectPurchases(); }} />)}</div>
            <div className={styles.areaDates}>{dashboard.chart.filter((_, i) => i === 0 || i === dashboard.chart.length - 1 || i % Math.max(1, Math.ceil(dashboard.chart.length / 5)) === 0).map(d => <span key={d.day}>{date(d.day)}</span>)}</div>
          </div>
        </div>
        <div className={styles.chartHint} aria-live="polite">{chartFocus ? `${date(chartFocus.day)} · ${money(chartFocus.cents)} · ${chartFocus.purchases} purchases` : "Select a day to see its purchases"}</div>
      </Panel>
      <Panel title="Recent activity" className={styles.recentPanel} action={<button className={styles.textButton} onClick={() => document.getElementById("dashboard-activity")?.scrollIntoView({ behavior: "smooth" })}>View all<ArrowRight size={14} /></button>}>
        <div className={styles.recentRows}>{recent.map(a => {
          const content = <><span className={styles.recentAvatar} style={{ color: a.fan.color, background: `${a.fan.color}18` }}>{a.fan.initials}</span><span className={styles.recentCopy}><strong>{a.fan.name}</strong><span><PlatformBadge platform={a.platform} compact />{a.title}</span><small>{date(dayAt(a.at))} · {time(a.at)}</small></span><ChevronRight size={15} /></>;
          return a.purchase ? <button className={styles.recentRow} key={a.id} onClick={() => setDetail({ kind: "purchase", purchase: a.purchase! })}>{content}</button> : <Link className={styles.recentRow} key={a.id} href={activityHref(a)}>{content}</Link>;
        })}</div>
        {!recent.length && <div className={styles.empty}>No activity in this period.</div>}
      </Panel>
      <Panel title="From your library" className={styles.libraryPanel} action={<Link className={styles.textLink} href={`/content-library?creator=${creator.id}`}>View library<ArrowRight size={14} /></Link>}>
        {hasPortrait ? <div className={styles.libraryTiles}>{dashboardPortraits.map(item => <Link className={styles.libraryTile} key={item.key} href={`/content-library?creator=briana&item=briana%3Asource%3Aphoto%3A${item.id}`}>
          {!failedImages[item.key] ? <img src={portraitUrl(item.key)} alt={`${item.title} — Brianna Redd`} onError={() => setFailedImages(current => ({ ...current, [item.key]: true }))} loading="lazy" /> : <span className={styles.coverPlaceholder}><ImageIcon size={34} /></span>}
          <span><strong>{item.title}</strong><small>Photo · {item.file}</small></span><ArrowUpRight size={17} />
        </Link>)}</div> : <Link className={styles.libraryEmpty} href={`/content-library?creator=${creator.id}`}><ImageIcon size={27} />Explore {creator.name}’s content library<ArrowRight size={18}/></Link>}
      </Panel>
      <DashboardCampaign fans={fans} creatorId={creator.id} workspace={workspace} />
    </div>

    <section className={styles.relationshipSummary} aria-label="Relationship insights">
      <button onClick={() => inspectFans("paying")} aria-label="Inspect paying fans"><span>Paying fans</span><strong data-metric="paying">{dashboard.metrics.payingFans}</strong></button>
      <button onClick={inspectPurchases} aria-label="Inspect purchases"><span>Purchases</span><strong data-metric="purchases">{dashboard.metrics.purchases}</strong></button>
      <button onClick={() => inspectFans("repeat")} aria-label="Inspect repeat buyers"><span>Repeat buyers</span><strong data-metric="repeat">{Math.round(dashboard.metrics.repeatRate)}<em>%</em></strong></button>
      <button onClick={() => inspectFans("linked")} aria-label="Inspect linked fans"><span>Linked fans</span><strong data-metric="linked">{dashboard.metrics.linkedFans}</strong></button>
    </section>

    <Panel title="Fan relationships" subtitle={`${dashboard.metrics.fans} unique relationships · ${dashboard.metrics.accounts} linked accounts · spend in the selected period`} id="dashboard-relationships" action={<Link className={styles.textLink} href={`/fans?creator=${creator.id}`}>View fan profiles<ArrowUpRight size={14} /></Link>}>
      <div className={styles.fanView} role="group" aria-label="Relationship view">{([['all', 'All fans'], ['paying', 'Paying'], ['active', 'Active'], ['repeat', 'Repeat buyers'], ['linked', 'Linked across platforms']] as const).map(([view, label]) => <button key={view} aria-pressed={fanView === view} onClick={() => { setFanView(view); setFanLimit(12); }}>{label}</button>)}</div>
      <div className={styles.purchaseControls}><div className={styles.search}><Search size={15} /><input aria-label="Search dashboard fans" placeholder="Search fan name or account" value={fanQuery} onChange={e => { setFanQuery(e.target.value); setFanLimit(12); }} />{fanQuery && <button aria-label="Clear fan search" onClick={() => setFanQuery("")}><X size={14} /></button>}</div></div>
      <div className={styles.tableWrap}><table className={styles.relationshipTable}><thead><tr><th>Fan</th><th>Linked platforms</th><th>Spend</th><th>Purchases</th><th>Last conversation</th><th><span className={styles.srOnly}>Actions</span></th></tr></thead><tbody>{relationships.slice(0, fanLimit).map(r => <tr key={r.fan.id} data-fan={r.fan.id}><td><Link className={styles.fanIdentity} href={profileHref(r.fan)}><span style={{ color: r.fan.color, background: `${r.fan.color}16` }}>{r.fan.initials}</span><div><strong>{r.fan.name}</strong><small>{r.memories} remembered details</small></div></Link></td><td><div className={styles.accountBadges}>{r.accounts.map(a => <PlatformBadge key={a.platform} platform={a.platform} compact />)}</div><small>{r.accounts.length === 1 ? "One platform" : `${r.accounts.length} accounts · one fan`}</small></td><td className={styles.numeric}>{money(r.cents)}</td><td>{r.purchases}</td><td><div>{r.lastMessage ? date(dayAt(r.lastMessage.at)) : "No conversation"}</div><small>{r.lastMessage ? `${time(r.lastMessage.at)} · ${platformNames[r.lastMessage.platform]}` : "—"}</small></td><td><div className={styles.rowActions}><Link href={profileHref(r.fan)} aria-label={`Open ${r.fan.name}'s fan profile`}>Profile<ArrowUpRight size={12} /></Link><Link href={conversationHref(r.fan, filters.platform)} aria-label={`Open ${r.fan.name}'s conversation`}><MessageCircle size={15} /></Link></div></td></tr>)}</tbody></table></div>
      {!relationships.length && <div className={styles.empty}><Users size={23} /><p>No fans match this relationship view.</p><button className={styles.textButton} onClick={() => { setFanView("all"); setFanQuery(""); setFanLimit(12); }}>Show all relationships</button></div>}
      <div className={styles.tableFooter}><span>{Math.min(relationships.length, fanLimit)} of {relationships.length} relationships</span>{relationships.length > fanLimit && <button className={styles.textButton} onClick={() => setFanLimit(n => n + 12)}>Show more fans<ChevronRight size={14} /></button>}</div>
    </Panel>

    <Panel title="Recent purchases" subtitle={focusDay ? `Purchases on ${date(focusDay, true)} · ${platform}` : `Completed purchases · ${platform}`} id="dashboard-purchases" action={focusDay ? <button className={styles.textButton} onClick={() => change({ day: "" })}>Show full period<X size={13} /></button> : <span className={styles.panelCount}>{dashboard.metrics.purchases} purchases</span>}>
      <div className={styles.purchaseControls}><div className={styles.search}><Search size={15} /><input aria-label="Search dashboard purchases" placeholder="Search content, fan or platform" value={query} onChange={e => { setQuery(e.target.value); setPurchaseLimit(8); }} />{query && <button aria-label="Clear purchase search" onClick={() => setQuery("")}><X size={14} /></button>}</div><select aria-label="Purchase content type" value={kind} onChange={e => { setKind(e.target.value); setPurchaseLimit(8); }}><option value="all">All content types</option><option value="Photo">Photos</option><option value="Video">Videos</option><option value="Bundle">Bundles</option></select></div>
      <div className={styles.tableWrap}><table className={styles.purchaseTable}><thead><tr><th>Content</th><th>Fan</th><th>Platform</th><th>Amount</th><th>Purchased</th><th>Status</th></tr></thead><tbody>{sales.slice(0, purchaseLimit).map(p => <tr key={p.id} data-purchase={p.id}><td><button className={styles.contentButton} aria-label={`Inspect ${p.title} purchase by ${p.fan.name}`} onClick={() => setDetail({ kind: "purchase", purchase: p })}><MediaIcon kind={p.kind} /><div><strong>{p.title}</strong><small>{p.kind}</small></div></button></td><td><Link className={styles.textLink} href={profileHref(p.fan, "purchases")}>{p.fan.name}</Link></td><td><PlatformBadge platform={p.platform} /></td><td className={styles.numeric}>{money(valueCents(p, filters.currency, audRate))}<small>{originalMoney(p)}</small></td><td>{date(dayAt(p.at))}<small>{time(p.at)}</small></td><td><span className={styles.owned}><Check size={11} />Owned</span><small>{p.status}</small></td></tr>)}</tbody></table></div>
      {!sales.length && <div className={styles.empty}><ShoppingBag size={23} /><p>No purchases match these filters.</p><button className={styles.textButton} onClick={() => { setQuery(""); setKind("all"); if (focusDay) change({ day: "" }); }}>Clear purchase filters</button></div>}
      <div className={styles.tableFooter}><span>{Math.min(sales.length, purchaseLimit)} of {sales.length} purchases</span>{sales.length > purchaseLimit && <button className={styles.textButton} onClick={() => setPurchaseLimit(n => n + 8)}>Show more purchases<ChevronRight size={14} /></button>}</div>
    </Panel>

    <div className={styles.lowerGrid}>
      <Panel title="Content performance" subtitle="Purchased content ranked by revenue" action={<span className={styles.panelCount}>{dashboard.content.length} items</span>}>
        <div className={styles.contentList}>{dashboard.content.slice(0, contentLimit).map((c, i) => <button key={c.title} className={styles.performanceRow} aria-label={`Inspect ${c.title} content performance`} onClick={() => setDetail({ kind: "content", title: c.title })}><span className={styles.rank}>{i + 1}</span><MediaIcon kind={c.kind} /><div><strong>{c.title}</strong><small>{c.kind} · {c.purchases} {c.purchases === 1 ? "purchase" : "purchases"} · {c.owners} {c.owners === 1 ? "owner" : "owners"}</small></div><span className={styles.performanceAmount}>{money(c.cents)}<ArrowUpRight size={12} /></span></button>)}</div>
        {!dashboard.content.length && <div className={styles.empty}><Package size={23} /><p>No purchased content in this period.</p></div>}
        {dashboard.content.length > contentLimit && <button className={`${styles.textButton} ${styles.moreButton}`} onClick={() => setContentLimit(n => n + 5)}>Show more content<ChevronRight size={14} /></button>}
      </Panel>
      <Panel title="Activity history" id="dashboard-activity" subtitle={focusDay ? date(focusDay, true) : "Conversations, purchases and relationship updates"}>
        <div className={styles.activityList}>{activities.slice(0, activityLimit).map(a => {
          const content = <><span className={`${styles.activityIcon} ${a.kind === "Purchase" ? styles.saleIcon : ""}`}>{a.kind === "Purchase" ? <ShoppingBag size={15} /> : a.kind === "Memory" ? <NotebookPen size={15} /> : a.kind === "Account link" ? <Link2 size={15} /> : a.title === "Message received" ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}</span><span className={styles.activityBody}><span><strong>{a.fan.name}</strong><PlatformBadge platform={a.platform} compact /><small>{a.kind}</small></span><b>{a.title}</b><p>{a.summary}</p><small>{date(dayAt(a.at))} · {time(a.at)} AEST</small></span><ChevronRight size={13} /></>;
          return a.purchase ? <button key={a.id} className={styles.activity} onClick={() => setDetail({ kind: "purchase", purchase: a.purchase! })} aria-label={`Inspect ${a.title} activity for ${a.fan.name}`}>{content}</button> : <Link key={a.id} className={styles.activity} href={activityHref(a)} aria-label={`Open ${a.kind.toLowerCase()} activity for ${a.fan.name}: ${a.title}`}>{content}</Link>;
        })}</div>
        {!activities.length && <div className={styles.empty}><MessageCircle size={23} /><p>No activity in this period.</p></div>}
        {activities.length > activityLimit && <button className={`${styles.textButton} ${styles.moreButton}`} onClick={() => setActivityLimit(n => n + 6)}>Show more activity<ChevronRight size={14} /></button>}
      </Panel>
    </div>
    <footer className={styles.footer}><span>One creator relationship per fan. Linked platform accounts are counted separately.</span><button className={styles.textButton} onClick={() => setDetail({ kind: "rates" })}>Revenue valuation<CircleHelp size={13} /></button></footer>

    {detail && <Dialog key={detail.kind === "purchase" ? detail.purchase.id : detail.kind === "content" ? detail.title : "rates"} title={detail.kind === "purchase" ? "Purchase details" : detail.kind === "content" ? "Content performance" : "Revenue valuation"} close={() => setDetail(null)}>
      {detail.kind === "rates" && <><p className={styles.dialogIntro}>Revenue combines completed purchases in the selected period. All purchases in these relationship records are completed; there are no pending payments or refunds in this ledger. Platform fees and earnings splits are excluded.</p><dl className={styles.details}><div><dt>Selected currency</dt><dd>{filters.currency}</dd></div><div><dt>Original dollar purchases</dt><dd>{displayMoney(Math.round(dashboard.metrics.usd * 100), "USD")}</dd></div><div><dt>Original Telegram purchases</dt><dd>{dashboard.metrics.stars.toLocaleString("en-US")} Stars</dd></div><div><dt>Star display valuation</dt><dd>US${STAR_USD.toFixed(3)} per Star</dd></div><div><dt>USD to AUD display rate</dt><dd>A${audRate.toFixed(4)} per US$1</dd></div><div><dt>Revenue in selected currency</dt><dd>{money(dashboard.metrics.revenueCents)}</dd></div></dl><p className={styles.dialogNote}>Converted figures are display estimates, rounded per purchase. Every purchase retains its original amount. This value is not a creator payout or a bank balance.</p></>}
      {detail.kind === "purchase" && <><div className={styles.purchaseHero}><MediaIcon kind={detail.purchase.kind} /><div><h3>{detail.purchase.title}</h3><p>{detail.purchase.kind} · {creator.name}</p></div><span className={styles.owned}><Check size={12} />Owned</span></div><dl className={styles.details}><div><dt>Fan</dt><dd>{detail.purchase.fan.name}</dd></div><div><dt>Platform</dt><dd><PlatformBadge platform={detail.purchase.platform} /></dd></div><div><dt>Original amount</dt><dd>{originalMoney(detail.purchase)}</dd></div><div><dt>Display value</dt><dd>{money(valueCents(detail.purchase, filters.currency, audRate))}</dd></div><div><dt>Purchased</dt><dd>{date(dayAt(detail.purchase.at), true)} · {time(detail.purchase.at)} AEST</dd></div><div><dt>Payment status</dt><dd>{detail.purchase.status}</dd></div><div><dt>Content ownership</dt><dd>{detail.purchase.fan.name} owns this {detail.purchase.kind.toLowerCase()}</dd></div></dl><div className={styles.dialogActions}><Link className={styles.secondaryButton} href={`/content-library?${new URLSearchParams({creator:creator.id,item:`${creator.id}:${detail.purchase.kind}:${detail.purchase.title}`,fan:detail.purchase.fan.id})}`}>Open in Content Library<ArrowUpRight size={14}/></Link><Link className={styles.primaryButton} href={profileHref(detail.purchase.fan, "purchases")}>Open fan purchase history<ArrowUpRight size={14} /></Link>{detail.purchase.sourceMessageId && <Link className={styles.secondaryButton} href={conversationHref(detail.purchase.fan, detail.purchase.platform, detail.purchase.sourceMessageId)}>View conversation context<MessageCircle size={14} /></Link>}</div></>}
      {detail.kind === "content" && contentDetail && <><div className={styles.purchaseHero}><MediaIcon kind={contentDetail.kind} /><div><h3>{contentDetail.title}</h3><p>{contentDetail.kind} · {creator.name}</p></div></div><div className={styles.contentStats}><div><strong>{money(contentDetail.cents)}</strong><span>Revenue in selected period</span></div><div><strong>{contentDetail.purchases}</strong><span>Purchases</span></div><div><strong>{contentDetail.owners}</strong><span>Unique owners</span></div></div><Link className={styles.secondaryButton} href={`/content-library?${new URLSearchParams({creator:creator.id,item:`${creator.id}:${contentDetail.kind}:${contentDetail.title}`})}`}>Open in Content Library<ArrowUpRight size={14}/></Link><h3 className={styles.ownersHeading}>Purchased by</h3>{contentDetail.entries.map(p => <div className={styles.ownerRow} key={p.id}><div><strong>{p.fan.name}</strong><span><PlatformBadge platform={p.platform} />{date(dayAt(p.at))}</span></div><span>{originalMoney(p)}</span><button className={styles.textButton} aria-label={`Open ${p.fan.name}'s ${p.title} purchase details`} onClick={() => setDetail({ kind: "purchase", purchase: p })}>Details<ArrowUpRight size={14} /></button></div>)}</>}
    </Dialog>}
  </div>;
}
