import "../support/admin-route-env";
/**
 * Rule (W4 lib-api-public-v2-plus6 F5; docs/review/W4/lib-api-public-v2-plus6.md): cut disclosure on
 * /api/v1/revenue. Promoted from tests/known-red/W4-lib-api-public-v2-plus6-revenue-cut-ratio.test.ts, which drove
 * the real publicRevenue over a faked PostgREST wire and MEASURED: getAnalytics puts the key's one clone in clones[]
 * with revenueStars 0 for a window without sales, and byTier comes from the lifetime `revenue_fan_tiers` RPC whatever
 * the window. This rule drives lib/revenue-projection.ts scaleAnalyticsData directly with that measured shape.
 * scaleAnalyticsData scales every breakdown by the window's net/gross ratio; a window with zero gross fell back to
 * ratio 1, so the lifetime byTier left GROSS, while a window with a sale left it NET. A clone key comparing a
 * window without sales (period=1D) with one that has a sale (period=1M) divided out its exact cut.
 * Fixture: platform cut 20% (creator multiplier 0.8), one 1000-Star sale inside 1M and outside 1D,
 * byTier = one lifetime whale tier of 4000 Stars.
 * Control: the 1M window (with the sale) shows byTier = 4000 x 0.8. Red: the 1D window (no sale) must show the same,
 * and never more than gross x the clone multiplier. A clone with no cut entry must never pass gross off as net.
 * Run: nice -n 10 node --import tsx --test --test-concurrency=1 tests/rules/W4-revenue-cut-ratio.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { scaleAnalyticsData, type CloneCuts } from "../../lib/revenue-projection";
import type { AnalyticsData } from "../../lib/analytics-data";

const CLONE_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_ID = "00000000-0000-4000-8000-000000000002";
const LIFETIME_WHALE_STARS = 4000;
const MULT = 0.8;

function analytics(clones: { id: string; revenueStars: number }[]): AnalyticsData {
  const revenue = clones.reduce((a, c) => a + c.revenueStars, 0);
  return {
    totals: { revenueStars: revenue, sales: revenue ? 1 : 0 },
    clones: clones.map((c) => ({ ...c, name: c.id, color: "#111", sales: c.revenueStars ? 1 : 0 })),
    byKind: [], byFeature: [], byDay: [], byHour: [], byDow: [], byFlow: [], whaleFans: [], topWeeklySpenders: [],
    byTier: [{ key: "whale", label: "Whale", fans: 2, stars: LIFETIME_WHALE_STARS }],
    weeklySpenderSummary: { buyers: 0, stars: 0, purchases: 0, avgStars: 0 },
    funnel: { avgStarsPerBuyer: 0, medianStarsPerBuyer: 0 },
    paywallFunnel: { paidMessageStars: 0 },
    buyerConversion: { purchaseMix: [] },
  } as unknown as AnalyticsData;
}

const cuts = (entries: [string, CloneCuts][]) => new Map(entries);
const PLATFORM_20 = cuts([[CLONE_ID, { platformPct: 20, agencyCreatorPct: 0 }]]);
const whale = (a: AnalyticsData) => a.byTier.find((t) => t.key === "whale")!.stars;

test("control: the 1M window (with the sale) shows the sale and the lifetime whale tier net of the cut", () => {
  const m = scaleAnalyticsData(analytics([{ id: CLONE_ID, revenueStars: 1000 }]), PLATFORM_20, "creator");
  assert.equal(m.totals.revenueStars, 1000 * MULT);
  assert.equal(whale(m), LIFETIME_WHALE_STARS * MULT);
});

test("F5: the 1D window (no sale) shows the same lifetime whale tier as 1M (never gross)", () => {
  const withSales = scaleAnalyticsData(analytics([{ id: CLONE_ID, revenueStars: 1000 }]), PLATFORM_20, "creator");
  const noSales = scaleAnalyticsData(analytics([{ id: CLONE_ID, revenueStars: 0 }]), PLATFORM_20, "creator");
  assert.equal(noSales.totals.revenueStars, 0, "harness: the 1D window has no sale");
  assert.ok(whale(noSales) <= LIFETIME_WHALE_STARS * MULT,
    `no-sales window shows byTier ${whale(noSales)} > net ${LIFETIME_WHALE_STARS * MULT}; ratio ${whale(noSales) / whale(withSales)} = 1 / the creator multiplier`);
  assert.equal(whale(noSales), whale(withSales));
  // Same window with clones[] empty: the multiplier still comes from the key's resolved cut.
  assert.equal(whale(scaleAnalyticsData(analytics([]), PLATFORM_20, "creator")), LIFETIME_WHALE_STARS * MULT);
});

test("F5: zero gross uses the stacked creator multiplier, and the lowest multiplier across a multi-clone scope", () => {
  const stacked = cuts([[CLONE_ID, { platformPct: 20, agencyCreatorPct: 10 }]]);
  const creator = whale(scaleAnalyticsData(analytics([{ id: CLONE_ID, revenueStars: 0 }]), stacked, "creator"));
  assert.ok(Math.abs(creator - LIFETIME_WHALE_STARS * 0.72) < 1e-6, `stacked creator byTier ${creator}, want ${LIFETIME_WHALE_STARS * 0.72}`);
  const fleet = cuts([[CLONE_ID, { platformPct: 20, agencyCreatorPct: 0 }], [OTHER_ID, { platformPct: 50, agencyCreatorPct: 0 }]]);
  const out = scaleAnalyticsData(analytics([{ id: CLONE_ID, revenueStars: 0 }, { id: OTHER_ID, revenueStars: 0 }]), fleet, "agency");
  assert.equal(whale(out), LIFETIME_WHALE_STARS * 0.5);
  const agencyOnly = scaleAnalyticsData(analytics([{ id: CLONE_ID, revenueStars: 0 }]), stacked, "agency");
  assert.equal(whale(agencyOnly), LIFETIME_WHALE_STARS * MULT, "agency mode, zero gross: platform cut only");
});

test("F5: a clone with no cut entry is never shown gross", () => {
  for (const revenueStars of [1000, 0]) {
    let out: AnalyticsData | undefined;
    try { out = scaleAnalyticsData(analytics([{ id: CLONE_ID, revenueStars }]), cuts([]), "creator"); } catch { /* refused: fail closed */ }
    if (out) {
      assert.ok(out.totals.revenueStars < revenueStars || revenueStars === 0, `revenue ${out.totals.revenueStars} passed gross through`);
      assert.ok(whale(out) < LIFETIME_WHALE_STARS, `byTier ${whale(out)} passed gross through (window gross ${revenueStars})`);
    }
  }
});

test("control: admin and agency semantics unchanged (input stays gross, agency mode takes the platform cut only)", () => {
  const gross = analytics([{ id: CLONE_ID, revenueStars: 1000 }]);
  const both = cuts([[CLONE_ID, { platformPct: 20, agencyCreatorPct: 10 }]]);
  const agency = scaleAnalyticsData(gross, both, "agency");
  assert.equal(agency.totals.revenueStars, 1000 * MULT, "agency mode never stacks the agency-creator cut");
  assert.equal(whale(agency), LIFETIME_WHALE_STARS * MULT);
  // Admins never call scaleAnalyticsData; the gross payload they get must not be mutated by a scaled copy.
  scaleAnalyticsData(gross, both, "creator");
  assert.equal(gross.totals.revenueStars, 1000);
  assert.equal(whale(gross), LIFETIME_WHALE_STARS);
});
