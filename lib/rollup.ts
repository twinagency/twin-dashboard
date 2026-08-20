import { supabaseAdmin } from "./supabase";

// The money aggregates, computed in Postgres instead of over the wire.
//
// WHY THIS FILE EXISTS. Every total on the Revenue page used to be built by
// downloading the rows and adding them up here: 330k usage_events and 197k
// chat_history rows for a single 1M view, 1,000 at a time, sequentially. That
// is 67.8 seconds measured end to end (getDashboard 29.8s + getAnalytics 37.9s
// on 2026-08-17), and worse, usage_events stopped at selectAllRows()'s 200,000
// row ceiling, so the cost figures on the page were lower bounds wearing the
// clothes of totals.
//
// Migration 120 moves those aggregations into SQL functions. Same definitions,
// quirks included — see the migration header, which is the place both halves
// are documented. The same rollups now take 143ms and 795ms.
//
// star_transactions is deliberately still read row by row: it is ~1k rows in a
// month, and the callers need each row (bucket, kind, feature, hour, weekday,
// media inference). Aggregate what only needs a number; keep the rows that
// need rows.
//
// NO SILENT FALLBACK. If a function is missing (migration not applied) these
// throw and the Revenue page shows an error. The alternative — quietly
// dropping back to the paged path — is how this project ends up with two
// answers to the same question and no way to tell which one is on screen.

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseAdmin.rpc(fn, args);
  if (error) {
    throw new Error(
      `${fn} failed: ${error.message}. Migration 120 (bot/db/migrations/120_revenue_rollups.sql) must be applied to this project.`,
    );
  }
  return data as T;
}

const iso = (ms: number) => new Date(ms).toISOString();

export type UsageRollupRow = {
  clone_id: string | null;
  cost_usd: number | string | null;
  calls: number | null;
  errors: number | null;
};

/** AI + voice spend in the window, grouped by clone. Includes the unattributed
 *  (clone_id null) group, because that money was still spent. */
export function usageRollup(startMs: number, endMs: number, cloneId?: string | null) {
  return rpc<UsageRollupRow[]>("revenue_usage_rollup", {
    p_start: iso(startMs),
    p_end: iso(endMs),
    p_clone: cloneId ?? null,
  });
}

export type CloneUserStatsRow = {
  clone_id: string;
  fans: number | null;
  active: number | null;
  messages: number | null;
  buyers: number | null;
};

/** Per-clone fan counts. `activeSinceMs` is passed in so "active in the last
 *  24h" is measured from the same instant as the rest of the page. */
export function cloneUserStats(activeSinceMs: number, cloneId?: string | null) {
  return rpc<CloneUserStatsRow[]>("revenue_clone_user_stats", {
    p_active_since: iso(activeSinceMs),
    p_clone: cloneId ?? null,
  });
}

export type CloneUserStatsWindowRow = {
  clone_id: string;
  fans: number | null;
  active: number | null;
  messages: number | null;
};

/** Per-clone fan counts bounded at BOTH ends (migration 122), for the stat tiles
 *  that have to answer "in the window the operator picked" rather than
 *  "ever". Distinct from cloneUserStats() above, which stays all-time on
 *  purpose — the Analytics tab's lifetime funnel reads that one.
 *
 *  `fans` counts arrivals (users.first_seen_at in window), `active` counts
 *  users.last_message_received in window, `messages` counts chat_history rows in
 *  window. Buyers are NOT here: dashboard-data.ts already holds the window's
 *  star_transactions rows and derives buyers from them, so asking SQL for a
 *  second definition of "buyer" would only create something to disagree with. */
export function cloneUserStatsWindow(startMs: number, endMs: number, cloneId?: string | null) {
  return rpc<CloneUserStatsWindowRow[]>("revenue_clone_user_stats_window", {
    p_start: iso(startMs),
    p_end: iso(endMs),
    p_clone: cloneId ?? null,
  });
}

export type FanSpendStats = {
  fans: number;
  buyers: number;
  repeat_buyers: number;
  one_time: number;
  three_plus: number;
  total_purchases: number;
  repeat_buyer_stars: number | string;
  lifetime_stars: number | string;
  median_buyer_stars: number | string;
};

export async function fanSpendStats(cloneId?: string | null): Promise<FanSpendStats> {
  const rows = await rpc<FanSpendStats[]>("revenue_fan_spend_stats", { p_clone: cloneId ?? null });
  return (
    rows?.[0] ?? {
      fans: 0,
      buyers: 0,
      repeat_buyers: 0,
      one_time: 0,
      three_plus: 0,
      total_purchases: 0,
      repeat_buyer_stars: 0,
      lifetime_stars: 0,
      median_buyer_stars: 0,
    }
  );
}

export type FanTierRow = { tier: string; fans: number | null; stars: number | string | null };

export function fanTiers(cloneId?: string | null) {
  return rpc<FanTierRow[]>("revenue_fan_tiers", { p_clone: cloneId ?? null });
}

/** Distinct fans who sent a message in the window. One integer, which used to
 *  cost ~197 round trips of chat_history. */
export async function messagedFanCount(startMs: number, endMs: number, cloneId?: string | null) {
  const n = await rpc<number | null>("revenue_messaged_fans", {
    p_start: iso(startMs),
    p_end: iso(endMs),
    p_clone: cloneId ?? null,
  });
  return Number(n) || 0;
}

export type PaywallStats = { views: number; fans: number; converted: number };

/** Paywall views, distinct fans paywalled, and how many of those also bought
 *  credits in the window. `creditBuyers` is already in the caller's hand from
 *  the ledger rows, so the intersection is done in SQL rather than by shipping
 *  every paywall hit up here. */
export async function paywallStats(
  startMs: number,
  endMs: number,
  cloneId: string | null,
  creditBuyers: number[],
): Promise<PaywallStats> {
  const rows = await rpc<PaywallStats[]>("revenue_paywall_stats", {
    p_start: iso(startMs),
    p_end: iso(endMs),
    p_clone: cloneId ?? null,
    p_credit_buyers: creditBuyers,
  });
  const row = rows?.[0];
  return {
    views: Number(row?.views) || 0,
    fans: Number(row?.fans) || 0,
    converted: Number(row?.converted) || 0,
  };
}
