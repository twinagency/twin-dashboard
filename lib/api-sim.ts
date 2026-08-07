// ── Synthetic data, generated on demand, stored nowhere ──────────────────────
//
// THE PROBLEM THIS SOLVES. Building a model-facing dashboard needs realistic
// revenue and fan data. The two obvious ways to get it are both bad:
//   - write fake fans and fake payments into the live tables. Every revenue
//     number this API exists to report is then wrong, permanently, and the
//     "exclude the test rows" filter WILL be forgotten by some query later.
//     This project's dominant defect is a setting that looks right and isn't;
//     poisoned money data is that defect with a price tag.
//   - stand up a second Supabase project. Real isolation, but it costs money
//     and the schema drifts from live the moment a migration lands.
//
// So: generate it. These functions read NOTHING and write NOTHING. They return
// payloads in exactly the shape of app/api/v1/* so a dashboard can be built
// against /sim and repointed at the real endpoint with a URL change and no
// code change. There is no database call anywhere in this file, which is the
// property that makes it safe, and check-public-api.ts asserts it.
//
// DETERMINISTIC BY SEED. The same ?seed= gives the same data every time, so a
// screenshot, a bug report and a test all refer to the same numbers. Change
// the seed to get a different but equally plausible model.

import type { PublicRevenue, PublicFans } from "./api-public";
import type { Period, DateRange } from "./dashboard-data";

// mulberry32: small, fast, deterministic. Not cryptographic and does not need
// to be — nothing here protects anything.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFrom(raw: string | null): number {
  if (!raw) return 1;
  const n = Number(raw);
  if (Number.isFinite(n)) return Math.floor(Math.abs(n)) || 1;
  // Any string works as a seed, so ?seed=kait is valid and stable.
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 1;
}

const DAY_MS = 86_400_000;
const PERIOD_DAYS: Record<string, number> = {
  "1D": 1, "1W": 7, "2W": 14, "1M": 30, "3M": 90, "6M": 180, "1Y": 365, ALL: 365, CUSTOM: 30,
};

const KINDS = [
  { key: "credits", label: "Message credits" },
  { key: "media", label: "Photos & videos" },
  { key: "tip", label: "Tips" },
  { key: "other", label: "Other" },
];
const FEATURES = [
  { key: "credits", label: "Message credits" },
  { key: "photo", label: "Photos" },
  { key: "video", label: "Videos" },
  { key: "bundle", label: "Bundles" },
  { key: "tip", label: "Tips" },
  { key: "subscription", label: "Subscriptions" },
];
const TIERS = [
  { key: "whale", label: "Whale · 1,000+ ⭐" },
  { key: "high", label: "High · 300+ ⭐" },
  { key: "mid", label: "Mid · 50+ ⭐" },
  { key: "low", label: "Low · under 50 ⭐" },
  { key: "none", label: "No spend yet" },
];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const share = (part: number, whole: number) => (whole > 0 ? part / whole : 0);

export function simRevenue(seed: number, period: Period, nowMs: number, range?: DateRange): PublicRevenue {
  const r = rng(seed);
  const days = range ? Math.max(1, Math.round((range.endMs - range.startMs) / DAY_MS)) : PERIOD_DAYS[period] ?? 30;

  // A plausible daily shape: a weekly rhythm (weekends up), a slow upward
  // trend, and noise. Not a flat random walk — a flat one makes every chart
  // look wrong in a way that hides real layout bugs.
  const byDay: { label: string; stars: number }[] = [];
  const byDow = DOW.map((label, dow) => ({ dow, label, stars: 0 }));
  const byHour = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: new Date(2000, 0, 1, hour).toLocaleTimeString("en-US", { hour: "numeric", hour12: true }),
    stars: 0,
  }));

  let totalStars = 0;
  let totalSales = 0;
  const endMs = range ? range.endMs : nowMs;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(endMs - i * DAY_MS);
    const dow = d.getDay();
    const weekend = dow === 0 || dow === 5 || dow === 6 ? 1.35 : 1;
    const trend = 1 + ((days - i) / days) * 0.4;
    const base = 180 * weekend * trend;
    const stars = Math.round(base * (0.55 + r() * 0.9));
    const sales = Math.max(1, Math.round(stars / (35 + r() * 30)));
    totalStars += stars;
    totalSales += sales;
    byDay.push({ label: d.toISOString().slice(0, 10), stars });
    byDow[dow].stars += stars;
    // Evening-weighted, the way a real chat product looks.
    for (let k = 0; k < sales; k++) {
      const hour = Math.min(23, Math.max(0, Math.round(19 + (r() - 0.5) * 11)));
      byHour[hour].stars += Math.round(stars / sales);
    }
  }

  const splitInto = (n: number, total: number, weights: number[]): number[] => {
    const sum = weights.reduce((a, b) => a + b, 0);
    const out = weights.map((w) => Math.round((w / sum) * total));
    // Force the parts to add up to the whole — a dashboard that shows a total
    // and a breakdown disagreeing by a few stars looks like a real bug.
    const drift = total - out.reduce((a, b) => a + b, 0);
    if (out.length) out[0] += drift;
    return out.slice(0, n);
  };

  const kindStars = splitInto(KINDS.length, totalStars, [5, 3, 1.4, 0.3]);
  const kindSales = splitInto(KINDS.length, totalSales, [6, 2.5, 1.2, 0.2]);
  const featStars = splitInto(FEATURES.length, totalStars, [5, 2, 1.2, 0.9, 1.4, 0.5]);
  const featSales = splitInto(FEATURES.length, totalSales, [6, 2.2, 0.8, 0.5, 1.2, 0.3]);

  const fans = Math.round(40 + days * (1.2 + r()));
  const buyers = Math.round(fans * (0.18 + r() * 0.12));
  const repeat = Math.round(buyers * (0.3 + r() * 0.25));
  const messaged = fans;
  const paywalled = Math.round(messaged * (0.5 + r() * 0.2));
  const purchased = buyers;

  const tierUsers = splitInto(TIERS.length, fans, [0.4, 1.2, 3, 5, 6]);
  const tierStars = splitInto(TIERS.length, totalStars, [4, 3, 2, 0.8, 0]);

  return {
    period,
    range: range ?? null,
    totals: { revenueStars: totalStars, sales: totalSales, fans, buyers },
    byKind: KINDS.map((k, i) => ({
      key: k.key,
      label: k.label,
      stars: kindStars[i],
      sales: kindSales[i],
      share: share(kindStars[i], totalStars),
    })),
    byFeature: FEATURES.map((f, i) => ({
      key: f.key,
      label: f.label,
      stars: featStars[i],
      sales: featSales[i],
      avgStars: featSales[i] > 0 ? Math.round(featStars[i] / featSales[i]) : 0,
      share: share(featStars[i], totalStars),
    })),
    byDay,
    byHour,
    byDow,
    byTier: TIERS.map((t, i) => ({
      key: t.key,
      label: t.label,
      users: tierUsers[i],
      stars: tierStars[i],
      share: share(tierStars[i], totalStars),
    })),
    funnel: {
      fans,
      buyers,
      repeat,
      buyerPct: share(buyers, fans),
      repeatPct: share(repeat, buyers),
    },
    paywallFunnel: {
      collecting: false,
      messaged,
      paywalled,
      purchased,
      paywallPct: share(paywalled, messaged),
      purchasePct: share(purchased, paywalled),
    },
  };
}

// Obviously-fake names. Nobody should ever have to work out whether a row in a
// sim payload is a real person, so these are drawn from a fixed list and the
// usernames are all suffixed.
const FIRST = ["Alex", "Jordan", "Sam", "Riley", "Casey", "Morgan", "Jamie", "Taylor", "Quinn", "Avery",
  "Rowan", "Skyler", "Emerson", "Finley", "Harper", "Kai", "Logan", "Reese", "Sage", "Toby"];

export function simFans(seed: number, limit: number, nowMs: number): PublicFans {
  const r = rng(seed ^ 0x5f3759df);
  const n = Math.max(0, Math.min(limit, 500));
  const fans: Record<string, unknown>[] = [];

  for (let i = 0; i < n; i++) {
    // Spend follows a steep power law, which is what makes a real fan list
    // look the way it does: a couple of whales carrying everything.
    const spend = Math.round(Math.pow(r(), 3) * 4000);
    const tier = spend >= 1000 ? "whale" : spend >= 300 ? "high" : spend >= 50 ? "mid" : spend > 0 ? "low" : "none";
    const purchases = spend > 0 ? Math.max(1, Math.round(spend / (60 + r() * 120))) : 0;
    const firstSeen = nowMs - Math.round(r() * 240) * DAY_MS;
    fans.push({
      telegram_id: 900_000_000 + Math.floor(r() * 99_999_999),
      name: `${FIRST[Math.floor(r() * FIRST.length)]} (sim)`,
      stated_name: null,
      username: `sim_fan_${i + 1}`,
      first_seen_at: new Date(firstSeen).toISOString(),
      last_message_received: new Date(firstSeen + Math.round(r() * (nowMs - firstSeen))).toISOString(),
      total_messages_sent: Math.round(r() * 400),
      total_messages_purchased: purchases * 20,
      message_credits: Math.round(r() * 40),
      total_spent_stars: spend,
      purchase_count: purchases,
      spend_tier: tier,
      is_high_spender: spend >= 300,
      subscription_tier: null,
      subscription_status: null,
      subscription_period_end: null,
      is_active: r() > 0.25,
      blocked: r() > 0.95,
    });
  }

  fans.sort((a, b) => Number(b.total_spent_stars) - Number(a.total_spent_stars));
  return { fans, rowCount: fans.length, limitApplied: n, truncated: false };
}
