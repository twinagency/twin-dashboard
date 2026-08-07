// ── The model-facing projection for the public API (app/api/v1/*) ────────────
//
// This file exists to answer one question in one place: WHAT IS A MODEL
// ALLOWED TO SEE? Everything the public API returns is built here, by naming
// fields explicitly. Nothing is passed through from an internal payload.
//
// WHY A PROJECTION AND NOT A FILTER. getAnalytics() returns costUsd,
// profitUsd, margin and a per-clone breakdown of the whole fleet. Deleting
// those on the way out means the next field added upstream is exposed by
// default, silently, to an external caller. Naming what goes OUT means the
// next field added upstream is withheld by default. Only one of those two
// failure modes is survivable.
//
// SO: OUR AI COST AND MARGIN NEVER LEAVE THIS BUILDING. costUsd/profitUsd are
// what it costs US to run her, and byFlow leaks the classic/smart split of the
// whole fleet. None of it is her business data and all of it is ours.

import { getAnalytics, type AnalyticsData } from "./analytics-data";
import type { Period, DateRange } from "./dashboard-data";
import { supabaseAdmin } from "./supabase";

// The fan fields a model may see about her OWN fans.
//
// ASSUMPTION, STATED BECAUSE IT WAS NEVER EXPLICITLY DECIDED: identity is
// included (telegram_id, name, username). These are her own fans, whose
// messages and handles she already sees in Telegram, so withholding them here
// would not protect anyone — it would just make her dashboard useless. Nothing
// derived from other clones is reachable regardless. If that call is wrong,
// this list is the only place to change it.
export const PUBLIC_FAN_COLUMNS = [
  "telegram_id",
  "name",
  "stated_name",
  "username",
  "first_seen_at",
  "last_message_received",
  "total_messages_sent",
  "total_messages_purchased",
  "message_credits",
  "total_spent_stars",
  "purchase_count",
  "spend_tier",
  "is_high_spender",
  "subscription_tier",
  "subscription_status",
  "subscription_period_end",
  "is_active",
  "blocked",
] as const;

// Never reachable on this API, by any route. Listed so the intent is testable
// rather than implied by absence.
export const NEVER_PUBLIC = [
  "cost_usd",
  "costUsd",
  "profitUsd",
  "margin",
  "bot_token",
  "persona",
  "intake",
  "text_prompt",
] as const;

export type PublicRevenue = {
  period: Period;
  range: DateRange | null;
  totals: { revenueStars: number; sales: number; fans: number; buyers: number };
  byKind: { key: string; label: string; stars: number; sales: number; share: number }[];
  byFeature: { key: string; label: string; stars: number; sales: number; avgStars: number; share: number }[];
  byDay: { label: string; stars: number }[];
  byHour: { hour: number; label: string; stars: number }[];
  byDow: { dow: number; label: string; stars: number }[];
  byTier: { key: string; label: string; users: number; stars: number; share: number }[];
  funnel: { fans: number; buyers: number; repeat: number; buyerPct: number; repeatPct: number };
  paywallFunnel: {
    collecting: boolean;
    messaged: number;
    paywalled: number;
    purchased: number;
    paywallPct: number;
    purchasePct: number;
  };
};

// The projection itself. Every field is named; `a` is never spread.
export function projectRevenue(a: AnalyticsData, range: DateRange | null): PublicRevenue {
  return {
    period: a.period,
    range,
    totals: {
      revenueStars: a.totals.revenueStars,
      sales: a.totals.sales,
      fans: a.totals.fans,
      buyers: a.totals.buyers,
      // a.totals.costUsd and a.totals.profitUsd are deliberately absent.
    },
    byKind: a.byKind.map((r) => ({ key: r.key, label: r.label, stars: r.stars, sales: r.sales, share: r.share })),
    byFeature: a.byFeature.map((r) => ({
      key: r.key,
      label: r.label,
      stars: r.stars,
      sales: r.sales,
      avgStars: r.avgStars,
      share: r.share,
    })),
    byDay: a.byDay.map((r) => ({ label: r.label, stars: r.stars })),
    byHour: a.byHour.map((r) => ({ hour: r.hour, label: r.label, stars: r.stars })),
    byDow: a.byDow.map((r) => ({ dow: r.dow, label: r.label, stars: r.stars })),
    byTier: a.byTier.map((r) => ({ key: r.key, label: r.label, users: r.users, stars: r.stars, share: r.share })),
    funnel: {
      fans: a.funnel.fans,
      buyers: a.funnel.buyers,
      repeat: a.funnel.repeat,
      buyerPct: a.funnel.buyerPct,
      repeatPct: a.funnel.repeatPct,
    },
    paywallFunnel: {
      collecting: a.paywallFunnel.collecting,
      messaged: a.paywallFunnel.messaged,
      paywalled: a.paywallFunnel.paywalled,
      purchased: a.paywallFunnel.purchased,
      paywallPct: a.paywallFunnel.paywallPct,
      purchasePct: a.paywallFunnel.purchasePct,
    },
    // a.clones[] is absent on purpose: it is the whole fleet, with our margin
    // on each. a.byFlow is absent for the same reason.
  };
}

// cloneId comes from the KEY, never from a request parameter. That is the
// entire tenancy boundary, so it is one argument on one function.
export async function publicRevenue(
  cloneId: string,
  period: Period,
  range?: DateRange,
): Promise<PublicRevenue> {
  const analytics = await getAnalytics(period, cloneId, range);
  return projectRevenue(analytics, range ?? null);
}

export const MAX_FAN_LIMIT = 500;
export const DEFAULT_FAN_LIMIT = 100;

export function clampFanLimit(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_FAN_LIMIT;
  return Math.min(MAX_FAN_LIMIT, Math.floor(n));
}

export type PublicFans = {
  fans: Record<string, unknown>[];
  rowCount: number;
  limitApplied: number;
  truncated: boolean;
};

export async function publicFans(cloneId: string, limit: number): Promise<PublicFans> {
  const capped = clampFanLimit(limit);
  const { data, error } = await supabaseAdmin
    .from("users")
    .select(PUBLIC_FAN_COLUMNS.join(","))
    // The tenancy boundary. Not optional, not derived from a parameter.
    .eq("clone_id", cloneId)
    .order("total_spent_stars", { ascending: false })
    .limit(capped);
  if (error) throw new Error(error.message);

  const fans = (data ?? []) as unknown as Record<string, unknown>[];
  return {
    fans,
    rowCount: fans.length,
    limitApplied: capped,
    truncated: fans.length === capped,
  };
}
