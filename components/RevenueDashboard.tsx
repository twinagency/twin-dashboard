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
import { fmtMoney, fmtNum, starsToMoneyRate } from "@/lib/money";
import { useCurrency } from "@/components/CurrencyProvider";
import { initials } from "@/lib/colors";
import FanAvatar from "@/components/FanAvatar";
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

type FullData = DashboardData & { analytics: AnalyticsData; balance: StarBalance | null };

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
  credits: "Message credits",
  photo: "Paid photo",
  video: "Paid video",
  bundle: "Photo bundle",
  media: "Media (untagged)",
  tip: "Tip",
  subscription: "VIP subscription",
  other: "Other",
};

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

const REVENUE_REFRESH_MS = 10 * 60 * 1000;

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
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [cloneQuery, setCloneQuery] = useState("");
  const [txQuery, setTxQuery] = useState("");
  // Transactions shown: 10 by default, "Show more" steps to 50 then 100 (max).
  const [txLimit, setTxLimit] = useState(10);
  // Full revenue report — expands below the stats grid from its teaser tile.
  const [reportOpen, setReportOpen] = useState(false);
  const reportRef = useRef<HTMLDivElement | null>(null);

  // Recharts colors are inline JS (not CSS classes) so they don't pick up the
  // light-mode constants rather than theme-conditional.
  const axisColor = "rgba(0,0,0,0.45)";
  const gridColor = "rgba(0,0,0,0.08)";
  const cursorColor = "rgba(0,0,0,0.04)";
  // Last bar in the window is always today/this-bucket — still accumulating,
  // so it renders greyed out (not a clone color) with a "Live" x-axis label
  // instead of the date, no matter which period width is selected.
  const liveBarColor = "rgba(0,0,0,0.14)";

  const fetchData = useCallback(
    async (p: Period, cid?: string | null, range?: { start: string; end: string } | null) => {
      const params = new URLSearchParams();
      if (range) {
        // End-of-day on the picked end date, so the day itself is fully included.
        params.set("start", String(new Date(`${range.start}T00:00:00`).getTime()));
        params.set("end", String(new Date(`${range.end}T23:59:59.999`).getTime()));
      } else {
        params.set("period", p);
      }
      if (cid) params.set("clone", cid);
      const res = await fetch(`/api/dashboard?${params}`, { cache: "no-store" });
      const json = (await res.json()) as FullData;
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

  const money = (stars: number) => fmtMoney(starsToMoneyRate(stars, currency, rate), currency);
  const usd = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (n: number) => `${Math.round(n * 100)}%`;

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
    <div>
      {/* ── Period toggle - a segmented control, not tabs: it re-windows the
          same ledger, it doesn't switch views. Custom range + chart type sit
          alongside it, on the same row. ─────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap gap-0.5 rounded-full bg-elev p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => {
                setCustomRange(null);
                setPeriod(p.key);
              }}
              className={
                "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums transition " +
                (!customRange && period === p.key
                  ? "bg-muted/15 text-ink"
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
              "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums transition " +
              (customRange ? "bg-muted/15 text-ink" : "text-muted hover:bg-muted/10 hover:text-ink")
            }
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M3 9h18M8 2v4M16 2v4" strokeLinecap="round" />
            </svg>
            {customRange ? `${customRange.start} → ${customRange.end}` : "Custom"}
          </button>
        </div>

        {/* Bar / line toggle - same series, different mark. */}
        <div className="inline-flex gap-0.5 rounded-full bg-elev p-0.5">
          <button
            onClick={() => setChartType("bar")}
            aria-label="Bar chart"
            aria-pressed={chartType === "bar"}
            className={
              "rounded-full p-1.5 transition " +
              (chartType === "bar" ? "bg-muted/15 text-ink" : "text-muted hover:bg-muted/10 hover:text-ink")
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
              "rounded-full p-1.5 transition " +
              (chartType === "line" ? "bg-muted/15 text-ink" : "text-muted hover:bg-muted/10 hover:text-ink")
            }
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
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
              <Input type="date" value={draftStart} onChange={(e) => setDraftStart(e.target.value)} max={draftEnd || undefined} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              To
              <Input type="date" value={draftEnd} onChange={(e) => setDraftEnd(e.target.value)} min={draftStart || undefined} />
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

      <div className={scoped ? "" : "grid gap-4 lg:grid-cols-[1fr_260px]"}>
        {/* ── Chart card ───────────────────────────────────────────── */}
        <Card size="sm">
          <CardHeader className="flex-row items-start gap-4 space-y-0">
            <div className="pl-4 pt-3">
              <div className="flex items-center gap-1.5 text-xs text-muted">
                {focusName ?? "Fleet"} · {proceedsLabel}
                <Info text="Every Star earned in this window, gross. This is proceeds, not your current wallet balance - see Balance below for that." />
                {trendPct !== null && (
                  <span className={"font-mono font-semibold tabular-nums " + (trendPct >= 0 ? "text-good" : "text-crit")}>
                    {trendPct >= 0 ? "+" : ""}
                    {trendPct}%
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-start gap-3">
                <span className="flex items-baseline gap-1.5">
                  <span className="font-mono text-2xl font-bold tabular-nums tracking-tight text-ink sm:text-3xl">
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
                    <span className="font-mono text-sm font-semibold tabular-nums text-ink">
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
                <Link href="/info" className="mt-2 inline-block text-xs text-[#f5f5f0]/50 underline underline-offset-2 hover:text-[#f5f5f0]/80">
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
                        tick={{ fill: axisColor, fontSize: 11 }}
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
                              fill={!customRange && idx === data.series.length - 1 ? liveBarColor : c.color}
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
                        tick={{ fill: axisColor, fontSize: 11 }}
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

        {/* ── Sidebar ──────────────────────────────────────────────── */}
        {!scoped && (
          <div>
            <div className="relative mb-2">
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
                value={cloneQuery}
                onChange={(e) => setCloneQuery(e.target.value)}
                placeholder="Search clones…"
                className="h-8 pl-8 text-xs"
              />
            </div>
          <Card size="sm">
            <CardContent className="px-0">
              <div className="divide-y divide-line">
                {(data?.clones ?? [])
                  .filter((c) => c.name.toLowerCase().includes(cloneQuery.trim().toLowerCase()))
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
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                            style={{ background: c.color }}
                          >
                            {initials(c.name)}
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs">{c.name}</span>
                          <span className="block font-mono text-[11px] tabular-nums text-ink">{money(c.stars)}</span>
                        </span>
                      </button>
                    </div>
                  );
                })}
                {(data?.clones ?? []).length === 0 && (
                  <div className="px-3 py-3 text-xs text-muted">No clones.</div>
                )}
              </div>
            </CardContent>
          </Card>
          </div>
        )}
      </div>

      {/* ── Fleet/clone stats - same window as the chart above it. A tile
          grid: each stat gets its own card so the row reads at a glance. */}
      {data && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
          {(() => {
            const s = focusStats ?? data.totals;
            const revPerUser = s.users > 0 ? displayStars / s.users : 0;
            const revPerBuyer = s.buyers > 0 ? displayStars / s.buyers : 0;
            const avgOrder = s.sales > 0 ? displayStars / s.sales : 0;
            const { messaged, purchased } = data.analytics.paywallFunnel;
            const conversion = messaged > 0 ? purchased / messaged : null;
            const repeatRate = data.analytics.funnel.repeatPct;
            // #1 single source — byFeature splits photos/videos/bundles/tips apart,
            // unlike byKind which lumps them into one "Photos & video" bucket.
            const topKind = [...data.analytics.byFeature].sort((a, b) => b.share - a.share)[0];
            const tiles: { label: string; value: string }[] = [
              { label: "Users", value: fmtNum(s.users) },
              { label: "Transactions", value: fmtNum(s.sales) },
              { label: "Active (24h)", value: fmtNum(s.active24h) },
              { label: "Messages", value: fmtNum(s.messages) },
              { label: "Buyers", value: fmtNum(s.buyers) },
              { label: "Rev/user", value: money(revPerUser) },
              { label: "Rev/buyer", value: money(revPerBuyer) },
              { label: "Avg order", value: money(avgOrder) },
              { label: "Conversion", value: conversion !== null ? pct(conversion) : "-" },
              { label: "Repeat rate", value: pct(repeatRate) },
              // Short label so the tile never truncates the number away.
              { label: "Top source", value: topKind && topKind.share > 0 ? `${topKind.label.replace(" (untagged)", "")} ${pct(topKind.share)}` : "-" },
            ];
            return (
              <>
                {tiles.map((t) => (
                  <div key={t.label} className="rounded-lg border border-line bg-elev px-3 py-2.5 shadow-[var(--shadow-card)]">
                    <div className="text-[10px] uppercase tracking-wide text-muted">{t.label}</div>
                    <div className="mt-1 truncate font-mono text-base font-semibold tabular-nums text-ink">{t.value}</div>
                  </div>
                ))}
                {/* Report tile - toggles the full revenue report below the grid. */}
                <button
                  type="button"
                  onClick={() => setReportOpen((v) => !v)}
                  aria-expanded={reportOpen}
                  className={
                    "flex flex-col justify-center rounded-lg border border-dashed px-3 py-2.5 text-left transition " +
                    (reportOpen
                      ? "border-accent/60 bg-accent/5"
                      : "border-line bg-transparent hover:border-muted hover:bg-muted/5")
                  }
                >
                  <div className={"text-xs font-medium " + (reportOpen ? "text-ink" : "text-muted")}>
                    Full revenue report {reportOpen ? "↓" : "→"}
                  </div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted/60">
                    {reportOpen ? "Open below" : "What makes the money"}
                  </div>
                </button>
              </>
            );
          })()}
        </div>
      )}

      {/* ── Full revenue report - every useful cut of the same window/scope as
          the tiles above (data.analytics is fetched with identical period +
          clone params). Toggled by the dashed tile in the stats grid. ─────── */}
      {data && reportOpen && (
        <div ref={reportRef} className="scroll-mt-20">
          <RevenueReport
            a={data.analytics}
            scoped={scoped}
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
              <Info text="Bought shows exactly what made the money when it's known: paid photo, paid video, photo bundle, message credits, tip, or VIP subscription. Media (untagged) is older Telegram-imported history recorded before the exact item was tracked, not a live bug." />
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
                onChange={(e) => setTxQuery(e.target.value)}
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fan</TableHead>
                      {!scoped && <TableHead>Clone</TableHead>}
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
                              {t.cloneName}
                            </span>
                          </TableCell>
                        )}
                        <TableCell className="capitalize text-muted">{TX_KIND_LABEL[t.kind] ?? t.kind}</TableCell>
                        <TableCell className="text-right">
                          <span className="block font-mono tabular-nums text-ink">{money(t.stars)}</span>
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
      <div className={"mt-0.5 font-mono text-sm font-semibold tabular-nums " + (accent === "good" ? "text-good" : "text-ink")}>
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
              {c?.name ?? p.dataKey}
            </span>
            <span className="font-mono tabular-nums text-ink">{money(p.value)}</span>
          </div>
        );
      })}
      <div className="mt-2 flex justify-between border-t border-line pt-2 font-medium">
        <span>Total</span>
        <span className="font-mono tabular-nums text-ink">{money(total)}</span>
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
  money,
  usd,
  pct,
  axisColor,
  cursorColor,
  onClose,
}: {
  a: AnalyticsData;
  scoped: boolean;
  money: (stars: number) => string;
  usd: (n: number) => string;
  pct: (n: number) => string;
  axisColor: string;
  cursorColor: string;
  onClose: () => void;
}) {
  // Categorical hues validated against the light surface (dataviz six-checks);
  // gray is reserved for "Other/untagged" buckets, never a real series.
  const CAT = { blue: "#2a78d6", aqua: "#1baf7a", yellow: "#eda100", violet: "#4a3aa7", red: "#e34948", gray: "#9ca3af" };

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
                : CAT.gray;
  const tierColor = (k: string) =>
    k === "whale" ? CAT.violet : k === "high" ? CAT.blue : k === "mid" ? CAT.aqua : k === "low" ? CAT.yellow : CAT.gray;
  const flowColor = (k: string) => (k === "smart" ? CAT.violet : CAT.blue);

  const totalStars = a.totals.revenueStars;
  const hasRevenue = totalStars > 0;

  // Headline facts — only the ones the data actually supports right now.
  const topFeature = a.byFeature[0];
  const topClone = a.clones[0];
  const whale = a.byTier.find((t) => t.key === "whale");
  const bestHour = hasRevenue ? a.byHour.reduce((m, h) => (h.stars > m.stars ? h : m)) : null;
  const bestDow = hasRevenue ? a.byDow.reduce((m, d) => (d.stars > m.stars ? d : m)) : null;
  const facts: { label: string; value: string }[] = [];
  if (topFeature && topFeature.stars > 0)
    facts.push({ label: "Top earner", value: `${topFeature.label.replace(" (untagged)", "")} · ${pct(topFeature.share)}` });
  if (!scoped && topClone && topClone.revenueStars > 0)
    facts.push({ label: "Top clone", value: `${topClone.name} · ${money(topClone.revenueStars)}` });
  if (whale && whale.stars > 0) facts.push({ label: "Whale share", value: `${pct(whale.share)} of lifetime spend` });
  if (bestHour && bestHour.stars > 0) facts.push({ label: "Peak hour", value: bestHour.label });
  if (bestDow && bestDow.stars > 0) facts.push({ label: "Peak day", value: bestDow.label });

  const earningClones = a.clones.filter((c) => c.revenueStars > 0 || c.sales > 0).slice(0, 8);

  return (
    <Card size="sm" className="mt-4">
      <CardHeader>
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-ink">Revenue report</CardTitle>
        <CardDescription className="text-[11px] text-muted">
          Where the money comes from in this window: product, spender tier, {scoped ? "" : "clone, "}time and funnel.
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Key facts */}
        {facts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {facts.map((f) => (
              <span key={f.label} className="inline-flex items-baseline gap-1.5 rounded-full bg-elev px-2.5 py-1 text-[11px]">
                <span className="text-muted">{f.label}</span>
                <span className="font-medium text-ink">{f.value}</span>
              </span>
            ))}
          </div>
        )}

        {/* What sells + who pays */}
        <div className="grid gap-3 lg:grid-cols-2">
          <ReportPanel title="What sells" hint="Revenue by feature, with sales and average per sale.">
            {a.byFeature.length === 0 ? (
              <ReportEmpty text="No sales in this window." />
            ) : (
              <div className="flex flex-col gap-3">
                {a.byFeature.map((f) => (
                  <ShareRow
                    key={f.key}
                    color={featureColor(f.key)}
                    label={f.label}
                    share={f.share}
                    right={money(f.stars)}
                    rightHint={pct(f.share)}
                    sub={`${fmtNum(f.sales)} sale${f.sales === 1 ? "" : "s"} · avg ${money(f.avgStars)} per sale`}
                  />
                ))}
              </div>
            )}
          </ReportPanel>

          <ReportPanel title="Who pays" hint="Revenue by spend tier. Tiers are lifetime spend per fan, not this window.">
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
          </ReportPanel>
        </div>

        {/* Which clone / which flow - fleet view only (scoped = one clone already) */}
        {!scoped && (
          <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
            <ReportPanel title="By clone" hint="Ranked by revenue. Profit = revenue minus real AI/voice cost.">
              {earningClones.length === 0 ? (
                <ReportEmpty text="No clone earned in this window." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Clone</TableHead>
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
                            <span className="truncate text-ink">{c.name}</span>
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-ink">{money(c.revenueStars)}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-muted">
                          {totalStars > 0 ? pct(c.revenueStars / totalStars) : "-"}
                        </TableCell>
                        <TableCell
                          className={"text-right font-mono tabular-nums " + (c.profitUsd < 0 ? "text-crit" : "text-ink")}
                        >
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
              )}
            </ReportPanel>

            <ReportPanel title="Classic vs Smart" hint="Revenue split by each clone's AI flow.">
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
                      sub={`${fmtNum(f.clones)} clone${f.clones === 1 ? "" : "s"} · ${fmtNum(f.sales)} sales · profit ${usd(f.profitUsd)}`}
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
                      tick={{ fill: axisColor, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={56}
                      tickFormatter={(v: number) => money(v).replace(/\.00$/, "")}
                    />
                    <Tooltip cursor={{ fill: cursorColor }} content={<SingleValueTip money={money} />} />
                    <Bar dataKey="stars" radius={[3, 3, 0, 0]} fill={CAT.blue} />
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
                      tick={{ fill: axisColor, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={56}
                      tickFormatter={(v: number) => money(v).replace(/\.00$/, "")}
                    />
                    <Tooltip cursor={{ fill: cursorColor }} content={<SingleValueTip money={money} />} />
                    <Bar dataKey="stars" radius={[3, 3, 0, 0]} fill={CAT.blue} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ReportPanel>
        </div>

        {/* Funnels */}
        <div className="grid gap-3 lg:grid-cols-2">
          <ReportPanel
            title="Paywall funnel"
            hint="Distinct fans this window: chatted, hit the out-of-messages paywall, bought credits."
          >
            <div className="flex flex-col gap-3">
              <FunnelRow label="Messaged" value={a.paywallFunnel.messaged} width={a.paywallFunnel.messaged > 0 ? 1 : 0} color={CAT.blue} />
              {a.paywallFunnel.collecting ? (
                <p className="text-[11px] leading-relaxed text-muted">
                  Paywall hits aren't logged yet (migration 024). This stage fills in once fans start hitting the wall.
                </p>
              ) : (
                <FunnelRow
                  label="Saw paywall"
                  value={a.paywallFunnel.paywalled}
                  width={a.paywallFunnel.messaged > 0 ? a.paywallFunnel.paywalled / a.paywallFunnel.messaged : 0}
                  color={CAT.yellow}
                  note={a.paywallFunnel.messaged > 0 ? `${pct(a.paywallFunnel.paywallPct)} of chatters hit the wall` : undefined}
                />
              )}
              <FunnelRow
                label="Bought credits"
                value={a.paywallFunnel.purchased}
                width={a.paywallFunnel.messaged > 0 ? a.paywallFunnel.purchased / a.paywallFunnel.messaged : 0}
                color={CAT.aqua}
                note={
                  !a.paywallFunnel.collecting && a.paywallFunnel.paywalled > 0
                    ? `${pct(a.paywallFunnel.purchasePct)} of them convert`
                    : undefined
                }
              />
            </div>
          </ReportPanel>

          <ReportPanel title="Buyer funnel" hint="All-time fans, buyers, and repeat buyers in this scope.">
            <div className="flex flex-col gap-3">
              <FunnelRow label="Fans" value={a.funnel.fans} width={a.funnel.fans > 0 ? 1 : 0} color={CAT.blue} />
              <FunnelRow
                label="Buyers"
                value={a.funnel.buyers}
                width={a.funnel.fans > 0 ? a.funnel.buyers / a.funnel.fans : 0}
                color={CAT.aqua}
                note={a.funnel.fans > 0 ? `${pct(a.funnel.buyerPct)} of fans convert` : undefined}
              />
              <FunnelRow
                label="Repeat buyers"
                value={a.funnel.repeat}
                width={a.funnel.fans > 0 ? a.funnel.repeat / a.funnel.fans : 0}
                color={CAT.violet}
                note={a.funnel.buyers > 0 ? `${pct(a.funnel.repeatPct)} of buyers come back` : undefined}
              />
            </div>
          </ReportPanel>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportPanel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <div className="mb-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink">{title}</h3>
        {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
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
}: {
  color: string;
  label: string;
  share: number;
  right: string;
  rightHint?: string;
  sub?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2 text-xs">
        <span className="h-2 w-2 shrink-0 self-center rounded-full" style={{ background: color }} />
        <span className="min-w-0 flex-1 truncate text-ink">{label}</span>
        {rightHint && <span className="font-mono tabular-nums text-muted">{rightHint}</span>}
        <span className="font-mono font-semibold tabular-nums text-ink">{right}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted/10">
        <div
          className="h-full rounded-full"
          style={{ width: `${share > 0 ? Math.min(100, Math.max(2, share * 100)) : 0}%`, background: color }}
        />
      </div>
      {sub && <div className="mt-1 text-[11px] text-muted">{sub}</div>}
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
        <span className="font-mono tabular-nums text-ink">{money(payload[0].value)}</span>
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
  const tiles: { label: string; value: string }[] = [
    { label: "AI cost", value: `$${stats.costUsd.toFixed(2)}` },
    { label: "Profit (USD)", value: `$${(stats.stars / 50 - stats.costUsd).toFixed(2)}` },
    { label: "AI calls", value: fmtNum(stats.aiCalls) },
    { label: "AI errors", value: fmtNum(stats.aiErrors) },
  ];
  return (
    <Card size="sm" className="mt-4">
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-ink">{name} · AI cost</CardTitle>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-md border border-line bg-bg p-2.5">
              <div className="text-[11px] text-muted">{t.label}</div>
              <div className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-ink">{t.value}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
