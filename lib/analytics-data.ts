import { supabaseAdmin } from "./supabase";
import { colorForIndex } from "./colors";
import { STAR_USD } from "./money";
import type { DateRange, Period } from "./dashboard-data";

// Deep money analytics — WHERE the money comes from. This is the aggregation layer
// for /analytics. It mirrors the query style in dashboard-data.ts (fetch scoped
// columns, filter the window in SQL via .gte, roll up in JS) so the two stay
// consistent. Volumes here are small (hundreds of ledger rows) so JS roll-up is
// plenty fast; if it ever grows, these become SQL views / RPCs.

const MS_DAY = 86_400_000;

const WINDOW_DAYS: Record<Period, number | null> = {
  "1D": 1,
  "1W": 7,
  "2W": 14,
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
  ALL: null,
  CUSTOM: null,
};

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
  credits: "Message credits",
  photo: "Paid photos",
  video: "Paid videos",
  bundle: "Photo bundles",
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
const TIERS: { key: string; label: string }[] = [
  { key: "whale", label: "Whale · 1,000+ ⭐" },
  { key: "high", label: "High · 300+ ⭐" },
  { key: "mid", label: "Mid · 50+ ⭐" },
  { key: "low", label: "Low · under 50 ⭐" },
  { key: "none", label: "No spend yet" },
];

export type AnalyticsData = {
  period: Period;
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
    purchased: number; // distinct fans who bought credits
    paywallPct: number; // paywalled / messaged
    purchasePct: number; // purchased / paywalled
  };
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
  funnel: {
    fans: number;
    buyers: number;
    repeat: number;
    buyerPct: number; // buyers / fans
    repeatPct: number; // repeat / buyers
  };
};

const iso = (ms: number) => new Date(ms).toISOString();
const hourLabel = (h: number) =>
  new Date(2000, 0, 1, h).toLocaleTimeString("en-US", { hour: "numeric", hour12: true });

export async function getAnalytics(
  period: Period,
  cloneId?: string | null,
  range?: DateRange,
): Promise<AnalyticsData> {
  const now = Date.now();
  const windowEnd = range ? range.endMs : now;

  // ── clones (color order matches the nav: created_at asc → colorForIndex) ──────
  // Colors are assigned across the FULL fleet order so they stay stable whether
  // scoped to "All" or narrowed to one clone (same clone always gets same color).
  const { data: cloneRows } = await supabaseAdmin
    .from("clones")
    .select("id,name,created_at,ai_mode")
    .order("created_at", { ascending: true });
  const allClones = (cloneRows ?? []) as { id: string; name: string; ai_mode: string | null }[];
  const clones = cloneId ? allClones.filter((c) => c.id === cloneId) : allClones;
  const nameById = new Map<string, string>();
  const colorById = new Map<string, string>();
  // Normalise ai_mode → the two flows the runtime supports ("smart" agent vs the
  // classic sorter). Anything unset/other is treated as classic.
  const flowById = new Map<string, "classic" | "smart">();
  allClones.forEach((c, i) => {
    nameById.set(c.id, c.name);
    colorById.set(c.id, colorForIndex(i));
    flowById.set(c.id, c.ai_mode === "smart" ? "smart" : "classic");
  });

  // ── window start ──────────────────────────────────────────────────────────────
  const days = WINDOW_DAYS[period];
  let startMs: number;
  if (range) {
    startMs = range.startMs;
  } else if (days !== null) {
    startMs = now - days * MS_DAY;
  } else {
    const { data: earliest } = await supabaseAdmin
      .from("star_transactions")
      .select("paid_at")
      .order("paid_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    startMs = earliest?.paid_at ? new Date(earliest.paid_at).getTime() : now - 180 * MS_DAY;
  }

  // ── revenue ledger in window (star_transactions) ─────────────────────────────
  // Try to read the additive `feature` column; if migration 024 hasn't been applied
  // yet the column is missing and PostgREST errors the whole select — so fall back to
  // the pre-feature columns (byFeature then derives buckets from `kind`). This keeps
  // every existing chart working before the migration lands.
  type TxRow = {
    clone_id: string | null;
    amount_stars: number;
    paid_at: string;
    kind: string | null;
    feature: string | null;
    telegram_id: number | null;
  };
  let txs: TxRow[];
  {
    let withFeatureQ = supabaseAdmin
      .from("star_transactions")
      .select("clone_id,amount_stars,paid_at,kind,feature,telegram_id")
      .gte("paid_at", iso(startMs))
      .lte("paid_at", iso(windowEnd));
    if (cloneId) withFeatureQ = withFeatureQ.eq("clone_id", cloneId);
    const withFeature = await withFeatureQ;
    if (withFeature.error) {
      let legacyQ = supabaseAdmin
        .from("star_transactions")
        .select("clone_id,amount_stars,paid_at,kind,telegram_id")
        .gte("paid_at", iso(startMs))
        .lte("paid_at", iso(windowEnd));
      if (cloneId) legacyQ = legacyQ.eq("clone_id", cloneId);
      const legacy = await legacyQ;
      txs = ((legacy.data ?? []) as Omit<TxRow, "feature">[]).map((r) => ({ ...r, feature: null }));
    } else {
      txs = (withFeature.data ?? []) as TxRow[];
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

    const f = normFeature(t.feature, t.kind);
    featureStars.set(f, (featureStars.get(f) ?? 0) + stars);
    featureSales.set(f, (featureSales.get(f) ?? 0) + 1);

    // Credits purchase = the paywall conversion. Track distinct buyers for the funnel.
    if (t.kind === "credits" && t.telegram_id != null) creditBuyers.add(t.telegram_id);

    const d = new Date(t.paid_at);
    const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
    dayStars.set(dayKey, (dayStars.get(dayKey) ?? 0) + stars);
    hourStars[d.getHours()] += stars;
    dowStars[d.getDay()] += stars;
  }

  // ── AI/voice cost in window (usage_events) ───────────────────────────────────
  let usageQ = supabaseAdmin
    .from("usage_events")
    .select("clone_id,cost_usd")
    .gte("created_at", iso(startMs))
    .lte("created_at", iso(windowEnd));
  if (cloneId) usageQ = usageQ.eq("clone_id", cloneId);
  const { data: usageRows } = await usageQ;
  const usage = (usageRows ?? []) as { clone_id: string | null; cost_usd: number | null }[];
  const cloneCost = new Map<string, number>();
  let totalCost = 0;
  for (const u of usage) {
    const c = Number(u.cost_usd) || 0;
    totalCost += c; // count every cost, even unattributed
    if (u.clone_id) cloneCost.set(u.clone_id, (cloneCost.get(u.clone_id) ?? 0) + c);
  }

  // ── paywall funnel: distinct fans messaged → paywalled → purchased (window) ──
  // messaged: distinct fans who sent a message (chat_history role='human').
  let msgQ = supabaseAdmin
    .from("chat_history")
    .select("telegram_id")
    .eq("role", "human")
    .gte("created_at", iso(startMs))
    .lte("created_at", iso(windowEnd));
  if (cloneId) msgQ = msgQ.eq("clone_id", cloneId);
  const { data: msgRows } = await msgQ;
  const messagedFans = new Set<number>();
  for (const m of (msgRows ?? []) as { telegram_id: number | null }[]) {
    if (m.telegram_id != null) messagedFans.add(m.telegram_id);
  }
  // paywalled: distinct fans shown the paywall (paywall_hits — additive table, mig 024).
  // If the table doesn't exist yet the query errors → treat as "still collecting".
  let paywallQ = supabaseAdmin
    .from("paywall_hits")
    .select("telegram_id")
    .gte("shown_at", iso(startMs))
    .lte("shown_at", iso(windowEnd));
  if (cloneId) paywallQ = paywallQ.eq("clone_id", cloneId);
  const paywallRes = await paywallQ;
  const paywallCollecting = Boolean(paywallRes.error);
  const paywalledFans = new Set<number>();
  for (const p of (paywallRes.data ?? []) as { telegram_id: number | null }[]) {
    if (p.telegram_id != null) paywalledFans.add(p.telegram_id);
  }

  // ── lifetime fan spend → tiers + funnel (users table) ────────────────────────
  let userQ = supabaseAdmin.from("users").select("total_spent_stars,spend_tier,purchase_count");
  if (cloneId) userQ = userQ.eq("clone_id", cloneId);
  const { data: userRows } = await userQ;
  const users = (userRows ?? []) as {
    total_spent_stars: number | null;
    spend_tier: string | null;
    purchase_count: number | null;
  }[];

  const tierUsers = new Map<string, number>();
  const tierStars = new Map<string, number>();
  let fans = 0;
  let buyers = 0;
  let repeat = 0;
  let lifetimeStars = 0;
  for (const u of users) {
    fans += 1;
    const spent = Number(u.total_spent_stars) || 0;
    const pc = Number(u.purchase_count) || 0;
    if (pc > 0 || spent > 0) buyers += 1;
    if (pc > 1) repeat += 1;
    lifetimeStars += spent;
    const tier = TIERS.some((t) => t.key === u.spend_tier) ? (u.spend_tier as string) : "none";
    tierUsers.set(tier, (tierUsers.get(tier) ?? 0) + 1);
    tierStars.set(tier, (tierStars.get(tier) ?? 0) + spent);
  }

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

  // Distinct-fan drop-off. Purchase stage = credit buyers (what the paywall sells).
  const paywallFunnel = {
    collecting: paywallCollecting,
    messaged: messagedFans.size,
    paywalled: paywalledFans.size,
    purchased: creditBuyers.size,
    paywallPct: messagedFans.size > 0 ? paywalledFans.size / messagedFans.size : 0,
    purchasePct: paywalledFans.size > 0 ? creditBuyers.size / paywalledFans.size : 0,
  };

  // Ordered day buckets across the whole window (fill gaps with 0 so the line is
  // continuous). Cap at ~120 points so ALL/6M stay readable.
  const byDay: { label: string; stars: number }[] = [];
  const startDay = new Date(startMs);
  startDay.setHours(0, 0, 0, 0);
  const dayCount = Math.min(180, Math.max(1, Math.ceil((now - startDay.getTime()) / MS_DAY) + 1));
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(startDay.getTime() + i * MS_DAY);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
    byDay.push({
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      stars: dayStars.get(key) ?? 0,
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
    paywallFunnel,
    byDay,
    byHour,
    byDow,
    byTier,
    funnel: {
      fans,
      buyers,
      repeat,
      buyerPct: fans > 0 ? buyers / fans : 0,
      repeatPct: buyers > 0 ? repeat / buyers : 0,
    },
  };
}
