// Synthetic earnings for the explicitly designated ZANE test account.
// TYPE-ONLY imports are intentional: this module has no database, storage,
// payment, Telegram, or network access and never inserts financial records.
import type { DashboardData, CloneStats, Period, DateRange } from "./dashboard-data";
import type { AnalyticsData, FeatureKey, KindKey } from "./analytics-data";
import type { RevenueWhyChanged } from "./revenue-why-changed";
import { DEMO_CLONE_ID } from "./creator-demo-policy";

const DAY = 86_400_000;
const ZONE = "Australia/Sydney";
const NAME = "ZANE";
const COLOR = "#21b9af";
const FEATURES: { key: FeatureKey; label: string; base: number }[] = [
  { key: "credits", label: "Paid Messages", base: 150 },
  { key: "photo", label: "Photos", base: 300 },
  { key: "video", label: "Videos", base: 600 },
  { key: "bundle", label: "Bundles", base: 850 },
  { key: "tip", label: "Tips / spoil", base: 200 },
  { key: "subscription", label: "VIP subscriptions", base: 500 },
  { key: "media", label: "Media (untagged)", base: 0 },
  { key: "other", label: "Other", base: 0 },
  { key: "refund", label: "Refunds / adjustments", base: 0 },
];
const firstNames = ["Alex", "Sam", "Jordan", "Taylor", "Morgan", "Casey", "Jamie", "Riley"];
const dateParts = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
function parts(ms: number) {
  const p = Object.fromEntries(dateParts.formatToParts(ms).map(x => [x.type, x.value]));
  return { key: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), dow: new Date(`${p.year}-${p.month}-${p.day}T12:00:00Z`).getUTCDay() };
}
function random(seed: number) { let x = seed | 0; x = Math.imul(x ^ (x >>> 16), 0x45d9f3b); x = Math.imul(x ^ (x >>> 16), 0x45d9f3b); return (x ^ (x >>> 16)) >>> 0; }
function buyerName(id: number) { return `${firstNames[id % firstNames.length]} ${String(id + 1).padStart(3, "0")} (demo)`; }
type Sale = { at: number; buyer: number; feature: FeatureKey; stars: number };
function ledger(now: number): Sale[] {
  const endDay = Math.floor(now / DAY);
  const rows: Sale[] = [];
  for (let d = endDay - 399; d <= endDay; d++) {
    const count = 9 + random(d) % 17;
    for (let i = 0; i < count; i++) {
      const seed = random(d * 31 + i);
      const at = d * DAY + (seed % 1440) * 60_000;
      if (at > now) continue;
      const featureIndex = [0, 0, 1, 1, 2, 2, 2, 3, 4, 5][seed % 10];
      const feature = FEATURES[featureIndex];
      rows.push({ at, buyer: seed % 4 === 0 ? seed % 5 : seed % 120, feature: feature.key, stars: feature.base + (random(seed + 1) % 7) * 50 });
    }
  }
  return rows.sort((a, b) => a.at - b.at);
}
const sum = (rows: Sale[]) => rows.reduce((n, r) => n + r.stars, 0);
function buyers(rows: Sale[]) {
  const map = new Map<number, { id: number; stars: number; purchases: number }>();
  for (const row of rows) { const old = map.get(row.buyer) || { id: row.buyer, stars: 0, purchases: 0 }; old.stars += row.stars; old.purchases++; map.set(row.buyer, old); }
  return [...map.values()].sort((a, b) => b.stars - a.stars);
}
function median(values: number[]) { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; }
const fraction = (n: number, d: number) => d ? n / d : 0;
function windowStart(period: Period, now: number, all: Sale[]) {
  const days: Record<string, number> = { "1D": 1, "1W": 7, "2W": 14, "1M": 30, "3M": 90, "6M": 180, "1Y": 365 };
  return period === "ALL" ? all[0]?.at ?? now : now - (days[period] || 30) * DAY;
}
function featureRows(rows: Sale[]) {
  const total = sum(rows);
  return FEATURES.map(f => { const matching = rows.filter(r => r.feature === f.key); const stars = sum(matching); return { key: f.key, label: f.label, stars, sales: matching.length, share: fraction(stars, total), avgStars: fraction(stars, matching.length) }; });
}
export type CreatorDemoData = DashboardData & { analytics: AnalyticsData; balance: { lifetimeStars: number; totalBalanceStars: number }; cachedAt: number; ageSeconds: number; stale: boolean; demo: true };
export function creatorDemoData(period: Period = "1M", range?: DateRange, now = Date.now()): CreatorDemoData {
  const all = ledger(now);
  const start = range?.startMs ?? windowStart(period, now, all);
  const end = Math.min(range?.endMs ?? now, now);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) throw new Error("Invalid demo date range");
  const rows = all.filter(r => r.at >= start && r.at <= end);
  const stars = sum(rows), lifetime = sum(all);
  const paid = buyers(rows), lifetimeBuyers = buyers(all);
  const week = all.filter(r => r.at >= now - 7 * DAY), weekly = buyers(week);
  const days = new Set(rows.map(r => parts(r.at).key)).size;
  const activeUsers = rows.length ? Math.min(12000, Math.max(paid.length * 4, days * 35)) : 0;
  const newFans = days * 24;
  const stats: CloneStats = { stars, grossPaymentStars: stars, sales: rows.length, newFans, activeUsers, totalFans: 12000, reachable24h: 286, messages: rows.length * 21 + days * 14, buyers: paid.length, repeatPct: fraction(paid.filter(b => b.purchases >= 2).length, paid.length), costUsd: 0, aiCalls: 0, aiErrors: 0 };
  const buckets = new Map<string, { label: string; stars: number }>();
  for (const row of rows) {
    const p = parts(row.at);
    const key = period === "1D" && !range ? `${p.key}T${String(p.hour).padStart(2, "0")}` : p.key;
    const label = period === "1D" && !range ? `${p.hour}:00` : new Intl.DateTimeFormat("en-AU", { timeZone: ZONE, month: "short", day: "numeric" }).format(row.at);
    const old = buckets.get(key) || { label, stars: 0 }; old.stars += row.stars; buckets.set(key, old);
  }
  const points = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value);
  const byFeature = featureRows(rows);
  const messages = rows.filter(r => r.feature === "credits"), messageBuyers = buyers(messages).length;
  const paywalled = Math.min(activeUsers, Math.max(messageBuyers * 3, Math.round(activeUsers * .55)));
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, label: `${hour}:00`, stars: sum(rows.filter(r => parts(r.at).hour === hour)) }));
  const byDow = [1, 2, 3, 4, 5, 6, 0].map(dow => ({ dow, label: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow], stars: sum(rows.filter(r => parts(r.at).dow === dow)) }));
  const tier = (stars: number) => stars >= 1000 ? "whale" : stars >= 300 ? "high" : stars >= 50 ? "mid" : "low";
  const repeat = lifetimeBuyers.filter(b => b.purchases >= 2), oneTime = lifetimeBuyers.filter(b => b.purchases === 1);
  const medianSpend = median(lifetimeBuyers.map(b => b.stars));
  const byKind: AnalyticsData["byKind"] = (["credits", "media", "tip", "other", "refund"] as KindKey[]).map(key => {
    const matches = rows.filter(r => (r.feature === "credits" || r.feature === "tip" ? r.feature : ["photo", "video", "bundle", "media"].includes(r.feature) ? "media" : "other") === key);
    return { key, label: { credits: "Paid Messages", media: "Photos & video", tip: "Tips / spoil", other: "Other", refund: "Refunds / adjustments" }[key], stars: sum(matches), sales: matches.length, share: fraction(sum(matches), stars) };
  });
  const analytics: AnalyticsData = {
    period, costIncluded: false,
    totals: { revenueStars: stars, costUsd: 0, profitUsd: 0, sales: rows.length, fans: 12000, buyers: paid.length },
    clones: [{ id: DEMO_CLONE_ID, name: NAME, color: COLOR, revenueStars: stars, costUsd: 0, profitUsd: 0, sales: rows.length, margin: 0 }],
    byKind, byFeature,
    paywallFunnel: { collecting: false, messaged: activeUsers, paywalled, purchased: messageBuyers, paidMessageBuyers: messageBuyers, paidMessagePurchases: messages.length, paidMessageStars: sum(messages), paywallViews: paywalled * 2, abandoned: paywalled - messageBuyers, paywallPct: fraction(paywalled, activeUsers), purchasePct: fraction(messageBuyers, paywalled), overallPct: fraction(messageBuyers, activeUsers), avgViewsPerFan: paywalled ? 2 : 0 },
    buyerConversion: { lifetimeFanProfiles: 12000, lifetimeBuyerProfiles: lifetimeBuyers.length, lifetimeBuyerRate: fraction(lifetimeBuyers.length, 12000), activeChatters: activeUsers, activeChatBuyers: paid.length, activeChatBuyerRate: activeUsers ? fraction(paid.length, activeUsers) : null, activeBuyerProfiles7d: weekly.length, activeBuyerEngagement7d: fraction(weekly.length, lifetimeBuyers.length), purchaseMix: byFeature },
    conversationFunnel: { arrivals: newFans, arrivalsStarted: Math.floor(newFans * .83), conversations: activeUsers, meaningful: Math.floor(activeUsers * .75), offered: Math.floor(activeUsers * .6), offeredBought: paid.length, ttfpN: paid.length, ttfpMedianHours: paid.length ? 2.4 : null },
    byFlow: [{ key: "smart", label: "Smart", clones: 1, stars, costUsd: 0, profitUsd: 0, sales: rows.length, share: stars ? 1 : 0 }],
    byDay: points.map(p => ({ label: p.label, stars: p.stars })), byHour, byDow,
    byTier: ["whale", "high", "mid", "low", "none"].map(key => { const matching = lifetimeBuyers.filter(b => tier(b.stars) === key); const amount = matching.reduce((n, b) => n + b.stars, 0); return { key, label: { whale: "Whale · 1,000+ ⭐", high: "High · 300+ ⭐", mid: "Mid · 50+ ⭐", low: "Low · under 50 ⭐", none: "No spend yet" }[key]!, users: key === "none" ? 12000 - lifetimeBuyers.length : matching.length, stars: amount, share: fraction(amount, lifetime) }; }),
    whaleFans: lifetimeBuyers.filter(b => tier(b.stars) === "whale").map(b => ({ cloneId: DEMO_CLONE_ID, cloneName: NAME, telegramId: -(b.id + 1), name: buyerName(b.id), username: null, stars: b.stars, purchases: b.purchases })),
    topWeeklySpenders: weekly.slice(0, 5).map(b => ({ cloneId: DEMO_CLONE_ID, cloneName: NAME, telegramId: -(b.id + 1), name: buyerName(b.id), username: null, stars: b.stars, purchases: b.purchases })),
    weeklySpenderSummary: { buyers: weekly.length, stars: sum(week), purchases: week.length, avgStars: fraction(sum(week), weekly.length) },
    funnel: { fans: 12000, buyers: lifetimeBuyers.length, repeat: repeat.length, oneTime: oneTime.length, threePlus: lifetimeBuyers.filter(b => b.purchases >= 3).length, nonBuyers: 12000 - lifetimeBuyers.length, totalPurchases: all.length, buyerPct: fraction(lifetimeBuyers.length, 12000), repeatPct: fraction(repeat.length, lifetimeBuyers.length), oneTimePct: fraction(oneTime.length, lifetimeBuyers.length), avgPurchasesPerBuyer: fraction(all.length, lifetimeBuyers.length), avgStarsPerBuyer: fraction(lifetime, lifetimeBuyers.length), medianStarsPerBuyer: medianSpend, repeatRevenueShare: fraction(repeat.reduce((n, b) => n + b.stars, 0), lifetime) },
  };
  return { demo: true, period, clones: [{ id: DEMO_CLONE_ID, slug: "zane-demo", name: NAME, color: COLOR, stars }], bucketLabels: points.map(p => p.label), series: points.map(p => ({ bucket: p.label, [DEMO_CLONE_ID]: p.stars })), recent: [...rows].reverse().slice(0, 300).map(r => ({ cloneId: DEMO_CLONE_ID, cloneName: NAME, cloneColor: COLOR, buyerName: buyerName(r.buyer), username: null, telegramId: -(r.buyer + 1), stars: r.stars, kind: r.feature, mediaType: ["photo", "video", "bundle"].includes(r.feature) ? r.feature as "photo" | "video" | "bundle" : null, mediaUrl: null, mediaName: ["photo", "video", "bundle"].includes(r.feature) ? `Demo ${r.feature} ${r.buyer % 6 + 1}` : null, paidAt: new Date(r.at).toISOString() })), totals: stats, perClone: { [DEMO_CLONE_ID]: stats }, analytics, balance: { lifetimeStars: lifetime, totalBalanceStars: Math.round(lifetime * .12) }, cachedAt: now, ageSeconds: 0, stale: false };
}
function metrics(rows: Sale[]) { const stars = sum(rows); return { stars, grossPaymentStars: stars, refundStars: 0, sales: rows.length, buyers: buyers(rows).length, averageSaleStars: fraction(stars, rows.length) }; }
export function creatorDemoInsight(day: string, now = Date.now()): RevenueWhyChanged {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(`${day}T12:00:00Z`)) || new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) !== day || day > parts(now).key) throw new Error("Choose today or a valid earlier date");
  const all = ledger(now), current = all.filter(r => parts(r.at).key === day);
  const baselineDays = Array.from({ length: 30 }, (_, i) => { const key = new Date(Date.parse(`${day}T12:00:00Z`) - (30 - i) * DAY).toISOString().slice(0, 10); return { key, label: key }; });
  const daily = baselineDays.map(d => all.filter(r => parts(r.at).key === d.key));
  const totals = metrics(current), baselines = daily.map(metrics);
  const benchmark = Object.fromEntries(Object.keys(totals).map(key => [key, median(baselines.map(m => m[key as keyof typeof m]))])) as typeof totals;
  const daysActivity = (rows: Sale[]) => ({ messagedFans: buyers(rows).length * 4, newFans: rows.length ? 24 : 0, conversationMessages: rows.length * 21 + (rows.length ? 14 : 0) });
  const activity = daysActivity(current), activities = daily.map(daysActivity);
  const usualMessagedFans = median(activities.map(a => a.messagedFans)), usualNewFans = median(activities.map(a => a.newFans)), usualConversationMessages = median(activities.map(a => a.conversationMessages));
  const top = buyers(current)[0], largest = [...current].sort((a, b) => b.stars - a.stars)[0];
  return {
    day: { key: day, label: day, partial: day === parts(now).key, elapsedLabel: day === parts(now).key ? "Demo day so far" : null },
    comparison: { label: "Synthetic 30-day comparison", benchmarkLabel: "30-day benchmark", baselineDays, baselineRangeLabel: `${baselineDays[0].key} to ${baselineDays[29].key}`, scopeLabel: "ZANE · Demo data", benchmark, sampleDays: 30, baselineIsPartial: false },
    totals: { ...totals, deltaStars: totals.stars - benchmark.stars, deltaSales: totals.sales - benchmark.sales, deltaBuyers: totals.buyers - benchmark.buyers, deltaAverageSaleStars: totals.averageSaleStars - benchmark.averageSaleStars },
    activity: { ...activity, usualMessagedFans, usualNewFans, usualConversationMessages, deltaMessagedFans: activity.messagedFans - usualMessagedFans, deltaNewFans: activity.newFans - usualNewFans, deltaConversationMessages: activity.conversationMessages - usualConversationMessages },
    concentration: { topBuyer: top ? { name: buyerName(top.id), cloneName: NAME, stars: top.stars, sales: top.purchases, share: fraction(top.stars, totals.stars) } : null, largestPayment: largest ? { name: buyerName(largest.buyer), cloneName: NAME, stars: largest.stars, feature: FEATURES.find(f => f.key === largest.feature)!.label, share: fraction(largest.stars, totals.stars) } : null },
    byClone: [{ key: DEMO_CLONE_ID, label: NAME, stars: totals.stars, sales: totals.sales, usualStars: benchmark.stars, usualSales: benchmark.sales, deltaStars: totals.stars - benchmark.stars }],
    byFeature: featureRows(current).map(f => { const usualStars = median(daily.map(rows => sum(rows.filter(r => r.feature === f.key)))); const usualSales = median(daily.map(rows => rows.filter(r => r.feature === f.key).length)); return { key: f.key, label: f.label, stars: f.stars, sales: f.sales, usualStars, usualSales, deltaStars: f.stars - usualStars }; }),
    summary: { headline: "ZANE demo earnings comparison", detail: "Generated sample transactions for interface testing. These are not real earnings, buyers, payments or available payouts.", concentrated: false },
  };
}
