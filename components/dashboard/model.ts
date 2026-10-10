import { AUD_PER_USD, STAR_USD } from "../../lib/money";
import { emptyState, messagesFor, normalizePlatform } from "../fans/model";
import { type Creator, type Fan, type Platform, type PlatformFilter, type Purchase, type WorkspaceState } from "../fans/types";

// This page only reads the existing isolated relationship fixtures. It has
// no database, payment, platform or delivery clients. Keep real /revenue data
// independent. Dates are pinned to the authored histories for repeatable tours.
export const REPORT_DAY = "2026-10-09";
export const REPORT_START = "2026-04-10";
export const FILTER_STORAGE_KEY = "twin-creator-dashboard-filters-v1";
export const platformOrder: Platform[] = ["onlyfans", "telegram"];
export type Window = "7d" | "30d" | "6m" | "all" | "custom";
export type DisplayCurrency = "USD" | "AUD";
export type Filters = { creatorId: string; platform: PlatformFilter; window: Window; currency: DisplayCurrency; from: string; to: string; day: string };
export type LedgerEntry = Purchase & { fan: Fan; status: "Completed" };
export type Activity = { id: string; fan: Fan; platform: Platform; at: string; kind: "Conversation" | "Purchase" | "Memory" | "Account link"; title: string; summary: string; purchase?: LedgerEntry; sourceId?: string };
export type Trend = { series: { day: string; value: number }[]; percentChange: number | null };

export const dayAt = (at: string) => new Date(Date.parse(at) + 10 * 60 * 60 * 1000).toISOString().slice(0, 10);
export function validDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === day;
}
export function shiftDay(day: string, by: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + by * 86400000).toISOString().slice(0, 10);
}
export function parseFilters(query: URLSearchParams, creators: Creator[]): Filters {
  const creatorId = creators.some(c => c.id === query.get("creator")) ? query.get("creator")! : "briana";
  const platform = normalizePlatform(query.get("platform")) ?? "all";
  const window = ["7d", "30d", "6m", "all", "custom"].includes(query.get("window") || "") ? query.get("window") as Window : "30d";
  const from = query.get("from") || shiftDay(REPORT_DAY, -29), to = query.get("to") || REPORT_DAY;
  const safeRange = validDay(from) && validDay(to) && from >= REPORT_START && from <= to && to <= REPORT_DAY;
  const day = query.get("day") || "";
  return { creatorId, platform, window: window === "custom" && !safeRange ? "30d" : window,
    currency: query.get("currency") === "AUD" ? "AUD" : "USD",
    from: safeRange ? from : shiftDay(REPORT_DAY, -29), to: safeRange ? to : REPORT_DAY,
    day: validDay(day) && day >= REPORT_START && day <= REPORT_DAY ? day : "" };
}
export function filterParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams({ creator: filters.creatorId, platform: filters.platform, window: filters.window, currency: filters.currency });
  if (filters.window === "custom") { params.set("from", filters.from); params.set("to", filters.to); }
  if (filters.day) params.set("day", filters.day);
  return params;
}
export function rangeFor(filters: Filters, fans: Fan[]) {
  const creatorFans = fans.filter(f => f.creatorId === filters.creatorId);
  const firstDay = creatorFans.map(f => dayAt(f.firstSeen)).sort()[0] || REPORT_DAY;
  const from = filters.window === "custom" ? filters.from : filters.window === "all" ? firstDay : filters.window === "6m" ? REPORT_START : shiftDay(REPORT_DAY, filters.window === "7d" ? -6 : -29);
  const to = filters.window === "custom" ? filters.to : REPORT_DAY;
  const days: string[] = [];
  for (let day = from; day <= to; day = shiftDay(day, 1)) days.push(day);
  return { from, to, days, firstDay };
}
export function valueCents(purchase: Purchase, currency: DisplayCurrency, audRate = AUD_PER_USD): number {
  const rate = Number.isFinite(audRate) && audRate > 0 ? audRate : AUD_PER_USD;
  const usd = purchase.currency === "Stars" ? purchase.amount * STAR_USD : purchase.amount;
  return Math.round(usd * (currency === "AUD" ? rate : 1) * 100);
}
export function displayMoney(cents: number, currency: DisplayCurrency) {
  return `${currency === "AUD" ? "A$" : "US$"}${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export const originalMoney = (p: Purchase) => p.currency === "Stars" ? `${p.amount.toLocaleString("en-US")} Stars` : displayMoney(Math.round(p.amount * 100), "USD");

export function buildDashboard(fans: Fan[], filters: Filters, audRate = AUD_PER_USD, state: WorkspaceState = emptyState()) {
  const range = rangeFor(filters, fans);
  const inRange = (at: string) => { const day = dayAt(at); return day >= range.from && day <= range.to; };
  const onPlatform = (platform: Platform) => filters.platform === "all" || filters.platform === platform;
  const cents = (p: Purchase) => valueCents(p, filters.currency, audRate);
  const periodTotals = (from: string, to: string) => {
    const periodFans = fans.filter(f => f.creatorId === filters.creatorId && dayAt(f.firstSeen) <= to);
    const periodAccounts = (fan: Fan) => fan.accounts.filter(a => dayAt(a.linkedAt) <= to);
    const scoped = periodFans.filter(f => filters.platform === "all" || periodAccounts(f).some(a => a.platform === filters.platform));
    const purchases = scoped.flatMap(f => f.purchases.filter(p => onPlatform(p.platform) && dayAt(p.at) >= from && dayAt(p.at) <= to && Number.isFinite(p.amount) && p.amount > 0));
    const activeFans = new Set(scoped.filter(f => messagesFor(f, state, filters.platform)
      .some(m => m.direction === "in" && dayAt(m.at) >= from && dayAt(m.at) <= to)).map(f => f.id)).size;
    return { revenue: purchases.reduce((sum, p) => sum + cents(p), 0), activeFans,
      platforms: Object.fromEntries(platformOrder.map(platform => [platform, purchases.filter(p => p.platform === platform).reduce((sum, p) => sum + cents(p), 0)])) as Record<Platform, number> };
  };
  const creatorFans = fans.filter(f => f.creatorId === filters.creatorId && dayAt(f.firstSeen) <= range.to);
  const accountsAtEnd = (fan: Fan) => fan.accounts.filter(a => dayAt(a.linkedAt) <= range.to);
  const scopedFans = creatorFans.filter(f => filters.platform === "all" || accountsAtEnd(f).some(a => a.platform === filters.platform));
  const entries: LedgerEntry[] = scopedFans.flatMap(fan => fan.purchases
    .filter(p => onPlatform(p.platform) && inRange(p.at) && Number.isFinite(p.amount) && p.amount > 0)
    .map(p => ({ ...p, fan, status: "Completed" as const }))).sort((a, b) => b.at.localeCompare(a.at));
  const payingIds = new Set(entries.map(p => p.fan.id));
  const activeIds = new Set(scopedFans.filter(f => messagesFor(f, state, filters.platform).some(m => m.direction === "in" && inRange(m.at))).map(f => f.id));
  const repeatBuyers = [...payingIds].filter(id => entries.filter(p => p.fan.id === id).length >= 2).length;
  const platforms = platformOrder.map(platform => {
    const sales = entries.filter(p => p.platform === platform);
    return { platform, cents: sales.reduce((sum, p) => sum + cents(p), 0), purchases: sales.length,
      buyers: new Set(sales.map(p => p.fan.id)).size,
      accounts: scopedFans.filter(f => accountsAtEnd(f).some(a => a.platform === platform)).length,
      connected: creatorFans.some(f => accountsAtEnd(f).some(a => a.platform === platform)) };
  });
  const chart = range.days.map(day => {
    const sales = entries.filter(p => dayAt(p.at) === day);
    return { day, cents: sales.reduce((sum, p) => sum + cents(p), 0), purchases: sales.length,
      platforms: platformOrder.map(platform => ({ platform, cents: sales.filter(p => p.platform === platform).reduce((sum, p) => sum + cents(p), 0) })) };
  });
  const relationships = scopedFans.map(fan => {
    const sales = entries.filter(p => p.fan.id === fan.id);
    const messages = messagesFor(fan, state, filters.platform).filter(m => dayAt(m.at) <= range.to);
    return { fan, accounts: accountsAtEnd(fan), cents: sales.reduce((sum, p) => sum + cents(p), 0), purchases: sales.length,
      paying: payingIds.has(fan.id), active: activeIds.has(fan.id), lastMessage: messages.at(-1),
      memories: fan.memories.filter(m => onPlatform(m.source) && dayAt(m.updatedAt) <= range.to).length };
  }).sort((a, b) => b.cents - a.cents || a.fan.name.localeCompare(b.fan.name));
  const content = [...new Set(entries.map(p => p.title))].map(title => {
    const sales = entries.filter(p => p.title === title);
    return { title, kind: sales[0].kind, entries: sales, purchases: sales.length, owners: new Set(sales.map(p => p.fan.id)).size,
      cents: sales.reduce((sum, p) => sum + cents(p), 0) };
  }).sort((a, b) => b.cents - a.cents || a.title.localeCompare(b.title));
  const activities: Activity[] = scopedFans.flatMap(fan => [
    ...messagesFor(fan, state, filters.platform).filter(m => inRange(m.at)).map(m => ({ id: `message:${m.id}`, fan, platform: m.platform, at: m.at,
      kind: "Conversation" as const, title: m.direction === "in" ? "Message received" : "Reply sent", summary: m.text, sourceId: m.id })),
    ...fan.memories.filter(m => onPlatform(m.source) && inRange(m.updatedAt)).map(m => ({ id: `memory:${fan.id}:${m.id}`, fan, platform: m.source, at: m.updatedAt,
      kind: "Memory" as const, title: m.label, summary: state.memories[fan.id]?.[m.id] ?? m.value, sourceId: m.sourceMessageId })),
    ...accountsAtEnd(fan).filter(a => onPlatform(a.platform) && inRange(a.linkedAt)).map(a => ({ id: `account:${fan.id}:${a.platform}`, fan, platform: a.platform, at: a.linkedAt,
      kind: "Account link" as const, title: "Account linked", summary: `@${a.username} joined this creator relationship.` })),
  ]);
  activities.push(...entries.map(p => ({ id: `purchase:${p.id}`, fan: p.fan, platform: p.platform, at: p.at, kind: "Purchase" as const, title: p.title, summary: `${originalMoney(p)} · ${p.kind} · Owned`, purchase: p, sourceId: p.sourceMessageId })));
  activities.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
  const revenueCents = entries.reduce((sum, p) => sum + cents(p), 0);
  const activeByDay = new Map(range.days.map(day => [day, new Set<string>()]));
  for (const fan of scopedFans) for (const message of messagesFor(fan, state, filters.platform)) {
    const day = dayAt(message.at);
    if (message.direction === "in" && activeByDay.has(day)) activeByDay.get(day)!.add(fan.id);
  }
  let currentComparison = { revenue: revenueCents, activeFans: activeIds.size,
    platforms: Object.fromEntries(platforms.map(p => [p.platform, p.cents])) as Record<Platform, number> };
  let previousComparison: ReturnType<typeof periodTotals> | null = null;
  if (filters.window === "all") {
    const half = Math.floor(range.days.length / 2);
    if (half > 0) {
      const previousFrom = range.days[0], previousTo = range.days[half - 1];
      const currentFrom = range.days[range.days.length - half], currentTo = range.days.at(-1)!;
      previousComparison = periodTotals(previousFrom, previousTo);
      currentComparison = periodTotals(currentFrom, currentTo);
    }
  } else {
    const previousFrom = shiftDay(range.from, -range.days.length);
    const previousTo = shiftDay(range.from, -1);
    if (previousFrom >= range.firstDay) previousComparison = periodTotals(previousFrom, previousTo);
  }
  const percentChange = (current: number, previous: number | null) => previous && Number.isFinite(previous) ? (current - previous) / previous * 100 : null;
  const trends = {
    revenue: { series: chart.map(point => ({ day: point.day, value: point.cents })),
      percentChange: percentChange(currentComparison.revenue, previousComparison?.revenue ?? null) } satisfies Trend,
    platforms: platformOrder.map(platform => ({ platform,
      series: chart.map(point => ({ day: point.day, value: point.platforms.find(item => item.platform === platform)?.cents ?? 0 })),
      percentChange: percentChange(currentComparison.platforms[platform], previousComparison?.platforms[platform] ?? null) })),
    activeFans: { series: range.days.map(day => ({ day, value: activeByDay.get(day)?.size ?? 0 })),
      percentChange: percentChange(currentComparison.activeFans, previousComparison?.activeFans ?? null) } satisfies Trend,
  };
  return { range, entries, platforms, chart, relationships, content, activities, trends,
    metrics: { revenueCents, payingFans: payingIds.size, activeFans: activeIds.size, purchases: entries.length,
      repeatBuyers, repeatRate: payingIds.size ? repeatBuyers / payingIds.size * 100 : 0,
      linkedFans: scopedFans.filter(f => accountsAtEnd(f).length > 1).length, fans: scopedFans.length,
      accounts: scopedFans.reduce((sum, f) => sum + accountsAtEnd(f).length, 0),
      usd: entries.filter(p => p.currency === "USD").reduce((sum, p) => sum + p.amount, 0),
      stars: entries.filter(p => p.currency === "Stars").reduce((sum, p) => sum + p.amount, 0) } };
}
