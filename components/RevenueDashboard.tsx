"use client";

import Link from "next/link";
import SharedOverview, { type SharedOverviewConfig } from "@/components/overview/SharedOverview";
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
import { fmtMoney, fmtNum, STAR_USD, starsToMoneyRate, usdToMoneyRate } from "@/lib/money";
import { intraPeriodTrendPct } from "@/lib/revenue-trend";
import { useCurrency } from "@/components/CurrencyProvider";
import { useDashboardAccess } from "@/components/DashboardAccessProvider";
import CreatorAvatar from "@/components/CreatorAvatar";

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

export type FullData = DashboardData & {
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
  refund: "Refund / adjustment",
  other: "Other",
};

function TransactionMedia({
  type,
  url,
  name,
  compact = false,
}: {
  type: "photo" | "video" | "bundle";
  url: string | null;
  name: string | null;
  compact?: boolean;
}) {
  const label = TX_KIND_LABEL[type];
  return (
    // min-w-0 on mobile, not min-w-[132px]: this sits in a table cell on desktop
    // and a flex card row on a phone, and a hard min-width there is one of the
    // things that pushed this page past the viewport.
    <span className="flex min-w-0 items-center gap-2.5 sm:min-w-[132px]" title={name || label}>
      <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-surface text-accent ${compact ? "h-8 w-8" : "h-10 w-10"}`}>
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

type LedgerSortKey = "fan" | "creator" | "type" | "amount" | "date";
type LedgerSortDirection = "asc" | "desc";

function ledgerTypeLabel(transaction: DashboardData["recent"][number]) {
  if (transaction.mediaType) return TX_KIND_LABEL[transaction.mediaType] ?? transaction.mediaType;
  return TX_KIND_LABEL[transaction.kind] ?? transaction.kind;
}

function LedgerSortHead({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  align = "left",
  className = "",
}: {
  label: string;
  sortKey: LedgerSortKey;
  activeKey: LedgerSortKey;
  direction: LedgerSortDirection;
  onSort: (key: LedgerSortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = activeKey === sortKey;
  const nextDirection = active && direction === "asc" ? "descending" : "ascending";
  return (
    <TableHead
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={`h-8 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${label}, ${nextDirection}`}
        className={`flex h-full w-full items-center gap-1 rounded-[3px] transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
          align === "right" ? "justify-end text-right" : "justify-start text-left"
        }`}
      >
        <span>{label}</span>
        <span aria-hidden="true" className={active ? "text-ink" : "text-muted/60"}>
          {active ? (direction === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </TableHead>
  );
}

const REVENUE_REFRESH_MS = 60 * 1000;

function snapshotAgeLabel(ageSeconds: number) {
  if (ageSeconds <= 5) return "Updated just now";
  if (ageSeconds < 60) return `Updated ${ageSeconds}s ago`;
  const minutes = Math.floor(ageSeconds / 60);
  return `Updated ${minutes}m ago`;
}

export default function RevenueDashboard({ cloneId, dayDetailAvailable = true, sharedOverview }: { cloneId?: string | null; dayDetailAvailable?: boolean; sharedOverview?: SharedOverviewConfig } = {}) {
  const { isCreator, isAgency } = useDashboardAccess();
  const scoped = Boolean(cloneId);
  const [showDetailed, setShowDetailed] = useState(false);
  const [period, setPeriod] = useState<Period>("1M");
  // Custom calendar range (yyyy-mm-dd strings, straight from <input type="date">).
  // When set, it overrides every preset period — the "Custom" pill lights up
  // instead of any of the fixed-window pills.
  const [customRange, setCustomRange] = useState<{ start: string; end: string } | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const draftStartRef = useRef<HTMLInputElement>(null);
  const draftEndRef = useRef<HTMLInputElement>(null);
  const [chartType, setChartType] = useState<"bar" | "line">("bar");
  const [chartMode, setChartMode] = useState<"total" | "creator">("total");
  const [analysisView, setAnalysisView] = useState<"customers" | "journey">("customers");
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
  const [txSort, setTxSort] = useState<{ key: LedgerSortKey; direction: LedgerSortDirection }>({
    key: "date",
    direction: "desc",
  });
  // Transactions shown: 10 by default, "Show more" steps to 50 then 100 (max).
  const [txLimit, setTxLimit] = useState(10);
  // Full revenue report — expands below the stats grid from its teaser tile.
  const [reportOpen, setReportOpen] = useState(false);
  const reportRef = useRef<HTMLDivElement | null>(null);
  const newestRequest = useRef(0);

  // Recharts colors are inline JS (not CSS classes) so they don't pick up the
  // light-mode constants rather than theme-conditional.
  const axisColor = "#607086";
  const gridColor = "#e3e8ef";
  const cursorColor = "rgba(47,111,237,0.07)";
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
    // Read the native fields as well as controlled state. Some mobile date
    // pickers only commit their value at the next click; Apply is that commit.
    const start = draftStartRef.current?.value || draftStart;
    const end = draftEndRef.current?.value || draftEnd;
    if (!start || !end) return;
    setDraftStart(start);
    setDraftEnd(end);
    setCustomRange({ start, end });
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

  function toggleTxSort(key: LedgerSortKey) {
    setTxSort((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: key === "amount" || key === "date" ? "desc" : "asc" };
    });
  }

  function selectTxSort(key: LedgerSortKey) {
    setTxSort({ key, direction: key === "amount" || key === "date" ? "desc" : "asc" });
  }

  const money = (stars: number) => fmtMoney(starsToMoneyRate(stars, currency, rate), currency);
  // AI contribution/cost arrive in USD; revenue arrives in Stars. Both are rendered in
  // the operator's selected currency so a table never puts "A$8,295 revenue"
  // beside "$4,102 AI contribution" and invites the wrong ratio. Was a bare "$" + toLocaleString.
  const usd = (n: number) => fmtMoney(usdToMoneyRate(n, currency, rate), currency);
  // Whole percent above 10, one decimal below it. Math.round alone flattened
  // every conversion rate the fleet has ever had into "1%": the real figure sat
  // between 0.62% and 0.68% across 1d/7d/30d on 2026-08-21, and all three
  // rounded to the same integer, so the tile looked frozen and looked like a
  // suspiciously round number at the same time. Multi-order buyer share and
  // top revenue type share are big enough that a decimal there is just noise.
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

  // The headline is signed Star ledger revenue: positive payments less recorded
  // refunds/adjustments. It is neither profit nor a withdrawable wallet balance.
  // Only equals "lifetime" when the window is genuinely all-time.
  const revenueLabel = customRange
    ? "Star revenue, custom range"
    : period === "ALL"
      ? "Lifetime Star revenue"
      : `Star revenue, ${PERIODS.find((p) => p.key === period)?.label ?? period}`;

  const toggleHidden = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // This is an intra-period direction signal. A real prior-period comparison
  // would require another full revenue rollup, currently the slowest query on
  // this page. Keep the existing comparison honest in the UI, and compare
  // average bucket values so a seven-day chart does not compare four days with
  // three days as raw totals.
  const trendPct = useMemo(() => {
    if (!data || data.series.length < 2) return null;
    const bucketRevenue = data.series.map((row) =>
      visibleClones.reduce((sum, clone) => sum + (Number(row[clone.id]) || 0), 0),
    );
    return intraPeriodTrendPct(bucketRevenue);
  }, [data, visibleClones]);

  // The default chart is intentionally a single fleet line/bar. Creator
  // colours remain available as an explicit diagnostic view, but the first
  // read should answer one question clearly: how did total revenue move?
  const totalChartSeries = useMemo(
    () =>
      (data?.series ?? []).map((row) => ({
        ...row,
        __total: visibleClones.reduce((sum, creator) => sum + (Number(row[creator.id]) || 0), 0),
      })),
    [data, visibleClones],
  );

  const summaryStats = focusStats ?? data?.totals ?? null;
  const summaryRevenuePerBuyer = summaryStats && summaryStats.buyers > 0 ? displayStars / summaryStats.buyers : null;
  const summaryAverageOrder = summaryStats && summaryStats.sales > 0 ? summaryStats.grossPaymentStars / summaryStats.sales : null;
  const primaryKpis = data && summaryStats
    ? [
        {
          label: "Net revenue",
          value: money(displayStars),
          meta: `⭐ ${fmtNum(displayStars)} after adjustments`,
          hint: "Recorded Star payments in this window after refunds and adjustments. This is not profit, a payout, or the current wallet balance.",
          primary: true,
        },
        {
          label: cloneId ? "Buyers" : "Unique buyers",
          value: fmtNum(summaryStats.buyers),
          meta: "positive paid orders",
          hint: "People with at least one positive paid order during the selected period.",
        },
        {
          label: "Messaged → buyer",
          value: data.analytics.buyerConversion.activeChatBuyerRate === null
            ? "-"
            : pct(data.analytics.buyerConversion.activeChatBuyerRate),
          meta: `${fmtNum(data.analytics.buyerConversion.activeChatBuyers)} of ${fmtNum(data.analytics.buyerConversion.activeChatters)}`,
          hint: "Of the people who sent a message during the selected dates, the share who also bought during those same dates. This does not prove the message caused the purchase.",
        },
        {
          label: "Revenue / buyer",
          value: summaryRevenuePerBuyer === null ? "-" : money(summaryRevenuePerBuyer),
          meta: "net revenue per buyer",
          hint: "Adjusted Star revenue in the selected period divided by buyers in that same period.",
        },
        {
          label: "Paid orders",
          value: fmtNum(summaryStats.sales),
          meta: summaryAverageOrder === null ? "No paid orders" : `${money(summaryAverageOrder)} average`,
          hint: "Positive Star payments in the selected period. Refunds and adjustments are not counted as orders.",
        },
      ]
    : [];
  const creatorCount = data?.clones.length ?? 0;
  const chartScopeLabel = chartMode === "creator"
    ? visibleClones.length === creatorCount
      ? "Creator breakdown"
      : `Creator breakdown (${visibleClones.length} of ${creatorCount})`
    : visibleClones.length === creatorCount
      ? "All creators"
      : `${visibleClones.length} of ${creatorCount} creators`;
  const txSortSummary = txSort.key === "date"
    ? txSort.direction === "desc" ? "Newest first" : "Oldest first"
    : txSort.key === "amount"
      ? txSort.direction === "desc" ? "Highest amount first" : "Lowest amount first"
      : `${txSort.key === "fan" ? "Fan" : txSort.key === "creator" ? "Creator" : "Type"} ${txSort.direction === "asc" ? "A–Z" : "Z–A"}`;

  if (sharedOverview && !showDetailed) return <SharedOverview {...sharedOverview}
    cloneId={cloneId} data={data} loading={loading} error={loadError}
    period={period} range={customRange} currency={currency} money={money}
    onPeriod={value => { setCustomRange(null); setPeriod(value); }}
    onRange={setCustomRange} onRefresh={refreshNow} onDetails={() => setShowDetailed(true)} />;

  return (
    <div className="pb-6">
      {sharedOverview && <button type="button" className="mb-4 rounded-lg border border-line bg-panel px-4 py-2 text-sm text-ink" onClick={() => setShowDetailed(false)}>Back to overview</button>}
      {/* Named on screen, not just in the console. The operator is the person
          who has to decide whether to pick a shorter window or call someone. */}
      {loadError && !isAgency && (
        <div className="mb-3 flex items-start gap-3 rounded-md border border-[#b4432f]/40 bg-[#fdecea] px-4 py-3 text-sm text-[#7a2b1e]">
          <span aria-hidden className="mt-0.5 text-base leading-none">⚠️</span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">This window could not be loaded.</div>
            <div className="mt-0.5 text-[12px] text-[#7a2b1e]/90">
              {data ? "Showing the last window that loaded." : "Try a shorter period. 1D and 1W are much cheaper to compute."}
            </div>
            {!isCreator && <details className="mt-1.5 group">
              <summary className="cursor-pointer select-none text-[12px] font-medium text-[#7a2b1e]/80 underline decoration-[#7a2b1e]/30 underline-offset-2 hover:text-[#7a2b1e]">
                Technical details
              </summary>
              <div className="mt-1 break-words rounded bg-[#7a2b1e]/[0.06] px-2.5 py-2 font-mono text-[11px] leading-snug text-[#7a2b1e]/90">
                {loadError}
              </div>
            </details>}
          </div>
        </div>
      )}
      <div className="mb-3 overflow-hidden rounded-lg border border-line bg-panel">
        <div className="flex flex-col justify-between gap-3 border-b border-line px-3 py-3 sm:flex-row sm:items-center sm:px-4">
          <div className="min-w-0">
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Finance operations</div>
            <h2 className="flex items-center gap-1.5 font-heading text-xl font-semibold tracking-[-0.025em] text-ink sm:text-2xl">
              Earnings overview
              <Info text={isCreator ? "Revenue, buyer activity and conversion performance for your creator account." : "Revenue, buyer activity and conversion performance across your active creators. In All creators, buyers are unique people across creators; audience and message totals count each creator-fan relationship."} />
            </h2>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted">
            {data && (
              <span className="inline-flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${data.stale ? "bg-[#b7791f]" : "bg-good"}`} />
                {data.stale ? "Refreshing latest data…" : snapshotAgeLabel(data.ageSeconds)}
              </span>
            )}
            <button
              type="button"
              onClick={refreshNow}
              disabled={loading}
              className="h-7 rounded border border-line bg-panel px-2.5 text-[11px] font-semibold text-ink transition hover:bg-elev disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* One compact command surface for time window, aggregation and mark. */}
        <div className="flex flex-wrap items-center gap-1.5 px-2 py-2 sm:px-3">
          <span className="px-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">Window</span>
          <div role="group" aria-label="Reporting window" className="inline-flex min-w-0 flex-wrap gap-0.5 rounded-md border border-line bg-elev p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={!customRange && period === p.key}
              onClick={() => {
                setCustomRange(null);
                setPeriod(p.key);
              }}
              className={
                "flex h-6 shrink-0 items-center gap-1 rounded-[3px] px-2 text-[10px] font-medium tabular-nums transition sm:text-[11px] " +
                (!customRange && period === p.key
                  ? "bg-[#172b3d] text-white"
                  : "text-muted hover:bg-panel hover:text-ink")
              }
            >
              {p.live && (
                <span className="h-1.5 w-1.5 rounded-full bg-good" />
              )}
              {p.label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={Boolean(customRange)}
            onClick={() => {
              setDraftStart(customRange?.start ?? "");
              setDraftEnd(customRange?.end ?? "");
              setCustomOpen(true);
            }}
            className={
              "flex h-6 shrink-0 items-center gap-1 rounded-[3px] px-2 text-[10px] font-medium tabular-nums transition sm:text-[11px] " +
              (customRange ? "bg-[#172b3d] text-white" : "text-muted hover:bg-panel hover:text-ink")
            }
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M3 9h18M8 2v4M16 2v4" strokeLinecap="round" />
            </svg>
            {customRange ? `${customRange.start} → ${customRange.end}` : "Custom"}
          </button>
        </div>

          {!scoped && !isCreator && (
            <>
              <span className="mx-0.5 h-5 w-px bg-line" />
              <span className="px-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">Series</span>
              <div role="group" aria-label="Revenue series" className="inline-flex shrink-0 gap-0.5 rounded-md border border-line bg-elev p-0.5">
                <button
                  type="button"
                  onClick={() => setChartMode("total")}
                  aria-pressed={chartMode === "total"}
                  className={`h-6 rounded-[3px] px-2 text-[10px] font-medium transition sm:text-[11px] ${chartMode === "total" ? "bg-[#172b3d] text-white" : "text-muted hover:bg-panel hover:text-ink"}`}
                >
                  Total
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode("creator")}
                  aria-pressed={chartMode === "creator"}
                  className={`h-6 rounded-[3px] px-2 text-[10px] font-medium transition sm:text-[11px] ${chartMode === "creator" ? "bg-[#172b3d] text-white" : "text-muted hover:bg-panel hover:text-ink"}`}
                >
                  By creator
                </button>
              </div>
            </>
          )}

          <span className="mx-0.5 h-5 w-px bg-line" />
          <span className="px-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">Chart</span>
          <div role="group" aria-label="Chart type" className="inline-flex shrink-0 gap-0.5 rounded-md border border-line bg-elev p-0.5">
          <button
            type="button"
            onClick={() => setChartType("bar")}
            aria-label="Bar chart"
            aria-pressed={chartType === "bar"}
            className={
              "grid h-6 w-7 place-items-center rounded-[3px] transition " +
              (chartType === "bar" ? "bg-[#172b3d] text-white" : "text-muted hover:bg-panel hover:text-ink")
            }
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M4 20V10M12 20V4M20 20v-7" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setChartType("line")}
            aria-label="Line chart"
            aria-pressed={chartType === "line"}
            className={
              "grid h-6 w-7 place-items-center rounded-[3px] transition " +
              (chartType === "line" ? "bg-[#172b3d] text-white" : "text-muted hover:bg-panel hover:text-ink")
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
      </div>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Custom date range</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 p-4 pt-0">
            <label className="flex flex-col gap-1 text-xs text-muted">
              From
              <Input ref={draftStartRef} type="date" value={draftStart} onChange={(event) => setDraftStart(event.target.value)} max={draftEnd || undefined} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              To
              <Input ref={draftEndRef} type="date" value={draftEnd} onChange={(event) => setDraftEnd(event.target.value)} min={draftStart || undefined} />
            </label>
            <div className="mt-1 flex justify-end gap-2">
              {customRange && (
                <Button variant="ghost" size="sm" onClick={clearCustomRange}>
                  Clear
                </Button>
              )}
              <Button size="sm" onClick={applyCustomRange}>
                Apply
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <section aria-label="Earnings summary" className="mb-3 overflow-hidden rounded-lg border border-line bg-panel">
        <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-5">
          {primaryKpis.length > 0 ? (
            primaryKpis.map((metric, index) => (
              <div
                key={metric.label}
                className={`min-w-0 bg-panel px-3 py-2.5 sm:px-3.5 ${index === 0 ? "col-span-2 sm:col-span-1" : ""}`}
              >
                <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.11em] text-muted">
                  <span>{metric.label}</span>
                  <Info text={metric.hint} />
                </div>
                <div
                  className={`mt-1 break-words font-mono text-lg font-semibold leading-none tabular-nums sm:text-xl ${
                    metric.primary
                      ? displayStars > 0
                        ? "money-value-primary text-good"
                        : displayStars < 0
                          ? "text-[#b4432f]"
                          : "text-ink"
                      : "text-ink"
                  }`}
                >
                  {metric.value}
                </div>
                <div className="mt-1 truncate text-[9px] text-muted">{metric.meta}</div>
              </div>
            ))
          ) : (
            Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className={`h-[70px] animate-pulse bg-elev ${index === 0 ? "col-span-2 sm:col-span-1" : ""}`} />
            ))
          )}
        </div>
      </section>

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.75fr)]">
        <div className="space-y-2">
        {/* ── Chart card ───────────────────────────────────────────── */}
        <Card size="sm" className="rounded-lg border border-line bg-panel shadow-none">
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 border-b border-line pb-3">
            <div className="min-w-0">
              <CardTitle className="text-sm font-semibold text-ink">Revenue performance</CardTitle>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
                <span>{focusName ? <span className="creator-name">{focusName}</span> : chartScopeLabel} · {revenueLabel}</span>
                <Info text="Recorded Star payments in this window, after refunds and adjustments. This is not profit, a payout, or the current wallet balance." />
              </div>
            </div>
            <div className="shrink-0 text-right">
              {trendPct !== null && (
                <div className="inline-flex items-center gap-1 rounded border border-line bg-elev px-2 py-1 text-[10px]">
                  <span className={`font-mono font-semibold tabular-nums ${trendPct > 0 ? "text-good" : trendPct < 0 ? "text-[#b4432f]" : "text-ink"}`}>
                    {trendPct >= 0 ? "+" : ""}{trendPct}%
                  </span>
                  <span className="text-muted">latter vs earlier half</span>
                  <Info text="Average Star revenue per chart interval in the latter half of this selected range compared with its earlier half. This is not a comparison with the previous period." />
                </div>
              )}
              {scoped && data?.balance ? (
                <div className="mt-1.5 flex justify-end">
                  <BalanceStat
                    label="Total balance"
                    hint="Every Star sitting in this bot's Telegram wallet right now, minus anything already withdrawn or spent. Read directly from Telegram (getMyStarBalance)."
                    value={data.balance.totalBalanceStars}
                    money={money}
                    accent="good"
                  />
                </div>
              ) : (
                <Link href={isCreator ? "/creator/info" : "/info"} className="mt-1.5 inline-block text-[10px] font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:text-accent-deep">
                  {scoped ? "Balance unavailable right now" : "See Total balance per bot"}
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div
              className="h-[190px] sm:h-[250px]"
              role="img"
              aria-label={
                data
                  ? `${chartScopeLabel}, ${revenueLabel}: ${money(displayStars)}${trendPct === null ? "" : `. Latter half ${trendPct >= 0 ? "up" : "down"} ${Math.abs(trendPct)} percent versus the earlier half.`}`
                  : "Revenue performance chart loading"
              }
            >
              {loading ? (
                <div className="flex h-full items-center justify-center text-muted">Loading…</div>
              ) : data && displayStars > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  {chartType === "bar" ? (
                    <BarChart data={chartMode === "total" ? totalChartSeries : data.series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
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
                        tick={{ fill: "#152033", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) => money(v).replace(/\.00$/, "")}
                        width={64}
                      />
                      <Tooltip
                        cursor={{ fill: cursorColor }}
                        content={<ChartTooltip clones={visibleClones} money={money} totalOnly={chartMode === "total"} totalLabel={focusName ?? "Total revenue"} />}
                      />
                      {chartMode === "total" ? (
                        <Bar dataKey="__total" fill="#172b3d" radius={[3, 3, 0, 0]}>
                          {totalChartSeries.map((_, idx) => (
                            <Cell
                              key={idx}
                              fill="#172b3d"
                              fillOpacity={!customRange && idx === totalChartSeries.length - 1 ? 0.52 : 1}
                            />
                          ))}
                        </Bar>
                      ) : visibleClones.map((c, i) => (
                        <Bar
                          key={c.id}
                          dataKey={c.id}
                          stackId="rev"
                          fill={scoped ? "var(--color-good)" : c.color}
                          radius={i === visibleClones.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                        >
                          {data.series.map((_, idx) => (
                            <Cell
                              key={idx}
                              fill={scoped ? "var(--color-good)" : c.color}
                              fillOpacity={!customRange && idx === data.series.length - 1 ? 0.52 : 1}
                            />
                          ))}
                        </Bar>
                      ))}
                    </BarChart>
                  ) : (
                    <LineChart data={chartMode === "total" ? totalChartSeries : data.series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
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
                        tick={{ fill: "#152033", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) => money(v).replace(/\.00$/, "")}
                        width={64}
                      />
                      <Tooltip
                        cursor={{ stroke: cursorColor }}
                        content={<ChartTooltip clones={visibleClones} money={money} totalOnly={chartMode === "total"} totalLabel={focusName ?? "Total revenue"} />}
                      />
                      {chartMode === "total" ? (
                        <Line
                          type="monotone"
                          dataKey="__total"
                          stroke="#172b3d"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 3 }}
                        />
                      ) : visibleClones.map((c) => (
                        <Line
                          key={c.id}
                          type="monotone"
                          dataKey={c.id}
                          stroke={scoped ? "var(--color-good)" : c.color}
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
        {!scoped && !isCreator && (
          <Card size="sm" className="gap-0 overflow-hidden rounded-lg border border-line bg-panel py-0 shadow-none">
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
                            <CreatorAvatar name={c.name} photoUrl={c.photoUrl} className="h-6 w-6" />
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
      <div className="space-y-3">
        {dayDetailAvailable && <RevenueDayDrivers cloneId={cloneId} />}
        {data && (
          <CreatorPerformanceRail
            creators={data.analytics.clones}
            totalStars={data.analytics.totals.revenueStars}
            money={money}
            pct={pct}
          />
        )}
      </div>
      </div>

      {/* ── Secondary operating metrics: one structured matrix, not a wall of
          detached dashboard cards. Every measure still follows its original
          scope/window semantics. ───────────────────────────────────────── */}
      {data && (
        <section className="mt-3 overflow-hidden rounded-lg border border-line bg-panel">
          <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2.5 sm:px-4">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-ink">Operating metrics</h3>
              <p className="mt-0.5 text-[10px] text-muted">Audience, engagement and order quality for the active reporting scope.</p>
            </div>
            <span className="shrink-0 text-[10px] text-muted">{customRange ? "Custom range" : PERIODS.find((item) => item.key === period)?.label}</span>
          </div>
          <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3">
          {(() => {
            const s = focusStats ?? data.totals;
            // This ratio uses the same selected-period cohort on both sides:
            // revenue in the period ÷ users who messaged in the period. Real
            // current activity has its own explicit 24-hour tile below.
            const revenuePerMessagedUser = s.activeUsers > 0 ? displayStars / s.activeUsers : null;
            const revenuePerBuyer = s.buyers > 0 ? displayStars / s.buyers : null;
            // Star revenue after adjustments includes refunds, while "Avg paid
            // order" means positive paid orders only. Keep those two measures
            // apart or one refund makes an ordinary purchase look cheaper.
            const avgOrder = s.sales > 0 ? s.grossPaymentStars / s.sales : null;
            // Windowed (lib/dashboard-data.ts), NOT analytics.funnel.repeatPct —
            // that one is the Analytics tab's LIFETIME funnel and never moved
            // when the period changed. Same reason as the four tiles above it.
            const multiOrderBuyerRate = s.buyers > 0 ? s.repeatPct : null;
            // #1 single source. Shares topFeatureRow() with the report's "Top
            // earner" fact below so the two cannot print different answers on
            // the same screen — they did, "Photos 21%" here against "Media 61%"
            // there, because this one dropped the catch-all buckets first.
            const topKind = topFeatureRow(data.analytics.byFeature);
            const periodScope = customRange ? "the selected calendar range" : "the selected reporting period";
            const creatorScope = cloneId ? "this creator" : "all creators";
            const profileScopeNote = cloneId
              ? ""
              : " In All creators, the same Telegram person can have a separate profile for each creator they message.";
            const buyerScopeNote = cloneId
              ? ""
              : " In All creators, the same Telegram account is counted once even if it pays more than one creator.";
            const tiles: { label: string; scope?: string; value: string; money?: boolean; hint?: string }[] = [
              // "Users" = every fan, all time, and it does NOT follow the date
              // filter — same as "Reachable now (24h)" below. Ronan's call,
              // 2026-08-22: on this page "Users" answers "how big is the
              // audience", a number that cannot shrink when you pick a shorter
              // period. The windowed count is "New" beside it.
              {
                label: "All-time users",
                value: fmtNum(s.totalFans),
                hint: `All fan profiles for ${creatorScope}, ever. This audience-size number does not change when you change the date filter.${profileScopeNote}`,
              },
              {
                label: "New users",
                value: fmtNum(s.newFans),
                hint: `Fan profiles first seen during ${periodScope}. Historical import rows are excluded.${profileScopeNote}`,
              },
              // This is deliberately not called “Active”: on a 1M/1Y view it
              // means “messaged sometime in that window”, not “active now”.
              {
                label: "Users who messaged",
                value: fmtNum(s.activeUsers),
                hint: `Fans who sent an inbound message during ${periodScope}.${profileScopeNote}`,
              },
              {
                label: "Revenue / user who messaged",
                value: revenuePerMessagedUser === null ? "-" : money(revenuePerMessagedUser),
                money: revenuePerMessagedUser !== null,
                hint: s.activeUsers > 0
                  ? `Recorded Star revenue during ${periodScope}, after refunds and adjustments, divided by users who messaged during that same period. It is not profit or a payout.${profileScopeNote}`
                  : `No users messaged during ${periodScope}, so this is not shown as $0.${profileScopeNote}`,
              },
              {
                label: "Purchases",
                value: fmtNum(s.sales),
                hint: `Individual positive Star payments recorded during ${periodScope}. Refunds and adjustments are not orders. One buyer can place more than one order.`,
              },
              // The ONE tile that ignores the filter, and it says so. Telegram
              // only allows a business bot to message a fan within 24h of that
              // fan's last message, so this is who the fleet can reach right
              // now — an operational limit, not a stat about the window.
              {
                label: "Active users (24h)",
                scope: "messaged in last 24h",
                value: fmtNum(s.reachable24h),
                hint: `Fan profiles whose last inbound message was within the past 24 hours. This is measured right now, not by the date filter.${profileScopeNote}`,
              },
              {
                label: "Messages",
                value: fmtNum(s.messages),
                hint: `All recorded conversation messages during ${periodScope} for ${creatorScope}, including fan messages and creator replies.${profileScopeNote}`,
              },
              {
                label: cloneId ? "Buyers" : "Unique buyers",
                scope: "paid this period",
                value: fmtNum(s.buyers),
                hint: `People with at least one positive paid order during ${periodScope}.${buyerScopeNote}`,
              },
              {
                label: "Revenue / buyer",
                value: revenuePerBuyer === null ? "-" : money(revenuePerBuyer),
                money: revenuePerBuyer !== null,
                hint: s.buyers > 0
                  ? `Recorded Star revenue during ${periodScope}, after refunds and adjustments, divided by Buyers. It is not profit or a payout.${buyerScopeNote}`
                  : `No Buyers were recorded during ${periodScope}, so this is not shown as $0.${buyerScopeNote}`,
              },
              {
                label: "Avg paid order",
                value: avgOrder === null ? "-" : money(avgOrder),
                money: avgOrder !== null,
                hint: s.sales > 0
                  ? `Positive paid-order value during ${periodScope} divided by the number of paid orders. Refunds and adjustments are excluded.`
                  : `No positive paid orders were recorded during ${periodScope}, so this is not shown as $0.`,
              },
              {
                label: "Multi-order buyers",
                scope: "2+ paid orders",
                value: multiOrderBuyerRate === null ? "-" : pct(multiOrderBuyerRate),
                hint: s.buyers > 0
                  ? `Share of Buyers with two or more positive paid orders during ${periodScope}.${buyerScopeNote}`
                  : `No Buyers were recorded during ${periodScope}, so this rate is not shown as 0%.${buyerScopeNote}`,
              },
              // Short label so the tile never truncates the number away.
              // "(untagged)" is kept, not stripped: it is the difference between
              // "photos are our product" and "we are not recording what we sell".
              {
                label: "Top revenue type",
                value: topKind ? `${topKind.label} ${pct(topKind.share)}` : "-",
                hint: `The payment type contributing the largest share of recorded Star revenue, after refunds and adjustments, during ${periodScope}.`,
              },
            ];
            return (
              <>
                {tiles
                  .filter((tile) => !["Purchases", "Buyers", "Unique buyers", "Revenue / buyer"].includes(tile.label))
                  .map((t) => (
                  <div key={t.label} className="min-w-0 bg-panel px-3 py-2.5 last:col-span-2 sm:last:col-span-1 sm:px-3.5">
                    <div className="flex min-w-0 items-start gap-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted">
                      <span className="min-w-0 break-words leading-tight">{t.label}</span>
                      {t.hint && <Info text={t.hint} />}
                    </div>
                    {t.scope && <div className="mt-0.5 break-words text-[9px] font-medium leading-tight text-muted/85">{t.scope}</div>}
                    <div className={"mt-1 break-words font-mono text-base font-semibold leading-tight tabular-nums text-ink"}>{t.value}</div>
                  </div>
                ))}
              </>
            );
          })()}
          </div>
        </section>
      )}

      {/* One analysis workspace replaces three oversized disclosure cards. The
          selected tab changes presentation only; all panels still use the same
          fetched analytics payload, period and creator scope. */}
      {data && (
        <section className="mt-3 overflow-hidden rounded-lg border border-line bg-panel">
          <div className="flex flex-col justify-between gap-2 border-b border-line px-3 pt-2.5 sm:flex-row sm:items-end sm:px-4">
            <div className="pb-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-ink">Performance analysis</h3>
              <p className="mt-0.5 text-[10px] text-muted">Move from customer conversion to chat behaviour and the full operating report.</p>
            </div>
            <div role="tablist" aria-label="Earnings analysis" className="flex flex-wrap gap-0.5">
              <button
                type="button"
                role="tab"
                aria-selected={!reportOpen && analysisView === "customers"}
                aria-controls="earnings-analysis-panel"
                onClick={() => {
                  setReportOpen(false);
                  setAnalysisView("customers");
                }}
                className={`border-b-2 px-2.5 py-2 text-[11px] font-medium transition ${!reportOpen && analysisView === "customers" ? "border-[#172b3d] text-ink" : "border-transparent text-muted hover:text-ink"}`}
              >
                Paying customers
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={!reportOpen && analysisView === "journey"}
                aria-controls="earnings-analysis-panel"
                onClick={() => {
                  setReportOpen(false);
                  setAnalysisView("journey");
                }}
                className={`border-b-2 px-2.5 py-2 text-[11px] font-medium transition ${!reportOpen && analysisView === "journey" ? "border-[#172b3d] text-ink" : "border-transparent text-muted hover:text-ink"}`}
              >
                Chat journey
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={reportOpen}
                aria-expanded={reportOpen}
                aria-controls="earnings-analysis-panel"
                onClick={() => setReportOpen(true)}
                className={`border-b-2 px-2.5 py-2 text-[11px] font-medium transition ${reportOpen ? "border-[#172b3d] text-ink" : "border-transparent text-muted hover:text-ink"}`}
              >
                Full revenue report
              </button>
            </div>
          </div>
          <div id="earnings-analysis-panel" role="tabpanel" className="p-3 sm:p-4">
            {!reportOpen && analysisView === "customers" && (
              <BuyerConversionPanel conversion={data.analytics.buyerConversion} pct={pct} />
            )}
            {!reportOpen && analysisView === "journey" && (
              <ConversationFunnelPanel f={data.analytics.conversationFunnel} pct={pct} />
            )}
            {reportOpen && (
              <div ref={reportRef} className="scroll-mt-20">
                <RevenueReport
                  a={data.analytics}
                  scoped={scoped}
                  cloneName={focusName ?? "Selected creator"}
                  transactions={cloneId ? data.recent.filter((transaction) => transaction.cloneId === cloneId) : data.recent}
                  purchaseHistoryVisible={!isCreator}
                  money={money}
                  usd={usd}
                  pct={pct}
                  axisColor={axisColor}
                  cursorColor={cursorColor}
                  onClose={() => {
                    setReportOpen(false);
                    setAnalysisView("customers");
                  }}
                />
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Recent ledger activity - same scope/window as everything above it.
          Server sends up to 300 (fleet-wide, most recent first); scoping to
          one clone filters client-side. Shows 10, "Show more" → 50 → 100. ── */}
      {!isCreator && data && (
        <Card size="sm" className="mt-3 gap-0 overflow-hidden rounded-lg border border-line bg-panel py-0 shadow-none">
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b border-line px-3 py-2.5 sm:px-4">
            <div>
              <CardTitle className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-ink">
                Recent ledger activity
                <Info text="Paid orders and any refunds or adjustments in the selected period. Media purchases show Photo, Video, or Bundle with the exact catalogue thumbnail when the original offer is available. Media (untagged) is older Telegram-imported history whose exact item was never recorded." />
              </CardTitle>
              <p className="mt-0.5 hidden text-[10px] text-muted sm:block">{txSortSummary} · signed payments, refunds and adjustments</p>
            </div>
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
                placeholder="Search ledger activity…"
                className="h-7 rounded pl-8 text-[11px]"
              />
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {(() => {
              const q = txQuery.trim().toLowerCase();
              const scopedTransactions = cloneId ? data.recent.filter((t) => t.cloneId === cloneId) : data.recent;
              const matches = scopedTransactions
                .map((transaction, sourceIndex) => ({ transaction, sourceIndex }))
                .filter(
                  ({ transaction: t }) =>
                    !q ||
                    t.buyerName.toLowerCase().includes(q) ||
                    (t.username?.toLowerCase().includes(q) ?? false) ||
                    t.cloneName.toLowerCase().includes(q) ||
                    (t.mediaName?.toLowerCase().includes(q) ?? false) ||
                    (TX_KIND_LABEL[t.kind] ?? t.kind).toLowerCase().includes(q),
                );
              const direction = txSort.direction === "asc" ? 1 : -1;
              const compareTransactions = (
                first: DashboardData["recent"][number],
                second: DashboardData["recent"][number],
              ) => {
                let result = 0;
                if (txSort.key === "fan") result = first.buyerName.localeCompare(second.buyerName);
                else if (txSort.key === "creator") result = first.cloneName.localeCompare(second.cloneName);
                else if (txSort.key === "type") result = ledgerTypeLabel(first).localeCompare(ledgerTypeLabel(second));
                else if (txSort.key === "amount") result = first.stars - second.stars;
                else result = (Date.parse(first.paidAt) || 0) - (Date.parse(second.paidAt) || 0);
                return result * direction;
              };
              const sortedMatches = [...matches]
                .sort((first, second) => compareTransactions(first.transaction, second.transaction) || first.sourceIndex - second.sourceIndex);
              const rows = sortedMatches.slice(0, txLimit);
              const nextLimit = txLimit < 50 ? 50 : txLimit < 100 ? 100 : null;
              if (rows.length === 0) {
                return (
                  <div className="px-4 py-6 text-center text-sm text-muted">
                    {q ? `No ledger activity matches "${txQuery}".` : "No ledger activity in this period."}
                  </div>
                );
              }
              return (
                <>
                <div className="flex items-center justify-between gap-2 border-b border-line bg-elev px-3 py-2 sm:hidden">
                  <label className="flex min-w-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                    <span>Sort</span>
                    <select
                      value={txSort.key}
                      onChange={(event) => selectTxSort(event.target.value as LedgerSortKey)}
                      className="h-7 min-w-0 rounded border border-line bg-panel px-2 text-[11px] font-medium normal-case tracking-normal text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      aria-label="Sort ledger by"
                    >
                      <option value="fan">Fan</option>
                      {!scoped && <option value="creator">Creator</option>}
                      <option value="type">Type</option>
                      <option value="amount">Amount</option>
                      <option value="date">Date</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => toggleTxSort(txSort.key)}
                    aria-label={`Reverse ledger sort; currently ${txSortSummary}`}
                    className="h-7 shrink-0 rounded border border-line bg-panel px-2 text-[11px] font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    <span aria-hidden="true">{txSort.direction === "asc" ? "↑" : "↓"}</span>
                  </button>
                </div>
                {/* ── PHONE: one card per transaction ─────────────────────────
                    Five columns of fan + clone + item + money + date needed 719px
                    on a 375px screen, so the table scrolled sideways inside its
                    own box and the operator could not see an amount and who paid
                    it at the same time. Same rows, same order, same numbers,
                    stacked instead. The table below takes over at sm. */}
                <div className="divide-y divide-line sm:hidden">
                  {rows.map(({ transaction: t, sourceIndex }) => (
                    <div key={sourceIndex} className="flex items-start gap-2.5 px-4 py-3">
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
                <div className="hidden max-h-[520px] overflow-y-auto sm:block">
                <Table className="text-xs">
                  <TableHeader className="sticky top-0 z-10 bg-elev shadow-[0_1px_0_var(--color-line)]">
                    <TableRow>
                      <LedgerSortHead label="Fan" sortKey="fan" activeKey={txSort.key} direction={txSort.direction} onSort={toggleTxSort} className="px-3" />
                      {!scoped && <LedgerSortHead label="Creator" sortKey="creator" activeKey={txSort.key} direction={txSort.direction} onSort={toggleTxSort} />}
                      <LedgerSortHead label="Type" sortKey="type" activeKey={txSort.key} direction={txSort.direction} onSort={toggleTxSort} />
                      <LedgerSortHead label="Amount" sortKey="amount" activeKey={txSort.key} direction={txSort.direction} onSort={toggleTxSort} align="right" />
                      <LedgerSortHead label="Date" sortKey="date" activeKey={txSort.key} direction={txSort.direction} onSort={toggleTxSort} align="right" className="pr-3" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(({ transaction: t, sourceIndex }) => (
                      <TableRow key={sourceIndex} className="hover:bg-elev/70">
                        <TableCell className="py-1.5 pl-3">
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
                          <TableCell className="py-1.5">
                            <span className="flex items-center gap-1.5">
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.cloneColor }} />
                              <span className="creator-name">{t.cloneName}</span>
                            </span>
                          </TableCell>
                        )}
                        <TableCell className="py-1.5 text-muted">
                          {t.mediaType ? (
                            <TransactionMedia type={t.mediaType} url={t.mediaUrl} name={t.mediaName} compact />
                          ) : (
                            <span className="capitalize">{TX_KIND_LABEL[t.kind] ?? t.kind}</span>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5 text-right">
                          <span className="money-value block font-mono tabular-nums">{money(t.stars)}</span>
                          <span className="block text-[11px] text-muted">⭐ {fmtNum(t.stars)}</span>
                        </TableCell>
                        <TableCell className="py-1.5 pr-3 text-right text-[11px] text-muted">
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


function CreatorPerformanceRail({
  creators,
  totalStars,
  money,
  pct,
}: {
  creators: AnalyticsData["clones"];
  totalStars: number;
  money: (stars: number) => string;
  pct: (value: number) => string;
}) {
  const ranked = creators.filter((creator) => creator.revenueStars !== 0 || creator.sales > 0);
  const visible = ranked.slice(0, 6);

  return (
    <section aria-label="Creator performance" className="overflow-hidden rounded-lg border border-line bg-panel">
      <div className="border-b border-line px-3 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-ink">Creator performance</h3>
        <p className="mt-0.5 text-[10px] text-muted">Revenue rank in the selected window</p>
      </div>
      {visible.length === 0 ? (
        <div className="px-3 py-6 text-center text-xs text-muted">No creator revenue in this window.</div>
      ) : (
        <>
          <div className="grid grid-cols-[22px_minmax(0,1fr)_auto_42px] gap-2 border-b border-line bg-elev px-3 py-1.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-muted">
            <span>#</span>
            <span>Creator</span>
            <span className="text-right">Revenue</span>
            <span className="text-right">Orders</span>
          </div>
          <ol className="divide-y divide-line">
            {visible.map((creator, index) => (
              <li key={creator.id} className="grid grid-cols-[22px_minmax(0,1fr)_auto_42px] items-center gap-2 px-3 py-2 text-[11px]">
                <span className="font-mono tabular-nums text-muted">{index + 1}</span>
                <span className="min-w-0">
                  <span className="creator-name block truncate font-medium text-ink">{creator.name}</span>
                  <span className="block text-[9px] tabular-nums text-muted">
                    {totalStars > 0 ? pct(creator.revenueStars / totalStars) : "-"} share
                  </span>
                </span>
                <span className="font-mono font-semibold tabular-nums text-ink">{money(creator.revenueStars)}</span>
                <span className="text-right font-mono tabular-nums text-muted">{fmtNum(creator.sales)}</span>
              </li>
            ))}
          </ol>
          {ranked.length > visible.length && (
            <div className="border-t border-line px-3 py-2 text-[10px] text-muted">
              {fmtNum(ranked.length - visible.length)} more in Full revenue report
            </div>
          )}
        </>
      )}
    </section>
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
  totalOnly = false,
  totalLabel = "Total revenue",
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number }[];
  label?: string;
  clones: { id: string; name: string; color: string }[];
  money: (stars: number) => string;
  totalOnly?: boolean;
  totalLabel?: string;
}) {
  if (!active || !payload?.length) return null;
  const byId = new Map(clones.map((c) => [c.id, c]));
  // A signed fleet total must remain inspectable even when it is zero or when
  // refunds make the bucket negative. Creator breakdown keeps the established
  // positive-series behaviour so empty creator rows do not crowd the tooltip.
  const rows = totalOnly ? payload : payload.filter((p) => p.value > 0);
  const total = rows.reduce((s, p) => s + p.value, 0);
  return (
    <div className="rounded-lg border border-line bg-panel p-3 text-xs shadow-[var(--shadow-card)]">
      <div className="mb-2 font-medium text-ink">{label}</div>
      {rows.map((p) => {
        const c = byId.get(p.dataKey);
        return (
          <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-2 text-muted">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: totalOnly && p.value < 0 ? "#b4432f" : totalOnly ? "#172b3d" : c?.color }}
              />
              <span className={totalOnly ? "" : "creator-name"}>{totalOnly ? totalLabel : c?.name ?? p.dataKey}</span>
            </span>
            <span className={`font-mono font-semibold tabular-nums ${p.value > 0 ? "text-good" : p.value < 0 ? "text-[#b4432f]" : "text-ink"}`}>
              {money(p.value)}
            </span>
          </div>
        );
      })}
      {!totalOnly && (
        <div className="mt-2 flex justify-between border-t border-line pt-2 font-medium">
          <span>Total</span>
          <span className="money-value font-mono tabular-nums">{money(total)}</span>
        </div>
      )}
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
  purchaseHistoryVisible,
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
  purchaseHistoryVisible: boolean;
  money: (stars: number) => string;
  usd: (n: number) => string;
  pct: (n: number) => string;
  axisColor: string;
  cursorColor: string;
  onClose: () => void;
}) {
  const [selectedMedia, setSelectedMedia] = useState<"photo" | "video" | "bundle" | null>(null);
  // A quiet, predominantly navy scale keeps category comparison legible without
  // turning the operating report into a rainbow. Red stays reserved for the
  // genuinely signed adjustment bucket.
  const CAT = { blue: "#172b3d", aqua: "#526578", yellow: "#7f8b96", violet: "#2e465d", red: "#9a4d43", pink: "#697785" };

  const featureColor = (k: string) =>
    k === "credits"
      ? CAT.blue
      : k === "photo"
        ? CAT.violet
        : k === "video"
          ? CAT.aqua
          : k === "bundle"
            ? CAT.pink
            : k === "tip"
              ? CAT.yellow
              : k === "subscription"
                ? CAT.aqua
                : k === "refund"
                  ? CAT.red
                  : CAT.yellow;
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
    <Card size="sm" className="gap-0 rounded-md border border-line bg-panel py-0 shadow-none">
      <CardHeader className="border-b border-line bg-elev px-3 py-2.5 sm:px-4 sm:py-3">
        <CardTitle className="text-xs font-semibold uppercase tracking-[0.12em] text-ink sm:text-sm">Revenue report</CardTitle>
        {/* Four lines of subtitle on a phone, above any data. Hidden there, and
            the ⓘ on the Close row is not the place for it either: the panel titles
            below each carry their own hint. */}
        <CardDescription className="hidden text-[11px] text-muted sm:block">
          {/* "in this window" used to cover the whole list, but the spender tier
              and buyer breakdown panels are lifetime and say so on themselves.
              A subtitle that contradicts the panel under it is how a lifetime
              number gets read as a windowed one. */}
          Where the money comes from: product, {scoped ? "" : "creator, "}time and funnel for this window, plus spender tiers and buyer behaviour over each fan&apos;s lifetime.
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 rounded border border-line bg-panel px-2.5 text-[11px] text-ink hover:bg-muted/10">
            Close
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-2.5 sm:px-(--card-spacing)">
        {/* Key facts */}
        {facts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {facts.map((f) => (
              <span key={f.label} className="inline-flex items-baseline gap-1.5 rounded border border-line bg-elev px-2.5 py-1 text-[11px]">
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
            hint="Revenue by feature, with sales and average per sale. Every Star ledger entry in this window sits in one of these rows, so untagged and other sales are listed too and the rows add up to the Star revenue above."
          >
            {reportFeatures.length === 0 ? (
              <ReportEmpty text="No sales in this window." />
            ) : (
              <div className="flex flex-col gap-3">
                {reportFeatures.map((f) => {
                  const drillable = purchaseHistoryVisible && scoped && (f.key === "photo" || f.key === "video" || f.key === "bundle");
                  const categoryClassName =
                    "rounded-md border border-line bg-panel p-3 text-left transition hover:border-[#7f8b96] hover:bg-elev";
                  const row = (
                    <ShareRow
                      color={featureColor(f.key)}
                      label={f.label}
                      share={f.share}
                      right={money(f.stars)}
                      rightHint={pct(f.share)}
                      sub={f.key === "refund" ? "Net ledger adjustment" : `${fmtNum(f.sales)} sale${f.sales === 1 ? "" : "s"}`}
                      subMoney={f.key === "refund" ? "included in net revenue" : `avg ${money(f.avgStars)} per sale`}
                    />
                  );
                  return drillable ? (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setSelectedMedia(f.key as "photo" | "video" | "bundle")}
                      className={`${categoryClassName} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#172b3d]/35`}
                    >
                      {row}
                      <span className="mt-2 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#172b3d]">
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

          <ReportPanel title={purchaseHistoryVisible ? "Who pays" : "Buyer value"} hint={purchaseHistoryVisible ? "Top spenders from the last 7 days, followed by lifetime spend tiers." : "Aggregate lifetime spend tiers."}>
            <div className="flex flex-col gap-4">
              {purchaseHistoryVisible && <div>
                <div className="mb-2 flex items-end justify-between gap-3">
                  <div>
                    <h4 className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink">Top 5 weekly spenders</h4>
                    <p className="text-[10px] text-muted">Rolling seven days in the current creator scope.</p>
                  </div>
                  <div className="text-right">
                    <div className="money-value font-mono text-sm font-semibold tabular-nums">{money(a.weeklySpenderSummary.stars)}</div>
                    <div className="text-[10px] text-muted">{fmtNum(a.weeklySpenderSummary.buyers)} buyers · {fmtNum(a.weeklySpenderSummary.purchases)} purchases</div>
                  </div>
                </div>
                {a.topWeeklySpenders.length === 0 ? (
                  <div className="rounded-md bg-surface px-3 py-5 text-center text-xs text-muted">No spenders in the last 7 days.</div>
                ) : (
                  <div className="grid gap-1.5">
                    {a.topWeeklySpenders.map((spender, index) => (
                      // min-w-0 because this is a GRID item: a grid track sizes to
                      // its item's min-content width unless told otherwise, so
                      // without it the fixed-width rank/avatar/amount forced the
                      // row 20px wider than the panel and it crossed the border.
                      <div key={`${spender.cloneId ?? "unknown"}:${spender.telegramId}`} className="flex min-w-0 items-center gap-2 rounded-md border border-line bg-panel px-2.5 py-2 sm:gap-2.5 sm:px-3">
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
              </div>}

              <div className="border-t border-line pt-3">
                <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink">Lifetime spend tiers</h4>
                <p className="mb-3 text-[10px] text-muted">How the full fan base is distributed by lifetime value.</p>
                {a.byTier.length === 0 ? (
                  <ReportEmpty text="No fans yet." />
                ) : (
                  <div className="flex flex-col gap-3">
                    {a.byTier.map((t) => {
                      const tierRow = (
                        <ShareRow
                          color={tierColor(t.key)}
                          label={t.label}
                          share={t.share}
                          right={money(t.stars)}
                          rightHint={pct(t.share)}
                          sub={`${fmtNum(t.users)} fan${t.users === 1 ? "" : "s"}`}
                        />
                      );

                      // Only Whale profiles are shown. The other tiers remain a
                      // compact overview, even when the fleet becomes large.
                      if (t.key !== "whale" || !purchaseHistoryVisible) return <div key={t.key}>{tierRow}</div>;

                      return (
                        <details key={t.key} className="rounded-md border border-line bg-surface/55 px-2.5 py-2.5 sm:px-3">
                          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                            {tierRow}
                            <span className="mt-2 block text-[10px] font-semibold text-[#172b3d]">View Whale fans</span>
                          </summary>
                          <div className="mt-2 max-h-72 overflow-y-auto border-t border-line pt-2">
                            <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] text-muted">
                              <span>Whale fans</span>
                              <span>{fmtNum(a.whaleFans.length)} listed</span>
                            </div>
                            {a.whaleFans.length === 0 ? (
                              <p className="py-2 text-xs text-muted">No Whale fans to show.</p>
                            ) : (
                              <div className="grid gap-1.5">
                                {a.whaleFans.map((fan) => (
                                  <div
                                    key={`${fan.cloneId ?? "unknown"}:${fan.telegramId ?? fan.name}`}
                                    className="flex min-w-0 items-center gap-2 rounded-lg bg-background/60 px-2 py-1.5"
                                  >
                                    <FanAvatar
                                      cloneId={fan.cloneId ?? ""}
                                      telegramId={fan.telegramId}
                                      name={fan.name}
                                      color={tierColor("whale")}
                                      className="h-7 w-7"
                                    />
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-xs font-semibold text-ink">{fan.name}</span>
                                      <span className="block truncate text-[10px] text-muted">
                                        {fan.username ? `@${fan.username}` : "Whale fan"}
                                        {!scoped ? (
                                          <>
                                            {" · "}
                                            <span className="creator-name">{fan.cloneName}</span>
                                          </>
                                        ) : ""}
                                      </span>
                                    </span>
                                    <span className="shrink-0 text-right">
                                      <span className="block font-mono text-[11px] font-semibold tabular-nums text-ink">⭐ {fmtNum(fan.stars)}</span>
                                      <span className="block text-[10px] text-muted">lifetime spend</span>
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </ReportPanel>
        </div>

        {/* Which clone / which flow - fleet view only (scoped = one clone already) */}
        {!scoped && (
          <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
            <ReportPanel title="By creator" hint="Ranked by revenue. Metered AI contribution is Star revenue at the canonical conversion rate minus recorded AI and voice cost. It excludes all other business costs.">
              {earningClones.length === 0 ? (
                <ReportEmpty text="No creator earned in this window." />
              ) : (
                <>
                {/* ── PHONE: one card per clone ───────────────────────────────
                    Six numeric columns wanted 493px inside a 283px panel. Same
                    six figures, labelled, in a 3-up grid under the name. */}
                <div className="flex flex-col gap-2 lg:hidden">
                  {earningClones.map((c) => (
                    <div key={c.id} className="rounded-md border border-line bg-surface/75 px-3 py-2.5">
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
                          { k: "AI contribution", v: usd(c.profitUsd), money: true },
                          { k: "AI margin", v: c.revenueStars > 0 ? pct(c.margin) : "-" },
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
                      <TableHead className="text-right">AI contribution</TableHead>
                      <TableHead className="text-right">AI margin</TableHead>
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
                      subMoney={`AI contribution ${usd(f.profitUsd)}`}
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
                      tick={{ fill: "#152033", fontSize: 11 }}
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
                      tick={{ fill: "#152033", fontSize: 11 }}
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
                  <div className="rounded-md border border-[#d7952d]/30 bg-[#d7952d]/8 px-3 py-2 text-[11px] leading-relaxed text-muted">
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

              <div className="rounded-md bg-surface/75 px-3 py-2 text-[10px] leading-relaxed text-muted">
                One-time buyers have exactly one recorded purchase. Repeat buyers have two or more; loyal buyers have three or more. Buyer value uses lifetime spend, so it is not limited by the date filter above.
              </div>
            </div>
          </ReportPanel>
        </div>

        {purchaseHistoryVisible && <Dialog open={selectedMedia !== null} onOpenChange={(open) => !open && setSelectedMedia(null)}>
          <DialogContent className="w-[min(880px,calc(100vw-2rem))] max-w-none sm:max-w-none">
            <DialogHeader>
              <DialogTitle>
                <span className="creator-name">{cloneName}</span> · Purchased {selectedMedia === "photo" ? "photos" : selectedMedia === "video" ? "videos" : "bundles"}
              </DialogTitle>
              <p className="text-xs text-muted">Most recent matching purchases in the selected revenue window.</p>
            </DialogHeader>
            {selectedPurchases.length === 0 ? (
              <div className="rounded-md border border-line bg-surface px-4 py-10 text-center text-sm text-muted">
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
                    "flex items-center gap-3 rounded-md border border-line bg-panel p-3 text-left transition hover:border-[#7f8b96] hover:bg-elev";
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
        </Dialog>}
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
    <div className="min-w-0 rounded-md border border-line p-2.5 sm:p-3">
      <div className="mb-2.5 border-b border-line pb-2 sm:mb-3">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.11em] text-ink">
          {title}
          {hint && <Info text={hint} className="text-muted sm:hidden" />}
        </h3>
        {hint && <p className="mt-0.5 hidden text-[10px] leading-relaxed text-muted sm:block">{hint}</p>}
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

// ── Paying customers ─────────────────────────────────────────────────────────
// Keep the plain-language question on every card. These rates intentionally
// answer different questions, so the UI must not make them look interchangeable.
function BuyerConversionPanel({
  conversion,
  pct,
}: {
  conversion: AnalyticsData["buyerConversion"];
  pct: (n: number) => string;
}) {
  const lifetimeRate = conversion.lifetimeBuyerRate === null ? "-" : pct(conversion.lifetimeBuyerRate);
  const activeChatRate = conversion.activeChatBuyerRate === null ? "-" : pct(conversion.activeChatBuyerRate);
  const buyerEngagementRate = conversion.activeBuyerEngagement7d === null ? "-" : pct(conversion.activeBuyerEngagement7d);
  // Purchase mix is intentionally ordered by number of paid orders, not by
  // revenue. "What do people buy?" is a product-frequency question; the full
  // report above remains the place to compare dollar revenue by product.
  const topPurchases = [...conversion.purchaseMix]
    .filter((item) => item.sales > 0)
    .sort((a, b) => b.sales - a.sales || b.stars - a.stars)
    .slice(0, 3);

  const metrics: { label: string; value: string; summary: string; detail: string }[] = [
    {
      label: "Have they ever bought?",
      value: lifetimeRate,
      summary: `${fmtNum(conversion.lifetimeBuyerProfiles)} of ${fmtNum(conversion.lifetimeFanProfiles)} audience accounts have bought`,
      detail: "Of every audience account that has ever chatted, how many have ever bought something? This is an all-time number, so changing the date does not change it. In All creators, one person who chats with two creators has two audience accounts, one with each creator.",
    },
    {
      label: "Did people who messaged buy?",
      value: activeChatRate,
      summary: `${fmtNum(conversion.activeChatBuyers)} of ${fmtNum(conversion.activeChatters)} people who messaged also bought`,
      detail: "Of the people who sent a message during the dates you picked, how many also bought something during those same dates? This is the buying-conversion number. In All creators, each person is counted once. It shows that both things happened in the same period; it does not prove that one message caused the purchase.",
    },
    {
      label: "Did past buyers come back?",
      value: buyerEngagementRate,
      summary: `${fmtNum(conversion.activeBuyerProfiles7d)} of ${fmtNum(conversion.lifetimeBuyerProfiles)} past buyers messaged in the last 7 days`,
      detail: "This is not a buying-conversion number. Of the people who have bought before, how many sent a message in the last seven days? It always checks the last seven days, even if you change the earnings date. In All creators, this counts each creator–buyer account, so one person can appear once for each creator they bought from.",
    },
  ];

  return (
    <div>
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div>
          <h4 className="text-sm font-semibold text-ink">Paying customers</h4>
          <p className="mt-0.5 text-[11px] text-muted">Did people buy after messaging, and did past buyers come back to chat?</p>
        </div>
        <p className="max-w-xl border-l-2 border-line pl-2.5 text-[10px] leading-relaxed text-muted">
          Each rate answers a different question. A purchase means a completed positive Star payment; refunds and adjustments do not count.
        </p>
      </div>

          <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line lg:grid-cols-3">
            {metrics.map((metric) => (
              <div key={metric.label} className="min-w-0 bg-panel px-3 py-2.5 last:col-span-2 lg:last:col-span-1">
                <div className="flex min-w-0 items-start gap-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted">
                  <span className="min-w-0 leading-tight">{metric.label}</span>
                  <Info text={metric.detail} />
                </div>
                <div className="mt-1 font-mono text-base font-semibold tabular-nums text-ink">{metric.value}</div>
                <div className="mt-0.5 text-[10px] leading-snug text-muted">{metric.summary}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 border-t border-line pt-3">
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
              What buyers purchased this period
              <Info text="The three most frequently purchased product types in the selected earnings period, ranked by positive paid-order count. Refunds and adjustments are excluded. The Full revenue report above shows every product type and its revenue." />
            </div>
            {topPurchases.length > 0 ? (
              <div className="mt-2 grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3">
                {topPurchases.map((item) => (
                  <div key={item.key} className="flex min-w-0 items-baseline justify-between gap-2 bg-panel px-2.5 py-2 text-[11px]">
                    <span className="min-w-0 break-words font-medium text-ink">{item.label}</span>
                    <span className="shrink-0 font-mono tabular-nums text-muted">{fmtNum(item.sales)} {item.sales === 1 ? "order" : "orders"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-1.5 text-[11px] text-muted">No positive paid orders were recorded in the selected period.</p>
            )}
          </div>
    </div>
  );
}

// ── Recorded chat & purchase signals ────────────────────────────────────────
//
// These five measures come directly from recorded profile, message, offer and
// payment events. The previous revenue-per-conversation and repeat-rate ratios
// are intentionally omitted here: the former can read as causal when it is not,
// and the latter already has a precise top-line Earnings tile.
//
// THE COHORT IS A CREATOR–FAN CHAT PAIR, NOT A PERSON: someone talking to two
// creators is two pairs, because these are relationship-level signals. The
// Buyers tile above deduplicates people instead, on purpose.
//
// WHY "SECOND MESSAGE" IS NOT "SENT A MESSAGE". A users row is created by the
// fan's first message, so a first-message rate would read ~100% forever. The
// first meaningful observed drop-off is whether that new fan sends another
// message in the selected period.
function ConversationFunnelPanel({
  f,
  pct,
}: {
  f: AnalyticsData["conversationFunnel"];
  pct: (n: number) => string;
}) {
  const rate = (a: number, b: number) => (b > 0 ? pct(a / b) : "-");
  const metrics: { label: string; value: string; summary: string; detail: string }[] = [
    {
      label: "Sent a second message",
      value: rate(f.arrivalsStarted, f.arrivals),
      summary: `${fmtNum(f.arrivalsStarted)} of ${fmtNum(f.arrivals)} new people`,
      detail: "Of the new people who messaged during the dates you picked, how many sent another message too? This tells you whether new people kept talking after their first message.",
    },
    {
      label: "Sent 5+ messages",
      value: rate(f.meaningful, f.conversations),
      summary: `${fmtNum(f.meaningful)} of ${fmtNum(f.conversations)} chats`,
      detail: "Of the chats that had at least one message during the dates you picked, how many had five or more messages from the person chatting?",
    },
    {
      label: "Received an offer",
      value: rate(f.offered, f.conversations),
      summary: `${fmtNum(f.offered)} of ${fmtNum(f.conversations)} chats`,
      detail: "Of the chats that had a message during the dates you picked, how many were sent a recorded paid offer, such as a paywall or locked item? This confirms an offer was sent, not that the person opened it.",
    },
    {
      label: "Bought after an offer",
      value: rate(f.offeredBought, f.offered),
      summary: `${fmtNum(f.offeredBought)} of ${fmtNum(f.offered)} chats with an offer`,
      detail: "Of the chats that received an offer, how many also bought something during the dates you picked? This does not prove that the offer caused the purchase.",
    },
    {
      label: "Typical time to first purchase",
      value: fmtHours(f.ttfpMedianHours),
      summary: f.ttfpN > 0 ? `based on ${fmtNum(f.ttfpN)} first purchases` : "no first purchases in these dates",
      detail: "The typical time between someone first messaging and their first purchase. It only uses people whose first purchase happened during the dates you picked, so it is not an average of every buyer.",
    },
  ];

  return (
    <div>
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div>
          <h4 className="text-sm font-semibold text-ink">Chat activity &amp; purchases</h4>
          <p className="mt-0.5 text-[11px] text-muted">A stage-by-stage view of engagement, recorded offers and buying signals.</p>
        </div>
        <p className="max-w-xl border-l-2 border-line pl-2.5 text-[10px] leading-relaxed text-muted">
          “20 of 100” means 20 chats reached that measured stage. Related stages can use different cohorts and do not prove causation.
        </p>
      </div>
          <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3 xl:grid-cols-5">
            {metrics.map((m, index) => (
              <div key={m.label} className="min-w-0 bg-panel px-3 py-2.5">
                <div className="mb-2 text-[9px] font-semibold tabular-nums text-muted">0{index + 1}</div>
                <div className="flex min-w-0 items-start gap-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted">
                  <span className="min-w-0 leading-tight">{m.label}</span>
                  <Info text={m.detail} />
                </div>
                <div className="mt-1 font-mono text-base font-semibold tabular-nums text-ink">{m.value}</div>
                <div className="mt-0.5 text-[10px] leading-snug text-muted">{m.summary}</div>
              </div>
            ))}
          </div>
    </div>
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
    <div className="min-w-0 rounded-md border border-line bg-surface/75 px-3 py-2.5">
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
    <div className="flex items-center gap-3 rounded-md border border-line bg-surface/75 px-3 py-2.5">
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
    { label: "Metered AI contribution (USD)", value: `$${(stats.stars * STAR_USD - stats.costUsd).toFixed(2)}`, money: true },
    { label: "AI calls", value: fmtNum(stats.aiCalls) },
    { label: "AI errors", value: fmtNum(stats.aiErrors) },
  ];
  return (
    <Card size="sm" className="mt-3 rounded-lg border border-line bg-panel shadow-none">
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
