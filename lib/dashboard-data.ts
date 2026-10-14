import { getOverviewRankings } from "./overview-rankings";
import type { OverviewRankings } from "./overview-rankings-model";
import { supabaseAdmin } from "./supabase";
import { selectAllRows } from "./select-all";
import { chartColorForClone, profileImagePathForClone } from "./colors";
import { cloneUserStats, cloneUserStatsWindow, usageRollup } from "./rollup";
import { REPORT_TZ, reportInstant } from "./report-time";
import { reportDayStartMs, shiftReportDay } from "./revenue-why-changed";
import { resolveRevenueWindow } from "./revenue-window";
import { repeatBuyerCount, rollupRevenueLedger } from "./revenue-ledger";
import { dedupeStarRows } from "./star-dedupe";
import { hasIndividualReceiptSchema, withReceiptColumns } from "./star-receipts";

export type Period = "ALL" | "1Y" | "6M" | "3M" | "1M" | "2W" | "1W" | "1D" | "CUSTOM";
type Gran = "hour" | "day" | "week" | "month";

// Window boundaries live in revenue-window.ts so the dashboard and analytics
// cannot quietly give a named period different dates. This file only decides
// how many visual buckets the already-resolved window receives.
const SPEC: Record<Period, { gran: Gran }> = {
  "1D": { gran: "hour" },
  "1W": { gran: "day" },
  "2W": { gran: "day" },
  "1M": { gran: "day" },
  // Every multi-day window is day-by-day: Ronan's call 2026-08-11. Weekly/monthly
  // buckets hid the individual days he reads the chart for. 1D stays hourly
  // because one bar is not a chart.
  "3M": { gran: "day" },
  "6M": { gran: "day" },
  "1Y": { gran: "day" },
  ALL: { gran: "day" },
  // Unused — CUSTOM always comes with an explicit {startMs, endMs} range, which
  // picks its own granularity (see granForSpan) instead of reading this table.
  CUSTOM: { gran: "day" },
};

export type DateRange = { startMs: number; endMs: number };

const MS_DAY = 86_400_000;

// Custom ranges pick bucket width from the span so a 3-day pick doesn't render
// as monthly bars and a 2-year pick doesn't render one bar per hour.
function granForSpan(ms: number): Gran {
  const days = ms / MS_DAY;
  if (days <= 2) return "hour";
  // Day-by-day at every span, to match the fixed periods above.
  return "day";
}

export type CloneSummary = {
  id: string;
  slug: string;
  name: string;
  color: string;
  photoUrl?: string;
  stars: number; // window revenue in stars
};

// Every field here is scoped to the requested window. `active` was `active24h`
// until 2026-08-21: it was a hardcoded now()-24h cut that ignored the period
// filter, and it was renamed rather than redefined in place so that every
// reader had to be looked at (there were three) instead of silently changing
// meaning under the two that render it with a "24h" label.
export type CloneStats = {
  /** Signed net proceeds, including refunds/adjustments. */
  stars: number;
  /** Positive, non-adjustment payment volume. Use for average paid-order value. */
  grossPaymentStars: number;
  /** Positive, non-adjustment incoming payments only. */
  sales: number;
  /** Fans who ARRIVED in the window, excluding the cutover import (migration
   *  123 — 57,164 rows all stamped first_seen_at = 2026-08-08). Rendered as
   *  "New". A migrated fan is not a new fan. */
  newFans: number;
  /** Fans who MESSAGED in the window. Rendered as "Users", because that is what
   *  "users, over the last week" means to anyone reading it — not signups. */
  activeUsers: number;
  /** Every fan on the clone, all-time, imports included. NOT windowed: the
   *  places that show fleet size ("Fleet fans", "N fan profiles") are asking how
   *  big the audience is, not how many arrived in a period. */
  totalFans: number;
  /** Fans messageable RIGHT NOW: last_message_received inside the last 24h,
   *  deliberately NOT scoped to the selected window.
   *
   *  Telegram only lets a business bot message a fan within 24h of that fan's
   *  last message, so this is the size of the audience the fleet can actually
   *  reach this minute — an operational limit, not a statistic about a period.
   *  Asking "how many can I message, over the last 3 months" is not a question,
   *  which is why this one tile stays fixed while the rest follow the filter. */
  reachable24h: number;
  messages: number;
  buyers: number;
  /** repeat buyers / buyers, both counted inside the window. 0 when no buyers. */
  repeatPct: number;
  costUsd: number;  // AI + voice spend in the window (from usage_events)
  aiCalls: number;
  aiErrors: number;
};

import { loadV2BundleSales, v2BundleLabel, type V2BundleSale } from "./v2-bundle-sales";

export type RecentTransaction = {
  cloneId: string;
  cloneName: string;
  cloneColor: string;
  buyerName: string;
  username: string | null;
  telegramId: number | null;
  stars: number;
  kind: string; // "refund" for adjustments; otherwise feature (credits/photo/video/bundle/media/tip/subscription) or coarse `kind`
  mediaType: "photo" | "video" | "bundle" | null;
  mediaUrl: string | null;
  mediaName: string | null;
  /** Twin V2 bundle card: the real bundle, the immutable offer and the number of files quoted. Absent for every other sale. */
  bundle?: V2BundleSale;
  paidAt: string;
};

export type DashboardData = {
  rankings?: OverviewRankings;
  rankingsError?: string;
  period: Period;
  clones: CloneSummary[];
  bucketLabels: string[];
  // one row per bucket: { bucket: label, [cloneId]: stars }
  series: Record<string, number | string>[];
  recent: RecentTransaction[];
  totals: {
    /** Signed net proceeds, including refunds/adjustments. */
    stars: number;
    /** Positive, non-adjustment payment volume. */
    grossPaymentStars: number;
    /** Positive, non-adjustment incoming payments only. */
    sales: number;
    costUsd: number;
    aiErrors: number;
    // Fleet-wide, scoped to the SAME window as stars/sales above. These were
    // all-time until 2026-08-21, which is the bug this shape now rules out.
    newFans: number;
    activeUsers: number;
    /** Neither of these is window-scoped, on purpose — see CloneStats. */
    totalFans: number;
    reachable24h: number;
    messages: number;
    buyers: number;
    repeatPct: number;
  };
  perClone: Record<string, CloneStats>;
};

// Build the ordered list of buckets for a window + a function mapping a
// timestamp to its bucket key.
function buildBuckets(startMs: number, endMs: number, gran: Gran) {
  const labels: string[] = [];
  const keys: string[] = [];

  const monthLabel = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: REPORT_TZ });
  const dayLabel = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: REPORT_TZ });
  const hourLabel = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", hour12: true, timeZone: REPORT_TZ });

  if (gran === "month") {
    const start = new Date(startMs);
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const end = new Date(endMs);
    while (cur <= end) {
      keys.push(`${cur.getFullYear()}-${cur.getMonth()}`);
      labels.push(monthLabel(cur));
      cur.setMonth(cur.getMonth() + 1);
    }
    const keyFor = (ts: number) => {
      const d = new Date(ts);
      return `${d.getFullYear()}-${d.getMonth()}`;
    };
    return { keys, labels, keyFor };
  }

  // The day-explanation panel and the revenue chart must mean exactly the
  // same thing by a date. A fixed 86,400,000 ms step is not a Sydney calendar
  // day during DST, and using the container's date labels filed evening sales
  // under the wrong visible day. Enumerate report-calendar keys instead.
  if (gran === "day") {
    const startKey = reportInstant(new Date(startMs)).dayKey;
    const endKey = reportInstant(new Date(endMs)).dayKey;
    for (let key = startKey; key <= endKey; key = shiftReportDay(key, 1)) {
      keys.push(key);
      // Noon is stable even in time zones whose DST change happens overnight.
      labels.push(dayLabel(new Date(reportDayStartMs(key) + 12 * 60 * 60 * 1000)));
    }
    return {
      keys,
      labels,
      keyFor: (ts: number) => reportInstant(new Date(ts)).dayKey,
    };
  }

  const step = gran === "hour" ? 3_600_000 : 7 * MS_DAY;
  const count = Math.max(1, Math.ceil((endMs - startMs) / step));
  for (let i = 0; i < count; i++) {
    const d = new Date(startMs + i * step);
    keys.push(String(i));
    labels.push(gran === "hour" ? hourLabel(d) : dayLabel(d));
  }
  const keyFor = (ts: number) =>
    String(Math.min(count - 1, Math.max(0, Math.floor((ts - startMs) / step))));
  return { keys, labels, keyFor };
}

// Finding B: an agency (or view-as agency) hitting /api/dashboard with no
// `clone` param must see only ITS OWN roster, not the whole fleet. Every
// downstream figure here (perClone, the clones summary list, the chart
// series, totals, recent transactions) is derived from either `clones`
// (below) or `purchases` (loadPurchases(), below) by iterating one of those
// two collections — never by scanning the fleet independently — so scoping
// those two queries is sufficient to scope everything built from them. See
// lib/revenue-cache.ts's refresh(), which is the only caller that passes a
// non-null cloneIds (null/undefined = fleet-wide, for the master admin).
export async function getDashboard(period: Period, range?: DateRange, nowMs = Date.now(), cloneIds?: string[] | null): Promise<DashboardData> {
  const spec = SPEC[period];
  const now = nowMs;
  const window = await resolveRevenueWindow(period, range, now);
  const startMs = window.startMs;
  const windowEnd = window.endMs;
  const gran: Gran = range ? granForSpan(range.endMs - range.startMs) : spec.gran;

  const { keys, labels, keyFor } = buildBuckets(startMs, windowEnd, gran);

  // ── purchases in window ────────────────────────────────────────────────────
  // Revenue ledger: every incoming Star (credit packs + paid media). `feature`
  // is an additive column (migration 024) — fall back without it if that
  // migration hasn't landed yet, same defensive pattern as analytics-data.ts.
  type PurchaseRow = {
    id: string;
    clone_id: string;
    amount_stars: number | string | null;
    paid_at: string;
    telegram_id: number | null;
    kind: string | null;
    feature: string | null;
    invoice_payload: string | null;
    receipt_namespace?: string | null;
    media_id?: string | null;
    media_type?: string | null;
  };
  // PAGED, and this is the revenue number itself. Unpaged, this read stopped at
  // the PostgREST cap and every total on the page was a fraction of the truth,
  // with nothing to say so. Measured on alanna-pow 2026-08-09, once her real
  // Telegram history landed: the 3-month window returned 1000 of 3383 rows and
  // reported 304,220 stars against an actual 1,340,088, and all-time reported
  // 572,191 against 2,263,157. The read has no ORDER BY, so WHICH thousand rows
  // came back was arbitrary - which is how a WIDER window could show LESS money
  // than a narrower one, the symptom that gave it away.
  async function loadPurchases(): Promise<PurchaseRow[]> {
    const receiptSchema = await hasIndividualReceiptSchema(supabaseAdmin);
    const COLS = withReceiptColumns("id,clone_id,amount_stars,paid_at,telegram_id,kind,feature,invoice_payload,media_id,media_type", receiptSchema);
    const COLS_LEGACY = withReceiptColumns("id,clone_id,amount_stars,paid_at,telegram_id,kind,invoice_payload", receiptSchema);
    // selectAllRows reports a failed read as an empty result, which here would
    // read as "no revenue" rather than "column not there yet". So the missing
    // column is probed for with one row BEFORE paging, and the paged read then
    // asks only for columns that exist. Same defensive intent as before, just
    // moved ahead of the read that has to succeed.
    const probe = await supabaseAdmin.from("star_transactions").select(COLS).limit(1);
    const hasFeature = !probe.error;
    let query = supabaseAdmin
      .from("star_transactions")
      .select(hasFeature ? COLS : COLS_LEGACY)
      .gte("paid_at", new Date(startMs).toISOString())
      .lte("paid_at", new Date(windowEnd).toISOString());
    // Finding B: restrict to the caller's roster before anything else touches
    // this table. Every money figure on this page (totals, perClone, recent
    // transactions) traces back to this one query.
    if (cloneIds) query = query.in("clone_id", cloneIds);
    const paged = await selectAllRows(
      query
        // ORDER BY id is correctness, not tidiness, and this read is the
        // headline revenue figure itself. selectAllRows walks the table 1,000
        // rows at a time with .range() while star_transactions is being
        // inserted into; without a stable sort, rows shift between pages and
        // the same row is counted twice or missed. Measured on usage_events by
        // check-revenue-rollups.ts: 30,290 rows read, 22,285 distinct, 26%
        // double-counted, a cost total of 37.38 against a true 33.94.
        //
        // The 2026-08-21 audit filed this against BOTH paged star_transactions
        // reads and the fix landed on only one of them (lib/analytics-data.ts,
        // commit 0743c99). This is the other one, and it is the more expensive
        // of the two to have wrong: analytics feeds the report panels, this
        // feeds the headline, every stat tile, the chart and now revenue per
        // conversation.
        .order("id", { ascending: true }),
      { label: "dashboard revenue ledger" },
    );
    const rows: PurchaseRow[] = hasFeature
      ? (paged.rows as PurchaseRow[])
      : (paged.rows as Omit<PurchaseRow, "feature">[]).map((r) => ({ ...r, feature: null }));
    // See lib/star-dedupe.ts: a 2026-09 bot bug double-recorded some real
    // payments. This is the headline revenue number, so collapse duplicates
    // right after paging, before anything sums or counts these rows.
    return dedupeStarRows(rows);
  }

  // ── independent reads, fired together ───────────────────────────────────────
  // clones, the revenue ledger, the usage/cost rollup and the three per-clone
  // user-stats calls share no inputs — each used to `await` in series, so the
  // page paid for every one of their round trips back to back. Measured
  // 2026-09-02: ~15 sequential Supabase calls on this one page load, several of
  // them multi-second. None of these six depend on another's result, only on
  // `startMs`/`windowEnd` computed above, so they run concurrently instead.
  const [cloneRows, purchases, usage, userStats, fleetStats, reachableStats] = await Promise.all([
    (cloneIds
      ? supabaseAdmin.from("clones").select("id,slug,name,created_at,intake").in("id", cloneIds)
      : supabaseAdmin.from("clones").select("id,slug,name,created_at,intake")
    )
      .order("created_at", { ascending: true })
      .then((r) => r.data),
    loadPurchases(),
    // Aggregated in SQL (migration 120). This read used to page every row: 330,849
    // of them in a 30 day window, which is ~200 sequential round trips AND past
    // selectAllRows()'s 200,000 row ceiling, so the cost it reported was a lower
    // bound with nothing on the page to say so. The rollup is 143ms and complete.
    usageRollup(startMs, windowEnd),
    // migration 122. The 120 function this replaced took only a p_active_since and
    // counted fans/messages/buyers over the whole users table, so five tiles sat
    // on lifetime totals while the period filter moved the other six — the bug
    // Ronan reported on 2026-08-21. Both ends are bounded now, and by the same
    // window the chart and the revenue totals above already use.
    //
    // `messages` now counts chat_history rows rather than summing
    // users.total_messages_sent, because only the former has a timestamp to filter
    // on. The ALL view therefore reads lower than it used to (271k vs 641k) — the
    // header of migration 122 explains why both numbers are correct.
    cloneUserStatsWindow(startMs, windowEnd),
    // The two figures that must NOT move with the filter. Asking "how many can I
    // message, over the last 3 months" is not a question, and neither is "how big
    // is my audience, over the last 3 months".
    //
    // totalFans comes from migration 120's all-time rollup: every fan on the
    // clone, imports included, which is what audience size means.
    cloneUserStats(now - MS_DAY),
    // reachable24h comes from the WINDOWED function instead of fleetStats.active,
    // even though both mean "messaged in the last 24h" and both currently agree.
    // Migration 120's version has no guard against the timestamps the cutover
    // import forged (migration 124), and it is clean here only because the newest
    // forged stamp is 2026-08-09 and has aged out of a 24h window. That is
    // correct-by-coincidence, and the coincidence is what let the same defect sit
    // undetected in the Users tile. This one is correct by construction.
    cloneUserStatsWindow(now - MS_DAY, now),
  ]);
  const clones = (cloneRows ?? []) as { id: string; slug: string; name: string; intake: unknown }[];
  const colorById = new Map<string, string>();
  clones.forEach((c, i) => colorById.set(c.id, chartColorForClone(c.intake, i)));

  // Cover photo per clone (first uploaded), batch-signed — so avatars match
  // the nav and the clones grid everywhere. Depends on `clones` above, so it
  // stays a second stage rather than joining the Promise.all.
  const photoById = new Map<string, string>();
  if (clones.length) {
    const { data: photoRows } = await supabaseAdmin
      .from("photos")
      .select("clone_id, storage_path")
      .in("clone_id", clones.map((c) => c.id))
      .order("created_at", { ascending: true });
    const firstPath = new Map<string, string>();
    for (const clone of clones) {
      const customPath = profileImagePathForClone(clone.intake);
      if (customPath) firstPath.set(clone.id, customPath);
    }
    for (const p of photoRows ?? []) {
      if (p.clone_id && !firstPath.has(p.clone_id)) firstPath.set(p.clone_id, p.storage_path);
    }
    const entries = [...firstPath.entries()];
    if (entries.length) {
      const { data: signed } = await supabaseAdmin.storage
        .from("media")
        .createSignedUrls(entries.map((e) => e[1]), 3600);
      (signed ?? []).forEach((s, i) => {
        if (s.signedUrl) photoById.set(entries[i][0], s.signedUrl);
      });
    }
  }

  // The signed ledger is the source of truth for net revenue and the chart.
  // The rollup deliberately keeps its paid-order subset separate: a refund or
  // adjustment lowers net proceeds, but never becomes an order, buyer, or
  // repeat purchase.
  const ledger = rollupRevenueLedger(purchases);
  const ledgerPurchases = ledger.rows;

  // bucketKey -> cloneId -> stars
  const grid = new Map<string, Map<string, number>>();

  for (const p of ledgerPurchases) {
    const bk = keyFor(new Date(p.paid_at).getTime());
    if (!grid.has(bk)) grid.set(bk, new Map());
    const row = grid.get(bk)!;
    row.set(p.clone_id, (row.get(p.clone_id) ?? 0) + p.stars);
  }

  const series = keys.map((k, i) => {
    const row: Record<string, number | string> = { bucket: labels[i] };
    const bk = grid.get(k);
    for (const c of clones) row[c.id] = bk?.get(c.id) ?? 0;
    return row;
  });

  // ── AI/voice cost in window (usage_events) ──────────────────────────────────
  // Fetched above, in parallel with the other independent reads.
  const cloneCost = new Map<string, number>();
  const cloneCalls = new Map<string, number>();
  const cloneErrors = new Map<string, number>();
  let totalCost = 0;
  let totalErrors = 0;
  for (const u of usage) {
    // Always count the cost in the grand total, even if we can't attribute it to a
    // clone (unattributed rows still cost real money — don't let them vanish).
    totalCost += Number(u.cost_usd) || 0;
    // Per-clone stats need a clone to attribute to; skip null-clone rows there only.
    if (!u.clone_id) continue;
    cloneCost.set(u.clone_id, (cloneCost.get(u.clone_id) ?? 0) + (Number(u.cost_usd) || 0));
    cloneCalls.set(u.clone_id, (cloneCalls.get(u.clone_id) ?? 0) + (Number(u.calls) || 0));
    const errors = Number(u.errors) || 0;
    if (errors) {
      cloneErrors.set(u.clone_id, (cloneErrors.get(u.clone_id) ?? 0) + errors);
      totalErrors += errors;
    }
  }

  // ── buyers + repeat rate, per clone, INSIDE THE WINDOW ──────────────────────
  // Derived from the star_transactions rows loaded above, which are ALREADY
  // filtered to [startMs, windowEnd] — so this costs no extra round trip, and
  // this page ends up with exactly one definition of "buyer": someone who paid
  // inside the window. That is deliberately NOT the users-table definition
  // ("has ever paid us anything") that lib/analytics-data.ts uses for its
  // LIFETIME funnel — those are different questions on different tabs, and the
  // reason the tile now reads this instead of analytics.funnel.repeatPct.
  //
  // A row with no telegram_id cannot be attributed to a person. Likewise, an
  // adjustment is part of signed net proceeds but cannot create a buyer. The
  // shared ledger rollup already applies both rules consistently to buyer and
  // repeat-order counts.
  const cloneTxPerFan = ledger.clonePaidOrdersPerFan;

  // ── per-clone user stats, INSIDE THE WINDOW ─────────────────────────────────
  // userStats/fleetStats/reachableStats all fetched above, in parallel.
  const totalFansByClone = new Map<string, number>();
  for (const row of fleetStats) totalFansByClone.set(row.clone_id, Number(row.fans) || 0);

  const reachableByClone = new Map<string, number>();
  for (const row of reachableStats) reachableByClone.set(row.clone_id, Number(row.active) || 0);
  const perClone: Record<string, CloneStats> = {};
  for (const c of clones) {
    const perFan = cloneTxPerFan.get(c.id);
    const buyers = perFan?.size ?? 0;
    const repeatBuyers = perFan ? repeatBuyerCount(perFan) : 0;
    perClone[c.id] = {
      stars: ledger.cloneNetStars.get(c.id) ?? 0,
      grossPaymentStars: ledger.cloneGrossPaymentStars.get(c.id) ?? 0,
      sales: ledger.cloneSales.get(c.id) ?? 0,
      newFans: 0,
      activeUsers: 0,
      totalFans: totalFansByClone.get(c.id) ?? 0,
      reachable24h: reachableByClone.get(c.id) ?? 0,
      messages: 0,
      buyers,
      repeatPct: buyers > 0 ? repeatBuyers / buyers : 0,
      costUsd: cloneCost.get(c.id) ?? 0,
      aiCalls: cloneCalls.get(c.id) ?? 0,
      aiErrors: cloneErrors.get(c.id) ?? 0,
    };
  }
  for (const row of userStats) {
    const s = perClone[row.clone_id];
    if (!s) continue;
    s.newFans = Number(row.fans) || 0;
    s.messages = Number(row.messages) || 0;
    s.activeUsers = Number(row.active) || 0;
  }

  // ── recent transactions — most recent first. Capped generously (not to 30)
  // so scoping to one clone client-side still has enough rows to show; the
  // frontend takes the top 30 AFTER filtering by clone. ─────────────────────
  type MediaType = "photo" | "video" | "bundle";
  const isMediaType = (value: unknown): value is MediaType =>
    value === "photo" || value === "video" || value === "bundle";
  const latestPurchases = [...ledgerPurchases]
    .sort((a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime())
    .slice(0, 300);

  // The Telegram ledger has the sale and the rich chat-history row has the
  // catalogue id. Match a sale to the latest unused same-price locked offer
  // made to that fan before payment, then resolve that exact item below.
  const mediaRefByTransaction = new Map<string, { type: MediaType; id: string }>();
  // An adjustment can carry a historic media feature, but it must never match
  // an offer or render as a new media sale in the recent ledger.
  const mediaPurchases = latestPurchases.filter(
    (p) => p.paidOrder && (p.kind === "media" || isMediaType(p.feature)),
  );
  const mediaCloneIds = [...new Set(mediaPurchases.map((p) => p.clone_id))];
  const mediaTelegramIds = [
    ...new Set(mediaPurchases.map((p) => p.telegram_id).filter((id): id is number => id != null)),
  ];
  if (mediaCloneIds.length && mediaTelegramIds.length) {
    const { data: offerRows } = await supabaseAdmin
      .from("chat_history")
      .select("id,clone_id,telegram_id,created_at,meta")
      .in("clone_id", mediaCloneIds)
      .in("telegram_id", mediaTelegramIds)
      .contains("meta", { paid: true })
      .order("created_at", { ascending: false })
      .limit(5000);
    const offers: {
      rowId: number;
      cloneId: string;
      telegramId: number;
      createdAt: number;
      stars: number;
      type: MediaType;
      mediaId: string;
    }[] = [];
    for (const row of (offerRows ?? []) as {
      id: number;
      clone_id: string;
      telegram_id: number;
      created_at: string;
      meta: { type?: unknown; media_id?: unknown; stars?: unknown } | null;
    }[]) {
      if (!isMediaType(row.meta?.type) || typeof row.meta?.media_id !== "string") continue;
      offers.push({
        rowId: row.id,
        cloneId: row.clone_id,
        telegramId: Number(row.telegram_id),
        createdAt: new Date(row.created_at).getTime(),
        stars: Number(row.meta.stars),
        type: row.meta.type,
        mediaId: row.meta.media_id,
      });
    }
    const usedOffers = new Set<number>();
    for (const purchase of mediaPurchases) {
      if (purchase.telegram_id == null) continue;
      const paidAt = new Date(purchase.paid_at).getTime();
      const recordedType = isMediaType(purchase.feature) ? purchase.feature : null;
      const offer = offers.find(
        (candidate) =>
          !usedOffers.has(candidate.rowId) &&
          candidate.cloneId === purchase.clone_id &&
          candidate.telegramId === Number(purchase.telegram_id) &&
          candidate.createdAt <= paidAt &&
          candidate.stars === purchase.stars &&
          (!recordedType || candidate.type === recordedType),
      );
      if (offer) {
        usedOffers.add(offer.rowId);
        mediaRefByTransaction.set(purchase.id, { type: offer.type, id: offer.mediaId });
      }
    }
  }

  // Twin V2 bundle cards name their bundle and offer on the charge itself, so they need no guess from chat history (V2 keeps no V1 chat rows).
  const v2BundleSales = await loadV2BundleSales(supabaseAdmin, mediaPurchases.map((p) => p.id));
  for (const [chargeId, sale] of v2BundleSales) if (sale.bundleId) mediaRefByTransaction.set(chargeId, { type: "bundle", id: sale.bundleId });

  const mediaAssetByKey = new Map<string, { path: string | null; name: string | null }>();
  const refs = [...mediaRefByTransaction.values()];
  const photoIds = [...new Set(refs.filter((r) => r.type === "photo").map((r) => r.id))];
  const videoIds = [...new Set(refs.filter((r) => r.type === "video").map((r) => r.id))];
  const bundleIds = [...new Set(refs.filter((r) => r.type === "bundle").map((r) => r.id))];
  if (photoIds.length) {
    const { data } = await supabaseAdmin
      .from("photos")
      .select("id,storage_path,image_name,caption")
      .in("id", photoIds);
    for (const p of (data ?? []) as { id: string; storage_path: string; image_name: string | null; caption: string | null }[]) {
      mediaAssetByKey.set(`photo:${p.id}`, { path: p.storage_path, name: p.image_name || p.caption || "Photo" });
    }
  }
  if (videoIds.length) {
    const { data } = await supabaseAdmin.from("videos").select("id,storage_path,caption").in("id", videoIds);
    for (const v of (data ?? []) as { id: string; storage_path: string; caption: string | null }[]) {
      mediaAssetByKey.set(`video:${v.id}`, { path: v.storage_path, name: v.caption || "Video" });
    }
  }
  if (bundleIds.length) {
    const { data } = await supabaseAdmin
      .from("photo_bundles")
      .select("id,name,photo_bundle_items(storage_path,sort_order)")
      .in("id", bundleIds);
    for (const b of (data ?? []) as {
      id: string;
      name: string | null;
      photo_bundle_items: { storage_path: string; sort_order: number }[];
    }[]) {
      const cover = [...(b.photo_bundle_items ?? [])].sort((a, z) => a.sort_order - z.sort_order)[0];
      mediaAssetByKey.set(`bundle:${b.id}`, { path: cover?.storage_path ?? null, name: b.name || "Bundle" });
    }
  }
  const mediaPaths = [
    ...new Set([...mediaAssetByKey.values()].map((asset) => asset.path).filter((path): path is string => !!path)),
  ];
  const { data: signedMedia } = mediaPaths.length
    ? await supabaseAdmin.storage.from("media").createSignedUrls(mediaPaths, 3600)
    : { data: [] as { signedUrl: string | null }[] };
  const signedUrlByPath = new Map(mediaPaths.map((path, i) => [path, signedMedia?.[i]?.signedUrl ?? null]));

  // ── buyer names for the recent list ─────────────────────────────────────────
  // Only the ≤300 fans who appear in `recent` need a name, so this asks for
  // exactly them. It used to fall out of the full users read that the rollup
  // above replaced — 63k rows fetched to label 300 lines. Still paged: the
  // telegram_id IN () list crosses every clone, so the result can exceed the
  // 1,000 row cap even though the input is small.
  //
  // Fan's self-stated name is the source of truth over the Telegram display
  // name (see memory: allieai2-fan-name-truth).
  const nameByKey = new Map<string, string>();
  const usernameByKey = new Map<string, string | null>();
  {
    const buyerTelegramIds = [
      ...new Set(latestPurchases.map((p) => p.telegram_id).filter((id): id is number => id != null)),
    ];
    const buyerCloneIds = [...new Set(latestPurchases.map((p) => p.clone_id).filter(Boolean))];
    if (buyerTelegramIds.length && buyerCloneIds.length) {
      const { rows: buyerRows } = await selectAllRows<{
        clone_id: string;
        telegram_id: number;
        name: string | null;
        stated_name: string | null;
        username: string | null;
      }>(
        supabaseAdmin
          .from("users")
          .select("clone_id,telegram_id,name,stated_name,username")
          .in("clone_id", buyerCloneIds)
          .in("telegram_id", buyerTelegramIds)
          // ORDERED, because 300 buyers across 11 clones can cross the 1,000
          // row page boundary and `users` is written on every inbound message.
          // Unordered .range() paging over a moving table skips rows, and a
          // skipped row here renders "Fan 12345" instead of his name. That is
          // the same defect this commit fixed on usage_events.
          .order("id", { ascending: true }),
        { label: "dashboard recent buyer names" },
      );
      for (const u of buyerRows) {
        const key = `${u.clone_id}:${u.telegram_id}`;
        nameByKey.set(key, u.stated_name || u.name || `Fan ${u.telegram_id}`);
        usernameByKey.set(key, u.username);
      }
    }
  }

  const cloneNameById = new Map(clones.map((c) => [c.id, c.name]));
  const recent: RecentTransaction[] = latestPurchases.map((p) => {
    const mediaRef = p.adjustment ? undefined : mediaRefByTransaction.get(p.id);
    const mediaType = p.adjustment ? null : mediaRef?.type ?? (isMediaType(p.feature) ? p.feature : null);
    const asset = mediaRef ? mediaAssetByKey.get(`${mediaRef.type}:${mediaRef.id}`) : null;
    const v2Bundle = p.adjustment ? undefined : v2BundleSales.get(p.id);
    return {
      cloneId: p.clone_id,
      cloneName: cloneNameById.get(p.clone_id) ?? "-",
      cloneColor: colorById.get(p.clone_id) ?? "#888",
      buyerName: p.telegram_id != null ? nameByKey.get(`${p.clone_id}:${p.telegram_id}`) ?? `Fan ${p.telegram_id}` : "Unknown",
      username: p.telegram_id != null ? usernameByKey.get(`${p.clone_id}:${p.telegram_id}`) ?? null : null,
      telegramId: p.telegram_id,
      stars: p.stars,
      kind: p.adjustment ? "refund" : mediaType || p.feature || p.kind || "other",
      mediaType,
      mediaUrl: asset?.path ? signedUrlByPath.get(asset.path) ?? null : null,
      mediaName: v2Bundle ? v2BundleLabel(v2Bundle) : asset?.name ?? null,
      ...(v2Bundle ? { bundle: v2Bundle } : {}),
      paidAt: p.paid_at,
    };
  });

  const summaries: CloneSummary[] = clones
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      color: colorById.get(c.id)!,
      photoUrl: photoById.get(c.id),
      stars: ledger.cloneNetStars.get(c.id) ?? 0,
    }))
    .sort((a, b) => b.stars - a.stars);

  // Fleet-wide rollup of the same WINDOWED fields perClone tracks, so the
  // Revenue page's headline tiles have an "All clones" total to show.
  //
  // users / active / messages are additive across clones. BUYERS IS NOT: one
  // fan can pay two clones and a sum counts them twice, which is why the
  // ledger rollup builds one paid-order map across the fleet rather than adding
  // per-clone counts. Same reason the fleet repeat rate cannot be averaged out
  // of per-clone rates — the denominators overlap.
  let totalNewFans = 0;
  let totalActiveUsers = 0;
  let totalFans = 0;
  let totalReachable = 0;
  let totalMessages = 0;
  for (const c of clones) {
    const s = perClone[c.id];
    totalNewFans += s.newFans;
    totalActiveUsers += s.activeUsers;
    totalFans += s.totalFans;
    totalReachable += s.reachable24h;
    totalMessages += s.messages;
  }
  const fleetTxPerFan = ledger.fleetPaidOrdersPerFan;
  const totalBuyers = fleetTxPerFan.size;
  const fleetRepeatBuyers = repeatBuyerCount(fleetTxPerFan);

  let rankings: OverviewRankings | undefined;
  let rankingsError: string | undefined;
  try { rankings = await getOverviewRankings(purchases, clones); } catch { rankingsError = "Rankings could not be refreshed. Please try again."; }
  return {
    rankings, rankingsError,
    period,
    clones: summaries,
    bucketLabels: labels,
    series,
    recent,
    totals: {
      stars: ledger.netStars,
      grossPaymentStars: ledger.grossPaymentStars,
      sales: ledger.sales,
      costUsd: totalCost,
      aiErrors: totalErrors,
      newFans: totalNewFans,
      activeUsers: totalActiveUsers,
      totalFans,
      reachable24h: totalReachable,
      messages: totalMessages,
      buyers: totalBuyers,
      repeatPct: totalBuyers > 0 ? fleetRepeatBuyers / totalBuyers : 0,
    },
    perClone,
  };
}
