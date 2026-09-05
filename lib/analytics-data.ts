import { supabaseAdmin } from "./supabase";
import { selectAllRows, selectAllRowsParallel } from "./select-all";
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
import { classifyRevenueLedgerRow } from "./revenue-ledger";

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
  // The core buyer-conversion measures. They intentionally keep the two
  // identity models separate instead of pretending they are interchangeable:
  //
  // - lifetime fields are rows in `users` (creator–fan profiles). In All
  //   creators, the same Telegram account can have one profile per creator.
  // - active-chat fields are distinct Telegram accounts in the selected
  //   reporting window, so a person talking to or buying from several
  //   creators is counted once in the fleet view.
  //
  // A rate is null rather than 0 when its denominator does not exist. Rendering
  // 0% in that state would claim a measured conversion failure when no cohort
  // was available to convert.
  buyerConversion: {
    lifetimeFanProfiles: number;
    lifetimeBuyerProfiles: number;
    lifetimeBuyerRate: number | null;
    activeChatters: number;
    activeChatBuyers: number;
    activeChatBuyerRate: number | null;
    activeBuyerProfiles7d: number;
    activeBuyerEngagement7d: number | null;
    // What customers purchased in the selected reporting period. `sales` is
    // positive paid-order count; `stars` is signed revenue after adjustments.
    // This is a product mix, not a first-purchase or per-buyer cohort.
    purchaseMix: { key: FeatureKey; label: string; stars: number; sales: number; share: number }[];
  };
  // Inputs for the five optional chat & purchase signals (migration 125).
  // They live here rather than on the dashboard payload because this half of
  // the page is already creator-scoped. The UI deliberately does not render
  // revenue per chat pair or repeat purchase rate here: neither shares the
  // relationship-level cohort and both can suggest causal meaning they do not
  // have.
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
  // The exact profiles in the Whale tier. This uses the same stored spend tier
  // as `byTier`, so the list belongs to the number shown beside Whale.
  whaleFans: {
    cloneId: string | null;
    cloneName: string;
    telegramId: number | null;
    name: string;
    username: string | null;
    stars: number;
    purchases: number;
  }[];
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

// `revenue_messaged_fans` gives the denominator for active-chat conversion as
// one exact SQL count. The numerator is the intersection of that cohort with
// the paid buyer IDs already read from the ledger, and migration 137 makes it
// one exact SQL count too.
//
// THE ROUND TRIPS THIS REPLACES. The old path sliced the buyer ids into
// batches of 300 (PostgREST puts `.in()` values in the URL, so a busy window
// overflowed the request line) and then paged chat_history 1,000 rows at a
// time, SEQUENTIALLY, for every batch. On a cloud-hosted database every one of
// those pages is an internet round trip: ~23 of them, one after another, to
// produce a single COUNT(DISTINCT telegram_id) whose row payloads were all
// discarded. See db/migrations/137_active_chat_buyers_rpc.sql for the measured
// cost and for why `count: "exact", head: true` cannot substitute (PostgREST
// counts rows, not distinct fans, so it would count a chatty buyer once per
// message and push the rate over 100%).
//
// The array now travels in an RPC POST body, so it is not URL-bound and does
// not need 300-row batches. A very large ALL-window list is still chunked, but
// at a size where the limit is statement size rather than the request line, and
// the chunks go out in parallel. The chunks partition a Set, so no telegram_id
// appears in two of them and summing per-chunk distinct counts is the exact
// total, not an approximation.
const ACTIVE_BUYER_RPC_CHUNK = 10_000;

// Only the pre-migration fallback below needs the small URL-bound batches.
const ACTIVE_BUYER_ID_BATCH = 300;

async function activeChatBuyerCount(
  startMs: number,
  endMs: number,
  cloneId: string | null | undefined,
  paidBuyerIds: ReadonlySet<number>,
): Promise<number> {
  if (paidBuyerIds.size === 0) return 0;

  const buyers = [...paidBuyerIds];
  const chunks: number[][] = [];
  for (let from = 0; from < buyers.length; from += ACTIVE_BUYER_RPC_CHUNK) {
    chunks.push(buyers.slice(from, from + ACTIVE_BUYER_RPC_CHUNK));
  }

  const counts = await Promise.all(
    chunks.map((chunk) =>
      supabaseAdmin.rpc("revenue_active_chat_buyers", {
        p_start: iso(startMs),
        p_end: iso(endMs),
        p_clone: cloneId ?? null,
        p_buyers: chunk,
      }),
    ),
  );

  // NO SILENT FALLBACK, except for the one condition that is genuinely "the SQL
  // is not applied yet". PGRST202 = no such function in PostgREST's schema
  // cache, 42883 = undefined_function. Same two codes lib/rollup.ts treats as
  // missing, and the same reasoning: a statement timeout (57014) must NOT drop
  // back to the paged path, because that path is ~23 round trips against a
  // database that has just said it is overloaded, and because a fallback taken
  // for the wrong reason is how a page ends up with two answers to one question.
  const missing = counts.find(
    (result) => result.error && (result.error.code === "PGRST202" || result.error.code === "42883"),
  );
  if (missing) {
    return activeChatBuyerCountPaged(startMs, endMs, cloneId, buyers);
  }
  const failed = counts.find((result) => result.error);
  if (failed?.error) {
    throw new Error(
      `revenue_active_chat_buyers failed: ${failed.error.message} (code ${failed.error.code ?? "none"}). ` +
        `The function exists, so this is not the pre-migration-137 case; refusing to publish a partial conversion rate.`,
    );
  }

  return counts.reduce((total, result) => total + (Number(result.data) || 0), 0);
}

// The pre-migration-137 path, unchanged in behaviour: page every matching chat
// row and count distinct ids in JS. Kept ONLY so the Analytics page keeps
// working between this code shipping and the migration being applied. Delete it
// (and its caller above) once 137 is applied.
//
// It still throws rather than publish a partial count. That guard is the whole
// reason this is safe to keep: a truncated read here would understate the
// numerator of a conversion rate, which reads as "our buyers stopped talking to
// us" rather than as "the read did not finish".
async function activeChatBuyerCountPaged(
  startMs: number,
  endMs: number,
  cloneId: string | null | undefined,
  buyers: number[],
): Promise<number> {
  const matched = new Set<number>();
  for (let from = 0; from < buyers.length; from += ACTIVE_BUYER_ID_BATCH) {
    const batch = buyers.slice(from, from + ACTIVE_BUYER_ID_BATCH);
    let query = supabaseAdmin
      .from("chat_history")
      .select("id,telegram_id")
      .eq("role", "human")
      .gte("created_at", iso(startMs))
      .lte("created_at", iso(endMs))
      .in("telegram_id", batch)
      // A stable order is necessary because selectAllRows pages while new
      // messages can be inserted. The exact count is more important than a
      // fast but lower-bound-looking conversion rate.
      .order("id", { ascending: true });
    if (cloneId) query = query.eq("clone_id", cloneId);
    const { rows, truncated } = await selectAllRows<{ telegram_id: number | null }>(query, {
      label: "analytics active-chat buyers",
    });
    if (truncated) {
      throw new Error(
        "Could not read every matching chat message for active-chat buyer conversion; refusing to publish a partial rate.",
      );
    }
    for (const row of rows) if (row.telegram_id != null) matched.add(Number(row.telegram_id));
  }
  return matched.size;
}

// This intentionally runs against the live clock rather than the report
// window. “Still chatting (7d)” answers whether lifetime buyers are active
// now; it must not turn into “were they active during the month I selected?”
async function activeBuyerProfileCount7d(nowMs: number, cloneId: string | null | undefined): Promise<number> {
  const from = iso(nowMs - 7 * MS_DAY);
  const to = iso(nowMs);
  let countQuery = supabaseAdmin
    .from("users")
    .select("id", { count: "exact", head: true })
    .gte("last_message_received", from)
    .lte("last_message_received", to)
    // Same buyer predicate as revenue_fan_spend_stats: a historical row can
    // be a buyer even if one of its two lifetime fields was not backfilled.
    .or("purchase_count.gt.0,total_spent_stars.gt.0");
  if (cloneId) countQuery = countQuery.eq("clone_id", cloneId);
  const { count, error } = await countQuery;
  if (error) {
    throw new Error(
      `Could not count buyer profiles active in the last 7 days: ${error.message} (code ${error.code ?? "none"}).`,
    );
  }

  // Migration 124's imported rows can carry a forged `last_message_received`
  // that predates their profile's first_seen_at. The normal user-stat rollup
  // excludes those; make this measure obey the same guard instead of treating
  // a backfill artefact as a buyer who is actively chatting. Only imported
  // candidates are paged, not the whole users table.
  let importedQuery = supabaseAdmin
    .from("users")
    .select("id,first_seen_at,last_message_received")
    .not("legacy_id", "is", null)
    .gte("last_message_received", from)
    .lte("last_message_received", to)
    .or("purchase_count.gt.0,total_spent_stars.gt.0")
    .order("id", { ascending: true });
  if (cloneId) importedQuery = importedQuery.eq("clone_id", cloneId);
  const { rows: importedCandidates, truncated } = await selectAllRows<{
    first_seen_at: string | null;
    last_message_received: string | null;
  }>(importedQuery, { label: "analytics imported active buyer profiles" });
  if (truncated) {
    throw new Error(
      "Could not read every imported active buyer profile for the 7-day guard; refusing to publish a partial engagement rate.",
    );
  }
  let invalidImported = 0;
  for (const row of importedCandidates) {
    if (!row.first_seen_at || !row.last_message_received) continue;
    if (new Date(row.last_message_received).getTime() < new Date(row.first_seen_at).getTime()) invalidImported += 1;
  }
  return Math.max(0, (Number(count) || 0) - invalidImported);
}
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
  const startMs = window.startMs;

  // ── clones (color order matches the nav: created_at asc → colorForIndex) ──────
  // Colors are assigned across the FULL fleet order so they stay stable whether
  // scoped to "All" or narrowed to one clone (same clone always gets same color).
  //
  // Fired together with the revenue ledger, the cost rollup, the messaged-fan
  // count and the paywall probe below — none of these five reads depends on
  // another's result, only on `startMs`/`windowEnd`/`cloneId`, and they used to
  // run one after another. Measured 2026-09-02 as part of the same "dashboard
  // is slow" pass that parallelized lib/dashboard-data.ts.
  const [cloneRows, txs, usage, messagedFanTotal, paywallProbe] = await Promise.all([
    supabaseAdmin
      .from("clones")
      .select("id,name,created_at,ai_mode,intake")
      .order("created_at", { ascending: true })
      .then((r) => r.data),
    loadTxs(),
    includeCost ? usageRollup(startMs, windowEnd, cloneId ?? null) : Promise.resolve([]),
    messagedFanCount(startMs, windowEnd, cloneId ?? null),
    supabaseAdmin.from("paywall_hits").select("telegram_id").limit(1),
  ]);
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
    invoice_payload: string | null;
  };
  async function loadTxs(): Promise<TxRow[]> {
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
    // A FACTORY, not a built query: selectAllRowsParallel fetches several ranges
    // at once and .range() mutates the builder it is called on, so every page
    // needs its own. Same columns, same window, same clone scope, same ORDER BY
    // on each call — that sameness is what makes the concurrent ranges line up.
    const makeQuery = () => {
      let q = supabaseAdmin
        .from("star_transactions")
        .select(hasFeature ? COLS : COLS_LEGACY)
        .gte("paid_at", iso(startMs))
        .lte("paid_at", iso(windowEnd));
      if (cloneId) q = q.eq("clone_id", cloneId);
      return q.order("id", { ascending: true });
    };
    // ORDER BY id is not tidiness, it is correctness. selectAllRows walks this
    // table 1,000 rows at a time with .range(), and star_transactions is being
    // inserted into while the walk runs — without a stable sort, rows shift
    // between pages and the same row is read twice or skipped. Measured on
    // usage_events by check-revenue-rollups.ts: 30,290 rows read of which only
    // 22,285 were distinct, 26% double-counted, and the cost total came out at
    // 37.38 against a true 33.94. That check orders by id; this read did not,
    // so the suite could not see the defect in the code the page actually runs.
    // Paged CONCURRENTLY after the first page. star_transactions is only ~8.6k
    // rows, so this is not a row-volume problem and deliberately does not get a
    // rollup table (migration 136 says why) — but on a cloud database the ALL
    // window is still ~9 sequential internet round trips for the ledger every
    // analytics load, and that is the shape 1M/ALL was timing out in. A short
    // window still costs exactly one round trip: the first page is fetched
    // alone and a short page ends the read there.
    const { rows } = await selectAllRowsParallel(makeQuery, {
      label: "analytics revenue ledger",
    });
    return hasFeature
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
  // Every identifiable person with a positive, non-adjustment payment in this
  // report window. This is deliberately all payment types, unlike
  // `creditBuyers` below, whose narrower job is the paid-message paywall
  // journey. It becomes the candidate side of active-chat buyer conversion.
  const windowPaidBuyerIds = new Set<number>();
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
    const { stars, paidOrder } = classifyRevenueLedgerRow(t);
    totalStars += stars;
    if (paidOrder) totalSales += 1;
    if (paidOrder && t.telegram_id != null) windowPaidBuyerIds.add(Number(t.telegram_id));

    if (t.clone_id) {
      cloneStars.set(t.clone_id, (cloneStars.get(t.clone_id) ?? 0) + stars);
      if (paidOrder) cloneSales.set(t.clone_id, (cloneSales.get(t.clone_id) ?? 0) + 1);
    }

    const k = normKind(t.kind);
    kindStars.set(k, (kindStars.get(k) ?? 0) + stars);
    if (paidOrder) kindSales.set(k, (kindSales.get(k) ?? 0) + 1);

    const f = inferredMediaByTransaction.get(t.id) ?? normFeature(t.feature, t.kind);
    featureStars.set(f, (featureStars.get(f) ?? 0) + stars);
    if (paidOrder) featureSales.set(f, (featureSales.get(f) ?? 0) + 1);

    // Paid-message purchase = the paywall conversion product. Track both
    // distinct buyers and paid-order volume for the clearer funnel. Revenue
    // remains signed so a refund still lowers the net paid-message revenue.
    if (f === "credits") {
      paidMessageStars += stars;
      if (paidOrder) {
        paidMessagePurchases += 1;
        if (t.telegram_id != null) creditBuyers.add(t.telegram_id);
      }
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
  // Fetched above, in parallel with clones/txs/messagedFanTotal/paywallProbe.
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
  // Fetched above, in parallel with clones/txs/usage/paywallProbe.
  // Do these direct reads in parallel with the rest of the deeper analytics
  // work below. Unlike the lifetime spend rollup, both answer a current
  // conversion question: who chatted in the selected window and who is still
  // talking now.
  const activeChatBuyerPromise = activeChatBuyerCount(startMs, windowEnd, cloneId, windowPaidBuyerIds);
  const activeBuyerProfiles7dPromise = activeBuyerProfileCount7d(nowMs, cloneId);
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
  // Fetched above, in parallel with clones/txs/usage/messagedFanTotal.
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
  // This is intentionally a profile read rather than a reconstruction from
  // transactions: `users.total_spent_stars` and `users.spend_tier` are the
  // maintained lifetime ledger used by the tier rollup itself. Re-summing
  // payment rows here could disagree with the tier on imported history.
  const whaleFansPromise = (async () => {
    let query = supabaseAdmin
      .from("users")
      .select("id,clone_id,telegram_id,name,stated_name,username,total_spent_stars,purchase_count")
      .eq("spend_tier", "whale")
      .order("total_spent_stars", { ascending: false })
      .order("id", { ascending: true });
    if (cloneId) query = query.eq("clone_id", cloneId);
    const { rows, truncated } = await selectAllRows<{
      clone_id: string | null;
      telegram_id: number | null;
      name: string | null;
      stated_name: string | null;
      username: string | null;
      total_spent_stars: number | string | null;
      purchase_count: number | null;
    }>(query, { label: "analytics Whale fans" });
    if (truncated) {
      throw new Error("Could not read every Whale fan, so the dashboard will not show an incomplete Whale list.");
    }
    return rows.map((fan) => ({
      cloneId: fan.clone_id,
      cloneName: fan.clone_id ? nameById.get(fan.clone_id) ?? "Unknown creator" : "Unknown creator",
      telegramId: fan.telegram_id,
      name: fan.stated_name || fan.name || fan.username || (fan.telegram_id == null ? "Unnamed fan" : `Fan ${fan.telegram_id}`),
      username: fan.username,
      stars: Number(fan.total_spent_stars) || 0,
      purchases: Number(fan.purchase_count) || 0,
    }));
  })();

  const [spendStats, tierRows, funnel, activeChatBuyers, activeBuyerProfiles7d, whaleFans] = await Promise.all([
    fanSpendStats(cloneId ?? null),
    fanTiers(cloneId ?? null),
    conversationFunnel(startMs, windowEnd, cloneId ?? null),
    activeChatBuyerPromise,
    activeBuyerProfiles7dPromise,
    whaleFansPromise,
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
    .select("clone_id,telegram_id,amount_stars,invoice_payload")
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
    invoice_payload: string | null;
  }[]) {
    if (transaction.telegram_id == null) continue;
    const key = `${transaction.clone_id ?? "unknown"}:${transaction.telegram_id}`;
    const current = weeklyByBuyer.get(key) ?? {
      cloneId: transaction.clone_id,
      telegramId: Number(transaction.telegram_id),
      stars: 0,
      purchases: 0,
    };
    const classified = classifyRevenueLedgerRow(transaction);
    current.stars += classified.stars;
    if (classified.paidOrder) current.purchases += 1;
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
    buyerConversion: {
      lifetimeFanProfiles: fans,
      lifetimeBuyerProfiles: buyers,
      lifetimeBuyerRate: fans > 0 ? buyers / fans : null,
      activeChatters: messagedFanTotal,
      activeChatBuyers,
      activeChatBuyerRate: messagedFanTotal > 0 ? activeChatBuyers / messagedFanTotal : null,
      activeBuyerProfiles7d,
      activeBuyerEngagement7d: buyers > 0 ? activeBuyerProfiles7d / buyers : null,
      purchaseMix: byFeature.map((feature) => ({
        key: feature.key,
        label: feature.label,
        stars: feature.stars,
        sales: feature.sales,
        share: feature.share,
      })),
    },
    byFlow,
    conversationFunnel: funnel,
    paywallFunnel,
    byDay,
    byHour,
    byDow,
    byTier,
    whaleFans,
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
