import "../support/admin-route-env";
/**
 * KNOWN RED (W4 lib-api-public-v2-plus6 F8; docs/review/W4/lib-api-public-v2-plus6.md). MONEY.
 * NEEDS OWNER DECISION on which net model is authoritative: the creator dashboard's (own row, row rate) or the public
 * API's (stacked agency-creator cut, STAR_USD); both are plausible from the code comments (`lib/platform-cut.ts:12-17`
 * vs `:236-238`). The red asserts the two agree and is neutral to the ruling (it compares publicRevenue to the runtime
 * getViewerTerms result); the control pins today's dashboard terms (0.9 @ 0.02). If the owner picks the API model,
 * change the control's expected values to 0.72 @ STAR_USD (fix lands in creatorTerms).
 *
 * Same creator, same clone, two "net" figures:
 * - creator dashboard: `app/creator/layout.tsx:25` `withDashboardAccess(creator, () => getViewerTerms())` →
 *   `lib/platform-cut.ts` creatorTerms: the clone's OWN platform_cuts row only (no agency fallback, no stacked
 *   agency-creator cut), and that row's `usd_per_star`. `lib/payouts/access.ts:29` uses the same terms for payouts.
 * - /api/v1/revenue with a clone key: `lib/api-public.ts:170-172` publicRevenue → resolveCloneCuts → platform cut
 *   (with agency fallback) stacked with agency_creator_cuts, converted at fixed STAR_USD (projectRevenue's
 *   usdPerStar param is never passed).
 * Fixture (PostgREST faked at the wire, tests/support/admin-wire.ts): platform_cuts clone row cut 10%, usd_per_star
 * 0.02; agency_creators links the clone to AGENCY_ID; agency_creator_cuts 20% for it; one 100★ sale 3 days ago.
 * Control: the dashboard terms for that creator are { starMult 0.9, usdPerStar 0.02 } (driven through the real
 * getViewerTerms inside withDashboardAccess, no lib edit). Red: publicRevenue(clone, 1M) reports 100 × 0.9 = 90★ and
 * 90 × 0.02 = $1.80 (today: 72★ and 72 × STAR_USD).
 * Team's Claude owns the fix. Not wired into npm scripts on purpose.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { AGENCY_ID, CLONE_ID, EMPTY_ROLLUP_RPCS, installWire, type Row } from "../support/admin-wire";
import { analyticsTables, cutTables } from "../support/W4-lib-api-public-v2-plus6-extras";
import { publicRevenue } from "../../lib/api-public";
import { getViewerTerms, invalidateCutCache } from "../../lib/platform-cut";
import { withDashboardAccess } from "../../lib/dashboard-access";
import type { CreatorDashboardIdentity } from "../../lib/creator-dashboard-identity";

const GROSS = 100;
const RATE = 0.02;
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// The creator identity shape lib/creator-dashboard-identity.ts builds (kind "creator", one linked clone).
const creator: CreatorDashboardIdentity = {
  id: "creator:acct-1", kind: "creator", name: "Fake Agency", cloneIds: [CLONE_ID], accountId: "acct-1", userId: "user-1",
  creatorName: "Fake Creator", onboarded: true, readOnly: false, agencyId: AGENCY_ID,
};

const sale: Row = { id: "s-1", clone_id: CLONE_ID, amount_stars: GROSS, paid_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  kind: "photo", feature: "photo", telegram_id: 7, invoice_payload: "fake-payload-s-1", imported_from: null };

function wire() {
  invalidateCutCache();
  return installWire({
    tables: { ...analyticsTables([sale]), ...cutTables({ platformPct: 10, usdPerStar: RATE, agencyCreatorPct: 20, agencyId: AGENCY_ID }) },
    rpc: { ...EMPTY_ROLLUP_RPCS },
  });
}

async function dashboardTerms() {
  const w = wire();
  try { return await withDashboardAccess(creator, () => getViewerTerms()); } finally { w.restore(); }
}

test("control: the creator dashboard terms for the clone are its own row, multiplier 0.9 at 0.02 per star", async () => {
  const t = await dashboardTerms();
  assert.ok(close(t.starMult, 0.9), `starMult ${t.starMult}`);
  assert.equal(t.usdPerStar, RATE);
});

test("F8: publicRevenue for a clone key reports the same net as that creator's dashboard (gross × 0.9, × 0.02)", async () => {
  const t = await dashboardTerms();
  const w = wire();
  try {
    const r = await publicRevenue(CLONE_ID, "1M");
    assert.equal(r.totals.sales, 1, "harness: the one sale is in the 1M window");
    const stars = GROSS * t.starMult;
    assert.ok(close(r.totals.revenueStars, stars),
      `revenueStars ${r.totals.revenueStars} vs dashboard ${stars} (gross ${GROSS} × ${t.starMult})`);
    assert.ok(close(r.totals.revenueUsd, stars * t.usdPerStar),
      `revenueUsd ${r.totals.revenueUsd} vs dashboard ${stars * t.usdPerStar} (rate ${t.usdPerStar})`);
  } finally { w.restore(); }
});
