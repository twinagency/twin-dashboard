"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardData, Period } from "@/lib/dashboard-data";
import { fmtMoney, fmtNum, starsToMoneyRate } from "@/lib/money";
import { useCurrency } from "@/components/CurrencyProvider";
import { useTheme } from "@/components/ThemeProvider";
import { initials } from "@/lib/colors";

const PERIODS: { key: Period; label: string; live?: boolean }[] = [
  { key: "ALL", label: "All" },
  { key: "6M", label: "6M" },
  { key: "3M", label: "3M" },
  { key: "1M", label: "1M" },
  { key: "2W", label: "2W" },
  { key: "1W", label: "1W" },
  { key: "1D", label: "1D", live: true },
];

const REVENUE_REFRESH_MS = 10 * 60 * 1000;
const HEALTH_REFRESH_MS = 30 * 60 * 1000;

// Card shell shared by the chart, sidebar and drill-in panels. Light by default,
// dark via the `dark` class on <html>.
const CARD = "rounded-lg border border-gray-200 bg-white text-gray-900 dark:border-white/10 dark:bg-[#0c0c10] dark:text-zinc-100";

type Health = {
  supabase: { ok: boolean; ms: number };
  clones: { id: string; slug: string; name: string; status: string; telegram: { ok: boolean; ms: number } }[];
};

export default function RevenueDashboard({ cloneId }: { cloneId?: string } = {}) {
  const focused = Boolean(cloneId);
  const [period, setPeriod] = useState<Period>("1M");
  const { currency, rate } = useCurrency();
  const { theme } = useTheme();
  const dark = theme === "dark";
  const [data, setData] = useState<DashboardData | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  // Recharts colors are inline JS (not CSS classes) so they don't pick up the
  // `dark:` variant — switch them on the active theme.
  const axisColor = dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.45)";
  const gridColor = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)";
  const cursorColor = dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";

  const fetchData = useCallback(async (p: Period) => {
    const res = await fetch(`/api/dashboard?period=${p}`, { cache: "no-store" });
    const json = (await res.json()) as DashboardData;
    setData(json);
    setLoading(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData(period);
    const id = setInterval(() => fetchData(period), REVENUE_REFRESH_MS);
    return () => clearInterval(id);
  }, [period, fetchData]);

  const money = (stars: number) => fmtMoney(starsToMoneyRate(stars, currency, rate), currency);

  const visibleClones = useMemo(() => {
    const all = data?.clones ?? [];
    if (cloneId) return all.filter((c) => c.id === cloneId);
    return all.filter((c) => !hidden.has(c.id));
  }, [data, hidden, cloneId]);

  // When scoped to one clone, the headline reflects just that clone's totals.
  const focusStats = cloneId && data ? data.perClone[cloneId] : null;
  const displayStars = focusStats ? focusStats.stars : data?.totals.stars ?? 0;
  const displaySales = focusStats ? focusStats.sales : data?.totals.sales ?? 0;
  const focusName = cloneId ? data?.clones.find((c) => c.id === cloneId)?.name : null;

  const filteredSidebar = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.clones ?? []).filter(
      (c) => !q || c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q),
    );
  }, [data, search]);

  const toggleHidden = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const healthById = useMemo(() => {
    const m = new Map<string, Health["clones"][number]>();
    health?.clones.forEach((c) => m.set(c.id, c));
    return m;
  }, [health]);

  return (
    <div>
      {/* ── Headline ───────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500 dark:text-white/50">{focusName ? `${focusName} · ${period}` : `Earned · ${period}`}</div>
          <div className="text-3xl font-bold tracking-tight sm:text-4xl">
            {data ? money(displayStars) : "—"}
          </div>
          <div className="mt-1 text-sm text-gray-500 dark:text-white/50">
            {data ? `${fmtNum(displayStars)} ⭐ · ${fmtNum(displaySales)} sales` : ""}
          </div>
        </div>
      </div>

      {/* ── Period toggle ──────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap gap-1">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition " +
              (period === p.key
                ? "bg-gray-200 text-gray-900 dark:bg-white/10 dark:text-white"
                : "text-gray-500 hover:bg-gray-100 dark:text-white/50 dark:hover:bg-white/5")
            }
          >
            {p.live && (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
            )}
            {p.label}
          </button>
        ))}
      </div>

      <div className={focused ? "" : "grid gap-6 lg:grid-cols-[1fr_300px]"}>
        {/* ── Chart card ───────────────────────────────────────────── */}
        <div className={`${CARD} p-5`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-white/70">Revenue</h2>
            <div className="relative" hidden={focused}>
              <button
                onClick={() => setFilterOpen((v) => !v)}
                className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/5"
              >
                Filter {hidden.size > 0 && <span className="text-brand-light">({hidden.size})</span>}
              </button>
              {filterOpen && (
                <div className="absolute right-0 z-10 mt-2 w-56 rounded-md border border-gray-200 bg-white p-2 shadow-xl dark:border-white/10 dark:bg-[#15151c]">
                  {(data?.clones ?? []).map((c) => (
                    <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-white/5">
                      <input
                        type="checkbox"
                        checked={!hidden.has(c.id)}
                        onChange={() => toggleHidden(c.id)}
                        className="h-3.5 w-3.5 accent-brand"
                      />
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                      <span className="truncate">{c.name}</span>
                    </label>
                  ))}
                  {(data?.clones.length ?? 0) === 0 && (
                    <div className="px-2 py-1.5 text-sm text-gray-400 dark:text-white/40">No clones</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="h-[220px] sm:h-[320px]">
            {loading ? (
              <div className="flex h-full items-center justify-center text-gray-400 dark:text-white/40">Loading…</div>
            ) : data && displayStars > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis dataKey="bucket" tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
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
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center text-gray-400 dark:text-white/40">
                <div className="text-2xl">📊</div>
                <div className="mt-2 text-sm">No revenue in this period yet.</div>
                <div className="text-xs text-gray-400 dark:text-white/30">It fills in as Stars purchases come through.</div>
              </div>
            )}
          </div>
        </div>

        {/* ── Sidebar ──────────────────────────────────────────────── */}
        {!focused && (
        <div className="flex flex-col gap-6">
          <div className={`${CARD} p-4`}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clones…"
              className="mb-3 w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm outline-none focus:border-brand-light dark:border-white/10 dark:bg-white/5"
            />
            <div className="flex flex-col gap-1">
              {filteredSidebar.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelected(selected === c.id ? null : c.id)}
                  className={
                    "flex items-center gap-3 rounded-md px-2 py-2 text-left transition " +
                    (selected === c.id ? "bg-gray-200 dark:bg-white/10" : "hover:bg-gray-100 dark:hover:bg-white/5")
                  }
                >
                  {c.photoUrl ? (
                    <img src={c.photoUrl} alt={c.name} className="h-8 w-8 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{ background: c.color }}
                    >
                      {initials(c.name)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{c.name}</span>
                    <span className="block text-xs text-gray-500 dark:text-white/40">{money(c.stars)}</span>
                  </span>
                </button>
              ))}
              {filteredSidebar.length === 0 && (
                <div className="px-2 py-3 text-sm text-gray-400 dark:text-white/40">No matches.</div>
              )}
            </div>
          </div>
        </div>
        )}
      </div>

      {/* ── Drill-in ─────────────────────────────────────────────── */}
      {selected && data && (
        <DrillIn
          name={data.clones.find((c) => c.id === selected)?.name ?? ""}
          stats={data.perClone[selected]}
          money={money}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function Dot({ ok }: { ok?: boolean }) {
  const color = ok === undefined ? "bg-gray-300 dark:bg-white/30" : ok ? "bg-green-500" : "bg-red-500";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
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
    <div className="rounded-md border border-gray-200 bg-white p-3 text-xs shadow-xl dark:border-white/10 dark:bg-[#15151c]">
      <div className="mb-2 font-medium text-gray-700 dark:text-white/80">{label}</div>
      {rows.map((p) => {
        const c = byId.get(p.dataKey);
        return (
          <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-2 text-gray-500 dark:text-white/60">
              <span className="h-2 w-2 rounded-full" style={{ background: c?.color }} />
              {c?.name ?? p.dataKey}
            </span>
            <span className="text-gray-700 dark:text-white/80">{money(p.value)}</span>
          </div>
        );
      })}
      <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 font-medium dark:border-white/10">
        <span>Total</span>
        <span>{money(total)}</span>
      </div>
    </div>
  );
}

function DrillIn({
  name,
  stats,
  money,
  onClose,
}: {
  name: string;
  stats: import("@/lib/dashboard-data").CloneStats;
  money: (stars: number) => string;
  onClose: () => void;
}) {
  const tiles: { label: string; value: string }[] = [
    { label: "Revenue", value: money(stats.stars) },
    { label: "Stars", value: `${fmtNum(stats.stars)} ⭐` },
    { label: "Sales", value: fmtNum(stats.sales) },
    { label: "Users", value: fmtNum(stats.users) },
    { label: "Active 7d", value: fmtNum(stats.active7d) },
    { label: "Messages", value: fmtNum(stats.messages) },
    { label: "Rev / User", value: money(stats.users ? stats.stars / stats.users : 0) },
    { label: "Rev / Buyer", value: money(stats.buyers ? stats.stars / stats.buyers : 0) },
    { label: "Buyers", value: fmtNum(stats.buyers) },
    // Money report: AI/voice spend vs a rough USD profit (Stars valued at 50/$1,
    // the platform's STARS_PER_USD). Cost is real USD from usage_events.
    { label: "AI cost", value: `$${stats.costUsd.toFixed(2)}` },
    { label: "Profit (USD)", value: `$${(stats.stars / 50 - stats.costUsd).toFixed(2)}` },
    { label: "AI calls", value: fmtNum(stats.aiCalls) },
    { label: "AI errors", value: fmtNum(stats.aiErrors) },
  ];
  return (
    <div className="mt-6 rounded-lg border border-gray-200 bg-white text-gray-900 p-5 dark:border-white/10 dark:bg-[#0c0c10] dark:text-zinc-100">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-white/70">{name} · breakdown</h3>
        <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-900 dark:text-white/40 dark:hover:text-white">
          Close ✕
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
            <div className="text-xs text-gray-500 dark:text-white/50">{t.label}</div>
            <div className="mt-1 text-xl font-semibold">{t.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
