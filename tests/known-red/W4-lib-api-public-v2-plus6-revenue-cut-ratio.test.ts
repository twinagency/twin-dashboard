import "../support/admin-route-env";
/**
 * KNOWN RED (W4 lib-api-public-v2-plus6 F5; docs/review/W4/lib-api-public-v2-plus6.md): cut disclosure on
 * /api/v1/revenue. Drives the REAL lib/api-public.ts publicRevenue (real getAnalytics in lib/analytics-data.ts, real
 * rollup RPC wrappers, real cut lookup through lib/platform-cut.ts, real scaleAnalyticsData + projectRevenue) with
 * PostgREST faked at the wire (tests/support/admin-wire.ts). The wiring is MEASURED here: getAnalytics puts the key's
 * one clone in clones[] with revenueStars 0 for a window without sales, and byTier comes from the lifetime
 * `revenue_fan_tiers` RPC whatever the window.
 * scaleAnalyticsData scales every breakdown by the window's net/gross ratio; a window with zero gross falls back to
 * ratio 1, so the lifetime byTier leaves GROSS, while a window with a sale leaves it NET. A clone key comparing a
 * window without sales (period=1D) with one that has a sale (period=1M) divides out its exact cut.
 * Fixture: platform cut 20% (creator multiplier 0.8), one 1000-Star sale three days ago (inside 1M, outside 1D),
 * `revenue_fan_tiers` = one lifetime whale tier of 4000 Stars; every other rollup RPC answers "no rows".
 * Control: the 1M window (with the sale) shows byTier = 4000 x 0.8. Red: the 1D window (no sale) must show the same,
 * and never more than gross x the clone multiplier.
 * Team's Claude owns the fix. Not wired into npm scripts on purpose.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CLONE_ID, EMPTY_ROLLUP_RPCS, installWire, type Row } from "../support/admin-wire";
import { analyticsTables, cutTables } from "../support/W4-lib-api-public-v2-plus6-extras";
import { publicRevenue } from "../../lib/api-public";
import { invalidateCutCache } from "../../lib/platform-cut";
import type { Period } from "../../lib/dashboard-data";

const LIFETIME_WHALE_STARS = 4000;
const MULT = 0.8;

const sale: Row = { id: "s-1", clone_id: CLONE_ID, amount_stars: 1000, paid_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  kind: "photo", feature: "photo", telegram_id: 7, invoice_payload: "fake-payload-s-1", imported_from: null };

async function whaleTierStars(period: Period): Promise<{ tier: number; revenue: number }> {
  invalidateCutCache();
  const w = installWire({
    tables: { ...analyticsTables([sale]), ...cutTables(20) },
    rpc: { ...EMPTY_ROLLUP_RPCS, revenue_fan_tiers: () => [{ tier: "whale", fans: 2, stars: LIFETIME_WHALE_STARS }] },
  });
  try {
    const r = await publicRevenue(CLONE_ID, period);
    const whale = r.byTier.find((t) => t.key === "whale");
    assert.ok(whale, `harness: the lifetime whale tier is in byTier (${JSON.stringify(r.byTier)})`);
    return { tier: whale.stars, revenue: r.totals.revenueStars };
  } finally { w.restore(); }
}

test("control: the 1M window (with the sale) shows the sale and the lifetime whale tier net of the cut", async () => {
  const m = await whaleTierStars("1M");
  assert.equal(m.revenue, 1000 * MULT);
  assert.equal(m.tier, LIFETIME_WHALE_STARS * MULT);
});

test("F5: the 1D window (no sale) shows the same lifetime whale tier as 1M (never gross)", async () => {
  const withSales = await whaleTierStars("1M");
  const noSales = await whaleTierStars("1D");
  assert.equal(noSales.revenue, 0, "harness: the 1D window has no sale");
  assert.ok(noSales.tier <= LIFETIME_WHALE_STARS * MULT,
    `no-sales window shows byTier ${noSales.tier} > net ${LIFETIME_WHALE_STARS * MULT}; ratio ${noSales.tier / withSales.tier} = 1 / the creator multiplier`);
  assert.equal(noSales.tier, withSales.tier);
});
