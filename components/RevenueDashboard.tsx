"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardData, Period } from "@/lib/dashboard-data";
import type { AnalyticsData } from "@/lib/analytics-data";
import type { StarBalance } from "@/lib/star-balance";
import { reportFeatureRows, topFeatureRow } from "@/lib/report-features";
import { reportTzLabel } from "@/lib/report-time";
import { fmtMoney, fmtNum, starsToMoneyRate, usdToMoneyRate } from "@/lib/money";
import { useCurrency } from "@/components/CurrencyProvider";
import { initials } from "@/lib/colors";
import FanAvatar from "@/components/FanAvatar";
import RevenueDayDrivers from "@/components/RevenueDayDrivers";
import { Info } from "@/components/clone/fields";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// The Revenue page is the ONE money destination: headline + chart + the 9 core
// stats, always visible, plus the deeper money cuts (by clone/flow/feature/time/
// tier) that used to live behind a separate "Analytics" tab — now just more of
// this same page. `cloneId` comes from the global clone switcher (lib/clone-scope,
// read by app/revenue/page.tsx) — when set, every number here scopes to that one
// clone; when absent ("All clones"), everything aggregates across the fleet.

type FullData = DashboardData & {
  analytics: AnalyticsData;
  balance: StarBalance | null;
  /** Server snapshot metadata. The API deliberately never serves browser-cached revenue. */
  cachedAt: number;
  ageSeconds: number;
  stale: boolean;
};

// T8: was `media: "Media"` — a bare, unexplained catch-all that read as broken
// ("Rev why tf it say media it should be photo or video or message"). The API
// already sends the finer star_transactions.feature value here when the row
// has one (see lib/dashboard-data.ts: `kind: p.feature || p.kind || "other"`),
// so most future sales already resolve to Paid photo/Paid video/Photo bundle/
// etc. "Media (untagged)" is now reserved for what it actually means: a sale
// whose specific item was never recorded — confirmed against Supabase, every
// row like that today is `imported_from: "telegram"` backfilled history from
// before star-reconcile.ts's photo/video/bundle split existed, not a live
// dashboard bug. Real-time sales tag correctly going forward.
const TX_KIND_LABEL: Record<string, string> = {
  credits: "Paid Messages",
  photo: "Photo",
  video: "Video",
  bundle: "Bundle",
  media: "Media (untagged)",
  tip: "Tip",
  subscription: "VIP subscription",
  other: "Other",
};

function TransactionMedia({
  type,
  url,
  name,
}: {
  type: "photo" | "video" | "bundle";
  url: string | null;
  name: string | null;
}) {
  const label = TX_KIND_LABEL[type];
  return (
    // min-w-0 on mobile, not min-w-[132px]: this sits in a table cell on desktop
    // and a flex card row on a phone, and a hard min-width there is one of the
    // things that pushed this page past the viewport.
    <span className="flex min-w-0 items-center gap-2.5 sm:min-w-[132px]" title={name || label}>
      <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-surface text-accent shadow-sm">
        {url && type === "video" ? (
          <>
            <video src={url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
            <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/10">
              {/* A CSS border triangle's BOX is 8px wide but its visual mass sits
                  in the left third, so centring the box leaves the arrow looking
                  shoved right. translate-x-[2px] centres what the eye actually
                  sees. Same complaint as the avatar circles above. */}
              <span className="h-0 w-0 translate-x-[2px] border-y-[5px] border-l-[8px] border-y-transparent border-l-white drop-shadow" />
            </span>
          </>
        ) : url ? (
          <img src={url} alt={name || `${label} purchased`} className="h-full w-full object-cover" />
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7}>
            {type === "video" ? (
              <>
                <rect x="3" y="5" width="13" height="14" rx="2" />
                <path d="m16 10 5-3v10l-5-3z" />
              </>
            ) : type === "bundle" ? (
              <>
                <rect x="5" y="3" width="14" height="14" rx="2" />
                <path d="M3 8v11a2 2 0 0 0 2 2h11" />
                <path d="m8 13 2.5-2.5 2 2 1.5-1.5 2 2" />
              </>
            ) : (
              <>
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <circle cx="9" cy="10" r="1.5" />
                <path d="m4 17 5-5 3 3 2-2 6 5" />
              </>
            )}
          </svg>
        )}
      </span>
      {/* min-w-0 + max-w-full, not a fixed max-w-40: without it this filename
          block could not shrink below 160px and pushed the mobile transaction
          card 18px past its own border. */}
      <span className="min-w-0">
        <span className="block font-medium text-ink">{label}</span>
        {name && <span className="block max-w-full truncate text-[11px] normal-case text-muted sm:max-w-40">{name}</span>}
      </span>
    </span>
  );
}

const PERIODS: { key: Period; label: string; live?: boolean }[] = [
  { key: "ALL", label: "All" },
  { key: "1Y", label: "1Y" },
  { key: "6M", label: "6M" },
  { key: "3M", label: "3M" },
  { key: "1M", label: "1M" },
  { key: "2W", label: "2W" },
  { key: "1W", label: "1W" },
  { key: "1D", label: "1D", live: true },
];

const REVENUE_REFRESH_MS = 60 * 1000;

function snapshotAgeLabel(ageSeconds: number) {
  if (ageSeconds <= 5) return "Updated just now";
  if (ageSeconds < 60) return `Updated ${ageSeconds}s ago`;
  const minutes = Math.floor(ageSeconds / 60);
  return `Updated ${minutes}m ago`;
}

export default function RevenueDashboard({ cloneId }: { cloneId?: string | null } = {}) {
  const scoped = Boolean(cloneId);
  const [period, setPeriod] = useState<Period>("1M");
  // Custom calendar range (yyyy-mm-dd strings, straight from <input type="date">).
  // When set, it overrides every preset period — the "Custom" pill lights up
  // instead of any of the fixed-window pills.
  const [customRange, setCustomRange] = useState<{ start: string; end: string } | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [chartType, setChartType] = useState<"bar" | "line">("bar");
  const { currency, rate } = useCurrency();
  const [data, setData] = useState<FullData | null>(null);
  // WHY THIS EXISTS. /api/dashboard answers a failure with 500 + {error}, and
  // fetchData used to setData(that object). `data` was then truthy with no
  // `totals` on it, so the first read of data.totals.stars threw and React
  // replaced the whole page with "Application error: a client-side exception
  // has occurred" — no clue on screen as to which of the eleven numbers on this
  // page was unavailable. 2026-08-22: revenue_usage_rollup started timing out
  // on 1M/3M (fleet-wide usage_events has no created_at-leading index and the
  // Alanna story 10x'd the traffic), so the DEFAULT view white-screened.
  // A failing query must degrade to a message, never to a blank page.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [creatorListOpen, setCreatorListOpen] = useState(false);
  const [creatorQuery, setCreatorQuery] = useState("");
  const [txQuery, setTxQuery] = useState("");
  // Transactions shown: 10 by default, "Show more" steps to 50 then 100 (max).
  const [txLimit, setTxLimit] = useState(10);
  // Full revenue report — expands below the stats grid from its teaser tile.
  const [reportOpen, setReportOpen] = useState(false);
  const reportRef = useRef<HTMLDivElement | null>(null);
  const newestRequest = useRef(0);

  // Recharts colors are inline JS (not CSS classes) so they don't pick up the
  // light-mode constants rather than theme-conditional.
  const axisColor = "#526b82";
  const gridColor = "#cfdeea";
  const cursorColor = "rgba(74,142,196,0.1)";
  // Last bar in the window is always today/this-bucket and still accumulating.
  // Keep its clone colour, but lower the opacity so "Live" is distinguishable
  // without introducing an off-theme grey bar.

  const fetchData = useCallback(
    async (p: Period, cid?: string | null, range?: { start: string; end: string } | null, force = false) => {
      const request = ++newestRequest.current;
      const params = new URLSearchParams();
      if (range) {
        // Date picker values are report-calendar dates. Sending them as dates
        // lets the server apply Sydney midnight boundaries, rather than the
        // browser's local timezone (which differs during daylight saving).
        params.set("startDate", range.start);
        params.set("endDate", range.end);
      } else {
        params.set("period", p);
      }
      if (cid) params.set("clone", cid);
      // A normal dashboard request waits if its one-minute snapshot has just
      // expired. An explicit refresh asks for a new snapshot even if it is
      // still warm, so the operator can verify the live ledger immediately.
      params.set("fresh", force ? "force" : "1");
      let json: (FullData & { error?: string }) | null = null;
      try {
        const res = await fetch(`/api/dashboard?${params}`, { cache: "no-store" });
        json = (await res.json()) as FullData & { error?: string };
        // Both halves matter: a 500 carries {error}, but a 200 whose body is
        // missing `totals` is just as unrenderable and must not reach setData.
        if (!res.ok || json?.error || !json?.totals) {
          throw new Error(json?.error || `the server returned ${res.status} with no totals`);
        }
      } catch (e) {
        if (request !== newestRequest.current) return;
        setLoadError(e instanceof Error ? e.message : String(e));
        setLoading(false);
        return; // keep the LAST GOOD data on screen rather than blanking it
      }
      if (request !== newestRequest.current) return;
      setLoadError(null);
      setData(json);
      setLoading(false);
    },
    [],
  );

  // Opening the report scrolls it into view (it renders below the fold).
  useEffect(() => {
    if (reportOpen) reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [reportOpen]);

  useEffect(() => {
    setLoading(true);
    setTxLimit(10); // new window/scope — collapse the tx list back down
    fetchData(period, cloneId, customRange);
    if (customRange) return; // a picked range is a fixed window — no live refresh
    const id = setInterval(() => fetchData(period, cloneId, customRange), REVENUE_REFRESH_MS);
    return () => clearInterval(id);
  }, [period, cloneId, customRange, fetchData]);

  function applyCustomRange() {
    if (!draftStart || !draftEnd) return;
    setCustomRange({ start: draftStart, end: draftEnd });
    setCustomOpen(false);
  }

  function clearCustomRange() {
    setCustomRange(null);
    setCustomOpen(false);
  }

  function refreshNow() {
    setLoading(true);
    fetchData(period, cloneId, customRange, true);
  }

  const money = (stars: number) => fmtMoney(starsToMoneyRate(stars, currency, rate), currency);
  // Profit/cost arrive in USD; revenue arrives in Stars. Both are rendered in
  // the operator's selected currency so a table never puts "A$8,295 revenue"
  // beside "$4,102 profit" and invites the wrong ratio. Was a bare "$" + toLocaleString.
  const usd = (n: number) => fmtMoney(usdToMoneyRate(n, currency, rate), currency);
  // Whole percent above 10, one decimal below it. Math.round alone flattened
  // every conversion rate the fleet has ever had into "1%": the real figure sat
  // between 0.62% and 0.68% across 1d/7d/30d on 2026-08-21, and all three
  // rounded to the same integer, so the tile looked frozen and looked like a
  // suspiciously round number at the same time. Repeat rate (~33-41%) and Top
  // source (~19%) are big enough that a decimal there is just noise.
  const pct = (n: number) => {
    const v = n * 100;
    return v > 0 && v < 10 ? `${v.toFixed(1)}%` : `${Math.round(v)}%`;
  };

  const visibleClones = useMemo(() => {
    const all = data?.clones ?? [];
    if (cloneId) return all.filter((c) => c.id === cloneId);
    return all.filter((c) => !hidden.has(c.id));
  }, [data, hidden, cloneId]);

  // When scoped to one clone, every headline/stat reflects just that clone's totals.
  const focusStats = cloneId && data ? data.perClone[cloneId] : null;
  const displayStars = focusStats ? focusStats.stars : data?.totals.stars ?? 0;
  const focusName = cloneId ? data?.clones.find((c) => c.id === cloneId)?.name : null;

  // Unambiguous label for the headline figure - it is gross Stars EARNED in the
  // selected window (proceeds), never the wallet balance or what's withdrawable.
  // Only equals "lifetime" when the window is genuinely all-time.
  const proceedsLabel = customRange
    ? "Proceeds, custom range"
    : period === "ALL"
      ? "Lifetime proceeds"
      : `Proceeds, ${PERIODS.find((p) => p.key === period)?.label ?? period}`;

  const toggleHidden = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Rough trend: second half of the visible window vs the first half — no
  // separate "previous period" fetch exists yet, so this approximates
  // direction from the same series already on screen.
  const trendPct = useMemo(() => {
    if (!data || data.series.length < 2) return null;
    const sumRows = (rows: typeof data.series) =>
      rows.reduce(
        (s, row) => s + visibleClones.reduce((cs, c) => cs + (Number(row[c.id]) || 0), 0),
        0,
      );
    const mid = Math.floor(data.series.length / 2);
    const first = sumRows(data.series.slice(0, mid));
    const second = sumRows(data.series.slice(mid));
    if (first === 0) return second > 0 ? 100 : null;
    return Math.round(((second - first) / first) * 100);
  }, [data, visibleClones]);

  return (
    <div className="earnings-aurora">
      {/* Named on screen, not just in the console. The operator is the person
          who has to decide whether to pick a shorter window or call someone. */}
      {loadError && (
        <div className="mb-4 rounded-xl border border-[#b4432f] bg-[#fdecea] px-4 py-3 text-sm text-[#7a2b1e]">
          <div className="font-semibold">This window could not be loaded.</div>
          <div className="mt-1 font-mono text-[11px] leading-snug break-words">{loadError}</div>
          <div className="mt-1 text-[12px]">
            {data ? "Showing the last window that loaded." : "Try a shorter period — 1D and 1W are much cheaper to compute."}
          </div>
        </div>
      )}
      <div className="earnings-heading mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          {/* Mobile first: 2xl on a phone. At 3xl this one line took a quarter of
              the screen height before a single number appeared. */}
          <h2 className="flex items-center gap-2 font-heading text-2xl font-semibold tracking-[-0.035em] text-[#06172f] sm:text-3xl md:text-4xl">
            Earnings overview
            <Info text="Revenue, buyer activity and conversion performance across your active creators. In All creators, buyers are unique people across creators; audience and message totals count each creator-fan relationship." />
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
            {data && <span>{data.stale ? "Refreshing latest data…" : snapshotAgeLabel(data.ageSeconds)}</span>}
            <button
              type="button"
              onClick={refreshNow}
              disabled={loading}
              className="font-semibold text-[#28658f] underline decoration-[#28658f]/35 underline-offset-2 transition hover:text-[#17496c] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
      </div>
      {/* ── Period toggle - a segmented control, not tabs: it re-windows the
          same ledger, it doesn't switch views. Custom range + chart type sit
          alongside it, on the same row. ─────────────────────────────────── */}
      {/* Mobile first: the pills still WRAP rather than scroll sideways. A scroll
          strip fitted in one row but hid "1D" and "Custom" off the right edge with
          no visible cue, which on this page reads as the content being cut off,
          the exact complaint. Tighter type and padding instead, so they wrap to
          two rows instead of three and nothing is hidden. */}
      <div className="earnings-toolbar mb-4 flex flex-wrap items-center gap-1.5 sm:mb-5 sm:gap-2">
        <div className="earnings-control-group inline-flex min-w-0 flex-wrap gap-0.5 rounded-full p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => {
                setCustomRange(null);
                setPeriod(p.key);
              }}
              className={
                "flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium tabular-nums transition sm:px-2.5 sm:text-xs " +
                (!customRange && period === p.key
                  ? "earnings-control-active"
                  : "text-muted hover:bg-muted/10 hover:text-ink")
              }
            >
              {p.live && (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-good" />
                </span>
              )}
              {p.label}
            </button>
          ))}
          <button
            onClick={() => {
              setDraftStart(customRange?.start ?? "");
              setDraftEnd(customRange?.end ?? "");
              setCustomOpen(true);
            }}
            className={
              "flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium tabular-nums transition sm:px-2.5 sm:text-xs " +
              (customRange ? "earnings-control-active" : "text-muted hover:bg-muted/10 hover:text-ink")
            }
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M3 9h18M8 2v4M16 2v4" strokeLinecap="round" />
            </svg>
            {customRange ? `${customRange.start} → ${customRange.end}` : "Custom"}
          </button>
        </div>

        {/* Bar / line toggle - same series, different mark. Fixed square boxes
            with place-items-center rather than padding around an icon: padding
            rounds differently per icon and left both of these looking off-centre
            inside the round active pill. */}
        <div className="earnings-control-group inline-flex shrink-0 gap-0.5 rounded-full p-0.5">
          <button
            onClick={() => setChartType("bar")}
            aria-label="Bar chart"
            aria-pressed={chartType === "bar"}
            className={
              "grid h-7 w-7 place-items-center rounded-full transition " +
              (chartType === "bar" ? "earnings-control-active" : "text-muted hover:bg-muted/10 hover:text-ink")
            }
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M4 20V10M12 20V4M20 20v-7" strokeLinecap="round" />
            </svg>
          </button>
          <button
            onClick={() => setChartType("line")}
            aria-label="Line chart"
            aria-pressed={chartType === "line"}
            className={
              "grid h-7 w-7 place-items-center rounded-full transition " +
              (chartType === "line" ? "earnings-control-active" : "text-muted hover:bg-muted/10 hover:text-ink")
            }
          >
            {/* The polyline's ink spans y 7..16, so its bounding box centre is not
                the viewBox centre. Nudged down to sit level in the circle. */}
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 translate-y-[1px]" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M4 16l5-6 4 3 7-9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Custom date range</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 p-4 pt-0">
            <label className="flex flex-col gap-1 text-xs text-muted">
              From
              <Input type="date" value={draftStart} onChange={(event) => setDraftStart(event.target.value)} max={draftEnd || undefined} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              To
              <Input type="date" value={draftEnd} onChange={(event) => setDraftEnd(event.target.value)} min={draftStart || undefined} />
            </label>
            <div className="mt-1 flex justify-end gap-2">
              {customRange && (
                <Button variant="ghost" size="sm" onClick={clearCustomRange}>
                  Clear
                </Button>
              )}
              <Button size="sm" onClick={applyCustomRange} disabled={!draftStart || !draftEnd}>
                Apply
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-2">
        {/* ── Chart card ───────────────────────────────────────────── */}
        <Card size="sm" className="earnings-feature-card">
          <CardHeader className="flex-row items-start gap-4 space-y-0 pb-0">
            <div>
              <div className="flex items-center gap-1.5 text-xs text-muted">
                {focusName ? <span className="creator-name">{focusName}</span> : "Fleet"} · {proceedsLabel}
                <Info text="Every Star earned in this window, gross. This is proceeds, not your current wallet balance - see Balance below for that." />
                {trendPct !== null && (
                  <span className="font-mono font-semibold tabular-nums text-black">
                    {trendPct >= 0 ? "+" : ""}
                    {trendPct}%
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-start gap-3">
                <span className="flex items-baseline gap-1.5">
                  <span className="money-value-primary font-mono text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
                    {data ? money(displayStars) : "-"}
                  </span>
                  {!customRange && period === "1D" && (
                    <span className="relative flex h-2 w-2" title="Live - refreshes automatically">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-good" />
                    </span>
                  )}
                </span>
                <span className="h-9 w-px bg-line" />
                <span>
                  <span className="block text-[11px] text-muted">Telegram Stars</span>
                  <span className="mt-0.5 flex items-baseline gap-1">
                    <span className="text-xs">⭐</span>
                    <span className="font-mono text-sm font-semibold tabular-nums text-black">
                      {data ? fmtNum(displayStars) : "-"}
                    </span>
                  </span>
                </span>
              </div>
              {scoped && data?.balance ? (
                <div className="mt-3 flex flex-wrap gap-4">
                  <BalanceStat
                    label="Total balance"
                    hint="Every Star sitting in this bot's Telegram wallet right now, minus anything already withdrawn or spent. Read directly from Telegram (getMyStarBalance)."
                    value={data.balance.totalBalanceStars}
                    money={money}
                    accent="good"
                  />
                </div>
              ) : (
                <Link href="/info" className="mt-2 inline-block text-xs font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:text-accent-deep">
                  {scoped ? "Balance unavailable right now" : "See Total balance per bot"}
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[160px] sm:h-[220px]">
              {loading ? (
                <div className="flex h-full items-center justify-center text-muted">Loading…</div>
              ) : data && displayStars > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  {chartType === "bar" ? (
                    <BarChart data={data.series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                      <XAxis
                        dataKey="bucket"
                        axisLine={false}
                        tickLine={false}
                        tick={(props: { x: number; y: number; payload: { value: string }; index: number }) => {
                          const isLive = !customRange && props.payload.value === data.series[data.series.length - 1]?.bucket;
                          return (
                            <g transform={`translate(${props.x},${props.y})`}>
                              <text
                                dy={12}
                                textAnchor="middle"
                                fontSize={11}
                                fontWeight={isLive ? 600 : 400}
                                fill={isLive ? "var(--color-good)" : axisColor}
                              >
                                {isLive ? "Live" : props.payload.value}
                              </text>
                            </g>
                          );
                        }}
                      />
                      <YAxis
                        tick={{ fill: "#06172f", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) => money(v).replace(/\.00$/, "")}
                        width={64}
                      />
                      <Tooltip
                        cursor={{ fill: cursorColor }}
                        content={<ChartTooltip clones={visibleClones} money={money} />}
                      />
                      {visibleClones.map((c, i) => (
                        <Bar
                          key={c.id}
                          dataKey={c.id}
                          stackId="rev"
                          fill={c.color}
                          radius={i === visibleClones.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                        >
                          {data.series.map((_, idx) => (
                            <Cell
                              key={idx}
                              fill={c.color}
                              fillOpacity={!customRange && idx === data.series.length - 1 ? 0.52 : 1}
                            />
                          ))}
                        </Bar>
                      ))}
                    </BarChart>
                  ) : (
                    <LineChart data={data.series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                      <XAxis
                        dataKey="bucket"
                        axisLine={false}
                        tickLine={false}
                        tick={(props: { x: number; y: number; payload: { value: string }; index: number }) => {
                          const isLive = !customRange && props.payload.value === data.series[data.series.length - 1]?.bucket;
                          return (
                            <g transform={`translate(${props.x},${props.y})`}>
                              <text
                                dy={12}
                                textAnchor="middle"
                                fontSize={11}
                                fontWeight={isLive ? 600 : 400}
                                fill={isLive ? "var(--color-good)" : axisColor}
                              >
                                {isLive ? "Live" : props.payload.value}
                              </text>
                            </g>
                          );
                        }}
                      />
                      <YAxis
                        tick={{ fill: "#06172f", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) => money(v).replace(/\.00$/, "")}
                        width={64}
                      />
                      <Tooltip
                        cursor={{ stroke: cursorColor }}
                        content={<ChartTooltip clones={visibleClones} money={money} />}
                      />
                      {visibleClones.map((c) => (
                        <Line
                          key={c.id}
                          type="monotone"
                          dataKey={c.id}
                          stroke={c.color}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 3 }}
                        />
                      ))}
                    </LineChart>
                  )}
                </ResponsiveContainer>
              ) : (
                <EmptyState />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Keep the full creator chooser out of the default page flow. On a
            phone this sits below the graph, and a large roster must never turn
            the earnings overview into hundreds of checked rows. */}
        {!scoped && (
          <Card size="sm" className="gap-0 overflow-hidden py-0">
            <button
              type="button"
              aria-expanded={creatorListOpen}
              aria-controls="creator-chart-picker"
              onClick={() => setCreatorListOpen((open) => !open)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-muted/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{creatorListOpen ? "Hide creators" : "View all creators"}</span>
                <span className="block truncate text-[11px] text-muted">
                  {visibleClones.length} of {(data?.clones ?? []).length} creators shown in the chart
                </span>
              </span>
              <svg
                viewBox="0 0 24 24"
                className={"h-4 w-4 shrink-0 text-muted transition-transform " + (creatorListOpen ? "rotate-180" : "")}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {creatorListOpen && (
              <div id="creator-chart-picker" className="border-t border-line">
                <div className="relative border-b border-line p-2.5">
                  <svg
                    viewBox="0 0 24 24"
                    className="pointer-events-none absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <circle cx="11" cy="11" r="7" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" strokeLinecap="round" />
                  </svg>
                  <Input
                    value={creatorQuery}
                    onChange={(event) => setCreatorQuery(event.target.value)}
                    placeholder="Search creators…"
                    aria-label="Search creators"
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <div className="max-h-[min(30rem,60vh)] divide-y divide-line overflow-y-auto overscroll-contain">
                  {(data?.clones ?? [])
                    .filter((c) => c.name.toLowerCase().includes(creatorQuery.trim().toLowerCase()))
                    .map((c) => {
                      const checked = !hidden.has(c.id);
                      return (
                        <div
                          key={c.id}
                          className={
                            "flex items-center gap-2.5 px-3 py-2.5 transition " +
                            (selected === c.id ? "bg-muted/20" : "hover:bg-muted/10")
                          }
                        >
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            aria-label={`Show ${c.name} in chart`}
                            onClick={() => toggleHidden(c.id)}
                            className={
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition " +
                              (checked ? "border-accent bg-accent" : "border-line bg-transparent hover:border-muted")
                            }
                          >
                            {checked && (
                              <svg viewBox="0 0 24 24" className="h-3 w-3 text-accent-ink" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                            )}
                          </button>
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                          <button
                            onClick={() => setSelected(selected === c.id ? null : c.id)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            {c.photoUrl ? (
                              <img src={c.photoUrl} alt={c.name} className="h-6 w-6 shrink-0 rounded-full object-cover" />
                            ) : (
                              <span
                                className="creator-name flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                                style={{ background: c.color }}
                              >
                                {initials(c.name)}
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="creator-name block truncate text-xs">{c.name}</span>
                              <span className="money-value block font-mono text-[11px] tabular-nums">{money(c.stars)}</span>
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  {(data?.clones ?? []).length === 0 && (
                    <div className="px-3 py-3 text-xs text-muted">No creators yet.</div>
                  )}
                  {(data?.clones ?? []).length > 0 &&
                    (data?.clones ?? []).filter((c) => c.name.toLowerCase().includes(creatorQuery.trim().toLowerCase())).length === 0 && (
                      <div className="px-3 py-3 text-xs text-muted">No creators match “{creatorQuery}”.</div>
                    )}
                </div>
              </div>
            )}
          </Card>
        )}
      </div>

      {/* The top-line chart says how much arrived; this card makes the next
          decision possible: did more people show up, did buyer count change, or
          did one unusually large payment move the entire day? It deliberately
          stays above the broad report so it is not buried behind a toggle. */}
      <RevenueDayDrivers cloneId={cloneId} />

      {/* ── Fleet/clone stats - same window as the chart above it. A tile
          grid: each stat gets its own card so the row reads at a glance. */}
      {data && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
          {(() => {
            const s = focusStats ?? data.totals;
            // Per ACTIVE user — fans who messaged in the window. NOT the
            // "Users" tile, which is all-time total since 2026-08-22: dividing
            // one window's revenue by the whole lifetime audience answers
            // nothing. Dividing by arrivals instead would answer "revenue per
            // person who signed up in this window", which is not what anyone
            // reads "Rev/user" as either.
            const revPerUser = s.activeUsers > 0 ? displayStars / s.activeUsers : 0;
            const revPerBuyer = s.buyers > 0 ? displayStars / s.buyers : 0;
            const avgOrder = s.sales > 0 ? displayStars / s.sales : 0;
            // "Conversion" on a tile beside "Buyers" means: of the people who
            // talked to her, how many bought ANYTHING. It used to divide
            // paywallFunnel.purchased by `messaged`, and .purchased counts only
            // fans who bought CREDITS — 57 of 401 real buyers over 30 days. A
            // fan who bought a photo, a video, a bundle or sent a tip was
            // counted as having left without spending, so the tile read about a
            // seventh of the truth and disagreed with the Buyers tile next to
            // it. The credit-only stage is still exactly right for the paywall
            // funnel panel further down, which is labelled as such.
            const { messaged } = data.analytics.paywallFunnel;
            const conversion = messaged > 0 ? s.buyers / messaged : null;
            // Windowed (lib/dashboard-data.ts), NOT analytics.funnel.repeatPct —
            // that one is the Analytics tab's LIFETIME funnel and never moved
            // when the period changed. Same reason as the four tiles above it.
            const repeatRate = s.repeatPct;
            // #1 single source. Shares topFeatureRow() with the report's "Top
            // earner" fact below so the two cannot print different answers on
            // the same screen — they did, "Photos 21%" here against "Media 61%"
            // there, because this one dropped the catch-all buckets first.
            const topKind = topFeatureRow(data.analytics.byFeature);
            const tiles: { label: string; value: string; money?: boolean }[] = [
              // "Users" = every fan, all time, and it does NOT follow the date
              // filter — same as "Reachable now (24h)" below. Ronan's call,
              // 2026-08-22: on this page "Users" answers "how big is the
              // audience", a number that cannot shrink when you pick a shorter
              // period. The windowed count is "New" beside it.
              { label: "Users", value: fmtNum(s.totalFans) },
              { label: "New", value: fmtNum(s.newFans) },
              // Was computed for Rev/user's denominator but never shown itself,
              // so the tile's math was invisible. Fans who messaged inside the
              // window - not New (first-time arrivals) and not the 24h
              // reachable tile below (that one ignores the filter entirely).
              { label: "Active", value: fmtNum(s.activeUsers) },
              { label: "Transactions", value: fmtNum(s.sales) },
              // The ONE tile that ignores the filter, and it says so. Telegram
              // only allows a business bot to message a fan within 24h of that
              // fan's last message, so this is who the fleet can reach right
              // now — an operational limit, not a stat about the window.
              { label: "Reachable now (24h)", value: fmtNum(s.reachable24h) },
              { label: "Messages", value: fmtNum(s.messages) },
              { label: cloneId ? "Buyers" : "Unique buyers", value: fmtNum(s.buyers) },
              { label: "Rev/user", value: money(revPerUser), money: true },
              { label: "Rev/buyer", value: money(revPerBuyer), money: true },
              { label: "Avg order", value: money(avgOrder), money: true },
              { label: "Conversion", value: conversion !== null ? pct(conversion) : "-" },
              { label: "Repeat rate", value: pct(repeatRate) },
              // Short label so the tile never truncates the number away.
              // "(untagged)" is kept, not stripped: it is the difference between
              // "photos are our product" and "we are not recording what we sell".
              { label: "Top source", value: topKind ? `${topKind.label} ${pct(topKind.share)}` : "-" },
            ];
            return (
              <>
                {tiles.map((t) => (
                  <div key={t.label} className="earnings-stat-tile rounded-xl border px-3 py-3">
                    <div className="text-[10px] uppercase tracking-wide text-muted">{t.label}</div>
                    <div className={"mt-1 break-words font-mono text-base font-semibold leading-tight tabular-nums " + (t.money ? "money-value" : "text-ink")}>{t.value}</div>
                  </div>
                ))}
                {/* Report tile - toggles the full revenue report below the grid. */}
                <button
                  type="button"
                  onClick={() => setReportOpen((v) => !v)}
                  aria-expanded={reportOpen}
                  className={
                    "flex flex-col justify-center rounded-xl border px-3 py-2.5 text-left shadow-[0_8px_22px_rgba(6,23,47,0.18)] transition " +
                    (reportOpen
                      ? "border-[#4a8ec4] bg-[#4a8ec4] hover:border-[#6ba6d2] hover:bg-[#6ba6d2]"
                      : "border-[#06172f] bg-[#06172f] hover:border-[#0d3d6e] hover:bg-[#0d3d6e]")
                  }
                >
                  <div className="text-xs font-bold text-white">
                    Full revenue report {reportOpen ? "↓" : "→"}
                  </div>
                  <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                    {reportOpen ? "Open below" : "What makes the money"}
                  </div>
                </button>
              </>
            );
          })()}
        </div>
      )}

      {/* ── Jesse's seven. Above the report toggle, not inside it: these are the
          numbers that say whether the funnel is working, and a number behind a
          click is a number nobody reads. Same window and scope as everything
          above. ──────────────────────────────────────────────────────────── */}
      {data && (
        <ConversationFunnelPanel
          f={data.analytics.conversationFunnel}
          windowStars={displayStars}
          buyers={(focusStats ?? data.totals).buyers}
          repeatPct={(focusStats ?? data.totals).repeatPct}
          money={money}
          pct={pct}
        />
      )}

      {/* ── Full revenue report - every useful cut of the same window/scope as
          the tiles above (data.analytics is fetched with identical period +
          clone params). Toggled by the dashed tile in the stats grid. ─────── */}
      {data && reportOpen && (
        <div ref={reportRef} className="scroll-mt-20">
          <RevenueReport
            a={data.analytics}
            scoped={scoped}
            cloneName={focusName ?? "Selected creator"}
            transactions={cloneId ? data.recent.filter((transaction) => transaction.cloneId === cloneId) : data.recent}
            money={money}
            usd={usd}
            pct={pct}
            axisColor={axisColor}
            cursorColor={cursorColor}
            onClose={() => setReportOpen(false)}
          />
        </div>
      )}

      {/* ── Recent transactions - same scope/window as everything above it.
          Server sends up to 300 (fleet-wide, most recent first); scoping to
          one clone filters client-side. Shows 10, "Show more" → 50 → 100. ── */}
      {data && (
        <Card size="sm" className="mt-4">
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink">
              Transactions
              <Info text="Media purchases show Photo, Video, or Bundle with the exact catalogue thumbnail when the original offer is available. Media (untagged) is older Telegram-imported history whose exact item was never recorded." />
            </CardTitle>
            <div className="relative w-40 sm:w-56">
              <svg
                viewBox="0 0 24 24"
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" strokeLinecap="round" />
              </svg>
              <Input
                value={txQuery}
                onChange={(event) => setTxQuery(event.target.value)}
                placeholder="Search transactions…"
                className="h-8 pl-8 text-xs"
              />
            </div>
          </CardHeader>
          <CardContent className="px-0">
            {(() => {
              const q = txQuery.trim().toLowerCase();
              const matches = (cloneId ? data.recent.filter((t) => t.cloneId === cloneId) : data.recent)
                .filter(
                  (t) =>
                    !q ||
                    t.buyerName.toLowerCase().includes(q) ||
                    (t.username?.toLowerCase().includes(q) ?? false) ||
                    t.cloneName.toLowerCase().includes(q) ||
                    (t.mediaName?.toLowerCase().includes(q) ?? false) ||
                    (TX_KIND_LABEL[t.kind] ?? t.kind).toLowerCase().includes(q),
                );
              const rows = matches.slice(0, txLimit);
              const nextLimit = txLimit < 50 ? 50 : txLimit < 100 ? 100 : null;
              if (rows.length === 0) {
                return (
                  <div className="px-4 py-6 text-center text-sm text-muted">
                    {q ? `No transactions match "${txQuery}".` : "No transactions in this window."}
                  </div>
                );
              }
              return (
                <>
                {/* ── PHONE: one card per transaction ─────────────────────────
                    Five columns of fan + clone + item + money + date needed 719px
                    on a 375px screen, so the table scrolled sideways inside its
                    own box and the operator could not see an amount and who paid
                    it at the same time. Same rows, same order, same numbers,
                    stacked instead. The table below takes over at sm. */}
                <div className="divide-y divide-line sm:hidden">
                  {rows.map((t, i) => (
                    <div key={i} className="flex items-start gap-2.5 px-4 py-3">
                      <FanAvatar
                        cloneId={t.cloneId}
                        telegramId={t.telegramId}
                        name={t.buyerName}
                        color={t.cloneColor}
                        className="mt-0.5 h-8 w-8"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-ink">{t.buyerName}</div>
                        <div className="mt-0.5 truncate text-[11px] text-muted">
                          {t.username ? `@${t.username}` : `Fan ${t.telegramId}`}
                          {!scoped && (
                            <>
                              {" · "}
                              <span className="creator-name">{t.cloneName}</span>
                            </>
                          )}
                        </div>
                        <div className="mt-1.5 min-w-0 text-xs text-muted">
                          {t.mediaType ? (
                            <TransactionMedia type={t.mediaType} url={t.mediaUrl} name={t.mediaName} />
                          ) : (
                            <span>{TX_KIND_LABEL[t.kind] ?? t.kind}</span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="money-value font-mono text-sm font-semibold tabular-nums">{money(t.stars)}</div>
                        <div className="text-[11px] text-muted">⭐ {fmtNum(t.stars)}</div>
                        <div className="mt-0.5 text-[10px] text-muted/80">
                          {new Date(t.paidAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fan</TableHead>
                      {!scoped && <TableHead>Creator</TableHead>}
                      <TableHead>Bought</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((t, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <span className="flex items-center gap-2">
                            <FanAvatar
                              cloneId={t.cloneId}
                              telegramId={t.telegramId}
                              name={t.buyerName}
                              color={t.cloneColor}
                            />
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-ink">{t.buyerName}</span>
                              {t.username && <span className="block truncate text-[11px] text-muted">@{t.username}</span>}
                            </span>
                          </span>
                        </TableCell>
                        {!scoped && (
                          <TableCell>
                            <span className="flex items-center gap-1.5">
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.cloneColor }} />
                              <span className="creator-name">{t.cloneName}</span>
                            </span>
                          </TableCell>
                        )}
                        <TableCell className="text-muted">
                          {t.mediaType ? (
                            <TransactionMedia type={t.mediaType} url={t.mediaUrl} name={t.mediaName} />
                          ) : (
                            <span className="capitalize">{TX_KIND_LABEL[t.kind] ?? t.kind}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="money-value block font-mono tabular-nums">{money(t.stars)}</span>
                          <span className="block text-[11px] text-muted">⭐ {fmtNum(t.stars)}</span>
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted">
                          {new Date(t.paidAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
                {nextLimit !== null && matches.length > txLimit && (
                  <div className="border-t border-line px-4 py-2 text-center">
                    <Button variant="ghost" size="sm" onClick={() => setTxLimit(nextLimit)}>
                      Show more ({Math.min(matches.length, nextLimit)})
                    </Button>
                  </div>
                )}
                </>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* ── AI cost drill-in (click a clone in the sidebar) ─────────── */}
      {selected && data && (
        <AiCostDrillIn
          name={data.clones.find((c) => c.id === selected)?.name ?? ""}
          stats={data.perClone[selected]}
          onClose={() => setSelected(null)}
        />
      )}

    </div>
  );
}


// One of the three balance figures shown under the headline when scoped to a
// single clone: value + unambiguous label + ⓘ hint, never bare numbers that
// could be mistaken for one another.
function BalanceStat({
  label,
  hint,
  value,
  money,
  accent,
}: {
  label: string;
  hint: string;
  value: number | null;
  money: (stars: number) => string;
  accent?: "good";
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] text-muted">
        {label}
        <Info text={hint} />
      </div>
      <div className={"mt-0.5 font-mono text-sm font-semibold tabular-nums " + (accent === "good" ? "money-value-primary" : "money-value")}>
        {value != null ? `${money(value)} · ⭐${fmtNum(value)}` : "unavailable"}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-40 flex-col items-center justify-center text-center text-muted">
      <div className="text-2xl">📊</div>
      <div className="mt-2 text-sm">No data in this period yet.</div>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  clones,
  money,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number }[];
  label?: string;
  clones: { id: string; name: string; color: string }[];
  money: (stars: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const byId = new Map(clones.map((c) => [c.id, c]));
  const rows = payload.filter((p) => p.value > 0);
  const total = rows.reduce((s, p) => s + p.value, 0);
  return (
    <div className="rounded-lg border border-line bg-panel p-3 text-xs shadow-[var(--shadow-card)]">
      <div className="mb-2 font-medium text-ink">{label}</div>
      {rows.map((p) => {
        const c = byId.get(p.dataKey);
        return (
          <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-2 text-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: c?.color }} />
              <span className="creator-name">{c?.name ?? p.dataKey}</span>
            </span>
            <span className="money-value font-mono tabular-nums">{money(p.value)}</span>
          </div>
        );
      })}
      <div className="mt-2 flex justify-between border-t border-line pt-2 font-medium">
        <span>Total</span>
        <span className="money-value font-mono tabular-nums">{money(total)}</span>
      </div>
    </div>
  );
}

// ── Full revenue report ─────────────────────────────────────────────────────
// Every money cut the API computes, in one collapsible section: what sells
// (byFeature), who pays (byTier), which clone/flow earns (unscoped only),
// when the money lands (byHour/byDow), and the two funnels. All of it follows
// the page's period + clone scope because it reads the same fetched payload.

function RevenueReport({
  a,
  scoped,
  cloneName,
  transactions,
  money,
  usd,
  pct,
  axisColor,
  cursorColor,
  onClose,
}: {
  a: AnalyticsData;
  scoped: boolean;
  cloneName: string;
  transactions: DashboardData["recent"];
  money: (stars: number) => string;
  usd: (n: number) => string;
  pct: (n: number) => string;
  axisColor: string;
  cursorColor: string;
  onClose: () => void;
}) {
  const [selectedMedia, setSelectedMedia] = useState<"photo" | "video" | "bundle" | null>(null);
  // The report uses the same Atlas palette as the rest of the dashboard.
  // Pink handles Other/untagged buckets so no data bars fall back to grey.
  const CAT = { blue: "#0a2540", aqua: "#4a8ec4", yellow: "#d7952d", violet: "#2f7eb8", red: "#c9364f", pink: "#f05a9d" };

  const featureColor = (k: string) =>
    k === "credits"
      ? CAT.blue
      : k === "photo"
        ? CAT.violet
        : k === "video"
          ? CAT.aqua
          : k === "bundle"
            ? CAT.red
            : k === "tip"
              ? CAT.yellow
              : k === "subscription"
                ? CAT.aqua
                : CAT.pink;
  const tierColor = (k: string) =>
    k === "whale" ? CAT.violet : k === "high" ? CAT.blue : k === "mid" ? CAT.aqua : k === "low" ? CAT.yellow : CAT.pink;
  const flowColor = (k: string) => (k === "smart" ? CAT.violet : CAT.blue);

  const totalStars = a.totals.revenueStars;
  const hasRevenue = totalStars > 0;
  // Every bucket byFeature returns, in product order, catch-alls last. The order
  // and the "show at zero" rule live in lib/report-features.ts because this list
  // used to be inline and named six of the eight buckets, so the two it left out
  // vanished from the panel while the headline still counted them (#600).
  const reportFeatures = reportFeatureRows(a.byFeature);
  const selectedPurchases = selectedMedia
    ? transactions.filter((transaction) => transaction.mediaType === selectedMedia)
    : [];

  // Headline facts — only the ones the data actually supports right now.
  const topFeature = topFeatureRow(a.byFeature);
  const topClone = a.clones[0];
  const whale = a.byTier.find((t) => t.key === "whale");
  const bestHour = hasRevenue ? a.byHour.reduce((m, h) => (h.stars > m.stars ? h : m)) : null;
  const bestDow = hasRevenue ? a.byDow.reduce((m, d) => (d.stars > m.stars ? d : m)) : null;
  const facts: { label: string; value: string; moneyValue?: string; isName?: boolean }[] = [];
  if (topFeature && topFeature.stars > 0)
    facts.push({ label: "Top earner", value: `${topFeature.label} · ${pct(topFeature.share)}` });
  if (!scoped && topClone && topClone.revenueStars > 0)
    facts.push({ label: "Top creator", value: topClone.name, moneyValue: money(topClone.revenueStars), isName: true });
  if (whale && whale.stars > 0) facts.push({ label: "Whale share", value: `${pct(whale.share)} of lifetime spend` });
  // The zone is printed, not assumed. These were computed on the container's
  // UTC clock and labelled nothing at all, so "Peak hour 3 AM" was really 1 PM
  // and evening sales landed on the previous weekday. See lib/report-time.ts.
  const tz = reportTzLabel();
  if (bestHour && bestHour.stars > 0) facts.push({ label: "Peak hour", value: `${bestHour.label} ${tz}` });
  if (bestDow && bestDow.stars > 0) facts.push({ label: "Peak day", value: `${bestDow.label} ${tz}` });

  // Every earning clone, not the top 8 of 12. The cut was silent, and a table
  // that drops a third of the fleet reads as the whole fleet.
  const earningClones = a.clones.filter((c) => c.revenueStars > 0 || c.sales > 0);

  return (
    <Card size="sm" className="mt-4">
      <CardHeader className="rounded-xl bg-[#06172f] px-3 py-2.5 text-white shadow-[0_10px_30px_rgba(6,23,47,0.2)] sm:px-4 sm:py-3">
        <CardTitle className="text-xs font-bold uppercase tracking-[0.14em] text-white sm:text-sm">Revenue report</CardTitle>
        {/* Four lines of subtitle on a phone, above any data. Hidden there, and
            the ⓘ on the Close row is not the place for it either: the panel titles
            below each carry their own hint. */}
        <CardDescription className="hidden text-[11px] text-white/70 sm:block">
          {/* "in this window" used to cover the whole list, but the spender tier
              and buyer breakdown panels are lifetime and say so on themselves.
              A subtitle that contradicts the panel under it is how a lifetime
              number gets read as a windowed one. */}
          Where the money comes from: product, {scoped ? "" : "creator, "}time and funnel for this window, plus spender tiers and buyer behaviour over each fan&apos;s lifetime.
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-white hover:bg-white/10 hover:text-white">
            Close
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-2.5 sm:px-(--card-spacing)">
        {/* Key facts */}
        {facts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {facts.map((f) => (
              <span key={f.label} className="inline-flex items-baseline gap-1.5 rounded-full bg-elev px-2.5 py-1 text-[11px]">
                <span className="text-muted">{f.label}</span>
                <span className={(f.isName ? "creator-name " : "") + "font-medium text-ink"}>{f.value}</span>
                {f.moneyValue && <span className="money-value font-mono font-semibold tabular-nums">· {f.moneyValue}</span>}
              </span>
            ))}
          </div>
        )}

        {/* What sells + who pays */}
        <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <ReportPanel
            title="What sells"
            hint="Revenue by feature, with sales and average per sale. Every Star in this window sits in one of these rows, so untagged and other sales are listed too and the rows add up to the proceeds above."
          >
            {reportFeatures.length === 0 ? (
              <ReportEmpty text="No sales in this window." />
            ) : (
              <div className="flex flex-col gap-3">
                {reportFeatures.map((f) => {
                  const drillable = scoped && (f.key === "photo" || f.key === "video" || f.key === "bundle");
                  const categoryClassName =
                    "rounded-xl border border-[#4a8ec4]/35 bg-[#b9daf1]/18 p-3 text-left transition hover:border-[#4a8ec4]/70 hover:bg-[#b9daf1]/34";
                  const row = (
                    <ShareRow
                      color={featureColor(f.key)}
                      label={f.label}
                      share={f.share}
                      right={money(f.stars)}
                      rightHint={pct(f.share)}
                      sub={`${fmtNum(f.sales)} sale${f.sales === 1 ? "" : "s"}`}
                      subMoney={`avg ${money(f.avgStars)} per sale`}
                    />
                  );
                  return drillable ? (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setSelectedMedia(f.key as "photo" | "video" | "bundle")}
                      className={`${categoryClassName} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4a8ec4]/55`}
                    >
                      {row}
                      <span className="mt-2 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#0d3d6e]">
                        View purchased items →
                      </span>
                    </button>
                  ) : (
                    <div key={f.key} className={categoryClassName}>{row}</div>
                  );
                })}
              </div>
            )}
          </ReportPanel>

          <ReportPanel title="Who pays" hint="Top spenders from the last 7 days, followed by lifetime spend tiers.">
            <div className="flex flex-col gap-4">
              <div>
                <div className="mb-2 flex items-end justify-between gap-3">
                  <div>
                    <h4 className="inline-flex rounded-lg bg-[#0d3d6e] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white shadow-sm">Top 5 weekly spenders</h4>
                    <p className="text-[10px] text-muted">Rolling seven days in the current creator scope.</p>
                  </div>
                  <div className="text-right">
                    <div className="money-value font-mono text-sm font-semibold tabular-nums">{money(a.weeklySpenderSummary.stars)}</div>
                    <div className="text-[10px] text-muted">{fmtNum(a.weeklySpenderSummary.buyers)} buyers · {fmtNum(a.weeklySpenderSummary.purchases)} purchases</div>
                  </div>
                </div>
                {a.topWeeklySpenders.length === 0 ? (
                  <div className="rounded-xl bg-surface px-3 py-5 text-center text-xs text-muted">No spenders in the last 7 days.</div>
                ) : (
                  <div className="grid gap-1.5">
                    {a.topWeeklySpenders.map((spender, index) => (
                      // min-w-0 because this is a GRID item: a grid track sizes to
                      // its item's min-content width unless told otherwise, so
                      // without it the fixed-width rank/avatar/amount forced the
                      // row 20px wider than the panel and it crossed the border.
                      <div key={`${spender.cloneId ?? "unknown"}:${spender.telegramId}`} className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-surface/75 px-2.5 py-2 sm:gap-2.5 sm:px-3">
                        <span className="w-4 shrink-0 font-mono text-[10px] font-semibold text-muted">#{index + 1}</span>
                        <FanAvatar
                          cloneId={spender.cloneId ?? ""}
                          telegramId={spender.telegramId}
                          name={spender.name}
                          color={CAT.aqua}
                          className="h-8 w-8"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-ink">{spender.name}</span>
                          <span className="block truncate text-[10px] text-muted">
                            {spender.username ? `@${spender.username}` : `Fan ${spender.telegramId}`}
                            {!scoped ? (
                              <>
                                {" · "}
                                <span className="creator-name">{spender.cloneName}</span>
                              </>
                            ) : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="money-value block font-mono text-xs font-semibold tabular-nums">{money(spender.stars)}</span>
                          {/* Two lines on a phone, one from sm up: as a single line
                              this was the widest fixed thing in the row. */}
                          <span className="block text-[10px] leading-tight text-muted">
                            ⭐ {fmtNum(spender.stars)}
                            <span className="hidden sm:inline"> · </span>
                            <span className="block sm:inline">{fmtNum(spender.purchases)} buys</span>
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {a.weeklySpenderSummary.buyers > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <InsightMetric label="Avg per weekly buyer" value={money(a.weeklySpenderSummary.avgStars)} />
                    <InsightMetric
                      label="Purchases per buyer"
                      value={(a.weeklySpenderSummary.purchases / a.weeklySpenderSummary.buyers).toFixed(1)}
                    />
                  </div>
                )}
              </div>

              <div className="border-t border-line pt-3">
                <h4 className="mb-1 inline-flex rounded-lg bg-[#0d3d6e] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white shadow-sm">Lifetime spend tiers</h4>
                <p className="mb-3 text-[10px] text-muted">How the full fan base is distributed by lifetime value.</p>
                {a.byTier.length === 0 ? (
                  <ReportEmpty text="No fans yet." />
                ) : (
                  <div className="flex flex-col gap-3">
                    {a.byTier.map((t) => (
                      <ShareRow
                        key={t.key}
                        color={tierColor(t.key)}
                        label={t.label}
                        share={t.share}
                        right={money(t.stars)}
                        rightHint={pct(t.share)}
                        sub={`${fmtNum(t.users)} fan${t.users === 1 ? "" : "s"}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ReportPanel>
        </div>

        {/* Which clone / which flow - fleet view only (scoped = one clone already) */}
        {!scoped && (
          <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
            <ReportPanel title="By creator" hint="Ranked by revenue. Profit = revenue minus real AI/voice cost.">
              {earningClones.length === 0 ? (
                <ReportEmpty text="No creator earned in this window." />
              ) : (
                <>
                {/* ── PHONE: one card per clone ───────────────────────────────
                    Six numeric columns wanted 493px inside a 283px panel. Same
                    six figures, labelled, in a 3-up grid under the name. */}
                <div className="flex flex-col gap-2 lg:hidden">
                  {earningClones.map((c) => (
                    <div key={c.id} className="rounded-xl border border-line bg-surface/75 px-3 py-2.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                          <span className="creator-name truncate text-xs font-semibold text-ink">{c.name}</span>
                        </span>
                        <span className="money-value shrink-0 font-mono text-sm font-semibold tabular-nums">
                          {money(c.revenueStars)}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                        {[
                          { k: "Share", v: totalStars > 0 ? pct(c.revenueStars / totalStars) : "-" },
                          { k: "Profit", v: usd(c.profitUsd), money: true },
                          { k: "Margin", v: c.revenueStars > 0 ? pct(c.margin) : "-" },
                          { k: "Sales", v: fmtNum(c.sales) },
                        ].map((cell) => (
                          <span key={cell.k} className="min-w-0">
                            <span className="block uppercase tracking-wide text-muted">{cell.k}</span>
                            <span
                              className={
                                "mt-0.5 block truncate font-mono text-xs font-semibold tabular-nums " +
                                (cell.money ? "money-value" : "text-ink")
                              }
                            >
                              {cell.v}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Creator</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Share</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                      <TableHead className="text-right">Sales</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {earningClones.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                            <span className="creator-name truncate text-ink">{c.name}</span>
                          </span>
                        </TableCell>
                        <TableCell className="money-value text-right font-mono tabular-nums">{money(c.revenueStars)}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-muted">
                          {totalStars > 0 ? pct(c.revenueStars / totalStars) : "-"}
                        </TableCell>
                        <TableCell className="money-value text-right font-mono tabular-nums">
                          {usd(c.profitUsd)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-muted">
                          {c.revenueStars > 0 ? pct(c.margin) : "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-muted">{fmtNum(c.sales)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
                </>
              )}
            </ReportPanel>

            <ReportPanel title="Classic vs Smart" hint="Revenue split by each creator's AI flow.">
              {a.byFlow.length === 0 ? (
                <ReportEmpty text="No flow data." />
              ) : (
                <div className="flex flex-col gap-3">
                  {a.byFlow.map((f) => (
                    <ShareRow
                      key={f.key}
                      color={flowColor(f.key)}
                      label={f.label}
                      share={f.share}
                      right={money(f.stars)}
                      rightHint={pct(f.share)}
                      sub={`${fmtNum(f.clones)} creator${f.clones === 1 ? "" : "s"} · ${fmtNum(f.sales)} sales`}
                      subMoney={`profit ${usd(f.profitUsd)}`}
                    />
                  ))}
                </div>
              )}
            </ReportPanel>
          </div>
        )}

        {/* When the money lands */}
        <div className="grid gap-3 lg:grid-cols-2">
          <ReportPanel title="Peak hours" hint="Revenue by hour of day (server time), summed across the window.">
            {!hasRevenue ? (
              <ReportEmpty text="No revenue in this window." />
            ) : (
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={a.byHour} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} tickLine={false} interval={2} />
                    <YAxis
                      tick={{ fill: "#06172f", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={56}
                      tickFormatter={(v: number) => money(v).replace(/\.00$/, "")}
                    />
                    <Tooltip cursor={{ fill: cursorColor }} content={<SingleValueTip money={money} />} />
                    <Bar dataKey="stars" radius={[3, 3, 0, 0]} fill={CAT.violet} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ReportPanel>

          <ReportPanel title="Peak days" hint="Revenue by day of week, summed across the window.">
            {!hasRevenue ? (
              <ReportEmpty text="No revenue in this window." />
            ) : (
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={a.byDow} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fill: "#06172f", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={56}
                      tickFormatter={(v: number) => money(v).replace(/\.00$/, "")}
                    />
                    <Tooltip cursor={{ fill: cursorColor }} content={<SingleValueTip money={money} />} />
                    <Bar dataKey="stars" radius={[3, 3, 0, 0]} fill={CAT.aqua} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ReportPanel>
        </div>

        {/* Conversion and buyer behaviour */}
        <div className="grid items-start gap-3 xl:grid-cols-2">
          <ReportPanel
            title="Paid-message paywall"
            hint="Current window: distinct fans who chatted, reached the message limit, then bought more messages."
          >
            <div className="flex flex-col gap-4">
              <div className="grid gap-2">
                <JourneyStep
                  step="1"
                  label="Chatted with the creator"
                  value={fmtNum(a.paywallFunnel.messaged)}
                  note="Unique fans who sent at least one message."
                  color={CAT.blue}
                />
              {a.paywallFunnel.collecting ? (
                  <div className="rounded-xl border border-[#d7952d]/30 bg-[#d7952d]/8 px-3 py-2 text-[11px] leading-relaxed text-muted">
                    Paywall-view tracking is not available yet. Chat and paid-message purchase totals are still shown below.
                  </div>
              ) : (
                  <JourneyStep
                    step="2"
                    label="Reached the message limit"
                    value={fmtNum(a.paywallFunnel.paywalled)}
                    note={`${pct(a.paywallFunnel.paywallPct)} of chatting fans · ${fmtNum(a.paywallFunnel.paywallViews)} total paywall views`}
                  color={CAT.yellow}
                />
              )}
                <JourneyStep
                  step="3"
                  label="Bought more messages"
                  value={fmtNum(a.paywallFunnel.purchased)}
                  note={
                    a.paywallFunnel.collecting
                      ? `${fmtNum(a.paywallFunnel.paidMessageBuyers)} paid-message buyers in this window`
                      : `${pct(a.paywallFunnel.purchasePct)} of paywalled fans converted`
                  }
                  color={CAT.aqua}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <InsightMetric label="Overall conversion" value={pct(a.paywallFunnel.overallPct)} hint="chatters → buyers" />
                <InsightMetric label="Left without buying" value={fmtNum(a.paywallFunnel.abandoned)} hint="after seeing paywall" />
                <InsightMetric label="Avg paywall views" value={a.paywallFunnel.avgViewsPerFan.toFixed(1)} hint="per reached fan" />
                <InsightMetric label="Paid-message buyers" value={fmtNum(a.paywallFunnel.paidMessageBuyers)} hint="unique this window" />
                <InsightMetric label="Message purchases" value={fmtNum(a.paywallFunnel.paidMessagePurchases)} hint="transactions" />
                <InsightMetric label="Message revenue" value={money(a.paywallFunnel.paidMessageStars)} hint={`⭐ ${fmtNum(a.paywallFunnel.paidMessageStars)}`} moneyValue />
              </div>
            </div>
          </ReportPanel>

          <ReportPanel title="Buyer breakdown" hint="Lifetime purchase behaviour for every fan in the current creator scope.">
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <InsightMetric label="All fans" value={fmtNum(a.funnel.fans)} />
                <InsightMetric label="Buyers" value={fmtNum(a.funnel.buyers)} hint={`${pct(a.funnel.buyerPct)} of fans`} />
                <InsightMetric label="Never purchased" value={fmtNum(a.funnel.nonBuyers)} hint={`${pct(1 - a.funnel.buyerPct)} of fans`} />
                <InsightMetric label="One-time buyers" value={fmtNum(a.funnel.oneTime)} hint={`${pct(a.funnel.oneTimePct)} of buyers`} />
                <InsightMetric label="Repeat buyers" value={fmtNum(a.funnel.repeat)} hint={`${pct(a.funnel.repeatPct)} of buyers`} />
                <InsightMetric label="3+ purchase buyers" value={fmtNum(a.funnel.threePlus)} hint="loyal buyers" />
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <InsightMetric label="Purchases / buyer" value={a.funnel.avgPurchasesPerBuyer.toFixed(1)} />
                <InsightMetric label="Avg buyer value" value={money(a.funnel.avgStarsPerBuyer)} moneyValue />
                <InsightMetric label="Median buyer value" value={money(a.funnel.medianStarsPerBuyer)} moneyValue />
                <InsightMetric label="Repeat revenue" value={pct(a.funnel.repeatRevenueShare)} hint="from repeat buyers" />
              </div>

              <div className="rounded-xl bg-surface/75 px-3 py-2 text-[10px] leading-relaxed text-muted">
                One-time buyers have exactly one recorded purchase. Repeat buyers have two or more; loyal buyers have three or more. Buyer value uses lifetime spend, so it is not limited by the date filter above.
              </div>
            </div>
          </ReportPanel>
        </div>

        <Dialog open={selectedMedia !== null} onOpenChange={(open) => !open && setSelectedMedia(null)}>
          <DialogContent className="w-[min(880px,calc(100vw-2rem))] max-w-none sm:max-w-none">
            <DialogHeader>
              <DialogTitle>
                <span className="creator-name">{cloneName}</span> · Purchased {selectedMedia === "photo" ? "photos" : selectedMedia === "video" ? "videos" : "bundles"}
              </DialogTitle>
              <p className="text-xs text-muted">Most recent matching purchases in the selected revenue window.</p>
            </DialogHeader>
            {selectedPurchases.length === 0 ? (
              <div className="rounded-xl border border-line bg-surface px-4 py-10 text-center text-sm text-muted">
                No item-level purchases are available for this category in the current window.
              </div>
            ) : (
              <div className="grid max-h-[62vh] gap-2 overflow-y-auto pr-1 md:grid-cols-2">
                {selectedPurchases.map((purchase, index) => {
                  const content = (
                    <>
                      <TransactionMedia
                        type={selectedMedia ?? "photo"}
                        url={purchase.mediaUrl}
                        name={purchase.mediaName}
                      />
                      <span className="min-w-0 flex-1 text-right">
                        <span className="money-value block font-mono text-sm font-semibold tabular-nums">{money(purchase.stars)}</span>
                        <span className="block truncate text-[11px] text-muted">{purchase.buyerName}</span>
                        <span className="block text-[10px] text-muted/75">
                          {new Date(purchase.paidAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </span>
                    </>
                  );
                  const className =
                    "flex items-center gap-3 rounded-xl border border-line bg-panel p-3 text-left shadow-sm transition hover:border-[#4a8ec4]/60 hover:bg-[#b9daf1]/18";
                  return purchase.mediaUrl ? (
                    <a
                      key={`${purchase.paidAt}-${purchase.telegramId ?? "unknown"}-${index}`}
                      href={purchase.mediaUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={className}
                      title="Open purchased media"
                    >
                      {content}
                    </a>
                  ) : (
                    <div key={`${purchase.paidAt}-${purchase.telegramId ?? "unknown"}-${index}`} className={className}>
                      {content}
                    </div>
                  );
                })}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// Mobile first: p-2.5 on a phone, p-4 from sm up. This panel sits inside a
// CardContent inside a Card, so three levels of 1rem padding were eating 60 of a
// 375px screen and leaving the content 283px wide. The hint moves into an
// ⓘ-hover at phone width for the same reason: as a paragraph it was taller than
// the data underneath it. Desktop keeps the visible sentence.
function ReportPanel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-line p-2.5 sm:p-4">
      <div className="mb-2.5 rounded-xl bg-[#06172f] px-3 py-2 shadow-[0_7px_20px_rgba(6,23,47,0.16)] sm:mb-3 sm:py-2.5">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.13em] text-white">
          {title}
          {hint && <Info text={hint} className="text-white/70 sm:hidden" />}
        </h3>
        {hint && <p className="mt-0.5 hidden text-[10px] leading-relaxed text-white/65 sm:block">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function ReportEmpty({ text }: { text: string }) {
  return <div className="flex h-24 items-center justify-center text-xs text-muted">{text}</div>;
}

// A labeled share bar: identity dot + label, value on the right, bar underneath.
// Values are always printed in text (never color-alone), per the page's dataviz rules.
function ShareRow({
  color,
  label,
  share,
  right,
  rightHint,
  sub,
  subMoney,
}: {
  color: string;
  label: string;
  share: number;
  right: string;
  rightHint?: string;
  sub?: string;
  subMoney?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2 text-xs">
        <span className="h-2 w-2 shrink-0 self-center rounded-full" style={{ background: color }} />
        <span className="min-w-0 flex-1 truncate text-ink">{label}</span>
        {rightHint && <span className="font-mono tabular-nums text-muted">{rightHint}</span>}
        <span className="money-value font-mono font-semibold tabular-nums">{right}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted/10">
        <div
          className="h-full rounded-full"
          style={{ width: `${share > 0 ? Math.min(100, Math.max(2, share * 100)) : 0}%`, background: color }}
        />
      </div>
      {(sub || subMoney) && (
        <div className="mt-1 flex flex-wrap gap-x-1 text-[11px] text-muted">
          {sub && <span>{sub}</span>}
          {subMoney && <span className="money-value font-medium">· {subMoney}</span>}
        </div>
      )}
    </div>
  );
}

// A duration a person reads, not a float. 0.4h is "24 min", 4.13h is "4.1h",
// 61h is "2.5d". Exported-shaped as a plain function because check-conversation
// -funnel.ts asserts the boundaries: "0h" for a median that is really 3 minutes
// would read as instant, and instant is a claim.
export function fmtHours(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return "-";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

// ── Jesse's seven conversation numbers ──────────────────────────────────────
//
// Five come from migration 125 (lib/rollup.ts conversationFunnel). The other
// two are computed here from figures already on this page, deliberately:
//
//   revenue per conversation = the SAME window revenue the headline shows,
//     divided by the same `conversations` the four rates above it divide by.
//     Not a second revenue definition, and not net of anything: Ronan's
//     decision of 2026-08-21 is that the totals stay whole.
//   repeat purchase rate     = totals.repeatPct, the value the "Repeat rate"
//     tile already renders. Read, not recomputed, so the two can never drift.
//
// THE COHORT IS A CONVERSATION, NOT A PERSON: one clone plus one fan. Someone
// talking to two clones is two conversations, because a rate about how a clone
// converses is a rate per clone. The "Buyers" tile above dedupes people instead,
// on purpose, because money paid twice by one person is one person's money.
//
// WHY "STARTED" IS NOT "SENT A MESSAGE". A users row is INSERTED by the fan's
// first message, so arrived and messaged are the same population and the naive
// rate is ~100% forever (4,313 of 4,315 over 7 days, measured 2026-08-21).
// There is no impression signal upstream of that in this database. So it counts
// arrivals who got past the first message, which is the stage fans actually
// fall out of, and the hint under the tile says so rather than leaving a reader
// to assume the definition that would have been useless.
function ConversationFunnelPanel({
  f,
  windowStars,
  buyers,
  repeatPct,
  money,
  pct,
}: {
  f: AnalyticsData["conversationFunnel"];
  windowStars: number;
  buyers: number;
  repeatPct: number;
  money: (stars: number) => string;
  pct: (n: number) => string;
}) {
  const rate = (a: number, b: number) => (b > 0 ? pct(a / b) : "-");
  const repeatBuyers = Math.round(repeatPct * buyers);
  const metrics: { label: string; value: string; hint: string; moneyValue?: boolean }[] = [
    {
      label: "Conversation start rate",
      value: rate(f.arrivalsStarted, f.arrivals),
      hint: `${fmtNum(f.arrivalsStarted)} of ${fmtNum(f.arrivals)} new fans sent more than one message`,
    },
    {
      label: "Meaningful conversation rate",
      value: rate(f.meaningful, f.conversations),
      hint: `${fmtNum(f.meaningful)} of ${fmtNum(f.conversations)} reached 5+ messages from the fan`,
    },
    {
      label: "Offer exposure rate",
      value: rate(f.offered, f.conversations),
      hint: `${fmtNum(f.offered)} were shown a paywall or a locked item`,
    },
    {
      label: "Offer to purchase",
      value: rate(f.offeredBought, f.offered),
      hint: `${fmtNum(f.offeredBought)} of ${fmtNum(f.offered)} bought after seeing an offer`,
    },
    {
      label: "Time to first purchase",
      value: fmtHours(f.ttfpMedianHours),
      // n, always. A median over 7 fans and a median over 700 are different
      // claims and the number alone cannot tell them apart.
      hint: f.ttfpN > 0 ? `median, ${fmtNum(f.ttfpN)} first-time buyers` : "no first purchases in this window",
    },
    {
      label: "Revenue per conversation",
      value: f.conversations > 0 ? money(windowStars / f.conversations) : "-",
      hint: `across ${fmtNum(f.conversations)} conversations`,
      moneyValue: true,
    },
    {
      label: "Repeat purchase rate",
      value: pct(repeatPct),
      hint: `${fmtNum(repeatBuyers)} of ${fmtNum(buyers)} buyers bought more than once`,
    },
  ];

  return (
    <Card size="sm" className="mt-4">
      <CardHeader className="space-y-0 pb-1">
        <CardTitle className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink">
          Conversation funnel
          <Info text="How a conversation turns into money, in the window and scope selected above. A conversation is one creator and one fan, so the same person talking to two creators counts twice here, unlike the Buyers tile which counts people. Conversation start rate counts new fans who got past their first message: a fan record is created BY the first message, so 'sent a message' would read 100% forever. Offer to purchase excludes old n8n subscription renewals, which Telegram auto-renews without Twin raising an invoice. Revenue per conversation is the same headline revenue shown above, undivided and unfiltered." />
        </CardTitle>
        <CardDescription className="text-[11px]">
          Seven numbers, same window as the tiles above.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-4 xl:grid-cols-7">
        {metrics.map((m) => (
          <InsightMetric key={m.label} label={m.label} value={m.value} hint={m.hint} moneyValue={m.moneyValue} />
        ))}
      </CardContent>
    </Card>
  );
}

function InsightMetric({
  label,
  value,
  hint,
  moneyValue = false,
}: {
  label: string;
  value: string;
  hint?: string;
  moneyValue?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface/75 px-3 py-2.5">
      <div className="truncate text-[9px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className={`mt-1 truncate font-mono text-base font-semibold tabular-nums ${moneyValue ? "money-value" : "text-ink"}`}>
        {value}
      </div>
      {hint && <div className="mt-0.5 truncate text-[10px] text-muted">{hint}</div>}
    </div>
  );
}

function JourneyStep({
  step,
  label,
  value,
  note,
  color,
}: {
  step: string;
  label: string;
  value: string;
  note: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface/75 px-3 py-2.5">
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
        style={{ background: color }}
      >
        {step}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-ink">{label}</span>
        <span className="block text-[10px] leading-relaxed text-muted">{note}</span>
      </span>
      <span className="shrink-0 font-mono text-lg font-semibold tabular-nums text-ink">{value}</span>
    </div>
  );
}

function FunnelRow({
  label,
  value,
  width,
  color,
  note,
}: {
  label: string;
  value: number;
  width: number;
  color: string;
  note?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-mono font-semibold tabular-nums text-ink">{fmtNum(value)}</span>
      </div>
      {/* Clamp to 100% - distinct-fan stages can exceed the base (e.g. more
          paywall hits than chatters when the window edges split a session). */}
      <div className="h-5 w-full overflow-hidden rounded-md bg-muted/10">
        <div
          className="h-full rounded-md"
          style={{ width: `${value > 0 ? Math.min(100, Math.max(3, width * 100)) : 0}%`, background: color }}
        />
      </div>
      {note && <div className="mt-1 text-[11px] text-muted">{note}</div>}
    </div>
  );
}

// Tooltip for the single-series time charts (hour / day-of-week).
function SingleValueTip({
  active,
  payload,
  label,
  money,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  money: (stars: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-panel p-3 text-xs shadow-[var(--shadow-card)]">
      <div className="mb-1 font-medium text-ink">{label}</div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted">Revenue</span>
        <span className="money-value font-mono tabular-nums">{money(payload[0].value)}</span>
      </div>
    </div>
  );
}

function AiCostDrillIn({
  name,
  stats,
  onClose,
}: {
  name: string;
  stats: import("@/lib/dashboard-data").CloneStats;
  onClose: () => void;
}) {
  const tiles: { label: string; value: string; money?: boolean }[] = [
    { label: "AI cost", value: `$${stats.costUsd.toFixed(2)}`, money: true },
    { label: "Profit (USD)", value: `$${(stats.stars / 50 - stats.costUsd).toFixed(2)}`, money: true },
    { label: "AI calls", value: fmtNum(stats.aiCalls) },
    { label: "AI errors", value: fmtNum(stats.aiErrors) },
  ];
  return (
    <Card size="sm" className="mt-4">
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-ink">
          <span className="creator-name">{name}</span> · AI cost
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-md border border-line bg-bg p-2.5">
              <div className="text-[11px] text-muted">{t.label}</div>
              <div className={"mt-0.5 font-mono text-lg font-semibold tabular-nums " + (t.money ? "money-value" : "text-ink")}>{t.value}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
