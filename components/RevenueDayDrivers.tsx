"use client";

import { useFlirtCreatorLocale } from "@/components/FlirtCreatorLocale";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import type { RevenueChangeRow, RevenueWhyChanged } from "@/lib/revenue-why-changed";
import { fmtDisplayMoney, STAR_USD } from "@/lib/money";
import { useCreatorCurrency } from "@/components/useCreatorCurrency";
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

function formatDay(day: string, locale = "en-AU") {
  const [year, month, date] = day.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(Date.UTC(year, month - 1, date, 12)));
}

function signed(value: number, formatter: (stars: number) => string) {
  if (value === 0) return formatter(0);
  return `${value > 0 ? "+" : "−"}${formatter(Math.abs(value))}`;
}

function signedNumber(value: number | null, locale = "en-AU") {
  if (value == null) return "N/A";
  if (value === 0) return "0";
  return `${value > 0 ? "+" : "−"}${Math.abs(Math.round(value)).toLocaleString(locale)}`;
}

function count(value: number, locale = "en-AU") {
  return Number.isInteger(value) ? value.toLocaleString(locale) : value.toLocaleString(locale, { maximumFractionDigits: 1 });
}

function quantity(value: number, singular: string, plural: string, locale = "en-AU") {
  return `${count(value, locale)} ${value === 1 ? singular : plural}`;
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
              Selected day: {money(row.stars)} net revenue · {quantity(row.sales, "paid order", "paid orders")}. 30-day typical: {money(row.usualStars)} net revenue · {quantity(row.usualSales, "paid order", "paid orders")}.
            </div>
          </div>
          <div className={(row.deltaStars >= 0 ? "text-good" : "text-[#b4432f]") + " shrink-0 text-right font-mono text-[11px] font-semibold"}>
            {signed(row.deltaStars, money)}
            <div className="font-sans text-[10px] font-medium text-muted">vs 30-day typical</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, detail, positive }: { label: string; value: string; detail: string; positive?: boolean | null }) {
  return (
    <div className="rounded-md border border-line bg-panel px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</div>
      <div className="mt-1 font-mono text-lg font-bold tabular-nums text-ink">{value}</div>
      <div className={(positive == null ? "text-muted" : positive ? "text-good" : "text-[#b4432f]") + " mt-0.5 text-[11px] font-medium"}>{detail}</div>
    </div>
  );
}

function SmallSignal({ label, value, detail, positive }: { label: string; value: string; detail: string; positive?: boolean | null }) {
  return (
    <div className="rounded bg-elev px-2.5 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className="mt-0.5 font-mono text-base font-bold text-ink">{value}</div>
      <div className={(positive == null ? "text-muted" : positive ? "text-good" : "text-[#b4432f]") + " mt-0.5 text-[10px] font-medium"}>{detail}</div>
    </div>
  );
}

export default function RevenueDayDrivers({ cloneId }: { cloneId?: string | null }) {
  const { currency, rate } = useCreatorCurrency();
  const { t, locale } = useFlirtCreatorLocale();
  const numberLocale = locale === "en" ? "en-AU" : locale;
  const number = (value: number) => count(value, numberLocale);
  const delta = (value: number | null) => signedNumber(value, numberLocale);
  const quantityText = (value: number, singular: string, plural: string) => quantity(value, singular, plural, numberLocale);
  const today = useMemo(() => reportDayKey(), []);
  const yesterday = useMemo(() => shiftDay(today, -1), [today]);
  // Start on today so both quick actions have an observable outcome: tapping
  // Yesterday switches to the completed day rather than reselecting the
  // silently preselected default.
  const [day, setDay] = useState(today);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const dayInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<RevenueWhyChanged | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const money = (stars: number) => fmtDisplayMoney(stars * STAR_USD * rate, currency, locale);
  const selectedDayHeading = day === today ? t("Earnings today so far", "Ganhos de hoje até agora") : t(`Earnings for ${formatDay(day)}`, `Ganhos de ${formatDay(day, locale)}`);

  function selectDay(nextDay: string) {
    if (!nextDay || nextDay > today) return;
    // Clear the previous result straight away so a newly selected date never
    // appears to be showing the old day's numbers. Incrementing the version
    // also intentionally reloads when someone presses the already-selected day.
    setData(null);
    setError(null);
    setDay(nextDay);
    setSelectionVersion((version) => version + 1);
  }

  function applyPickedDay() {
    // Native calendar controls update this field before React receives an
    // event on a few mobile/browser combinations. The explicit action reads
    // the rendered value directly, so a picked day can never be a visual-only
    // change again. Normal onChange still updates immediately where supported.
    selectDay(dayInputRef.current?.value || day);
  }

  // This stays a compact row until someone chooses to investigate. The 30-day
  // comparison is only read after it is opened.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setData(null);
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
        setError(cause instanceof Error ? cause.message : t("Daily earnings data is unavailable.", "Os dados de ganhos do dia estão indisponíveis."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [day, cloneId, open, selectionVersion]);

  const benchmarkLabel = t("30-day benchmark", "referência de 30 dias");

  return (
    <Card size="sm" className="gap-0 overflow-hidden rounded-lg border border-line bg-panel py-0 shadow-none">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/10 sm:px-4"
      >
        <span className="min-w-0">
          <span className="flex min-w-0 items-start gap-1.5 text-sm font-semibold leading-tight text-ink">
            <span className="min-w-0">{t("Revenue drivers", "Fatores que influenciam os ganhos")}</span>
            <span className="shrink-0"><Info text={t("Compare one calendar day with the median result across the prior 30 calendar days, in the current creator scope.", "Compare um dia com a mediana dos resultados dos 30 dias anteriores para a criadora selecionada.")} /></span>
          </span>
          <span className="mt-0.5 block text-[11px] leading-snug text-muted">{t("Daily earnings analysis compared to previous days & weeks", "Ganhos diários comparados com os dias e semanas anteriores")}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-ink">
          {open ? t("Close", "Fechar") : t("Inspect", "Ver detalhes")}
          {open ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
        </span>
      </button>

      {open && (
        <CardContent className="border-t border-line p-3 sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-ink">{selectedDayHeading}</div>
              <p className="mt-0.5 text-[11px] text-muted">{cloneId ? t("This selected creator only", "Apenas esta criadora") : t("All creators together", "Todas as criadoras")}</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <Button type="button" variant="ghost" size="sm" aria-pressed={day === yesterday} onClick={() => selectDay(yesterday)} className={(day === yesterday ? "bg-[#172b3d] text-white hover:bg-[#0f1d29] hover:text-white" : "") + " h-7 rounded border border-line px-2 text-[11px]"}>
                {t("Yesterday", "Ontem")}
              </Button>
              <Button type="button" variant="ghost" size="sm" aria-pressed={day === today} onClick={() => selectDay(today)} className={(day === today ? "bg-[#172b3d] text-white hover:bg-[#0f1d29] hover:text-white" : "") + " h-7 rounded border border-line px-2 text-[11px]"}>
                {t("Today", "Hoje")}
              </Button>
              <Input ref={dayInputRef} aria-label={t("Choose a day to review", "Escolha um dia para consultar")} type="date" value={day} max={today} onChange={(event) => selectDay(event.target.value)} className="h-7 w-[132px] rounded px-2 text-xs" />
              <Button type="button" variant="ghost" size="sm" onClick={applyPickedDay} className="h-7 rounded border border-line px-2 text-[11px]">
                {t("View", "Consultar")}
              </Button>
            </div>
          </div>

          {loading && <div className="flex min-h-24 items-center justify-center text-sm text-muted">{t("Loading daily earnings data...", "Carregando os ganhos do dia…")}</div>}
          {error && (
            <div className="mt-3 rounded-md border border-[#b4432f]/35 bg-[#fdecea] px-3 py-3 text-sm text-[#7a2b1e]">
              <div className="font-semibold">{t("Daily earnings data is unavailable.", "Os dados de ganhos do dia estão indisponíveis.")}</div>
              <div className="mt-1 text-xs">{t(error, "Tente consultar o período novamente em instantes.")}</div>
            </div>
          )}
          {!loading && data && (
            <div className="mt-3 space-y-3">
              <div className="rounded-md border border-line bg-elev px-3 py-2.5">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="money-value-primary font-mono text-xl font-bold tabular-nums tracking-tight">{money(data.totals.stars)}</span>
                  <span className={(direction(data.totals.deltaStars) == null ? "text-muted" : data.totals.deltaStars > 0 ? "text-good" : "text-[#b4432f]") + " font-mono text-sm font-bold"}>
                    {signed(data.totals.deltaStars, money)} {t("vs", "em comparação com a")} {benchmarkLabel} ({money(data.comparison.benchmark.stars)})
                  </span>
                  {data.day.partial && <span className="rounded bg-[#fff4d6] px-2 py-0.5 text-[10px] font-semibold text-[#8a5a00]">{t("Today so far", "Hoje, até agora")}</span>}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  30-day benchmark = the median daily result across the 30 calendar days immediately before this one ({data.comparison.baselineRangeLabel}), for {data.comparison.scopeLabel}. {data.day.partial && data.day.elapsedLabel ? `Each comparison day is measured through its first ${data.day.elapsedLabel}.` : "These are full calendar days in Sydney time."}
                </p>
                {data.totals.refundStars > 0 && <p className="mt-1 text-[11px] font-medium text-[#8a5a00]">Includes {money(data.totals.refundStars)} in refunds or adjustments.</p>}
              </div>

              <div className={(data.summary.concentrated ? "border-[#d7952d]/55 bg-[#fff8e8]" : "border-line bg-panel") + " rounded-md border px-3 py-2.5"}>
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{t("Daily summary", "Resumo do dia")}</div>
                <p className="mt-1 text-sm font-semibold leading-snug text-ink">{data.summary.headline}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{data.summary.detail}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Stat label={t("Buyers", "Compradores")} value={number(data.totals.buyers)} detail={`${delta(data.totals.deltaBuyers)} ${t("vs baseline of", "em comparação com a referência de")} ${number(data.comparison.benchmark.buyers)}`} positive={direction(data.totals.deltaBuyers)} />
                <Stat label={t("Paid orders", "Pedidos pagos")} value={number(data.totals.sales)} detail={`${delta(data.totals.deltaSales)} ${t("vs baseline of", "em comparação com a referência de")} ${number(data.comparison.benchmark.sales)}`} positive={direction(data.totals.deltaSales)} />
                <Stat label={t("Average paid order", "Valor médio por pedido pago")} value={money(data.totals.averageSaleStars)} detail={`${signed(data.totals.deltaAverageSaleStars, money)} ${t("vs baseline of", "em comparação com a referência de")} ${money(data.comparison.benchmark.averageSaleStars)}`} positive={direction(data.totals.deltaAverageSaleStars)} />
                <Stat label={t("Fans who messaged", "Fãs que enviaram mensagem")} value={data.activity.messagedFans == null ? "N/A" : number(data.activity.messagedFans)} detail={data.activity.deltaMessagedFans == null ? t("Activity unavailable", "Atividade indisponível") : `${delta(data.activity.deltaMessagedFans)} ${t("vs baseline of", "em comparação com a referência de")} ${number(data.activity.usualMessagedFans ?? 0)}`} positive={direction(data.activity.deltaMessagedFans)} />
              </div>

              <details className="rounded-md border border-line">
                <summary className="cursor-pointer px-3 py-2.5 text-xs font-bold text-ink">{t("Audience activity", "Atividade do público")}</summary>
                <div className="border-t border-line p-3">
                  <p className="text-[11px] leading-relaxed text-muted">{t("Daily audience measures. They do not show that a message directly caused a payment.", "Indicadores diários do público. A relação direta entre uma mensagem e um pagamento exige outros dados.")}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <SmallSignal label={t("New fans", "Novos fãs")} value={data.activity.newFans == null ? "N/A" : number(data.activity.newFans)} detail={data.activity.deltaNewFans == null ? t("Activity unavailable", "Atividade indisponível") : `${delta(data.activity.deltaNewFans)} ${t("vs baseline of", "em comparação com a referência de")} ${number(data.activity.usualNewFans ?? 0)}`} positive={direction(data.activity.deltaNewFans)} />
                    <SmallSignal label={t("Conversation messages", "Mensagens nas conversas")} value={data.activity.conversationMessages == null ? "N/A" : number(data.activity.conversationMessages)} detail={data.activity.deltaConversationMessages == null ? t("Activity unavailable", "Atividade indisponível") : `${delta(data.activity.deltaConversationMessages)} ${t("vs baseline of", "em comparação com a referência de")} ${number(data.activity.usualConversationMessages ?? 0)}`} positive={direction(data.activity.deltaConversationMessages)} />
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-muted">{t("Fans who messaged counts distinct inbound fans. Total conversation messages counts all conversation rows, including replies.", "O total de fãs que enviaram mensagem conta pessoas distintas. O total de mensagens inclui todas as mensagens das conversas, inclusive respostas.")}</p>
                </div>
              </details>

              <details className="rounded-md border border-line">
                <summary className="cursor-pointer px-3 py-2.5 text-xs font-bold text-ink">{t("Largest payments and buyers", "Maiores pagamentos e compradores")}</summary>
                <div className="border-t border-line p-3">
                  <p className="text-[11px] leading-relaxed text-muted">{t("The largest individual paid order and highest-paying buyer on the selected day.", "Maior pedido pago e comprador com maior gasto no dia selecionado.")}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {data.concentration.largestPayment ? (
                      <SmallSignal label={t("Largest paid order", "Maior pedido pago")} value={money(data.concentration.largestPayment.stars)} detail={`${data.concentration.largestPayment.feature}, ${Math.round(data.concentration.largestPayment.share * 100)}% of paid-in amount`} />
                    ) : (
                      <SmallSignal label={t("Largest paid order", "Maior pedido pago")} value="N/A" detail="No positive payment" />
                    )}
                    {data.concentration.topBuyer ? (
                      <SmallSignal label={t("Highest-paying buyer", "Comprador com maior gasto")} value={money(data.concentration.topBuyer.stars)} detail={`${quantityText(data.concentration.topBuyer.sales, t("purchase", "compra"), t("purchases", "compras"))}, ${Math.round(data.concentration.topBuyer.share * 100)}% of paid-in amount`} />
                    ) : (
                      <SmallSignal label={t("Highest-paying buyer", "Comprador com maior gasto")} value="N/A" detail="No identified buyer" />
                    )}
                  </div>
                  {(data.concentration.largestPayment || data.concentration.topBuyer) && (
                    <p className="mt-2 text-[11px] leading-relaxed text-muted">
                      {data.concentration.largestPayment ? `Largest paid order: ${data.concentration.largestPayment.name}${cloneId ? "" : `, on ${data.concentration.largestPayment.cloneName}`}.` : ""}
                      {data.concentration.largestPayment && data.concentration.topBuyer ? " " : ""}
                      {data.concentration.topBuyer ? `Highest-paying buyer: ${data.concentration.topBuyer.name}${cloneId ? "" : `, on ${data.concentration.topBuyer.cloneName}`}.` : ""}
                    </p>
                  )}
                  <p className="mt-2 text-[10px] leading-relaxed text-muted">{t("Refunds are not counted as paid orders or buyers. They are shown separately in the earnings total above.", "Os reembolsos ficam fora da contagem de pedidos e compradores. Eles aparecem separadamente no total de ganhos acima.")}</p>
                </div>
              </details>

              <details className="rounded-md border border-line">
                <summary className="cursor-pointer px-3 py-2.5 text-xs font-bold text-ink">{t("Earnings breakdown", "Detalhamento dos ganhos")}</summary>
                <div className="grid gap-3 border-t border-line p-3 lg:grid-cols-2">
                  <p className="lg:col-span-2 rounded-lg bg-muted/10 px-2.5 py-2 text-[10px] leading-relaxed text-muted">
                    <span className="font-semibold text-ink">{t("How to read this:", "Como interpretar")}</span> each row compares selected-day net revenue and positive paid orders with the median daily result from the preceding 30 days. $0 and 0 paid orders under <span className="font-medium text-ink">Selected day</span> means none that day. Under <span className="font-medium text-ink">30-day typical</span>, it means the median comparison day was zero—not that the creator has no historical earnings. Refunds and adjustments affect net revenue but are not paid orders.
                  </p>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.1em] text-ink">{t("Creator revenue & paid orders", "Receita e pedidos pagos por criadora")}</div>
                    <p className="mt-1 text-[11px] text-muted">{t("Creators appear when they had revenue on the selected day or during the prior-30-day comparison.", "São exibidas criadoras com receita no dia selecionado ou nos 30 dias anteriores.")}</p>
                    <ChangeList rows={data.byClone} money={money} empty={t("No creator payments in this comparison.", "Nenhum pagamento por criadora nesta comparação.")} />
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.1em] text-ink">{t("Payment-type revenue & paid orders", "Receita e pedidos pagos por tipo de pagamento")}</div>
                    <p className="mt-1 text-[11px] text-muted">{t("Each payment type is measured using the same selected-day and prior-30-day comparison.", "Cada tipo de pagamento usa a mesma comparação entre o dia selecionado e os 30 dias anteriores.")}</p>
                    <ChangeList rows={data.byFeature} money={money} empty={t("No payment-type data in this comparison.", "Sem dados por tipo de pagamento nesta comparação.")} />
                  </div>
                </div>
              </details>

              <p className="border-t border-line pt-3 text-[11px] leading-relaxed text-muted">{t("Payments and buyers come from the revenue ledger. Messaging figures are context only and do not establish that a message directly caused a payment.", "Os pagamentos e compradores vêm do registro de receitas. Os dados de mensagens ajudam a contextualizar os resultados.")}</p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
