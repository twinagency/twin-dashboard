"use client";

import { useEffect, useMemo, useState } from "react";
import type { RevenueChangeRow, RevenueWhyChanged } from "@/lib/revenue-why-changed";
import { fmtMoney, starsToMoneyRate } from "@/lib/money";
import { useCurrency } from "@/components/CurrencyProvider";
import { Info } from "@/components/clone/fields";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

function ChangeList({ rows, money, empty }: { rows: RevenueChangeRow[]; money: (stars: number) => string; empty: string }) {
  if (!rows.length) return <p className="py-3 text-xs text-muted">{empty}</p>;
  return (
    <div className="divide-y divide-line">
      {rows.map((row) => (
        <div key={row.key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <div className="min-w-0">
            <div className="truncate font-medium text-ink">{row.label}</div>
            <div className="mt-0.5 text-[11px] text-muted">
              {row.sales.toLocaleString("en-AU")} sales · usual {row.usualSales.toFixed(1)}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="money-value font-mono text-sm font-semibold">{money(row.stars)}</div>
            <div className={(row.deltaStars >= 0 ? "text-good" : "text-[#b4432f]") + " mt-0.5 font-mono text-[11px] font-semibold"}>
              {signed(row.deltaStars, money)} vs usual
            </div>
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

export default function RevenueDayDrivers({ cloneId }: { cloneId?: string | null }) {
  const { currency, rate } = useCurrency();
  const today = useMemo(() => reportDayKey(), []);
  // Start with the latest complete day. It keeps the first explanation honest;
  // operators can explicitly switch to Today when they want the live partial-day
  // comparison instead.
  const [day, setDay] = useState(() => shiftDay(reportDayKey(), -1));
  const [data, setData] = useState<RevenueWhyChanged | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const money = (stars: number) => fmtMoney(starsToMoneyRate(stars, currency, rate), currency);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/dashboard/day-insight?date=${encodeURIComponent(day)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const json = (await response.json()) as RevenueWhyChanged & { error?: string };
        if (!response.ok || json.error) throw new Error(json.error || "This day could not be explained.");
        return json;
      })
      .then((json) => {
        if (!controller.signal.aborted) setData(json);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setData(null);
        setError(cause instanceof Error ? cause.message : "This day could not be explained.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [day, cloneId]);

  return (
    <Card size="sm" className="mt-4 overflow-hidden border-[#4a8ec4]/45">
      <CardHeader className="gap-3 bg-[#06172f] px-3 py-3 text-white sm:flex-row sm:items-start sm:justify-between sm:px-4">
        <div>
          <CardTitle className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.12em] text-white">
            What drove this day?
            <Info text="A factual comparison with the previous four matching weekdays. “Usual” is their median, so one earlier outlier does not become the normal benchmark. It separates a broad lift in people messaging and buying from a day dominated by one unusually large payment." />
          </CardTitle>
          <CardDescription className="mt-1 text-[11px] leading-relaxed text-white/70">
            Pick any day to see the payments, buyers, product mix and conversation activity behind its result.
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDay(shiftDay(today, -1))}
            className="h-7 border border-white/20 bg-white/10 px-2 text-[11px] text-white hover:bg-white/20 hover:text-white"
          >
            Yesterday
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDay(today)}
            className="h-7 border border-white/20 bg-white/10 px-2 text-[11px] text-white hover:bg-white/20 hover:text-white"
          >
            Today
          </Button>
          <Input
            aria-label="Choose a day to explain"
            type="date"
            value={day}
            max={today}
            onChange={(event) => event.target.value && setDay(event.target.value)}
            className="h-7 w-[132px] border-white/25 bg-white px-2 text-xs text-[#06172f]"
          />
        </div>
      </CardHeader>

      <CardContent className="p-3 sm:p-4">
        {loading && <div className="flex min-h-40 items-center justify-center text-sm text-muted">Reading what changed…</div>}
        {error && (
          <div className="rounded-xl border border-[#b4432f]/35 bg-[#fdecea] px-3 py-3 text-sm text-[#7a2b1e]">
            <div className="font-semibold">This day could not be explained.</div>
            <div className="mt-1 text-xs">{error}</div>
          </div>
        )}
        {!loading && data && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{data.day.partial ? "Today so far" : data.day.label}</div>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="money-value-primary font-mono text-2xl font-bold tabular-nums tracking-tight">{money(data.totals.stars)}</span>
                  <span className={(data.totals.deltaStars >= 0 ? "text-good" : "text-[#b4432f]") + " font-mono text-sm font-bold"}>{signed(data.totals.deltaStars, money)} vs usual</span>
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  Compared with {data.comparison.label}{data.day.partial && data.day.elapsedLabel ? ` (${data.day.elapsedLabel} into the day)` : ""}.
                </p>
                {data.totals.refundStars > 0 && (
                  <p className="mt-1 text-[11px] font-medium text-[#8a5a00]">
                    Includes {money(data.totals.refundStars)} in refunds / adjustments.
                  </p>
                )}
              </div>
              {data.day.partial && <span className="rounded-full bg-[#fff4d6] px-2 py-1 text-[11px] font-semibold text-[#8a5a00]">Live, not a full day</span>}
            </div>

            <div className={(data.summary.concentrated ? "border-[#d7952d]/55 bg-[#fff8e8]" : "border-[#4a8ec4]/45 bg-[#eff8ff]") + " rounded-xl border p-3"}>
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">The short answer</div>
              <p className="mt-1 text-sm font-semibold leading-snug text-ink">{data.summary.headline}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{data.summary.detail}</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Buyers" value={data.totals.buyers.toLocaleString("en-AU")} detail={`${signedNumber(data.totals.deltaBuyers)} vs usual`} positive={data.totals.deltaBuyers >= 0} />
              <Stat label="Sales" value={data.totals.sales.toLocaleString("en-AU")} detail={`${signedNumber(data.totals.deltaSales)} vs usual`} positive={data.totals.deltaSales >= 0} />
              <Stat label="Average sale" value={money(data.totals.averageSaleStars)} detail={`${signed(data.totals.deltaAverageSaleStars, money)} vs usual`} positive={data.totals.deltaAverageSaleStars >= 0} />
              <Stat label="Fans who messaged" value={data.activity.messagedFans == null ? "N/A" : data.activity.messagedFans.toLocaleString("en-AU")} detail={data.activity.deltaMessagedFans == null ? "Activity unavailable" : `${signedNumber(data.activity.deltaMessagedFans)} vs usual`} positive={data.activity.deltaMessagedFans == null ? null : data.activity.deltaMessagedFans >= 0} />
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-line p-3">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.1em] text-ink">
                  People and activity
                  <Info text="Fans who messaged is the number of distinct people with an incoming message. It is a traffic signal, not proof that messages caused a payment." />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Stat label="New fans" value={data.activity.newFans == null ? "N/A" : data.activity.newFans.toLocaleString("en-AU")} detail={data.activity.deltaNewFans == null ? "Activity unavailable" : `${signedNumber(data.activity.deltaNewFans)} vs usual`} positive={data.activity.deltaNewFans == null ? null : data.activity.deltaNewFans >= 0} />
                  <Stat label="Conversation messages" value={data.activity.conversationMessages == null ? "N/A" : data.activity.conversationMessages.toLocaleString("en-AU")} detail={data.activity.deltaConversationMessages == null ? "Activity unavailable" : `${signedNumber(data.activity.deltaConversationMessages)} vs usual`} positive={data.activity.deltaConversationMessages == null ? null : data.activity.deltaConversationMessages >= 0} />
                </div>
              </div>

              <div className="rounded-xl border border-line p-3">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.1em] text-ink">
                  Was it one big payment?
                  <Info text="This shows the largest positive payment and the top payer for the selected day. A high share means incoming payments were concentrated rather than broadly distributed; refunds are shown separately." />
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {data.concentration.largestPayment ? (
                    <div className="rounded-xl bg-muted/10 p-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">Largest payment</div>
                      <div className="money-value mt-1 font-mono text-base font-bold">{money(data.concentration.largestPayment.stars)}</div>
                      <div className="mt-1 truncate text-xs font-medium text-ink">{data.concentration.largestPayment.name}</div>
                      <div className="mt-0.5 text-[11px] text-muted">{data.concentration.largestPayment.feature} · {Math.round(data.concentration.largestPayment.share * 100)}% of incoming payments</div>
                      {!cloneId && <div className="mt-0.5 truncate text-[11px] text-muted">{data.concentration.largestPayment.cloneName}</div>}
                    </div>
                  ) : (
                    <div className="rounded-xl bg-muted/10 p-2.5 text-xs text-muted">No identifiable payment.</div>
                  )}
                  {data.concentration.topBuyer ? (
                    <div className="rounded-xl bg-muted/10 p-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">Top buyer</div>
                      <div className="money-value mt-1 font-mono text-base font-bold">{money(data.concentration.topBuyer.stars)}</div>
                      <div className="mt-1 truncate text-xs font-medium text-ink">{data.concentration.topBuyer.name}</div>
                      <div className="mt-0.5 text-[11px] text-muted">{data.concentration.topBuyer.sales} purchases · {Math.round(data.concentration.topBuyer.share * 100)}% of incoming payments</div>
                      {!cloneId && <div className="mt-0.5 truncate text-[11px] text-muted">{data.concentration.topBuyer.cloneName}</div>}
                    </div>
                  ) : (
                    <div className="rounded-xl bg-muted/10 p-2.5 text-xs text-muted">No identified buyer.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-line p-3">
                <div className="text-xs font-bold uppercase tracking-[0.1em] text-ink">Which clones changed?</div>
                <p className="mt-1 text-[11px] text-muted">Positive and negative contributions compared with a usual matching weekday.</p>
                <ChangeList rows={data.byClone} money={money} empty="No clone payments in this comparison." />
              </div>
              <div className="rounded-xl border border-line p-3">
                <div className="text-xs font-bold uppercase tracking-[0.1em] text-ink">What sold differently?</div>
                <p className="mt-1 text-[11px] text-muted">Product mix explains whether the difference came from tips, media, bundles or paid messages.</p>
                <ChangeList rows={data.byFeature} money={money} empty="No product payments in this comparison." />
              </div>
            </div>

            <p className="border-t border-line pt-3 text-[11px] leading-relaxed text-muted">
              Payments and buyers are exact ledger events. Messaging figures show what changed alongside revenue; they are signals to investigate, not a claim that one directly caused the other.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
