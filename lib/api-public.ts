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
import { STAR_USD, AUD_PER_USD } from "./money";

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
  totals: {
    revenueStars: number;
    revenueUsd: number;
    revenueAud: number;
    sales: number;
    fans: number;
    buyers: number;
  };
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
      // Static STAR_USD/AUD_PER_USD conversion (lib/money.ts), not a live FX
      // rate. This is revenue only, not cost or profit, so it does not touch
      // the "our margin never leaves the building" boundary above.
      revenueUsd: a.totals.revenueStars * STAR_USD,
      revenueAud: a.totals.revenueStars * STAR_USD * AUD_PER_USD,
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
//
// includeCost: false is not an optimisation bolted on here — it is the honest
// statement of what this function needs. projectRevenue() below cannot return
// costUsd or profitUsd, so computing them would be work done to be discarded.
// It also happens to be the fix for the 500s: revenue_usage_rollup was timing
// out (code 57014) on every period of this endpoint on 2026-08-24. See
// AnalyticsOptions in lib/analytics-data.ts.
export async function publicRevenue(
  cloneId: string,
  period: Period,
  range?: DateRange,
): Promise<PublicRevenue> {
  const analytics = await getAnalytics(period, cloneId, range, { includeCost: false });
  return projectRevenue(analytics, range ?? null);
}

// ── the fleet projection (migration 127 keys) ────────────────────────────────
//
// A fleet key answers "how is every girl doing", so the response is the same
// revenue shape PLUS a per-model breakdown. Written as its own type and its own
// projection rather than as an optional field on PublicRevenue, because the
// question "what may a fleet key see" deserves to be answerable by reading one
// list, exactly like the per-clone one above.
//
// WHAT IS STILL WITHHELD, and this is the whole point of doing it by hand:
// a.clones[] carries costUsd, profitUsd and margin PER GIRL. That is our margin
// on each of them, itemised, and it is the single most sensitive object in this
// codebase to hand to an outside builder. Widening the key's scope from one
// clone to ten does NOT widen it from revenue to profit — those are different
// axes and only the first one moved. Only id, name, revenueStars and sales are
// named below; the rest are not "removed", they are never mentioned.
export type PublicFleetModel = {
  id: string;
  name: string;
  revenueStars: number;
  revenueUsd: number;
  revenueAud: number;
  sales: number;
};

export type PublicFleetRevenue = PublicRevenue & {
  scope: "fleet";
  models: PublicFleetModel[];
};

export function projectFleetRevenue(a: AnalyticsData, range: DateRange | null): PublicFleetRevenue {
  return {
    ...projectRevenue(a, range),
    scope: "fleet",
    // a.clones is already ranked best → worst by revenue upstream; the order is
    // part of what makes this useful, so it is preserved rather than re-sorted.
    models: a.clones.map((c) => ({
      id: c.id,
      name: c.name,
      revenueStars: c.revenueStars,
      revenueUsd: c.revenueStars * STAR_USD,
      revenueAud: c.revenueStars * STAR_USD * AUD_PER_USD,
      sales: c.sales,
      // c.costUsd, c.profitUsd and c.margin are deliberately absent.
    })),
  };
}

// No cloneId argument, and that absence is the point: a fleet key is not a
// clone key with a wildcard, it is a different call. getAnalytics(period, null)
// is fleet-wide by its own contract.
export async function publicFleetRevenue(
  period: Period,
  range?: DateRange,
): Promise<PublicFleetRevenue> {
  const analytics = await getAnalytics(period, null, range, { includeCost: false });
  return projectFleetRevenue(analytics, range ?? null);
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

// A fleet key's fan list. Same columns plus `clone_id`, because a row from ten
// girls' fans is meaningless without saying whose fan it is — and the id names
// a clone this key can already see, so it discloses nothing the key did not
// already have.
//
// NOT a per-clone loop. One ordered, capped query across the fleet: ten queries
// at MAX_FAN_LIMIT each would be 5,000 rows to return 500 of them, and the
// ordering between the ten results would still have to be redone here.
export const PUBLIC_FLEET_FAN_COLUMNS = ["clone_id", ...PUBLIC_FAN_COLUMNS] as const;

export async function publicFleetFans(limit: number): Promise<PublicFans> {
  const capped = clampFanLimit(limit);
  const { data, error } = await supabaseAdmin
    .from("users")
    .select(PUBLIC_FLEET_FAN_COLUMNS.join(","))
    // No .eq() — that IS the fleet scope, and it is reached only from a route
    // that has already proved tenant.scope === "fleet".
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
