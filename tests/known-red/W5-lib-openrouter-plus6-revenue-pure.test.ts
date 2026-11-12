// KNOWN RED (W5 lib-openrouter-plus6 F4, F8, F9, F22; docs/review/W5/lib-openrouter-plus6.md). Pure calls, no I/O.
// F8: lib/revenue-trend.ts intraPeriodTrendPct divides by a signed (refund-including) earlier-half average, so a
//     negative baseline flips the sign: [-100,100] reads -200 % ("down" while revenue rose), [-100,-200] reads +100 %.
// F9: lib/revenue-ledger.ts classifyRevenueLedgerRow turns a null or garbled amount_stars into 0, so the row silently
//     leaves net revenue, orders and buyers. "Silent" = rollupRevenueLedger([bad]) is structurally equal to
//     rollupRevenueLedger([]), ignoring `rows` (an echo of the input) and zero-valued per-clone/per-fan map entries
//     (an echo of the row's ids). A throw, a non-finite total, or any extra flag/counter is "not silent".
// F4: lib/revenue-projection.ts scaleAnalyticsData scales every breakdown by net/gross of SIGNED window sums: with one
//     clone net-negative in the window and different cuts the ratio leaves [min m_i, max m_i] (A +100 @20 %, B -60 @50 %
//     → 50/40 = 1.25, above both clones' multipliers 0.8 and 0.5). Bound: byTier ≤ gross × max_i m_i and ≥ 0.
// F22 (= W4 lib-analytics-data-plus4 O1): a multi-clone window with zero gross takes the `: 1` branch
//     (revenue-projection.ts:121) and ships the lifetime byTier GROSS; bound ≤ gross × max_i m_i (500 at 50 %). The
//     single-clone zero-gross branch is W4 lib-api-public-v2-plus6 F5 (its revenue-cut-ratio known-red).
// F17 (net() with no cut returns gross) is NOT tested: `net` is not exported (revenue-projection.ts:38).
// Team's Claude owns the fix. Intended runner: init.sh's known-red loop (init.sh:54-56); not wired yet: orchestrator item.
import assert from "node:assert/strict";
import { test } from "node:test";
import { intraPeriodTrendPct } from "../../lib/revenue-trend";
import { rollupRevenueLedger, type RevenueLedgerRow } from "../../lib/revenue-ledger";
import { scaleAnalyticsData, type CloneCuts } from "../../lib/revenue-projection";
import type { AnalyticsData } from "../../lib/analytics-data";

// ── F8 ──────────────────────────────────────────────────────────────────────
test("control: F8 a rising positive series reads as a positive trend", () => {
  const pct = intraPeriodTrendPct([100, 200]);
  assert.ok(pct !== null && pct > 0, `got ${pct}`);
});

test("F8: revenue rising from a refund-dominated half (-100 → 100) never reads as a decline", () => {
  const pct = intraPeriodTrendPct([-100, 100]);
  assert.ok(pct === null || pct >= 0, `[-100,100] read as ${pct} %`);
});

test("F8: revenue falling further below zero (-100 → -200) never reads as growth", () => {
  const pct = intraPeriodTrendPct([-100, -200]);
  assert.ok(pct === null || pct <= 0, `[-100,-200] read as +${pct} %`);
});

// ── F9 ──────────────────────────────────────────────────────────────────────
const CLONE_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const row = (amount: RevenueLedgerRow["amount_stars"]): RevenueLedgerRow => ({ clone_id: CLONE_A, telegram_id: 42, amount_stars: amount, invoice_payload: "photo" });
/** Plain-object view of a rollup: `rows` dropped (it echoes the input), Maps as objects with zero/empty entries dropped. */
function shape(v: unknown): unknown {
  if (v instanceof Map) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of v) {
      const n = shape(x);
      if (n === 0 || (n && typeof n === "object" && !Array.isArray(n) && Object.keys(n).length === 0)) continue;
      out[String(k)] = n;
    }
    return out;
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return Object.fromEntries(Object.entries(v).filter(([k]) => k !== "rows").map(([k, x]) => [k, shape(x)]));
  }
  return v;
}

/** null when not silent; otherwise a description. Silent = the bad row's rollup looks exactly like an empty ledger's. */
function silentZero(rows: RevenueLedgerRow[]): string | null {
  let r: ReturnType<typeof rollupRevenueLedger>;
  try { r = rollupRevenueLedger(rows); } catch { return null; }
  const got = shape(r);
  try { assert.deepStrictEqual(got, shape(rollupRevenueLedger([]))); } catch { return null; }
  return `rollup equals an empty ledger's ${JSON.stringify(got)}`;
}

test("control: F9 a valid 50-star paid row counts as 50 net stars and one sale", () => {
  const r = rollupRevenueLedger([row(50)]);
  assert.equal(r.netStars, 50);
  assert.equal(r.sales, 1);
});

test('F9: a row with amount_stars "bad" does not silently count as zero', () => {
  const silent = silentZero([row("bad")]);
  assert.equal(silent, null, `amount_stars "bad" rolled up silently: ${silent}`);
});

test("F9: a row with amount_stars null does not silently count as zero", () => {
  const silent = silentZero([row(null)]);
  assert.equal(silent, null, `amount_stars null rolled up silently: ${silent}`);
});

// ── F4 ──────────────────────────────────────────────────────────────────────
const CLONE_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2";
const LIFETIME_TIER = 1000;

/** The minimal AnalyticsData scaleAnalyticsData reads; cast once. */
function analytics(clones: { id: string; revenueStars: number }[]): AnalyticsData {
  const clone = (c: { id: string; revenueStars: number }) => ({ ...c, name: c.id, color: "#000", costUsd: 0, profitUsd: 0, sales: 0, margin: 0 });
  return {
    totals: { revenueStars: clones.reduce((s, c) => s + c.revenueStars, 0), costUsd: 0, profitUsd: 0, sales: 0, fans: 0, buyers: 0 },
    clones: clones.map(clone),
    byKind: [], byFeature: [], byDay: [], byHour: [], byDow: [], byFlow: [], whaleFans: [], topWeeklySpenders: [],
    byTier: [{ key: "whale", label: "Whale", fans: 2, stars: LIFETIME_TIER }],
    weeklySpenderSummary: { stars: 0, avgStars: 0 },
    funnel: { avgStarsPerBuyer: 0, medianStarsPerBuyer: 0 },
    paywallFunnel: { paidMessageStars: 0 },
    buyerConversion: { purchaseMix: [] },
  } as unknown as AnalyticsData;
}
const cuts = (entries: [string, number][]) => new Map<string, CloneCuts>(entries.map(([id, p]) => [id, { platformPct: p, agencyCreatorPct: 0 }]));
const tierStars = (d: AnalyticsData) => d.byTier[0].stars;
/** Agency mode: each clone's viewer multiplier is 1 - platformPct/100; the bound is the widest of them. */
const maxMult = (c: Map<string, CloneCuts>) => Math.max(...[...c.values()].map((x) => 1 - x.platformPct / 100));

test("control: F4 two clones with positive windows at one 20 % cut show the lifetime tier at 80 %", () => {
  const out = scaleAnalyticsData(analytics([{ id: CLONE_A, revenueStars: 100 }, { id: CLONE_B, revenueStars: 50 }]), cuts([[CLONE_A, 20], [CLONE_B, 20]]), "agency");
  assert.ok(Math.abs(tierStars(out) - LIFETIME_TIER * 0.8) < 1e-9, `byTier ${tierStars(out)}`);
});

test("F4: one clone net-negative in the window (A +100 @20 %, B -60 @50 %) never shows a tier above gross × max multiplier or below zero", () => {
  const c = cuts([[CLONE_A, 20], [CLONE_B, 50]]);
  const out = scaleAnalyticsData(analytics([{ id: CLONE_A, revenueStars: 100 }, { id: CLONE_B, revenueStars: -60 }]), c, "agency");
  const t = tierStars(out);
  const bound = LIFETIME_TIER * maxMult(c);
  assert.ok(t <= bound + 1e-9 && t >= 0, `lifetime tier ${LIFETIME_TIER} scaled to ${t}; allowed 0..${bound} (max multiplier ${maxMult(c)})`);
});

test("F22: a multi-clone window with zero revenue, every clone cut 50 %, never shows the lifetime tier above gross × 0.5", () => {
  const c = cuts([[CLONE_A, 50], [CLONE_B, 50]]);
  const out = scaleAnalyticsData(analytics([{ id: CLONE_A, revenueStars: 0 }, { id: CLONE_B, revenueStars: 0 }]), c, "agency");
  const bound = LIFETIME_TIER * maxMult(c);
  assert.ok(tierStars(out) <= bound + 1e-9 && tierStars(out) >= 0, `every viewer multiplier is 0.5 but byTier shows ${tierStars(out)} (allowed ≤ ${bound})`);
});
