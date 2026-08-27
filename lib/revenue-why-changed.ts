import { cloneUserStatsWindow, messagedFanCount } from "./rollup";
import { REPORT_TZ } from "./report-time";
import { selectAllRows } from "./select-all";
import { supabaseAdmin } from "./supabase";

// ── Why it changed ──────────────────────────────────────────────────────────
//
// A total tells an operator WHAT arrived. This module answers the next question:
// was a high/low day broad demand (more people talking and buying), a product
// mix shift, or one unusual payment? It compares the selected day with the
// previous 30 REPORT_TZ calendar days, not simply yesterday. The median keeps
// one unusually large payment from redefining what a normal day looks like.
//
// Do not call any of these correlations "proof of cause". A payment itself is
// direct evidence; an increase in people messaging is a contemporaneous traffic
// signal. The UI uses "What changed" and states the raw facts so an operator is
// not handed a made-up causal story.

const BASELINE_DAYS = 30;
// The activity rollups currently return one day at a time. Keep the exact daily
// comparison, but do not launch 60 database RPCs at once when this panel opens.
const ACTIVITY_CONCURRENCY = 6;
// This card has to inspect 31 day windows and activity rollups. Keep it
// responsive without letting every opened browser duplicate that work. A short
// lifetime is intentional: historical days do not need second-by-second
// updates, while today's next request is never more than a minute old.
const INSIGHT_CACHE_TTL_MS = 60_000;
const INSIGHT_CACHE_MAX_ENTRIES = 48;

const FEATURE_LABEL: Record<string, string> = {
  credits: "Paid Messages",
  photo: "Photos",
  video: "Videos",
  bundle: "Bundles",
  media: "Media (untagged)",
  tip: "Tips / spoil",
  subscription: "VIP subscriptions",
  refund: "Refunds / adjustments",
  other: "Other",
};

type PurchaseRow = {
  id: string;
  clone_id: string | null;
  telegram_id: number | null;
  amount_stars: number | string | null;
  paid_at: string;
  kind: string | null;
  feature: string | null;
  invoice_payload: string | null;
};

type CloneRow = { id: string; name: string | null };
type BuyerRow = { clone_id: string; telegram_id: number; name: string | null; stated_name: string | null; username: string | null };

type DriverPurchase = {
  id: string;
  cloneId: string;
  telegramId: number | null;
  stars: number;
  paidAt: string;
  feature: string;
  /** A refund/negative ledger adjustment is part of net proceeds, but is not a sale. */
  adjustment: boolean;
};

export type RevenueDayActivity = {
  /** Distinct fans who sent at least one incoming message that day. */
  messagedFans: number | null;
  /** Fans first seen that day. This is new audience, not every active fan. */
  newFans: number | null;
  /** All chat-history rows, useful as a volume signal but not a distinct-person count. */
  conversationMessages: number | null;
};

type MetricTotals = {
  /** Net proceeds: every signed ledger entry, exactly as the revenue total uses it. */
  stars: number;
  /** Positive payment volume before refunds/adjustments. */
  grossPaymentStars: number;
  /** Absolute value of refund/adjustment entries on this day. */
  refundStars: number;
  sales: number;
  buyers: number;
  averageSaleStars: number;
};

type BuyerTotal = {
  /** The clone where this fan paid the most, used to find a display identity. */
  cloneId: string;
  telegramId: number | null;
  stars: number;
  sales: number;
  byClone: Map<string, number>;
};
type DriverTotal = { key: string; stars: number; sales: number };

export type RevenueChangeRow = {
  key: string;
  label: string;
  stars: number;
  sales: number;
  usualStars: number;
  usualSales: number;
  deltaStars: number;
};

export type RevenueWhyChanged = {
  day: {
    key: string;
    label: string;
    partial: boolean;
    elapsedLabel: string | null;
  };
  comparison: {
    label: string;
    /** Compact, visible name for the 30-day median comparison. */
    benchmarkLabel: string;
    /** The exact dates used to make the median understandable and auditable. */
    baselineDays: { key: string; label: string }[];
    /** Short inclusive date range for compact/mobile UI; the detailed dates stay available above. */
    baselineRangeLabel: string;
    /** Makes it explicit whether the baseline is fleet-wide or one creator. */
    scopeLabel: string;
    /** The exact median values behind the visible baseline comparison. */
    benchmark: MetricTotals;
    sampleDays: number;
    baselineIsPartial: boolean;
  };
  totals: MetricTotals & { deltaStars: number; deltaSales: number; deltaBuyers: number; deltaAverageSaleStars: number };
  activity: RevenueDayActivity & {
    usualMessagedFans: number | null;
    usualNewFans: number | null;
    usualConversationMessages: number | null;
    deltaMessagedFans: number | null;
    deltaNewFans: number | null;
    deltaConversationMessages: number | null;
  };
  concentration: {
    topBuyer: { name: string; cloneName: string; stars: number; sales: number; share: number } | null;
    largestPayment: { name: string; cloneName: string; stars: number; feature: string; share: number } | null;
  };
  byClone: RevenueChangeRow[];
  byFeature: RevenueChangeRow[];
  summary: {
    headline: string;
    detail: string;
    concentrated: boolean;
  };
};

type DayAggregate = {
  totals: MetricTotals;
  buyers: Map<string, BuyerTotal>;
  clones: Map<string, DriverTotal>;
  features: Map<string, DriverTotal>;
  largestPayment: DriverPurchase | null;
};

type DayWindow = {
  key: string;
  startMs: number;
  endMs: number;
  partial: boolean;
};

// `feature` was added after the original ledger. The main report deliberately
// falls back when an older deployment has not received that migration yet; this
// detail panel must have the same behaviour or it would turn an otherwise valid
// day into a misleading error screen.
const PURCHASE_COLUMNS = "id,clone_id,telegram_id,amount_stars,paid_at,kind,feature,invoice_payload";
const PURCHASE_COLUMNS_LEGACY = "id,clone_id,telegram_id,amount_stars,paid_at,kind,invoice_payload";

// `Intl` is the source of truth for the reporting day. The app's report must
// never change its definition of "Tuesday" just because a Node container is in
// UTC, especially around Sydney daylight-saving changes.
const reportParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: REPORT_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const reportDateLabel = new Intl.DateTimeFormat("en-AU", {
  timeZone: REPORT_TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
});

const reportComparisonDateLabel = new Intl.DateTimeFormat("en-AU", {
  timeZone: REPORT_TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

function parseDayKey(dayKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) throw new Error("date must be YYYY-MM-DD");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw new Error("date is not a real calendar day");
  }
  return { year, month, day };
}

function partsAt(ms: number) {
  const values: Record<string, string> = {};
  for (const part of reportParts.formatToParts(new Date(ms))) values[part.type] = part.value;
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour) % 24,
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

/** The UTC instant that represents midnight of `dayKey` in REPORT_TZ. */
export function reportDayStartMs(dayKey: string): number {
  const target = parseDayKey(dayKey);
  const targetMs = Date.UTC(target.year, target.month - 1, target.day, 0, 0, 0);
  // Iterating the offset is robust across DST: use what this instant formats as
  // in REPORT_TZ, then correct towards the intended wall-clock midnight.
  let instant = targetMs;
  for (let i = 0; i < 4; i++) {
    const actual = partsAt(instant);
    const actualMs = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const correction = targetMs - actualMs;
    if (correction === 0) return instant;
    instant += correction;
  }
  return instant;
}

export function shiftReportDay(dayKey: string, days: number): string {
  const { year, month, day } = parseDayKey(dayKey);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** The consecutive calendar days immediately before a reporting date. */
export function priorReportDayKeys(dayKey: string, days = BASELINE_DAYS): string[] {
  parseDayKey(dayKey);
  if (!Number.isInteger(days) || days < 1) throw new Error("days must be a positive integer");
  return Array.from({ length: days }, (_, index) => shiftReportDay(dayKey, -(index + 1)));
}

function labelForDay(dayKey: string): string {
  // Midday avoids the handful of zones where DST shifts occur overnight.
  return reportDateLabel.format(new Date(reportDayStartMs(dayKey) + 12 * 60 * 60 * 1000));
}

function comparisonLabelForDay(dayKey: string): string {
  return reportComparisonDateLabel.format(new Date(reportDayStartMs(dayKey) + 12 * 60 * 60 * 1000));
}

function normaliseFeature(feature: string | null, kind: string | null, adjustment: boolean): string {
  if (adjustment) return "refund";
  if (feature && FEATURE_LABEL[feature]) return feature;
  if (kind && FEATURE_LABEL[kind]) return kind;
  return "other";
}

function toPurchases(rows: PurchaseRow[]): DriverPurchase[] {
  return rows.map((row) => {
    const stars = Number(row.amount_stars) || 0;
    const adjustment = row.invoice_payload === "refund" || stars < 0;
    return {
      id: row.id,
      cloneId: row.clone_id ?? "unknown",
      telegramId: row.telegram_id == null ? null : Number(row.telegram_id),
      stars,
      paidAt: row.paid_at,
      feature: normaliseFeature(row.feature, row.kind, adjustment),
      adjustment,
    };
  });
}

function identityKey(cloneId: string, telegramId: number | null) {
  return `${cloneId}:${telegramId ?? "unknown"}`;
}

function buyerGroupKey(cloneScope: string | null, cloneId: string, telegramId: number | null) {
  // In the fleet view, a person who paid two clones is still one buyer. Splitting
  // their spend by clone hides exactly the $10k-outlier pattern this panel is
  // meant to surface. In an individual clone view the clone prefix is harmless
  // and makes the identity explicit.
  return cloneScope ? identityKey(cloneId, telegramId) : `fleet:${telegramId ?? "unknown"}`;
}

export function aggregateRevenueDay(purchases: DriverPurchase[], cloneScope: string | null = null): DayAggregate {
  const buyers = new Map<string, BuyerTotal>();
  const clones = new Map<string, DriverTotal>();
  const features = new Map<string, DriverTotal>();
  let stars = 0;
  let grossPaymentStars = 0;
  let refundStars = 0;
  let sales = 0;
  let largestPayment: DriverPurchase | null = null;

  for (const purchase of purchases) {
    stars += purchase.stars;
    const isPayment = !purchase.adjustment && purchase.stars > 0;
    if (isPayment) {
      grossPaymentStars += purchase.stars;
      sales += 1;
      if (!largestPayment || purchase.stars > largestPayment.stars) largestPayment = purchase;
    } else if (purchase.adjustment) {
      refundStars += Math.abs(purchase.stars);
    }

    const clone = clones.get(purchase.cloneId) ?? { key: purchase.cloneId, stars: 0, sales: 0 };
    clone.stars += purchase.stars;
    clone.sales += isPayment ? 1 : 0;
    clones.set(purchase.cloneId, clone);

    const feature = features.get(purchase.feature) ?? { key: purchase.feature, stars: 0, sales: 0 };
    feature.stars += purchase.stars;
    feature.sales += isPayment ? 1 : 0;
    features.set(purchase.feature, feature);

    if (isPayment && purchase.telegramId != null) {
      const key = buyerGroupKey(cloneScope, purchase.cloneId, purchase.telegramId);
      const buyer = buyers.get(key) ?? {
        cloneId: purchase.cloneId,
        telegramId: purchase.telegramId,
        stars: 0,
        sales: 0,
        byClone: new Map<string, number>(),
      };
      buyer.stars += purchase.stars;
      buyer.sales += 1;
      const cloneSpend = (buyer.byClone.get(purchase.cloneId) ?? 0) + purchase.stars;
      buyer.byClone.set(purchase.cloneId, cloneSpend);
      const primarySpend = buyer.byClone.get(buyer.cloneId) ?? 0;
      if (cloneSpend > primarySpend) buyer.cloneId = purchase.cloneId;
      buyers.set(key, buyer);
    }
  }

  return {
    totals: {
      stars,
      grossPaymentStars,
      refundStars,
      sales,
      buyers: buyers.size,
      averageSaleStars: sales ? grossPaymentStars / sales : 0,
    },
    buyers,
    clones,
    features,
    largestPayment,
  };
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// A mean turns a previous $10k tip into "normal" and makes the very thing this
// panel is meant to expose disappear. The median across the prior 30 calendar
// days is a much more honest normal day when a few buyers are exceptionally
// high value.
function usualTotals(days: DayAggregate[]): MetricTotals {
  return {
    stars: median(days.map((day) => day.totals.stars)),
    grossPaymentStars: median(days.map((day) => day.totals.grossPaymentStars)),
    refundStars: median(days.map((day) => day.totals.refundStars)),
    sales: median(days.map((day) => day.totals.sales)),
    buyers: median(days.map((day) => day.totals.buyers)),
    averageSaleStars: median(days.map((day) => day.totals.averageSaleStars)),
  };
}

function usualActivity(days: RevenueDayActivity[]): RevenueDayActivity {
  const usual = (key: keyof RevenueDayActivity) => {
    const values = days.map((day) => day[key]).filter((value): value is number => value != null);
    return values.length ? median(values) : null;
  };
  return {
    messagedFans: usual("messagedFans"),
    newFans: usual("newFans"),
    conversationMessages: usual("conversationMessages"),
  };
}

function delta(current: number | null, usual: number | null) {
  return current == null || usual == null ? null : current - usual;
}

function changeRows(
  target: Map<string, DriverTotal>,
  baseline: Map<string, DriverTotal>[],
  labelFor: (key: string) => string,
): RevenueChangeRow[] {
  const keys = new Set<string>([...target.keys(), ...baseline.flatMap((day) => [...day.keys()])]);
  return [...keys]
    .map((key) => {
      const current = target.get(key) ?? { key, stars: 0, sales: 0 };
      const usual = {
        stars: median(baseline.map((day) => day.get(key)?.stars ?? 0)),
        sales: median(baseline.map((day) => day.get(key)?.sales ?? 0)),
      };
      return {
        key,
        label: labelFor(key),
        stars: current.stars,
        sales: current.sales,
        usualStars: usual.stars,
        usualSales: usual.sales,
        deltaStars: current.stars - usual.stars,
      };
    })
    // A negative change is just as explanatory as an increase. Rank by absolute
    // contribution and do not silently disappear the product that stopped selling.
    .filter((row) => row.stars !== 0 || row.usualStars !== 0)
    .sort((a, b) => Math.abs(b.deltaStars) - Math.abs(a.deltaStars) || b.stars - a.stars)
    .slice(0, 5);
}

function displayBuyer(row: BuyerRow | undefined, telegramId: number | null) {
  if (!row) return telegramId == null ? "An unknown buyer" : `Fan ${telegramId}`;
  return row.stated_name || row.name || (row.username ? `@${row.username}` : `Fan ${row.telegram_id}`);
}

function cloneLabelForBuyer(buyer: BuyerTotal, names: Map<string, string>) {
  const labels = [...buyer.byClone.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cloneId]) => names.get(cloneId) ?? "Unknown creator");
  if (labels.length <= 2) return labels.join(" + ");
  return `${labels.slice(0, 2).join(" + ")} + ${labels.length - 2} more`;
}

function roundPct(value: number) {
  return Math.round(value * 100);
}

function netRevenueHeadline(deltaStars: number) {
  if (deltaStars > 0) return "Net revenue was higher than the 30-day baseline.";
  if (deltaStars < 0) return "Net revenue was lower than the 30-day baseline.";
  return "Net revenue matched the 30-day baseline.";
}

function composeSummary(
  totals: MetricTotals,
  baseline: MetricTotals,
  activity: RevenueWhyChanged["activity"],
  concentration: RevenueWhyChanged["concentration"],
): RevenueWhyChanged["summary"] {
  const topBuyer = concentration.topBuyer;
  const topPayment = concentration.largestPayment;
  const concentrated = Boolean(topBuyer && topBuyer.share >= 0.35);
  const revenueDelta = totals.stars - baseline.stars;
  const netHeadline = netRevenueHeadline(revenueDelta);
  const buyersAboveBaseline = totals.buyers > baseline.buyers;
  const buyersBelowBaseline = totals.buyers < baseline.buyers;
  const averageOrderAboveBaseline = totals.averageSaleStars > baseline.averageSaleStars;
  const averageOrderBelowBaseline = totals.averageSaleStars < baseline.averageSaleStars;
  const messagesAboveBaseline = activity.deltaMessagedFans != null && activity.deltaMessagedFans > 0;

  if (totals.grossPaymentStars === 0 && totals.refundStars > 0 && totals.stars <= 0) {
    return {
      headline: "Refunds or adjustments left net proceeds at zero or below.",
      detail: "No positive payments were recorded. Refunds and adjustments are included in net proceeds, but are not counted as paid orders or buyers.",
      concentrated: false,
    };
  }
  if (totals.grossPaymentStars === 0) {
    return {
      headline: "No positive payments landed on this day.",
      detail: "There is no paid order to compare. The activity figures below still show whether fans were messaging or arriving.",
      concentrated: false,
    };
  }
  if (revenueDelta < 0 && totals.refundStars > baseline.refundStars) {
    return {
      headline: "Net revenue was lower than the 30-day baseline, and refunds or adjustments were higher.",
      detail: "Those adjustments lower net proceeds. Paid-order and creator comparisons below remain separate, so this does not assume refunds were the only difference.",
      concentrated,
    };
  }
  if (topPayment && topPayment.share >= 0.5) {
    return {
      headline: netHeadline,
      detail: `One ${topPayment.feature.toLowerCase()} payment from ${topPayment.name} represented ${roundPct(topPayment.share)}% of the day's incoming payments. This describes concentration on the selected day; it does not establish why net revenue differed from the 30-day baseline.`,
      concentrated: true,
    };
  }
  if (topBuyer && topBuyer.share >= 0.35) {
    return {
      headline: netHeadline,
      detail: `${topBuyer.name} accounted for ${roundPct(topBuyer.share)}% of the day's incoming payments. This shows concentration on the selected day, not proof of a broader change in demand.`,
      concentrated: true,
    };
  }
  if (buyersAboveBaseline && averageOrderBelowBaseline) {
    return {
      headline: netHeadline,
      detail: `${messagesAboveBaseline ? "Fans who messaged were also above their prior-30-day median. " : ""}Buyer count was above the 30-day median, while average paid-order value was below it.`,
      concentrated: false,
    };
  }
  if (buyersBelowBaseline && averageOrderAboveBaseline) {
    return {
      headline: netHeadline,
      detail: "Buyer count was below the 30-day median, while average paid-order value was above it.",
      concentrated,
    };
  }
  if (buyersAboveBaseline && averageOrderAboveBaseline) {
    return {
      headline: netHeadline,
      detail: `${messagesAboveBaseline ? "Fans who messaged, buyer count, and average paid-order value were all above their prior-30-day medians." : "Buyer count and average paid-order value were both above their 30-day medians."}`,
      concentrated,
    };
  }
  if (buyersBelowBaseline && averageOrderBelowBaseline) {
    return {
      headline: netHeadline,
      detail: "Buyer count and average paid-order value were both below their 30-day medians.",
      concentrated,
    };
  }
  if (messagesAboveBaseline && buyersAboveBaseline) {
    return {
      headline: netHeadline,
      detail: "Fans who messaged and buyer count were both above their prior-30-day medians.",
      concentrated: false,
    };
  }
  if (buyersAboveBaseline) {
    return {
      headline: netHeadline,
      detail: "Buyer count was above the 30-day median.",
      concentrated,
    };
  }
  if (buyersBelowBaseline) {
    return {
      headline: netHeadline,
      detail: "Buyer count was below the 30-day median.",
      concentrated,
    };
  }
  if (averageOrderAboveBaseline) {
    return {
      headline: netHeadline,
      detail: "Average paid-order value was above the 30-day median.",
      concentrated,
    };
  }
  if (averageOrderBelowBaseline) {
    return {
      headline: netHeadline,
      detail: "Average paid-order value was below the 30-day median.",
      concentrated,
    };
  }
  if (revenueDelta < 0) {
    return {
      headline: netHeadline,
      detail: "The payment and creator comparisons below show what was lower. A lower result does not, by itself, establish why fans arrived or chose to buy.",
      concentrated,
    };
  }
  return {
    headline: netHeadline,
    detail: "No single buyer dominated the day. Check the activity and payment breakdowns for the observed differences from the 30-day baseline.",
    concentrated,
  };
}

/**
 * Read the full 31-day ledger range once, then apply each report-calendar
 * window in memory. This avoids turning a 30-day comparison into 31 paged
 * ledger requests, while retaining exact same-elapsed-time cutoffs for an
 * in-progress day.
 */
async function loadPurchases(windows: DayWindow[], cloneId: string | null, hasFeature: boolean): Promise<DriverPurchase[][]> {
  if (!windows.length) return [];
  const startMs = Math.min(...windows.map((window) => window.startMs));
  const endMs = Math.max(...windows.map((window) => window.endMs));
  let query = supabaseAdmin
    .from("star_transactions")
    .select(hasFeature ? PURCHASE_COLUMNS : PURCHASE_COLUMNS_LEGACY)
    .gte("paid_at", new Date(startMs).toISOString())
    .lt("paid_at", new Date(endMs).toISOString())
    .order("id", { ascending: true });
  if (cloneId) query = query.eq("clone_id", cloneId);
  const result = await selectAllRows<PurchaseRow>(query, { label: "why-changed revenue for 30-day comparison" });
  if (result.truncated) throw new Error("Could not safely read every payment for this 30-day comparison.");
  const rows = hasFeature
    ? result.rows
    : result.rows.map((row) => ({ ...row, feature: null }));
  const purchasesByWindow = windows.map((): DriverPurchase[] => []);
  for (const purchase of toPurchases(rows)) {
    const paidAtMs = new Date(purchase.paidAt).getTime();
    const windowIndex = windows.findIndex((window) => paidAtMs >= window.startMs && paidAtMs < window.endMs);
    if (windowIndex >= 0) purchasesByWindow[windowIndex].push(purchase);
  }
  return purchasesByWindow;
}

async function loadActivity(window: DayWindow, cloneId: string | null): Promise<RevenueDayActivity> {
  try {
    const [rows, messagedFans] = await Promise.all([
      cloneUserStatsWindow(window.startMs, window.endMs, cloneId),
      messagedFanCount(window.startMs, window.endMs, cloneId),
    ]);
    return {
      messagedFans,
      newFans: rows.reduce((sum, row) => sum + (Number(row.fans) || 0), 0),
      conversationMessages: rows.reduce((sum, row) => sum + (Number(row.messages) || 0), 0),
    };
  } catch {
    // Payments still answer a great deal. If a telemetry RPC is briefly down,
    // preserve the exact revenue explanation and honestly leave activity blank.
    return { messagedFans: null, newFans: null, conversationMessages: null };
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function loadActivities(windows: DayWindow[], cloneId: string | null) {
  // The existing RPCs return exact values for one interval. A grouped daily RPC
  // would be faster, but until it exists, bounded parallelism keeps all 30
  // daily medians truthful without overwhelming the database connection pool.
  return mapWithConcurrency(windows, ACTIVITY_CONCURRENCY, (window) => loadActivity(window, cloneId));
}

function windowForDay(dayKey: string, nowMs: number, partialDurationMs?: number): DayWindow {
  const startMs = reportDayStartMs(dayKey);
  const fullEndMs = reportDayStartMs(shiftReportDay(dayKey, 1));
  const endMs = partialDurationMs == null ? Math.min(fullEndMs, nowMs) : Math.min(fullEndMs, startMs + partialDurationMs);
  return { key: dayKey, startMs, endMs, partial: endMs < fullEndMs };
}

function elapsedLabel(elapsedMs: number) {
  const hours = Math.floor(elapsedMs / 3_600_000);
  const minutes = Math.floor((elapsedMs % 3_600_000) / 60_000);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * Build the selected day's explanation using the prior 30 report-calendar days
 * as its baseline. For a live/incomplete day, each comparison is cut at the
 * same elapsed time rather than comparing 2pm today with a whole calendar day.
 */
export async function getRevenueWhyChanged(dayKey: string, cloneId: string | null = null): Promise<RevenueWhyChanged> {
  parseDayKey(dayKey);
  const nowMs = Date.now();
  const target = windowForDay(dayKey, nowMs);
  if (target.startMs >= nowMs) throw new Error("Choose today or an earlier day.");

  const elapsedMs = target.endMs - target.startMs;
  const baselineDays = priorReportDayKeys(dayKey).map((key) => windowForDay(key, nowMs, target.partial ? elapsedMs : undefined));
  const windows = [target, ...baselineDays];

  // Probe once before the paged reads. `selectAllRows()` represents a query
  // error as a safe truncation, which is right for money but does not reveal a
  // missing additive column. Resolving that here keeps old and new database
  // installations equally usable.
  const featureProbe = await supabaseAdmin.from("star_transactions").select(PURCHASE_COLUMNS).limit(1);
  const hasFeature = !featureProbe.error;

  const [purchasesByWindow, activityByWindow] = await Promise.all([
    loadPurchases(windows, cloneId, hasFeature),
    loadActivities(windows, cloneId),
  ]);
  const [targetPurchases, ...baselinePurchases] = purchasesByWindow;
  const targetAggregate = aggregateRevenueDay(targetPurchases, cloneId);
  const baselineAggregates = baselinePurchases.map((purchases) => aggregateRevenueDay(purchases, cloneId));
  const usual = usualTotals(baselineAggregates);
  const [targetActivity, ...baselineActivity] = activityByWindow;
  const baselineActivityMedian = usualActivity(baselineActivity);

  const allCloneIds = new Set<string>();
  for (const purchase of purchasesByWindow.flat()) allCloneIds.add(purchase.cloneId);
  const cloneNameById = new Map<string, string>();
  if (allCloneIds.size) {
    const { data, error } = await supabaseAdmin.from("clones").select("id,name").in("id", [...allCloneIds]);
    if (error) throw new Error(`Could not resolve clone names: ${error.message}`);
    for (const clone of (data ?? []) as CloneRow[]) cloneNameById.set(clone.id, clone.name || "Unknown creator");
  }

  const topBuyer = [...targetAggregate.buyers.values()].sort((a, b) => b.stars - a.stars || b.sales - a.sales)[0] ?? null;
  const largestPayment = targetAggregate.largestPayment;
  const identities = new Map<string, { cloneId: string; telegramId: number | null }>();
  if (topBuyer) identities.set(identityKey(topBuyer.cloneId, topBuyer.telegramId), topBuyer);
  if (largestPayment) identities.set(identityKey(largestPayment.cloneId, largestPayment.telegramId), largestPayment);
  const buyerNameByKey = new Map<string, string>();
  await Promise.all(
    [...identities.values()].map(async (identity) => {
      if (identity.telegramId == null) return;
      const { data } = await supabaseAdmin
        .from("users")
        .select("clone_id,telegram_id,name,stated_name,username")
        .eq("clone_id", identity.cloneId)
        .eq("telegram_id", identity.telegramId)
        .maybeSingle();
      buyerNameByKey.set(
        identityKey(identity.cloneId, identity.telegramId),
        displayBuyer((data as BuyerRow | null) ?? undefined, identity.telegramId),
      );
    }),
  );

  const concentration: RevenueWhyChanged["concentration"] = {
    topBuyer: topBuyer
      ? {
          name: buyerNameByKey.get(identityKey(topBuyer.cloneId, topBuyer.telegramId)) ?? displayBuyer(undefined, topBuyer.telegramId),
          cloneName: cloneLabelForBuyer(topBuyer, cloneNameById),
          stars: topBuyer.stars,
          sales: topBuyer.sales,
          share: targetAggregate.totals.grossPaymentStars ? topBuyer.stars / targetAggregate.totals.grossPaymentStars : 0,
        }
      : null,
    largestPayment: largestPayment
      ? {
          name: buyerNameByKey.get(identityKey(largestPayment.cloneId, largestPayment.telegramId)) ?? displayBuyer(undefined, largestPayment.telegramId),
          cloneName: cloneNameById.get(largestPayment.cloneId) ?? "Unknown creator",
          stars: largestPayment.stars,
          feature: FEATURE_LABEL[largestPayment.feature] ?? "Other",
          share: targetAggregate.totals.grossPaymentStars ? largestPayment.stars / targetAggregate.totals.grossPaymentStars : 0,
        }
      : null,
  };

  const activity: RevenueWhyChanged["activity"] = {
    ...targetActivity,
    usualMessagedFans: baselineActivityMedian.messagedFans,
    usualNewFans: baselineActivityMedian.newFans,
    usualConversationMessages: baselineActivityMedian.conversationMessages,
    deltaMessagedFans: delta(targetActivity.messagedFans, baselineActivityMedian.messagedFans),
    deltaNewFans: delta(targetActivity.newFans, baselineActivityMedian.newFans),
    deltaConversationMessages: delta(targetActivity.conversationMessages, baselineActivityMedian.conversationMessages),
  };

  return {
    day: {
      key: dayKey,
      label: labelForDay(dayKey),
      partial: target.partial,
      elapsedLabel: target.partial ? elapsedLabel(elapsedMs) : null,
    },
    comparison: {
      label: target.partial ? "the same elapsed time across the prior 30 calendar days" : "the prior 30 calendar days",
      benchmarkLabel: "30-day baseline",
      baselineDays: baselineDays.map((baseline) => ({ key: baseline.key, label: comparisonLabelForDay(baseline.key) })),
      baselineRangeLabel: `${comparisonLabelForDay(baselineDays[baselineDays.length - 1].key)} to ${comparisonLabelForDay(baselineDays[0].key)}`,
      scopeLabel: cloneId ? "the selected creator" : "all creators",
      benchmark: usual,
      sampleDays: baselineDays.length,
      baselineIsPartial: target.partial,
    },
    totals: {
      ...targetAggregate.totals,
      deltaStars: targetAggregate.totals.stars - usual.stars,
      deltaSales: targetAggregate.totals.sales - usual.sales,
      deltaBuyers: targetAggregate.totals.buyers - usual.buyers,
      deltaAverageSaleStars: targetAggregate.totals.averageSaleStars - usual.averageSaleStars,
    },
    activity,
    concentration,
    byClone: changeRows(targetAggregate.clones, baselineAggregates.map((day) => day.clones), (id) => cloneNameById.get(id) ?? "Unknown creator"),
    byFeature: changeRows(targetAggregate.features, baselineAggregates.map((day) => day.features), (key) => FEATURE_LABEL[key] ?? "Other"),
    summary: composeSummary(targetAggregate.totals, usual, activity, concentration),
  };
}

type InsightCacheEntry = { fetchedAt: number; value: RevenueWhyChanged };
const insightCache = new Map<string, InsightCacheEntry>();
const insightInflight = new Map<string, Promise<RevenueWhyChanged>>();

function insightCacheKey(dayKey: string, cloneId: string | null) {
  return `${dayKey}|${cloneId ?? "fleet"}`;
}

function evictOldInsights() {
  while (insightCache.size >= INSIGHT_CACHE_MAX_ENTRIES) {
    let oldestKey: string | undefined;
    let oldestAt = Infinity;
    for (const [key, entry] of insightCache) {
      if (entry.fetchedAt < oldestAt) {
        oldestAt = entry.fetchedAt;
        oldestKey = key;
      }
    }
    if (!oldestKey) return;
    insightCache.delete(oldestKey);
  }
}

/**
 * A single-flight, short-lived cache for the drill-down. It protects Supabase
 * when several operators open the same earnings page, but deliberately does
 * not turn a current-day result into a stale daily report.
 */
export async function getCachedRevenueWhyChanged(dayKey: string, cloneId: string | null = null): Promise<RevenueWhyChanged> {
  const key = insightCacheKey(dayKey, cloneId);
  const cached = insightCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < INSIGHT_CACHE_TTL_MS) return cached.value;

  const running = insightInflight.get(key);
  if (running) return running;

  const run = getRevenueWhyChanged(dayKey, cloneId).then((value) => {
    evictOldInsights();
    insightCache.set(key, { fetchedAt: Date.now(), value });
    return value;
  });
  insightInflight.set(key, run);
  run.finally(() => {
    if (insightInflight.get(key) === run) insightInflight.delete(key);
  }).catch(() => {});
  return run;
}
