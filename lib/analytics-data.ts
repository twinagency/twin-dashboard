import { supabaseAdmin } from "./supabase";
import { selectAllRows } from "./select-all";
import { chartColorForClone } from "./colors";
import {
  conversationFunnel,
  fanSpendStats,
  fanTiers,
  messagedFanCount,
  paywallStats,
  usageRollup,
  type ConversationFunnel,
} from "./rollup";
import { STAR_USD } from "./money";
import { REPORT_TZ, reportInstant } from "./report-time";
import type { DateRange, Period } from "./dashboard-data";
import { resolveRevenueWindow } from "./revenue-window";

// Deep money analytics — WHERE the money comes from. This is the aggregation layer
// for /analytics. It mirrors the query style in dashboard-data.ts (fetch scoped
// columns, filter the window in SQL via .gte, roll up in JS) so the two stay
// consistent. Volumes here are small (hundreds of ledger rows) so JS roll-up is
// plenty fast; if it ever grows, these become SQL views / RPCs.

const MS_DAY = 86_400_000;

export type KindKey = "credits" | "media" | "tip" | "other";

const KIND_LABEL: Record<KindKey, string> = {
  credits: "Message credits",
  media: "Photos & video",
  tip: "Tips / spoil",
  other: "Other",
};

// Finer per-feature breakdown. Reads star_transactions.feature (additive column,
// migration 024) and falls back to the coarse `kind` for older rows written before
// the column existed — so the cut degrades gracefully instead of dropping revenue.
export type FeatureKey = "credits" | "photo" | "video" | "bundle" | "media" | "tip" | "subscription" | "other";

const FEATURE_LABEL: Record<FeatureKey, string> = {
  credits: "Paid Messages",
  photo: "Photos",
  video: "Videos",
  bundle: "Bundles",
  media: "Media (untagged)",
  tip: "Tips / spoil",
  subscription: "VIP subscriptions",
  other: "Other",
};
const FEATURE_KEYS = Object.keys(FEATURE_LABEL) as FeatureKey[];

// Map a legacy row (feature NULL) onto a feature bucket from its coarse `kind`.
const kindToFeature = (k: string | null): FeatureKey =>
  k === "credits" || k === "tip" || k === "media"
    ? (k as FeatureKey)
    : k === "subscription"
      ? "subscription"
      : "other";
const normFeature = (feature: string | null, kind: string | null): FeatureKey =>
  feature && (FEATURE_KEYS as string[]).includes(feature) ? (feature as FeatureKey) : kindToFeature(kind);

// Lifetime spend tiers — must match src/data/*-store.ts recordSpend().
export const TIERS: { key: string; label: string }[] = [
  { key: "whale", label: "Whale · 1,000+ ⭐" },
  { key: "high", label: "High · 300+ ⭐" },
  { key: "mid", label: "Mid · 50+ ⭐" },
  { key: "low", label: "Low · under 50 ⭐" },
  { key: "none", label: "No spend yet" },
];

export type AnalyticsData = {
  period: Period;
  // Whether revenue_usage_rollup was actually run. When false, every costUsd,
  // profitUsd and margin in this object is 0 because it was never measured.
  // See AnalyticsOptions on getAnalytics().
  costIncluded: boolean;
  totals: {
    revenueStars: number;
    costUsd: number;
    profitUsd: number;
    sales: number;
    fans: number;
    buyers: number;
  };
  // Ranked best → worst by revenue.
  clones: {
    id: string;
    name: string;
    color: string;
    revenueStars: number;
    costUsd: number;
    profitUsd: number;
    sales: number;
    margin: number; // profit / revenue, 0..1 (0 if no revenue)
  }[];
  byKind: { key: KindKey; label: string; stars: number; sales: number; share: number }[];
  // Finer per-feature revenue + conversion (avg stars per sale). Empty until the
  // additive `feature` column starts accruing (falls back to `kind` for legacy rows).
  byFeature: { key: FeatureKey; label: string; stars: number; sales: number; avgStars: number; share: number }[];
  // msgs → paywall → purchase drop-off, by DISTINCT fans in the window. `collecting`
  // is true until paywall_hits starts logging (migration 024) — show a hint, not a crash.
  paywallFunnel: {
    collecting: boolean;
    messaged: number; // distinct fans who sent a message in the window
    paywalled: number; // distinct fans shown the paywall
    purchased: number; // paywalled fans who bought message credits in the window
    paidMessageBuyers: number;
    paidMessagePurchases: number;
    paidMessageStars: number;
    paywallViews: number;
    abandoned: number;
    paywallPct: number; // paywalled / messaged
    purchasePct: number; // purchased / paywalled
    overallPct: number; // purchased / messaged
    avgViewsPerFan: number;
  };
  // The counting half of Jesse's seven conversation numbers (migration 125).
  // Lives here rather than on the dashboard payload because this half of the
  // page is already clone-scoped, which is what these rates have to respect.
  //
  // Only FIVE of the seven are in here. Revenue per conversation and repeat
  // purchase rate are rendered from figures the dashboard payload already
  // carries (window revenue, and totals.repeatPct) — see the panel in
  // components/RevenueDashboard.tsx. A second definition of either would put
  // two answers to one question on the same screen, which is the defect the
  // 2026-08-21 audit found three times.
  //
  // NOT projected by lib/api-public.ts, which is an allowlist: a field added
  // here is withheld from a model's own dashboard by default, and that is the
  // correct posture for anything measuring how well the funnel converts.
  conversationFunnel: ConversationFunnel;
  // Classic (sorter) vs Smart (agent) flow, split by each clone's ai_mode.
  byFlow: {
    key: "classic" | "smart";
    label: string;
    clones: number;
    stars: number;
    costUsd: number;
    profitUsd: number;
    sales: number;
    share: number; // of revenue in window
  }[];
  byDay: { label: string; stars: number }[];
  byHour: { hour: number; label: string; stars: number }[];
  // Revenue by day-of-week (server-local), Monday-first. Computed in the tx loop
  // (not from byDay, which caps at 180 rendered points on long windows).
  byDow: { dow: number; label: string; stars: number }[];
  byTier: { key: string; label: string; users: number; stars: number; share: number }[];
  topWeeklySpenders: {
    cloneId: string | null;
    cloneName: string;
    telegramId: number;
    name: string;
    username: string | null;
    stars: number;
    purchases: number;
  }[];
  weeklySpenderSummary: {
    buyers: number;
    stars: number;
    purchases: number;
    avgStars: number;
  };
  funnel: {
    fans: number;
    buyers: number;
    repeat: number;
    oneTime: number;
    threePlus: number;
    nonBuyers: number;
    totalPurchases: number;
    buyerPct: number; // buyers / fans
    repeatPct: number; // repeat / buyers
    oneTimePct: number;
    avgPurchasesPerBuyer: number;
    avgStarsPerBuyer: number;
    medianStarsPerBuyer: number;
    repeatRevenueShare: number;
  };
};

const iso = (ms: number) => new Date(ms).toISOString();
const hourLabel = (h: number) =>
  new Date(2000, 0, 1, h).toLocaleTimeString("en-US", { hour: "numeric", hour12: true });

// ── why getAnalytics takes an options bag at all ─────────────────────────────
// `includeCost: false` skips revenue_usage_rollup entirely. That rollup is the
// single most expensive read on this page — it aggregates usage_events, which
// is the biggest table here — and on 2026-08-24 it was the reason
// /api/v1/revenue returned 500 to every caller with a statement timeout
// (code 57014) on every period.
//
// The infuriating part, and the reason this option exists rather than a bigger
// index being the whole answer: THE PUBLIC API THROWS THE RESULT AWAY. Our AI
// cost and margin are withheld from every external caller by projectRevenue()
// in lib/api-public.ts, on purpose and by design. So the public path was paying
// the most expensive query on the page to compute a number it is contractually
// forbidden from returning, and then timing out on it.
//
// THE ONLY CALLER ALLOWED TO PASS false IS THE PUBLIC API. The operator's own
// Revenue page shows cost, profit and margin, so it must pass true (the
// default) or those tiles quietly render as zero — which is exactly this
// project's signature defect and is why `costIncluded` is on the return value
// rather than the caller being trusted to remember what it asked for.
export type AnalyticsOptions = { includeCost?: boolean };

export async function getAnalytics(
  period: Period,
  cloneId?: string | null,
  range?: DateRange,
  opts?: AnalyticsOptions,
  nowMs = Date.now(),
): Promise<AnalyticsData> {
  const includeCost = opts?.includeCost !== false;
  const window = await resolveRevenueWindow(period, range, nowMs);
  const windowEnd = window.endMs;

  // ── clones (color order matches the nav: created_at asc → colorForIndex) ──────
  // Colors are assigned across the FULL fleet order so they stay stable whether
  // scoped to "All" or narrowed to one clone (same clone always gets same color).
  const { data: cloneRows } = await supabaseAdmin
    .from("clones")
    .select("id,name,created_at,ai_mode,intake")
    .order("created_at", { ascending: true });
  const allClones = (cloneRows ?? []) as { id: string; name: string; ai_mode: string | null; intake: unknown }[];
  const clones = cloneId ? allClones.filter((c) => c.id === cloneId) : allClones;
  const nameById = new Map<string, string>();
  const colorById = new Map<string, string>();
  // Normalise ai_mode → the two flows the runtime supports ("smart" agent vs the
  // classic sorter). Anything unset/other is treated as classic.
  const flowById = new Map<string, "classic" | "smart">();
  allClones.forEach((c, i) => {
    nameById.set(c.id, c.name);
    colorById.set(c.id, chartColorForClone(c.intake, i));
    flowById.set(c.id, c.ai_mode === "smart" ? "smart" : "classic");
  });

  // ── shared window ─────────────────────────────────────────────────────────────
  const startMs = window.startMs;

  // ── revenue ledger in window (star_transactions) ─────────────────────────────
  // Try to read the additive `feature` column; if migration 024 hasn't been applied
  // yet the column is missing and PostgREST errors the whole select — so fall back to
  // the pre-feature columns (byFeature then derives buckets from `kind`). This keeps
  // every existing chart working before the migration lands.
  type TxRow = {
    id: string;
    clone_id: string | null;
    amount_stars: number;
    paid_at: string;
    kind: string | null;
    feature: string | null;
    telegram_id: number | null;
  };
  let txs: TxRow[];
  {
    // PAGED, and this is the revenue number on every analytics chart. Unpaged it
    // stopped at the PostgREST cap with no error: alanna-pow's 3-month window
    // read 1000 of 3383 rows and reported 304,220 stars against an actual
    // 1,340,088 (measured 2026-08-09). There is no ORDER BY, so which thousand
    // came back was arbitrary, and a wider window could report LESS than a
    // narrower one.
    //
    // The missing-column fallback is probed with one row BEFORE the paged read,
    // because selectAllRows reports a failure as an empty result — which here
    // would render as "no revenue" instead of "column not there yet".
    // `id` is required: the legacy-media inference below keys its map on it.
    const COLS = "id,clone_id,amount_stars,paid_at,kind,feature,telegram_id,invoice_payload";
    const COLS_LEGACY = "id,clone_id,amount_stars,paid_at,kind,telegram_id,invoice_payload";
    const probe = await supabaseAdmin.from("star_transactions").select(COLS).limit(1);
    const hasFeature = !probe.error;
    let q = supabaseAdmin
      .from("star_transactions")
      .select(hasFeature ? COLS : COLS_LEGACY)
      .gte("paid_at", iso(startMs))
      .lte("paid_at", iso(windowEnd));
    if (cloneId) q = q.eq("clone_id", cloneId);
    // ORDER BY id is not tidiness, it is correctness. selectAllRows walks this
    // table 1,000 rows at a time with .range(), and star_transactions is being
    // inserted into while the walk runs — without a stable sort, rows shift
    // between pages and the same row is read twice or skipped. Measured on
    // usage_events by check-revenue-rollups.ts: 30,290 rows read of which only
    // 22,285 were distinct, 26% double-counted, and the cost total came out at
    // 37.38 against a true 33.94. That check orders by id; this read did not,
    // so the suite could not see the defect in the code the page actually runs.
    const { rows } = await selectAllRows(q.order("id", { ascending: true }), {
      label: "analytics revenue ledger",
    });
    txs = hasFeature
      ? (rows as TxRow[])
      : (rows as Omit<TxRow, "feature">[]).map((r) => ({ ...r, feature: null }));
  }

  // Older Telegram-imported sales predate star_transactions.feature. Recover
  // photo/video/bundle from the original locked chat offer so the revenue
  // report can show real media categories instead of one generic Media bucket.
  type MediaFeature = "photo" | "video" | "bundle";
  const isMediaFeature = (value: unknown): value is MediaFeature =>
    value === "photo" || value === "video" || value === "bundle";
  const inferredMediaByTransaction = new Map<string, MediaFeature>();
  const legacyMediaTransactions = txs.filter(
    (transaction) => transaction.kind === "media" && !isMediaFeature(transaction.feature),
  );
  const legacyCloneIds = [
    ...new Set(legacyMediaTransactions.map((transaction) => transaction.clone_id).filter((id): id is string => !!id)),
  ];
  const legacyTelegramIds = [
    ...new Set(
      legacyMediaTransactions
        .map((transaction) => transaction.telegram_id)
        .filter((id): id is number => id != null),
    ),
  ];
  if (legacyCloneIds.length && legacyTelegramIds.length) {
    const { data: offerRows } = await supabaseAdmin
      .from("chat_history")
      .select("id,clone_id,telegram_id,created_at,meta")
      .in("clone_id", legacyCloneIds)
      .in("telegram_id", legacyTelegramIds)
      .contains("meta", { paid: true })
      .order("created_at", { ascending: false })
      .limit(10000);
    const offers: {
      rowId: number;
      cloneId: string;
      telegramId: number;
      createdAt: number;
      stars: number;
      type: MediaFeature;
    }[] = [];
    for (const row of (offerRows ?? []) as {
      id: number;
      clone_id: string;
      telegram_id: number;
      created_at: string;
      meta: { type?: unknown; stars?: unknown } | null;
    }[]) {
      if (!isMediaFeature(row.meta?.type)) continue;
      offers.push({
        rowId: row.id,
        cloneId: row.clone_id,
        telegramId: Number(row.telegram_id),
        createdAt: new Date(row.created_at).getTime(),
        stars: Number(row.meta?.stars),
        type: row.meta.type,
      });
    }
    const usedOffers = new Set<number>();
    for (const transaction of legacyMediaTransactions) {
      if (!transaction.clone_id || transaction.telegram_id == null) continue;
      const paidAt = new Date(transaction.paid_at).getTime();
      const offer = offers.find(
        (candidate) =>
          !usedOffers.has(candidate.rowId) &&
          candidate.cloneId === transaction.clone_id &&
          candidate.telegramId === Number(transaction.telegram_id) &&
          candidate.createdAt <= paidAt &&
          candidate.stars === Number(transaction.amount_stars),
      );
      if (!offer) continue;
      usedOffers.add(offer.rowId);
      inferredMediaByTransaction.set(transaction.id, offer.type);
    }
  }

  // Per-clone revenue + sales.
  const cloneStars = new Map<string, number>();
  const cloneSales = new Map<string, number>();
  // By feature/kind.
  const kindStars = new Map<KindKey, number>();
  const kindSales = new Map<KindKey, number>();
  // Finer per-feature revenue + sales (uses the additive `feature` col, falls back to kind).
  const featureStars = new Map<FeatureKey, number>();
  const featureSales = new Map<FeatureKey, number>();
  // Distinct fans who bought CREDITS in the window (paywall-funnel conversion stage).
  const creditBuyers = new Set<number>();
  // By calendar day.
  const dayStars = new Map<string, number>();
  // By hour-of-day (local).
  const hourStars = new Array<number>(24).fill(0);
  // By day-of-week (local, 0 = Sunday per Date#getDay).
  const dowStars = new Array<number>(7).fill(0);

  let totalStars = 0;
  let totalSales = 0;
  let paidMessagePurchases = 0;
  let paidMessageStars = 0;

  const normKind = (k: string | null): KindKey =>
    k === "credits" || k === "media" || k === "tip" ? k : "other";

  for (const t of txs) {
    const stars = Number(t.amount_stars) || 0;
    totalStars += stars;
    totalSales += 1;

    if (t.clone_id) {
      cloneStars.set(t.clone_id, (cloneStars.get(t.clone_id) ?? 0) + stars);
      cloneSales.set(t.clone_id, (cloneSales.get(t.clone_id) ?? 0) + 1);
    }

    const k = normKind(t.kind);
    kindStars.set(k, (kindStars.get(k) ?? 0) + stars);
    kindSales.set(k, (kindSales.get(k) ?? 0) + 1);

    const f = inferredMediaByTransaction.get(t.id) ?? normFeature(t.feature, t.kind);
    featureStars.set(f, (featureStars.get(f) ?? 0) + stars);
    featureSales.set(f, (featureSales.get(f) ?? 0) + 1);

    // Paid-message purchase = the paywall conversion product. Track both
    // distinct buyers and transaction/revenue volume for the clearer funnel.
    if (f === "credits") {
      paidMessagePurchases += 1;
      paidMessageStars += stars;
      if (t.telegram_id != null) creditBuyers.add(t.telegram_id);
    }

    // REPORT_TZ, not the container's clock. `new Date().getHours()` here read
    // UTC and was labelled "(local)" — ten hours out on AEST, which moved peak
    // hour from lunchtime to 3 AM and filed every evening sale on the wrong
    // weekday. See lib/report-time.ts.
    const at = reportInstant(t.paid_at);
    dayStars.set(at.dayKey, (dayStars.get(at.dayKey) ?? 0) + stars);
    hourStars[at.hour] += stars;
    dowStars[at.dow] += stars;
  }

  // ── AI/voice cost in window (usage_events) ───────────────────────────────────
  // SQL rollup (migration 120). This was the second full page-through of
  // usage_events on every Revenue load — the chart half did the identical 330k
  // row walk — and like that one it stopped at the 200,000 row ceiling, so the
  // cost and every margin derived from it were understated.
  //
  // Skipped entirely when includeCost is false — see AnalyticsOptions above.
  // The public API is forbidden from returning any of this, so on that path the
  // query is not made slow, it is not made at all.
  const usage = includeCost ? await usageRollup(startMs, windowEnd, cloneId ?? null) : [];
  const cloneCost = new Map<string, number>();
  let totalCost = 0;
  for (const u of usage) {
    const c = Number(u.cost_usd) || 0;
    totalCost += c; // count every cost, even unattributed
    if (u.clone_id) cloneCost.set(u.clone_id, (cloneCost.get(u.clone_id) ?? 0) + c);
  }

  // ── paywall funnel: distinct fans messaged → paywalled → purchased (window) ──
  // messaged: distinct fans who sent a message (chat_history role='human').
  // COUNT(DISTINCT) in SQL (migration 120). This single integer used to cost a
  // page-through of 196,994 chat rows — the biggest single read on the page,
  // and every one of those rows was thrown away after being counted once.
  const messagedFanTotal = await messagedFanCount(startMs, windowEnd, cloneId ?? null);
  // paywalled: distinct fans shown the paywall (paywall_hits — additive table, mig 024).
  // If the table doesn't exist yet the rollup errors → treat as "still collecting",
  // the same meaning the old probe-then-page had, so an unapplied migration 024
  // still reads as "collecting" rather than "nobody was ever paywalled".
  //
  // The conversion stage is computed in SQL too: creditBuyers (built from the
  // ledger rows above, a few hundred ids at most) goes down as an array and the
  // intersection comes back as a number.
  //
  // The one-row probe stays. It answers "does this table exist yet", which is a
  // different question from "did the rollup work", and only the first of those
  // is allowed to degrade quietly — a failing rollup must surface, not read as
  // an empty funnel.
  //
  // ...and "does the table exist" is a NARROWER question than "did the probe
  // return an error". This was `Boolean(paywallProbe.error)`, so a timeout, a
  // dropped connection or an expired key all resolved to "still collecting" and
  // the whole funnel rendered 0 views / 0 paywalled / 0% conversion with a
  // reassuring hint under it. Those zeroes look exactly like a measurement, and
  // the operator's reading of "0% conversion" is "the paywall is broken", not
  // "the dashboard could not reach the database".
  //
  // So only the two codes that actually mean "no such table" degrade quietly.
  // PGRST205 is PostgREST's own missing-table-in-schema-cache; 42P01 is
  // Postgres's undefined_table, which surfaces when the RPC path hits it first.
  // Everything else throws and the page shows an error, per the NO SILENT
  // FALLBACK rule at the top of lib/rollup.ts.
  const paywallProbe = await supabaseAdmin.from("paywall_hits").select("telegram_id").limit(1);
  const probeErr = paywallProbe.error;
  const paywallCollecting = Boolean(probeErr && (probeErr.code === "PGRST205" || probeErr.code === "42P01"));
  if (probeErr && !paywallCollecting) {
    throw new Error(
      `paywall_hits probe failed: ${probeErr.message} (code ${probeErr.code ?? "none"}). ` +
        `The table exists, so this is not the pre-migration-024 case; refusing to render an empty funnel as a measurement.`,
    );
  }
  let paywallViews = 0;
  let paywalledFanTotal = 0;
  let convertedPaywallBuyers = 0;
  if (!paywallCollecting) {
    const stats = await paywallStats(startMs, windowEnd, cloneId ?? null, [...creditBuyers]);
    paywallViews = stats.views;
    paywalledFanTotal = stats.fans;
    convertedPaywallBuyers = stats.converted;
  }

  // ── lifetime fan spend → tiers + funnel (users table) ────────────────────────
  // Two SQL rollups (migration 120) in place of a full read of users, which was
  // 63,557 rows and ~64 round trips for a handful of counters and a median. The
  // definitions are identical, quirks included: a buyer is anyone with a
  // purchase or any spend, total_purchases counts at least one per buyer even
  // when purchase_count is 0, lifetime_stars spans every fan and not just
  // buyers, and an unknown or missing tier lands in "none".
  // The conversation funnel joins this Promise.all rather than getting its own
  // await: it is a ~800ms scan of chat_history in the window (measured 834ms on
  // 30 days fleet-wide, 2026-08-21) and the page is already several seconds, so
  // it runs beside the two lifetime rollups instead of after them.
  const [spendStats, tierRows, funnel] = await Promise.all([
    fanSpendStats(cloneId ?? null),
    fanTiers(cloneId ?? null),
    conversationFunnel(startMs, windowEnd, cloneId ?? null),
  ]);
  const fans = Number(spendStats.fans) || 0;
  const buyers = Number(spendStats.buyers) || 0;
  const repeat = Number(spendStats.repeat_buyers) || 0;
  const oneTime = Number(spendStats.one_time) || 0;
  const threePlus = Number(spendStats.three_plus) || 0;
  const totalPurchases = Number(spendStats.total_purchases) || 0;
  const repeatBuyerStars = Number(spendStats.repeat_buyer_stars) || 0;
  const lifetimeStars = Number(spendStats.lifetime_stars) || 0;
  const medianStarsPerBuyer = Number(spendStats.median_buyer_stars) || 0;

  const tierUsers = new Map<string, number>();
  const tierStars = new Map<string, number>();
  for (const row of tierRows) {
    const tier = TIERS.some((t) => t.key === row.tier) ? row.tier : "none";
    tierUsers.set(tier, (tierUsers.get(tier) ?? 0) + (Number(row.fans) || 0));
    tierStars.set(tier, (tierStars.get(tier) ?? 0) + (Number(row.stars) || 0));
  }

  // Rolling seven-day spender leaderboard, independent of the selected chart
  // preset so "weekly" always means the latest seven complete days in scope.
  let weeklyQ = supabaseAdmin
    .from("star_transactions")
    .select("clone_id,telegram_id,amount_stars")
    .gte("paid_at", iso(windowEnd - 7 * MS_DAY))
    .lte("paid_at", iso(windowEnd));
  if (cloneId) weeklyQ = weeklyQ.eq("clone_id", cloneId);
  // Paged: a busy fleet week outgrows the row cap, and an unpaged read would drop
  // spenders off the leaderboard with no error.
  const { rows: weeklyRows } = await selectAllRows(weeklyQ, { label: "analytics weekly spenders" });
  const weeklyByBuyer = new Map<
    string,
    { cloneId: string | null; telegramId: number; stars: number; purchases: number }
  >();
  for (const transaction of (weeklyRows ?? []) as {
    clone_id: string | null;
    telegram_id: number | null;
    amount_stars: number | null;
  }[]) {
    if (transaction.telegram_id == null) continue;
    const key = `${transaction.clone_id ?? "unknown"}:${transaction.telegram_id}`;
    const current = weeklyByBuyer.get(key) ?? {
      cloneId: transaction.clone_id,
      telegramId: Number(transaction.telegram_id),
      stars: 0,
      purchases: 0,
    };
    current.stars += Number(transaction.amount_stars) || 0;
    current.purchases += 1;
    weeklyByBuyer.set(key, current);
  }
  const rankedWeeklySpenders = [...weeklyByBuyer.values()].sort((a, b) => b.stars - a.stars);
  const weeklyStars = rankedWeeklySpenders.reduce((sum, spender) => sum + spender.stars, 0);
  const weeklyPurchases = rankedWeeklySpenders.reduce((sum, spender) => sum + spender.purchases, 0);
  const topFive = rankedWeeklySpenders.slice(0, 5);

  // Names for the five rows actually rendered. These used to be looked up in a
  // map built from every fan in the fleet; now the read asks for five fans.
  const userByKey = new Map<
    string,
    { name: string | null; stated_name: string | null; username: string | null }
  >();
  if (topFive.length) {
    const topCloneIds = [...new Set(topFive.map((s) => s.cloneId).filter((id): id is string => !!id))];
    const topTelegramIds = [...new Set(topFive.map((s) => s.telegramId))];
    if (topCloneIds.length && topTelegramIds.length) {
      const { data: topUsers } = await supabaseAdmin
        .from("users")
        .select("clone_id,telegram_id,name,stated_name,username")
        .in("clone_id", topCloneIds)
        .in("telegram_id", topTelegramIds)
        .limit(200);
      for (const user of (topUsers ?? []) as {
        clone_id: string;
        telegram_id: number;
        name: string | null;
        stated_name: string | null;
        username: string | null;
      }[]) {
        userByKey.set(`${user.clone_id}:${user.telegram_id}`, user);
      }
    }
  }

  const topWeeklySpenders = topFive.map((spender) => {
    const user = userByKey.get(`${spender.cloneId ?? "unknown"}:${spender.telegramId}`);
    return {
      ...spender,
      cloneName: spender.cloneId ? nameById.get(spender.cloneId) ?? "Unknown clone" : "Unknown clone",
      name: user?.stated_name || user?.name || user?.username || `Fan ${spender.telegramId}`,
      username: user?.username ?? null,
    };
  });

  // ── assemble ─────────────────────────────────────────────────────────────────
  const cloneOut = clones
    .map((c) => {
      const rev = cloneStars.get(c.id) ?? 0;
      const cost = cloneCost.get(c.id) ?? 0;
      const profit = rev * STAR_USD - cost;
      return {
        id: c.id,
        name: c.name,
        color: colorById.get(c.id)!,
        revenueStars: rev,
        costUsd: cost,
        profitUsd: profit,
        sales: cloneSales.get(c.id) ?? 0,
        margin: rev > 0 ? profit / (rev * STAR_USD) : 0,
      };
    })
    .sort((a, b) => b.revenueStars - a.revenueStars);

  // ── classic vs smart flow (roll clone revenue/cost up by ai_mode) ─────────────
  const flowAgg: Record<"classic" | "smart", { clones: number; stars: number; cost: number; sales: number }> = {
    classic: { clones: 0, stars: 0, cost: 0, sales: 0 },
    smart: { clones: 0, stars: 0, cost: 0, sales: 0 },
  };
  for (const c of clones) {
    const f = flowById.get(c.id) ?? "classic";
    flowAgg[f].clones += 1;
    flowAgg[f].stars += cloneStars.get(c.id) ?? 0;
    flowAgg[f].cost += cloneCost.get(c.id) ?? 0;
    flowAgg[f].sales += cloneSales.get(c.id) ?? 0;
  }
  const FLOW_LABEL: Record<"classic" | "smart", string> = {
    classic: "Classic (sorter)",
    smart: "Smart (agent)",
  };
  const byFlow = (["smart", "classic"] as const)
    .map((key) => {
      const a = flowAgg[key];
      return {
        key,
        label: FLOW_LABEL[key],
        clones: a.clones,
        stars: a.stars,
        costUsd: a.cost,
        profitUsd: a.stars * STAR_USD - a.cost,
        sales: a.sales,
        share: totalStars > 0 ? a.stars / totalStars : 0,
      };
    })
    .filter((f) => f.clones > 0);

  const byKind = (Object.keys(KIND_LABEL) as KindKey[])
    .map((key) => {
      const stars = kindStars.get(key) ?? 0;
      return {
        key,
        label: KIND_LABEL[key],
        stars,
        sales: kindSales.get(key) ?? 0,
        share: totalStars > 0 ? stars / totalStars : 0,
      };
    })
    .filter((k) => k.stars > 0 || k.sales > 0)
    .sort((a, b) => b.stars - a.stars);

  const byFeature = FEATURE_KEYS.map((key) => {
    const stars = featureStars.get(key) ?? 0;
    const sales = featureSales.get(key) ?? 0;
    return {
      key,
      label: FEATURE_LABEL[key],
      stars,
      sales,
      avgStars: sales > 0 ? stars / sales : 0,
      share: totalStars > 0 ? stars / totalStars : 0,
    };
  })
    .filter((f) => f.stars > 0 || f.sales > 0)
    .sort((a, b) => b.stars - a.stars);

  // Distinct-fan paywall journey. The converted stage is the intersection of
  // fans who saw the paywall and fans who bought paid messages in the window,
  // avoiding the misleading implication that every credit buyer saw the wall.
  const paywallFunnel = {
    collecting: paywallCollecting,
    messaged: messagedFanTotal,
    paywalled: paywalledFanTotal,
    purchased: convertedPaywallBuyers,
    paidMessageBuyers: creditBuyers.size,
    paidMessagePurchases,
    paidMessageStars,
    paywallViews,
    abandoned: Math.max(0, paywalledFanTotal - convertedPaywallBuyers),
    paywallPct: messagedFanTotal > 0 ? paywalledFanTotal / messagedFanTotal : 0,
    purchasePct: paywalledFanTotal > 0 ? convertedPaywallBuyers / paywalledFanTotal : 0,
    overallPct: messagedFanTotal > 0 ? convertedPaywallBuyers / messagedFanTotal : 0,
    avgViewsPerFan: paywalledFanTotal > 0 ? paywallViews / paywalledFanTotal : 0,
  };

  // Ordered day buckets across the whole window (fill gaps with 0 so the line is
  // continuous). Cap at ~120 points so ALL/6M stay readable.
  const byDay: { label: string; stars: number }[] = [];
  const startDay = new Date(startMs);
  startDay.setHours(0, 0, 0, 0);
  // No cap: it was Math.min(180, ...), which on 1Y/ALL charted the OLDEST 180
  // days and silently dropped everything recent, so the newest revenue was
  // missing from the very windows meant to show the most history.
  //
  // ...and it ran to `now`, not to the end of the window being charted. Every
  // preset window ends at now so it never showed there, but a custom range
  // ending last month drew a flat zero line from that end date to today — days
  // the operator did not ask about, rendered as days with no sales. This series
  // also leaves the building through the public API, so those invented zeroes
  // were being handed to a model's own dashboard as measurements.
  const endDay = new Date(Math.max(startDay.getTime(), windowEnd));
  const dayCount = Math.max(1, Math.ceil((endDay.getTime() - startDay.getTime()) / MS_DAY) + 1);
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(startDay.getTime() + i * MS_DAY);
    // Keyed through reportInstant for the same reason the buckets are: a key
    // built on the container's UTC clock cannot match a bucket built in
    // REPORT_TZ, and every bar would read 0 while the totals stayed right.
    byDay.push({
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: REPORT_TZ }),
      stars: dayStars.get(reportInstant(d).dayKey) ?? 0,
    });
  }

  const byHour = hourStars.map((stars, hour) => ({ hour, label: hourLabel(hour), stars }));

  const DOW_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const byDow = [1, 2, 3, 4, 5, 6, 0].map((dow) => ({ dow, label: DOW_LABEL[dow], stars: dowStars[dow] }));

  const byTier = TIERS.map((t) => {
    const stars = tierStars.get(t.key) ?? 0;
    return {
      key: t.key,
      label: t.label,
      users: tierUsers.get(t.key) ?? 0,
      stars,
      share: lifetimeStars > 0 ? stars / lifetimeStars : 0,
    };
  }).filter((t) => t.users > 0);
  return {
    period,
    // False means costUsd/profitUsd/margin everywhere below are ZERO BECAUSE
    // THEY WERE NOT ASKED FOR, not because the fleet ran free. Anything that
    // renders a cost must read this first; anything that hides cost (the public
    // projection) can ignore it.
    costIncluded: includeCost,
    totals: {
      revenueStars: totalStars,
      costUsd: totalCost,
      profitUsd: totalStars * STAR_USD - totalCost,
      sales: totalSales,
      fans,
      buyers,
    },
    clones: cloneOut,
    byKind,
    byFeature,
    byFlow,
    conversationFunnel: funnel,
    paywallFunnel,
    byDay,
    byHour,
    byDow,
    byTier,
    topWeeklySpenders,
    weeklySpenderSummary: {
      buyers: rankedWeeklySpenders.length,
      stars: weeklyStars,
      purchases: weeklyPurchases,
      avgStars: rankedWeeklySpenders.length > 0 ? weeklyStars / rankedWeeklySpenders.length : 0,
    },
    funnel: {
      fans,
      buyers,
      repeat,
      oneTime,
      threePlus,
      nonBuyers: Math.max(0, fans - buyers),
      totalPurchases,
      buyerPct: fans > 0 ? buyers / fans : 0,
      repeatPct: buyers > 0 ? repeat / buyers : 0,
      oneTimePct: buyers > 0 ? oneTime / buyers : 0,
      avgPurchasesPerBuyer: buyers > 0 ? totalPurchases / buyers : 0,
      avgStarsPerBuyer: buyers > 0 ? lifetimeStars / buyers : 0,
      medianStarsPerBuyer,
      repeatRevenueShare: lifetimeStars > 0 ? repeatBuyerStars / lifetimeStars : 0,
    },
  };
}
