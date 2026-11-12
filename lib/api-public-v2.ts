// ── Payments + stats for the public API (app/api/v1/payments, /stats) ────────
//
// Same contract as lib/api-public.ts, written as its own file because that one
// is pinned by check B1/G8 (it must never read request parameters and holds
// exactly one unfiltered `users` read). Everything here is an allowlist
// projection: every outbound field is NAMED, nothing is spread from a row, so a
// column added upstream is withheld by default.
//
// WHAT NEVER LEAVES: our AI cost, profit and margin (no usage_events and no
// revenue_usage_rollup is read anywhere in this file), the invoice payload, the
// intent/attempt ids, chat content, and any credential.
//
// TENANCY IS THE KEY. Each read comes as a pair: a function that takes a cloneId
// and filters on it, and a fleet function with no filter that the route reaches
// only behind `tenant.scope === "fleet"`. Neither ever sees a request parameter;
// bounded options arrive pre-parsed from lib/api-public-query.ts.
//
// MONEY MATCHES /api/v1/revenue. Rows go through the same duplicate collapse
// (lib/star-dedupe.ts) and the same cuts as the revenue endpoint: a clone key
// sees both cuts stacked, a fleet key the platform cut only, per row's own
// clone. So a sum of /payments equals /revenue for the same window up to
// per-row rounding: each payment is rounded to 0.01 Star, /revenue cuts the
// unrounded aggregate, so they differ by at most 0.005 Star per payment.

import { supabaseAdmin } from "./supabase";
import { PAGE, selectAllRows } from "./select-all";
import { dedupeStarRows } from "./star-dedupe";
import { classifyRevenueLedgerRow } from "./revenue-ledger";
import { STAR_USD } from "./money";
import { net, resolveCloneCuts, type CloneCuts } from "./revenue-projection";
import { cloneUserStats, cloneUserStatsWindow } from "./rollup";
import { cursorAt, encodeCursor, type PaymentQuery } from "./api-public-query";

type Mode = "clone" | "fleet";

/** Net of the cuts this key's role is entitled to (clone key = creator, fleet =
 *  agency), rounded to cents of a Star. A missing cut THROWS (net()): clone_id is
 *  NOT NULL + FK on star_transactions, so every row's clone resolves; a miss is a
 *  broken invariant, and gross must never go out as net. */
function netStars(gross: number, cuts: CloneCuts | undefined, mode: Mode): number {
  return Math.round(net(gross, cuts, mode === "clone" ? "creator" : "agency") * 100) / 100;
}
const usd = (stars: number) => Math.round(stars * STAR_USD * 100) / 100;

// ── payments ─────────────────────────────────────────────────────────────────
const PAYMENT_COLUMNS = "id,clone_id,telegram_id,kind,feature,media_type,amount_stars,paid_at,invoice_payload";

export type PublicPayment = {
  id: string;
  cloneId?: string;
  telegramId: number | null;
  fan: { name: string | null; username: string | null } | null;
  kind: string | null;
  feature: string | null;
  mediaType: string | null;
  stars: number;
  usd: number;
  paidAt: string;
  isRefund: boolean;
};

export type PublicPayments = {
  payments: PublicPayment[];
  count: number;
  /** requested limit; a page may exceed it by the rest of its last paid_at group */
  limitApplied: number;
  nextCursor: string | null;
  window: { since: string; until: string };
  totals: { stars: number; usd: number; sales: number; buyers: number };
};

type RawPayment = {
  id: string;
  clone_id: string | null;
  telegram_id: number | null;
  kind: string | null;
  feature: string | null;
  media_type: string | null;
  amount_stars: number | string | null;
  paid_at: string;
  invoice_payload: string | null;
};

// A page never splits a paid_at group. Duplicates share paid_at (it is in the
// business key), so with whole groups on every page, dedupeStarRows over one
// page is dedupeStarRows over the window, and pages sum to /revenue (W4 F2).
// A group bigger than this is refused rather than split.
const GROUP_ROWS = PAGE;

/** star_transactions in this key's scope, window and filters; every read below starts here. */
function scopedPayments(cloneId: string | null, q: PaymentQuery, limit: number) {
  let query = supabaseAdmin.from("star_transactions").select(PAYMENT_COLUMNS).limit(limit).gte("paid_at", q.since).lte("paid_at", q.until);
  // The tenancy boundary for the per-clone read. The fleet read passes null and
  // is reached only from a route that proved tenant.scope === "fleet".
  if (cloneId !== null) query = query.eq("clone_id", cloneId);
  if (q.feature) query = query.eq("feature", q.feature);
  if (q.kind) query = query.eq("kind", q.kind);
  if (q.minStars > 0) query = query.gte("amount_stars", q.minStars);
  else if (!q.includeRefunds) query = query.gt("amount_stars", 0);
  return query.order("paid_at", { ascending: false }).order("id", { ascending: false });
}
async function rowsOf(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<RawPayment[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as RawPayment[];
}

async function readPayments(cloneId: string | null, q: PaymentQuery, mode: Mode): Promise<PublicPayments> {
  // Read `limit` rows, not limit+1: asking for one extra to spot a next page broke at the
  // max, where PostgREST max_rows (1000) silently drops the extra row (W4 F3).
  // Keyset pagination on paid_at alone: the previous page ended on a whole
  // group, so this one is everything strictly older. No id reaches a filter
  // from a cursor (a TON id can hold `+` and `/`), and every read is plain eq/lt.
  const head = scopedPayments(cloneId, q, q.limit);
  const page = await rowsOf(q.cursor ? head.lt("paid_at", q.cursor.t) : head);
  let hasMore = false;
  // A short page is the end of the window (max_rows >= 1000 >= limit, as
  // selectAllRows assumes). A full one reads the rest of its last paid_at
  // group, then one row past it to know whether another page exists.
  if (page.length === q.limit) {
    const t = page[page.length - 1].paid_at;
    const rest = await rowsOf(scopedPayments(cloneId, q, GROUP_ROWS).eq("paid_at", t).lt("id", String(page[page.length - 1].id)));
    if (rest.length >= GROUP_ROWS) throw new Error(`payments: ${GROUP_ROWS}+ rows share paid_at ${t}, refusing to split them across pages`);
    page.push(...rest);
    hasMore = (await rowsOf(scopedPayments(cloneId, q, 1).lt("paid_at", t))).length > 0;
  }
  const last = page[page.length - 1];
  const cursor = hasMore ? cursorAt(last.paid_at) : null;
  if (hasMore && !cursor) throw new Error(`payments: paid_at ${String(last.paid_at)} cannot be a page cursor`);
  // Duplicate payments from the 2026-09 bot bug are collapsed here for the same
  // reason they are collapsed in the revenue number, so the two agree.
  const rows = dedupeStarRows(page);

  // Who paid, filtered by the clone(s) on the page. A page can hold ~2000 fans
  // (limit plus its last group), so 200 ids per read keeps the URL short,
  // selectAllRows pages past max_rows, and a short read fails the page.
  const tgIds = [...new Set(rows.map((r) => r.telegram_id).filter((v): v is number => typeof v === "number"))];
  const cloneIds = [...new Set(rows.map((r) => r.clone_id).filter((v): v is string => !!v))];
  const names = new Map<string, { name: string | null; username: string | null }>();
  for (let i = 0; i < tgIds.length && cloneIds.length; i += 200) {
    const u = await selectAllRows<{ clone_id: string; telegram_id: number; name: string | null; username: string | null }>(
      supabaseAdmin.from("users").select("clone_id,telegram_id,name,username").in("clone_id", cloneIds).in("telegram_id", tgIds.slice(i, i + 200)).order("clone_id").order("telegram_id"),
      { label: "public payments fans" });
    if (u.truncated) throw new Error("payments: fan name lookup incomplete");
    for (const f of u.rows) names.set(`${f.clone_id}:${f.telegram_id}`, { name: f.name, username: f.username });
  }
  const cuts = await resolveCloneCuts(cloneIds);

  const payments: PublicPayment[] = rows.map((r) => {
    const c = classifyRevenueLedgerRow(r);
    const stars = netStars(c.stars, r.clone_id ? cuts.get(r.clone_id) : undefined, mode);
    const out: PublicPayment = {
      id: String(r.id),
      telegramId: r.telegram_id ?? null,
      fan: r.telegram_id != null && r.clone_id ? (names.get(`${r.clone_id}:${r.telegram_id}`) ?? null) : null,
      kind: r.kind ?? null,
      feature: r.feature ?? null,
      mediaType: r.media_type ?? null,
      stars,
      usd: usd(stars),
      paidAt: r.paid_at,
      isRefund: c.adjustment,
    };
    if (mode === "fleet" && r.clone_id) out.cloneId = r.clone_id;
    return out;
  });

  const paid = payments.filter((p) => !p.isRefund);
  const buyers = new Set(rows.filter((r) => classifyRevenueLedgerRow(r).paidOrder && r.telegram_id != null).map((r) => r.telegram_id));
  const totalStars = Math.round(payments.reduce((a, p) => a + p.stars, 0) * 100) / 100;
  return {
    payments,
    count: payments.length,
    limitApplied: q.limit,
    nextCursor: cursor ? encodeCursor(cursor) : null,
    window: { since: q.since, until: q.until },
    totals: { stars: totalStars, usd: usd(totalStars), sales: paid.length, buyers: buyers.size },
  };
}

export function publicPayments(cloneId: string, q: PaymentQuery): Promise<PublicPayments> {
  return readPayments(cloneId, q, "clone");
}
export function publicFleetPayments(q: PaymentQuery): Promise<PublicPayments> {
  return readPayments(null, q, "fleet");
}

// ── stats: one call that answers "how are we doing right now" ────────────────
export type StatsWindow = { stars: number; usd: number; sales: number; buyers: number; avgOrderStars: number; refundStars: number };
export type StatsModel = {
  id: string;
  name: string;
  fans: number;
  active24h: number;
  new24h: number;
  new7d: number;
  stars24h: number;
  stars7d: number;
  sales24h: number;
};
export type PublicStats = {
  scope: "clone" | "fleet";
  generatedAt: string;
  /** seconds this snapshot may be reused for; polling faster just returns the same numbers */
  freshnessSeconds: number;
  windows: { last1h: StatsWindow; last24h: StatsWindow; last7d: StatsWindow; last30d: StatsWindow };
  /** true when the 30 day payments read hit its row ceiling, so the 30d figures are a lower bound */
  windowsTruncated: boolean;
  fans: {
    total: number;
    active24h: number;
    new1h: number;
    new24h: number;
    new7d: number;
    new30d: number;
    buyersLifetime: number;
    messages24h: number;
    messages7d: number;
  };
  byFeature24h: { feature: string; stars: number; sales: number }[];
  byHour24h: { hour: string; stars: number; sales: number }[];
  models?: StatsModel[];
};

export const STATS_TTL_MS = 15_000;
const statsCache = new Map<string, { at: number; value: PublicStats }>();
const MAX_30D_ROWS = 60_000;
const H = 3_600_000;
const D = 24 * H;

type Tx = {
  id: string;
  clone_id: string;
  telegram_id: number | null;
  kind: string | null;
  feature: string | null;
  amount_stars: number | string | null;
  paid_at: string;
  invoice_payload: string | null;
};

function windowOf(rows: { stars: number; paidOrder: boolean; adjustment: boolean; telegram_id: number | null }[]): StatsWindow {
  let net = 0, gross = 0, sales = 0, refunds = 0;
  const buyers = new Set<number>();
  for (const r of rows) {
    net += r.stars;
    if (r.adjustment) { refunds += r.stars; continue; }
    if (r.paidOrder) { gross += r.stars; sales++; if (r.telegram_id != null) buyers.add(r.telegram_id); }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return { stars: round(net), usd: usd(net), sales, buyers: buyers.size, avgOrderStars: sales ? round(gross / sales) : 0, refundStars: round(Math.abs(refunds)) };
}

async function computeStats(cloneId: string | null, mode: Mode, now: number): Promise<PublicStats> {
  const since30 = new Date(now - 30 * D).toISOString();
  let tq = supabaseAdmin
    .from("star_transactions")
    .select("id,clone_id,telegram_id,kind,feature,amount_stars,paid_at,invoice_payload")
    .gte("paid_at", since30)
    .lte("paid_at", new Date(now).toISOString());
  if (cloneId !== null) tq = tq.eq("clone_id", cloneId);
  // ORDER BY id is correctness: an unordered paged read can repeat or skip rows.
  tq = tq.order("id", { ascending: true });

  const cloneQ = cloneId !== null
    ? supabaseAdmin.from("clones").select("id,name").eq("id", cloneId)
    : supabaseAdmin.from("clones").select("id,name").order("created_at", { ascending: true });

  const scopeId = cloneId ?? null;
  const [paged, allTime, w1h, w24h, w7d, w30d, clones] = await Promise.all([
    selectAllRows<Tx>(tq, { maxRows: MAX_30D_ROWS, label: "public stats payments" }),
    cloneUserStats(now - D, scopeId),
    cloneUserStatsWindow(now - H, now, scopeId),
    cloneUserStatsWindow(now - D, now, scopeId),
    cloneUserStatsWindow(now - 7 * D, now, scopeId),
    cloneUserStatsWindow(now - 30 * D, now, scopeId),
    cloneQ.then((r) => (r.data ?? []) as { id: string; name: string }[]),
  ]);

  const deduped = dedupeStarRows(paged.rows);
  const cuts = await resolveCloneCuts(deduped.map((r) => r.clone_id));
  const classified = deduped.map((r) => {
    const c = classifyRevenueLedgerRow(r);
    return { ...c, clone_id: r.clone_id, feature: r.feature, ms: Date.parse(r.paid_at), stars: netStars(c.stars, cuts.get(r.clone_id), mode) };
  });
  const within = (ms: number) => classified.filter((r) => r.ms >= now - ms);
  const r24 = within(D), r7 = within(7 * D);

  const fansOf = (rows: { clone_id: string; fans: number | null }[]) => rows.reduce((a, r) => a + (Number(r.fans) || 0), 0);
  const activeOf = (rows: { active: number | null }[]) => rows.reduce((a, r) => a + (Number(r.active) || 0), 0);
  const msgsOf = (rows: { messages: number | null }[]) => rows.reduce((a, r) => a + (Number(r.messages) || 0), 0);

  const feat = new Map<string, { stars: number; sales: number }>();
  for (const r of r24) {
    if (r.adjustment) continue;
    const k = r.feature ?? "other";
    const cur = feat.get(k) ?? { stars: 0, sales: 0 };
    cur.stars += r.stars; cur.sales += r.paidOrder ? 1 : 0;
    feat.set(k, cur);
  }
  const hours = new Map<string, { stars: number; sales: number }>();
  for (const r of r24) {
    if (r.adjustment) continue;
    const k = new Date(r.ms).toISOString().slice(0, 13) + ":00Z";
    const cur = hours.get(k) ?? { stars: 0, sales: 0 };
    cur.stars += r.stars; cur.sales += r.paidOrder ? 1 : 0;
    hours.set(k, cur);
  }
  const round = (n: number) => Math.round(n * 100) / 100;

  const byClone = (rows: { clone_id: string; fans?: number | null; active?: number | null }[], id: string, f: "fans" | "active") =>
    Number(rows.find((r) => r.clone_id === id)?.[f] ?? 0) || 0;

  const stats: PublicStats = {
    scope: mode,
    generatedAt: new Date(now).toISOString(),
    freshnessSeconds: STATS_TTL_MS / 1000,
    windows: { last1h: windowOf(within(H)), last24h: windowOf(r24), last7d: windowOf(r7), last30d: windowOf(classified) },
    windowsTruncated: paged.truncated,
    fans: {
      total: fansOf(allTime),
      active24h: activeOf(w24h),
      new1h: fansOf(w1h),
      new24h: fansOf(w24h),
      new7d: fansOf(w7d),
      new30d: fansOf(w30d),
      buyersLifetime: allTime.reduce((a, r) => a + (Number(r.buyers) || 0), 0),
      messages24h: msgsOf(w24h),
      messages7d: msgsOf(w7d),
    },
    byFeature24h: [...feat].map(([feature, v]) => ({ feature, stars: round(v.stars), sales: v.sales })).sort((a, b) => b.stars - a.stars),
    byHour24h: [...hours].map(([hour, v]) => ({ hour, stars: round(v.stars), sales: v.sales })).sort((a, b) => (a.hour < b.hour ? -1 : 1)),
  };
  if (mode === "fleet") {
    stats.models = clones.map((c) => {
      const mine24 = r24.filter((r) => r.clone_id === c.id);
      const mine7 = r7.filter((r) => r.clone_id === c.id);
      return {
        id: c.id,
        name: c.name,
        fans: byClone(allTime, c.id, "fans"),
        active24h: byClone(w24h, c.id, "active"),
        new24h: byClone(w24h, c.id, "fans"),
        new7d: byClone(w7d, c.id, "fans"),
        stars24h: round(mine24.reduce((a, r) => a + r.stars, 0)),
        stars7d: round(mine7.reduce((a, r) => a + r.stars, 0)),
        sales24h: mine24.filter((r) => r.paidOrder).length,
      };
    }).sort((a, b) => b.stars24h - a.stars24h);
  }
  return stats;
}

async function cachedStats(cloneId: string | null, mode: Mode, now: number): Promise<PublicStats> {
  const key = cloneId ?? "fleet";
  const hit = statsCache.get(key);
  if (hit && now - hit.at < STATS_TTL_MS) return hit.value;
  const value = await computeStats(cloneId, mode, now);
  statsCache.set(key, { at: now, value });
  if (statsCache.size > 200) for (const [k, v] of statsCache) if (now - v.at > STATS_TTL_MS) statsCache.delete(k);
  return value;
}

export function publicStats(cloneId: string, now = Date.now()): Promise<PublicStats> {
  return cachedStats(cloneId, "clone", now);
}
export function publicFleetStats(now = Date.now()): Promise<PublicStats> {
  return cachedStats(null, "fleet", now);
}

/** Test seam: drop the 15 second snapshot cache. */
export function _resetStatsCache(): void {
  statsCache.clear();
}
