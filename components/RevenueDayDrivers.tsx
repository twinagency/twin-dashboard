"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import type { RevenueChangeRow, RevenueWhyChanged } from "@/lib/revenue-why-changed";
import { fmtMoney, starsToMoneyRate } from "@/lib/money";
import { useCurrency } from "@/components/CurrencyProvider";
import { Info } from "@/components/clone/fields";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const REPORT_TZ = process.env.NEXT_PUBLIC_REPORT_TIMEZONE || "Australia/Sydney";

function reportDayKey(now = new Date()) {
  const fields: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)) {
    fields[part.type] = part.value;
  }
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function shiftDay(day: string, amount: number) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + amount)).toISOString().slice(0, 10);
}

function signed(value: number, formatter: (stars: number) => string) {
  if (value === 0) return formatter(0);
  return `${value > 0 ? "+" : "−"}${formatter(Math.abs(value))}`;
}

function signedNumber(value: number | null) {
  if (value == null) return "N/A";
  if (value === 0) return "0";
  return `${value > 0 ? "+" : "−"}${Math.abs(Math.round(value)).toLocaleString("en-AU")}`;
}

function count(value: number) {
  return Number.isInteger(value) ? value.toLocaleString("en-AU") : value.toLocaleString("en-AU", { maximumFractionDigits: 1 });
}

function quantity(value: number, singular: string, plural: string) {
  return `${count(value)} ${value === 1 ? singular : plural}`;
}

function direction(value: number | null) {
  return value == null || value === 0 ? null : value > 0;
}

function ChangeList({
  rows,
  money,
  empty,
}: {
  rows: RevenueChangeRow[];
  money: (stars: number) => string;
  empty: string;
}) {
  if (!rows.length) return <p className="py-2 text-xs text-muted">{empty}</p>;
  return (
    <div className="divide-y divide-line">
      {rows.map((row) => (
        <div key={row.key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <div className="min-w-0">
            <div className="truncate font-medium text-ink">{row.label}</div>
            <div className="mt-0.5 text-[11px] leading-relaxed text-muted">
              Selected day: {money(row.stars)} from {quantity(row.sales, "paid order", "paid orders")}. Baseline: {money(row.usualStars)} from {quantity(row.usualSales, "paid order", "paid orders")}.
            </div>
          </div>
          <div className={(row.deltaStars >= 0 ? "text-good" : "text-[#b4432f]") + " shrink-0 text-right font-mono text-[11px] font-semibold"}>
            {signed(row.deltaStars, money)}
            <div className="font-sans text-[10px] font-medium text-muted">vs baseline</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, detail, positive }: { label: string; value: string; detail: string; positive?: boolean | null }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</div>
      <div className="mt-1 font-mono text-lg font-bold tabular-nums text-ink">{value}</div>
      <div className={(positive == null ? "text-muted" : positive ? "text-good" : "text-[#b4432f]") + " mt-0.5 text-[11px] font-medium"}>{detail}</div>
    </div>
  );
}

function SmallSignal({ label, value, detail, positive }: { label: string; value: string; detail: string; positive?: boolean | null }) {
  return (
    <div className="rounded-lg bg-muted/10 px-2.5 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className="mt-0.5 font-mono text-base font-bold text-ink">{value}</div>
      <div className={(positive == null ? "text-muted" : positive ? "text-good" : "text-[#b4432f]") + " mt-0.5 text-[10px] font-medium"}>{detail}</div>
    </div>
  );
}

export default function RevenueDayDrivers({ cloneId }: { cloneId?: string | null }) {
  const { currency, rate } = useCurrency();
  const today = useMemo(() => reportDayKey(), []);
  const [day, setDay] = useState(() => shiftDay(reportDayKey(), -1));
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<RevenueWhyChanged | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const money = (stars: number) => fmtMoney(starsToMoneyRate(stars, currency, rate), currency);

  // This stays a compact row until someone chooses to investigate. The five-day
  // comparison is only read after it is opened.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/dashboard/day-insight?date=${encodeURIComponent(day)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const json = (await response.json()) as RevenueWhyChanged & { error?: string };
        if (!response.ok || json.error) throw new Error(json.error || "Daily earnings data is unavailable.");
        return json;
      })
      .then((json) => {
        if (!controller.signal.aborted) setData(json);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setData(null);
        setError(cause instanceof Error ? cause.message : "Daily earnings data is unavailable.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [day, cloneId, open]);

  const benchmarkLabel = data?.comparison.benchmarkLabel ?? "30-day baseline";

  return (
    <Card size="sm" className="mt-4 overflow-hidden border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/10 sm:px-4"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
            Daily earnings analysis
            <Info text="Compare one calendar day with the median result across the prior 30 calendar days, in the current creator scope." />
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-muted">Review buyers, orders, audience activity, major payments, and product mix for any day.</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[#28658f]">
          {open ? "Hide" : "Open"}
          {open ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
        </span>
      </button>

      {open && (
        <CardContent className="border-t border-line p-3 sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-ink">{data ? (data.day.partial ? "Earnings today so far" : `Earnings for ${data.day.label}`) : "Choose a day to review"}</div>
              <p className="mt-0.5 text-[11px] text-muted">{cloneId ? "This selected creator only" : "All creators together"}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button type="button" variant="ghost" size="sm" onClick={() => setDay(shiftDay(today, -1))} className="h-7 border border-line px-2 text-[11px]">
                Yesterday
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setDay(today)} className="h-7 border border-line px-2 text-[11px]">
                Today
              </Button>
              <Input aria-label="Choose a day to review" type="date" value={day} max={today} onChange={(event) => event.target.value && setDay(event.target.value)} className="h-7 w-[132px] px-2 text-xs" />
            </div>
          </div>

          {loading && <div className="flex min-h-24 items-center justify-center text-sm text-muted">Loading daily earnings data...</div>}
          {error && (
            <div className="mt-3 rounded-xl border border-[#b4432f]/35 bg-[#fdecea] px-3 py-3 text-sm text-[#7a2b1e]">
              <div className="font-semibold">Daily earnings data is unavailable.</div>
              <div className="mt-1 text-xs">{error}</div>
            </div>
          )}
          {!loading && data && (
            <div className="mt-3 space-y-3">
              <div className="rounded-xl border border-[#4a8ec4]/35 bg-[#eff8ff] px-3 py-2.5">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="money-value-primary font-mono text-xl font-bold tabular-nums tracking-tight">{money(data.totals.stars)}</span>
                  <span className={(direction(data.totals.deltaStars) == null ? "text-muted" : data.totals.deltaStars > 0 ? "text-good" : "text-[#b4432f]") + " font-mono text-sm font-bold"}>
                    {signed(data.totals.deltaStars, money)} vs {benchmarkLabel} ({money(data.comparison.benchmark.stars)})
                  </span>
                  {data.day.partial && <span className="rounded-full bg-[#fff4d6] px-2 py-0.5 text-[10px] font-semibold text-[#8a5a00]">Today so far</span>}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  30-day baseline = the median across the prior 30 calendar days, for {data.comparison.scopeLabel}. {data.day.partial && data.day.elapsedLabel ? `Each day is measured through its first ${data.day.elapsedLabel}.` : "These are full calendar days in Sydney time."}
                </p>
                {data.totals.refundStars > 0 && <p className="mt-1 text-[11px] font-medium text-[#8a5a00]">Includes {money(data.totals.refundStars)} in refunds or adjustments.</p>}
              </div>

              <div className={(data.summary.concentrated ? "border-[#d7952d]/55 bg-[#fff8e8]" : "border-[#4a8ec4]/35 bg-surface") + " rounded-xl border px-3 py-2.5"}>
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Daily summary</div>
                <p className="mt-1 text-sm font-semibold leading-snug text-ink">{data.summary.headline}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{data.summary.detail}</p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Buyers" value={count(data.totals.buyers)} detail={`${signedNumber(data.totals.deltaBuyers)} vs baseline of ${count(data.comparison.benchmark.buyers)}`} positive={direction(data.totals.deltaBuyers)} />
                <Stat label="Paid orders" value={count(data.totals.sales)} detail={`${signedNumber(data.totals.deltaSales)} vs baseline of ${count(data.comparison.benchmark.sales)}`} positive={direction(data.totals.deltaSales)} />
                <Stat label="Average paid order" value={money(data.totals.averageSaleStars)} detail={`${signed(data.totals.deltaAverageSaleStars, money)} vs baseline of ${money(data.comparison.benchmark.averageSaleStars)}`} positive={direction(data.totals.deltaAverageSaleStars)} />
                <Stat label="Fans who messaged" value={data.activity.messagedFans == null ? "N/A" : count(data.activity.messagedFans)} detail={data.activity.deltaMessagedFans == null ? "Activity unavailable" : `${signedNumber(data.activity.deltaMessagedFans)} vs baseline of ${count(data.activity.usualMessagedFans ?? 0)}`} positive={direction(data.activity.deltaMessagedFans)} />
              </div>

              <details className="rounded-xl border border-line">
                <summary className="cursor-pointer px-3 py-2.5 text-xs font-bold text-ink">Audience activity</summary>
                <div className="border-t border-line p-3">
                  <p className="text-[11px] leading-relaxed text-muted">Daily audience measures. They do not show that a message directly caused a payment.</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <SmallSignal label="New fans" value={data.activity.newFans == null ? "N/A" : count(data.activity.newFans)} detail={data.activity.deltaNewFans == null ? "Activity unavailable" : `${signedNumber(data.activity.deltaNewFans)} vs baseline of ${count(data.activity.usualNewFans ?? 0)}`} positive={direction(data.activity.deltaNewFans)} />
                    <SmallSignal label="Conversation messages" value={data.activity.conversationMessages == null ? "N/A" : count(data.activity.conversationMessages)} detail={data.activity.deltaConversationMessages == null ? "Activity unavailable" : `${signedNumber(data.activity.deltaConversationMessages)} vs baseline of ${count(data.activity.usualConversationMessages ?? 0)}`} positive={direction(data.activity.deltaConversationMessages)} />
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-muted">Fans who messaged counts distinct inbound fans. Total conversation messages counts all conversation rows, including replies.</p>
                </div>
              </details>

              <details className="rounded-xl border border-line">
                <summary className="cursor-pointer px-3 py-2.5 text-xs font-bold text-ink">Largest payments and buyers</summary>
                <div className="border-t border-line p-3">
                  <p className="text-[11px] leading-relaxed text-muted">The largest individual paid order and highest-paying buyer on the selected day.</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {data.concentration.largestPayment ? (
                      <SmallSignal label="Largest paid order" value={money(data.concentration.largestPayment.stars)} detail={`${data.concentration.largestPayment.feature}, ${Math.round(data.concentration.largestPayment.share * 100)}% of paid-in amount`} />
                    ) : (
                      <SmallSignal label="Largest paid order" value="N/A" detail="No positive payment" />
                    )}
                    {data.concentration.topBuyer ? (
                      <SmallSignal label="Highest-paying buyer" value={money(data.concentration.topBuyer.stars)} detail={`${quantity(data.concentration.topBuyer.sales, "purchase", "purchases")}, ${Math.round(data.concentration.topBuyer.share * 100)}% of paid-in amount`} />
                    ) : (
                      <SmallSignal label="Highest-paying buyer" value="N/A" detail="No identified buyer" />
                    )}
                  </div>
                  {(data.concentration.largestPayment || data.concentration.topBuyer) && (
                    <p className="mt-2 text-[11px] leading-relaxed text-muted">
                      {data.concentration.largestPayment ? `Largest paid order: ${data.concentration.largestPayment.name}${cloneId ? "" : `, on ${data.concentration.largestPayment.cloneName}`}.` : ""}
                      {data.concentration.largestPayment && data.concentration.topBuyer ? " " : ""}
                      {data.concentration.topBuyer ? `Highest-paying buyer: ${data.concentration.topBuyer.name}${cloneId ? "" : `, on ${data.concentration.topBuyer.cloneName}`}.` : ""}
                    </p>
                  )}
                  <p className="mt-2 text-[10px] leading-relaxed text-muted">Refunds are not counted as paid orders or buyers. They are shown separately in the earnings total above.</p>
                </div>
              </details>

              <details className="rounded-xl border border-line">
                <summary className="cursor-pointer px-3 py-2.5 text-xs font-bold text-ink">Earnings breakdown</summary>
                <div className="grid gap-3 border-t border-line p-3 lg:grid-cols-2">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.1em] text-ink">By creator</div>
                    <p className="mt-1 text-[11px] text-muted">Each line shows that creator&apos;s selected-day revenue versus its {benchmarkLabel.toLowerCase()}.</p>
                    <ChangeList rows={data.byClone} money={money} empty="No creator payments in this comparison." />
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.1em] text-ink">By payment type</div>
                    <p className="mt-1 text-[11px] text-muted">Each line shows the selected-day revenue for that payment type versus its {benchmarkLabel.toLowerCase()}.</p>
                    <ChangeList rows={data.byFeature} money={money} empty="No payment-type data in this comparison." />
                  </div>
                </div>
              </details>

              <p className="border-t border-line pt-3 text-[11px] leading-relaxed text-muted">Payments and buyers come from the revenue ledger. Messaging figures are context only and do not establish that a message directly caused a payment.</p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
