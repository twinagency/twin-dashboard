// Pure, presentation-only Cat earnings. This module intentionally has no
// database, payment, Telegram, storage or network imports. It reshapes the
// existing deterministic demo ledger so the production earnings component can
// render a coherent high-performance month without touching Cat's live data.
import type { AnalyticsData, FeatureKey, KindKey } from "./analytics-data";
import type { DateRange, Period } from "./dashboard-data";
import type { RevenueWhyChanged } from "./revenue-why-changed";
import { creatorDemoData, creatorDemoInsight, type CreatorDemoData } from "./creator-demo-data";
import { DEMO_CLONE_ID } from "./creator-demo-policy";
import { CAT_DEMO_30D_STARS, CAT_DEMO_CLONE_ID, CAT_DEMO_LIFETIME_STARS } from "./cat-demo-policy";

export { CAT_DEMO_30D_STARS, CAT_DEMO_LIFETIME_STARS } from "./cat-demo-policy";

export const CAT_DEMO_KIND = "cat-presentation" as const;
export const CAT_DEMO_ACTIVE_USERS_30D = 12_000;
export const CAT_DEMO_BUYERS_30D = 2_040;
export const CAT_DEMO_PURCHASES_30D = 5_100;
export const CAT_DEMO_MESSAGES_30D = 216_840;

const CAT_NAME = "Cat";
const CAT_SLUG = "cat-chase";
const CAT_COLOR = "#2f6fed";
const CAT_ALL_TIME_USERS = 12_000;
const CAT_LIFETIME_BUYERS = 2_040;
const CAT_NEW_USERS_30D = 12_000;
const CAT_REACHABLE_24H = 684;

// Day zero is the launch baseline. The rest deliberately mixes strong days,
// softer days and short pull-backs while the overall month grows. A real first
// month should not look like a mathematically perfect staircase.
const CAT_FIRST_MONTH_REVENUE_WEIGHTS = [
  0, .18, .32, .27, .41, .66, .52, .85, .77, 1.08, 1.36,
  1.12, 1.49, 1.77, 1.55, 2.03, 2.46, 2.18, 1.94, 2.71,
  3.15, 2.69, 3.44, 3.18, 3.92, 4.35, 3.73, 4.68, 4.19,
  5.06, 4.72,
] as const;

const CAT_LATEST_DAY_INTRADAY_WEIGHTS = [
  .61, .47, .36, .42, .58, .73, .91, 1.16, .98, 1.29, 1.08, 1.41, 1.24,
] as const;

const FEATURE_REVENUE_WEIGHT: Record<FeatureKey, number> = {
  credits: 10,
  photo: 20,
  video: 33,
  bundle: 27,
  media: 0,
  tip: 7,
  subscription: 3,
  other: 0,
  refund: 0,
};

const FEATURE_SALES_WEIGHT: Record<FeatureKey, number> = {
  credits: 750,
  photo: 1_600,
  video: 1_300,
  bundle: 900,
  media: 0,
  tip: 350,
  subscription: 200,
  other: 0,
  refund: 0,
};

export type CatDemoData = Omit<CreatorDemoData, "demo"> & {
  demo: true;
  demoKind: typeof CAT_DEMO_KIND;
};

const fraction = (numerator: number, denominator: number) => denominator > 0 ? numerator / denominator : 0;

/** Allocate an integer total without losing a cent-equivalent to rounding. */
function allocate(total: number, weights: readonly number[]): number[] {
  if (total <= 0 || weights.length === 0) return weights.map(() => 0);
  const positive = weights.map((weight) => Math.max(0, Number(weight) || 0));
  const weightTotal = positive.reduce((sum, weight) => sum + weight, 0);
  if (weightTotal <= 0) return positive.map((_, index) => index === 0 ? total : 0);
  const exact = positive.map((weight) => total * weight / weightTotal);
  const values = exact.map(Math.floor);
  let remainder = total - values.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let index = 0; index < remainder; index++) values[order[index % order.length].index] += 1;
  return values;
}

function fitWeights(template: readonly number[], length: number): number[] {
  if (length <= 0) return [];
  if (length === template.length) return [...template];
  if (length === 1) return [template[template.length - 1] ?? 1];
  return Array.from({ length }, (_, index) => {
    const templateIndex = Math.round(index * (template.length - 1) / (length - 1));
    return template[templateIndex] ?? 0;
  });
}

function catPresetSeriesStars(
  period: Period,
  length: number,
  monthLength: number,
): number[] | null {
  if (length <= 0 || monthLength <= 0) return null;
  const monthSeries = allocate(
    CAT_DEMO_30D_STARS,
    fitWeights(CAT_FIRST_MONTH_REVENUE_WEIGHTS, monthLength),
  );

  if (period === "1M") {
    return length === monthLength
      ? monthSeries
      : allocate(CAT_DEMO_30D_STARS, fitWeights(CAT_FIRST_MONTH_REVENUE_WEIGHTS, length));
  }
  if (period === "2W" || period === "1W") {
    return length <= monthSeries.length ? monthSeries.slice(-length) : null;
  }
  if (period === "1D") {
    return allocate(
      monthSeries[monthSeries.length - 1] ?? 0,
      fitWeights(CAT_LATEST_DAY_INTRADAY_WEIGHTS, length),
    );
  }
  if (period === "ALL") {
    return allocate(CAT_DEMO_LIFETIME_STARS, fitWeights(CAT_FIRST_MONTH_REVENUE_WEIGHTS, length));
  }
  return null;
}

function targetStars(sourceStars: number, monthStars: number, lifetimeStars: number): number {
  if (sourceStars <= 0 || monthStars <= 0) return 0;
  if (sourceStars <= monthStars || lifetimeStars <= monthStars) {
    return Math.round(CAT_DEMO_30D_STARS * sourceStars / monthStars);
  }
  const progress = Math.min(1, (sourceStars - monthStars) / (lifetimeStars - monthStars));
  return Math.round(CAT_DEMO_30D_STARS + progress * (CAT_DEMO_LIFETIME_STARS - CAT_DEMO_30D_STARS));
}

function periodCounts(stars: number) {
  if (stars <= 0) return { activeUsers: 0, buyers: 0, newFans: 0, messages: 0, sales: 0, repeatPct: 0 };
  const scale = stars / CAT_DEMO_30D_STARS;
  const activeUsers = Math.min(CAT_ALL_TIME_USERS, Math.max(1, Math.round(CAT_DEMO_ACTIVE_USERS_30D * scale)));
  const buyers = Math.min(activeUsers, Math.round(activeUsers * .17));
  const newFans = Math.min(activeUsers, Math.round(CAT_NEW_USERS_30D * Math.min(scale, CAT_ALL_TIME_USERS / CAT_NEW_USERS_30D)));
  const messages = Math.max(activeUsers, Math.round(CAT_DEMO_MESSAGES_30D * scale));
  const sales = Math.max(buyers, Math.round(CAT_DEMO_PURCHASES_30D * scale));
  const repeatBuyers = Math.round(buyers * .6);
  return { activeUsers, buyers, newFans, messages, sales, repeatPct: fraction(repeatBuyers, buyers) };
}

function kindForFeature(key: FeatureKey): KindKey {
  if (key === "credits" || key === "tip") return key;
  if (["photo", "video", "bundle", "media"].includes(key)) return "media";
  if (key === "refund") return "refund";
  return "other";
}

export function catDemoData(period: Period = "1M", range?: DateRange, now = Date.now()): CatDemoData {
  const source = creatorDemoData(period, range, now);
  const month = creatorDemoData("1M", undefined, now);
  const lifetimeSource = creatorDemoData("ALL", undefined, now);
  const presetSeriesStars = range
    ? null
    : catPresetSeriesStars(period, source.series.length, month.series.length);
  const stars = presetSeriesStars
    ? presetSeriesStars.reduce((sum, value) => sum + value, 0)
    : period === "1M" && !range
      ? CAT_DEMO_30D_STARS
      : targetStars(source.totals.stars, month.totals.stars, lifetimeSource.totals.stars);
  const counts = periodCounts(stars);

  const featureStars = allocate(stars, source.analytics.byFeature.map((feature) => FEATURE_REVENUE_WEIGHT[feature.key]));
  const featureSales = allocate(counts.sales, source.analytics.byFeature.map((feature) => FEATURE_SALES_WEIGHT[feature.key]));
  const byFeature: AnalyticsData["byFeature"] = source.analytics.byFeature.map((feature, index) => ({
    ...feature,
    stars: featureStars[index],
    sales: featureSales[index],
    avgStars: fraction(featureStars[index], featureSales[index]),
    share: fraction(featureStars[index], stars),
  }));

  const kindKeys: KindKey[] = ["credits", "media", "tip", "other", "refund"];
  const kindLabels: Record<KindKey, string> = {
    credits: "Paid Messages",
    media: "Photos & video",
    tip: "Tips / spoil",
    other: "Other",
    refund: "Refunds / adjustments",
  };
  const byKind: AnalyticsData["byKind"] = kindKeys.map((key) => {
    const features = byFeature.filter((feature) => kindForFeature(feature.key) === key);
    const kindStars = features.reduce((sum, feature) => sum + feature.stars, 0);
    return {
      key,
      label: kindLabels[key],
      stars: kindStars,
      sales: features.reduce((sum, feature) => sum + feature.sales, 0),
      share: fraction(kindStars, stars),
    };
  });

  const seriesStars = presetSeriesStars ?? allocate(
    stars,
    fitWeights(CAT_FIRST_MONTH_REVENUE_WEIGHTS, source.series.length),
  );
  const series = source.series.map((row, index) => ({ bucket: row.bucket, [CAT_DEMO_CLONE_ID]: seriesStars[index] }));
  const hourStars = allocate(stars, source.analytics.byHour.map((row) => row.stars));
  const dowStars = allocate(stars, source.analytics.byDow.map((row) => row.stars));
  const paidMessages = byFeature.find((feature) => feature.key === "credits")!;
  const paywalled = Math.min(counts.activeUsers, Math.round(counts.activeUsers * .25));
  const paidMessageBuyers = Math.min(counts.buyers, Math.round(counts.buyers * .25));
  const paywallViews = Math.round(paywalled * 1.8);

  const lifetimeTierUsers = [60, 900, 650, 430, 9_960];
  const lifetimeTierStars = [6_322_011, 720_000, 52_000, 15_000, 0];
  const byTier = source.analytics.byTier.map((tier, index) => ({
    ...tier,
    users: lifetimeTierUsers[index] ?? 0,
    stars: lifetimeTierStars[index] ?? 0,
    share: fraction(lifetimeTierStars[index] ?? 0, CAT_DEMO_LIFETIME_STARS),
  }));
  const whaleTotal = byTier.find((tier) => tier.key === "whale")?.stars ?? 0;
  const whaleStars = allocate(whaleTotal, source.analytics.whaleFans.map((fan) => fan.stars));
  const whaleFans = source.analytics.whaleFans.map((fan, index) => ({
    ...fan,
    name: fan.name.replace(/\s*\(demo\)$/i, ""),
    cloneId: CAT_DEMO_CLONE_ID,
    cloneName: CAT_NAME,
    // Deliberately unlink fabricated profiles from Cat's real avatar endpoint.
    telegramId: null,
    stars: whaleStars[index],
  }));

  const monthSeriesStars = catPresetSeriesStars("1M", month.series.length, month.series.length) ?? [];
  const weeklyStars = monthSeriesStars.slice(-Math.min(8, monthSeriesStars.length)).reduce((sum, value) => sum + value, 0);
  const weeklyScale = fraction(weeklyStars, CAT_DEMO_30D_STARS);
  const weeklyBuyers = Math.max(1, Math.round(CAT_DEMO_BUYERS_30D * weeklyScale));
  const weeklyPurchases = Math.max(weeklyBuyers, Math.round(CAT_DEMO_PURCHASES_30D * weeklyScale));
  const weeklyTopStars = allocate(Math.round(weeklyStars * .18), source.analytics.topWeeklySpenders.map((fan) => fan.stars));
  const topWeeklySpenders = source.analytics.topWeeklySpenders.map((fan, index) => ({
    ...fan,
    name: fan.name.replace(/\s*\(demo\)$/i, ""),
    cloneId: CAT_DEMO_CLONE_ID,
    cloneName: CAT_NAME,
    telegramId: null,
    stars: weeklyTopStars[index],
    purchases: Math.max(1, Math.round(fan.purchases * CAT_DEMO_PURCHASES_30D / Math.max(1, month.totals.sales))),
  }));

  const lifetimeRepeat = 1_224;
  const lifetimeOneTime = CAT_LIFETIME_BUYERS - lifetimeRepeat;
  const lifetimePurchases = CAT_DEMO_PURCHASES_30D;
  const activeBuyerProfiles7d = Math.min(CAT_LIFETIME_BUYERS, Math.round(weeklyBuyers * .82));
  const analytics: AnalyticsData = {
    ...source.analytics,
    period,
    totals: {
      revenueStars: stars,
      costUsd: 0,
      profitUsd: 0,
      sales: counts.sales,
      fans: CAT_ALL_TIME_USERS,
      buyers: counts.buyers,
    },
    clones: [{
      id: CAT_DEMO_CLONE_ID,
      name: CAT_NAME,
      color: CAT_COLOR,
      revenueStars: stars,
      costUsd: 0,
      profitUsd: 0,
      sales: counts.sales,
      margin: 0,
    }],
    byKind,
    byFeature,
    paywallFunnel: {
      collecting: false,
      messaged: counts.activeUsers,
      paywalled,
      purchased: paidMessageBuyers,
      paidMessageBuyers,
      paidMessagePurchases: paidMessages.sales,
      paidMessageStars: paidMessages.stars,
      paywallViews,
      abandoned: Math.max(0, paywalled - paidMessageBuyers),
      paywallPct: fraction(paywalled, counts.activeUsers),
      purchasePct: fraction(paidMessageBuyers, paywalled),
      overallPct: fraction(paidMessageBuyers, counts.activeUsers),
      avgViewsPerFan: fraction(paywallViews, paywalled),
    },
    buyerConversion: {
      lifetimeFanProfiles: CAT_ALL_TIME_USERS,
      lifetimeBuyerProfiles: CAT_LIFETIME_BUYERS,
      lifetimeBuyerRate: fraction(CAT_LIFETIME_BUYERS, CAT_ALL_TIME_USERS),
      activeChatters: counts.activeUsers,
      activeChatBuyers: counts.buyers,
      activeChatBuyerRate: counts.activeUsers > 0 ? fraction(counts.buyers, counts.activeUsers) : null,
      activeBuyerProfiles7d,
      activeBuyerEngagement7d: fraction(activeBuyerProfiles7d, CAT_LIFETIME_BUYERS),
      purchaseMix: byFeature,
    },
    conversationFunnel: {
      arrivals: counts.newFans,
      arrivalsStarted: Math.round(counts.newFans * .82),
      conversations: counts.activeUsers,
      meaningful: Math.round(counts.activeUsers * .71),
      offered: Math.round(counts.activeUsers * .6),
      offeredBought: Math.min(counts.buyers, Math.round(counts.activeUsers * .6)),
      ttfpN: Math.round(counts.buyers * .79),
      ttfpMedianHours: counts.buyers > 0 ? 3.8 : null,
    },
    byFlow: [{
      key: "smart",
      label: "Smart",
      clones: 1,
      stars,
      costUsd: 0,
      profitUsd: 0,
      sales: counts.sales,
      share: stars > 0 ? 1 : 0,
    }],
    byDay: series.map((row) => ({ label: String(row.bucket), stars: Number(row[CAT_DEMO_CLONE_ID]) || 0 })),
    byHour: source.analytics.byHour.map((row, index) => ({ ...row, stars: hourStars[index] })),
    byDow: source.analytics.byDow.map((row, index) => ({ ...row, stars: dowStars[index] })),
    byTier,
    whaleFans,
    topWeeklySpenders,
    weeklySpenderSummary: {
      buyers: weeklyBuyers,
      stars: weeklyStars,
      purchases: weeklyPurchases,
      avgStars: fraction(weeklyStars, weeklyBuyers),
    },
    funnel: {
      fans: CAT_ALL_TIME_USERS,
      buyers: CAT_LIFETIME_BUYERS,
      repeat: lifetimeRepeat,
      oneTime: lifetimeOneTime,
      threePlus: 1_080,
      nonBuyers: CAT_ALL_TIME_USERS - CAT_LIFETIME_BUYERS,
      totalPurchases: lifetimePurchases,
      buyerPct: fraction(CAT_LIFETIME_BUYERS, CAT_ALL_TIME_USERS),
      repeatPct: fraction(lifetimeRepeat, CAT_LIFETIME_BUYERS),
      oneTimePct: fraction(lifetimeOneTime, CAT_LIFETIME_BUYERS),
      avgPurchasesPerBuyer: fraction(lifetimePurchases, CAT_LIFETIME_BUYERS),
      avgStarsPerBuyer: fraction(CAT_DEMO_LIFETIME_STARS, CAT_LIFETIME_BUYERS),
      medianStarsPerBuyer: 1_950,
      repeatRevenueShare: .86,
    },
  };

  const sourceAverageSale = fraction(source.totals.grossPaymentStars, source.totals.sales);
  const targetAverageSale = fraction(stars, counts.sales);
  const transactionScale = sourceAverageSale > 0 ? targetAverageSale / sourceAverageSale : 0;
  const stats = {
    stars,
    grossPaymentStars: stars,
    sales: counts.sales,
    newFans: counts.newFans,
    activeUsers: counts.activeUsers,
    totalFans: CAT_ALL_TIME_USERS,
    reachable24h: CAT_REACHABLE_24H,
    messages: counts.messages,
    buyers: counts.buyers,
    repeatPct: counts.repeatPct,
    costUsd: 0,
    aiCalls: 0,
    aiErrors: 0,
  };

  return {
    ...source,
    demo: true,
    demoKind: CAT_DEMO_KIND,
    period,
    clones: [{ id: CAT_DEMO_CLONE_ID, slug: CAT_SLUG, name: CAT_NAME, color: CAT_COLOR, stars }],
    series,
    recent: source.recent.map((transaction) => ({
      ...transaction,
      cloneId: CAT_DEMO_CLONE_ID,
      cloneName: CAT_NAME,
      cloneColor: CAT_COLOR,
      buyerName: transaction.buyerName.replace(/\s*\(demo\)$/i, ""),
      mediaName: transaction.mediaName?.replace(/^Demo\s+/i, "Sample ") ?? null,
      telegramId: null,
      stars: Math.max(1, Math.round(transaction.stars * transactionScale)),
    })),
    totals: stats,
    perClone: { [CAT_DEMO_CLONE_ID]: stats },
    analytics,
    balance: {
      lifetimeStars: CAT_DEMO_LIFETIME_STARS,
      totalBalanceStars: Math.round(CAT_DEMO_LIFETIME_STARS * .12),
    },
  };
}

export function catDemoInsight(day: string, now = Date.now()): RevenueWhyChanged {
  const source = creatorDemoInsight(day, now, 28);
  const month = creatorDemoData("1M", undefined, now);
  const scale = fraction(CAT_DEMO_30D_STARS, month.totals.stars);
  const scaled = (value: number) => Math.round(value * scale);
  const currentFeatureStars = allocate(scaled(source.totals.stars), source.byFeature.map((feature) => feature.stars));
  const currentFeatureSales = allocate(Math.max(0, Math.round(source.totals.sales * CAT_DEMO_PURCHASES_30D / Math.max(1, month.totals.sales))), source.byFeature.map((feature) => feature.sales));
  const byFeature = source.byFeature.map((feature, index) => ({
    ...feature,
    stars: currentFeatureStars[index],
    sales: currentFeatureSales[index],
    usualStars: scaled(feature.usualStars),
    usualSales: Math.round(feature.usualSales * CAT_DEMO_PURCHASES_30D / Math.max(1, month.totals.sales)),
    deltaStars: currentFeatureStars[index] - scaled(feature.usualStars),
  }));
  const totalsStars = currentFeatureStars.reduce((sum, value) => sum + value, 0);
  const totalsSales = currentFeatureSales.reduce((sum, value) => sum + value, 0);
  const totalsBuyers = Math.round(source.totals.buyers * CAT_DEMO_BUYERS_30D / Math.max(1, month.totals.buyers));
  const averageSaleStars = fraction(totalsStars, totalsSales);
  const benchmarkStars = scaled(source.comparison.benchmark.stars);
  const benchmarkSales = Math.round(source.comparison.benchmark.sales * CAT_DEMO_PURCHASES_30D / Math.max(1, month.totals.sales));
  const benchmarkBuyers = Math.round(source.comparison.benchmark.buyers * CAT_DEMO_BUYERS_30D / Math.max(1, month.totals.buyers));
  const benchmarkAverage = fraction(benchmarkStars, benchmarkSales);
  const activityValue = (value: number | null, target: number, base: number) => value === null
    ? null
    : Math.round(value * target / Math.max(1, base));
  return {
    ...source,
    day: { ...source.day, partial: false, elapsedLabel: null },
    comparison: {
      ...source.comparison,
      label: "First-month four-week comparison",
      benchmarkLabel: "Four-week benchmark",
      scopeLabel: "the first-month sample",
      benchmark: {
        stars: benchmarkStars,
        grossPaymentStars: benchmarkStars,
        refundStars: 0,
        sales: benchmarkSales,
        buyers: benchmarkBuyers,
        averageSaleStars: benchmarkAverage,
      },
    },
    totals: {
      stars: totalsStars,
      grossPaymentStars: totalsStars,
      refundStars: 0,
      sales: totalsSales,
      buyers: totalsBuyers,
      averageSaleStars,
      deltaStars: totalsStars - benchmarkStars,
      deltaSales: totalsSales - benchmarkSales,
      deltaBuyers: totalsBuyers - benchmarkBuyers,
      deltaAverageSaleStars: averageSaleStars - benchmarkAverage,
    },
    activity: {
      ...source.activity,
      messagedFans: activityValue(source.activity.messagedFans, CAT_DEMO_ACTIVE_USERS_30D, month.totals.activeUsers),
      newFans: activityValue(source.activity.newFans, CAT_NEW_USERS_30D, month.totals.newFans),
      conversationMessages: activityValue(source.activity.conversationMessages, CAT_DEMO_MESSAGES_30D, month.totals.messages),
      usualMessagedFans: activityValue(source.activity.usualMessagedFans, CAT_DEMO_ACTIVE_USERS_30D, month.totals.activeUsers),
      usualNewFans: activityValue(source.activity.usualNewFans, CAT_NEW_USERS_30D, month.totals.newFans),
      usualConversationMessages: activityValue(source.activity.usualConversationMessages, CAT_DEMO_MESSAGES_30D, month.totals.messages),
      deltaMessagedFans: activityValue(source.activity.deltaMessagedFans, CAT_DEMO_ACTIVE_USERS_30D, month.totals.activeUsers),
      deltaNewFans: activityValue(source.activity.deltaNewFans, CAT_NEW_USERS_30D, month.totals.newFans),
      deltaConversationMessages: activityValue(source.activity.deltaConversationMessages, CAT_DEMO_MESSAGES_30D, month.totals.messages),
    },
    concentration: {
      topBuyer: source.concentration.topBuyer ? { ...source.concentration.topBuyer, cloneName: CAT_NAME, stars: scaled(source.concentration.topBuyer.stars) } : null,
      largestPayment: source.concentration.largestPayment ? { ...source.concentration.largestPayment, cloneName: CAT_NAME, stars: scaled(source.concentration.largestPayment.stars) } : null,
    },
    byClone: [{
      key: CAT_DEMO_CLONE_ID,
      label: CAT_NAME,
      stars: totalsStars,
      sales: totalsSales,
      usualStars: benchmarkStars,
      usualSales: benchmarkSales,
      deltaStars: totalsStars - benchmarkStars,
    }],
    byFeature,
    summary: {
      headline: "First-month earnings comparison",
      detail: "Daily results within the first four weeks.",
      concentrated: false,
    },
  };
}
