// Offline: net-at-the-source scaling (lib/agency-scale.ts) and the viewer-terms math.
import assert from "node:assert/strict";
import { scaleTableBody, scaleRpcBody, isMappedRollup, RPC_STAR_FIELDS } from "../lib/agency-scale";
import { AGENCY_ROLLUPS } from "../lib/agency-query";
import { computeStarMult, normalizeUsdPerStar, applyStackedCut, DEFAULT_USD_PER_STAR } from "../lib/platform-cut";

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok ${name}`); } catch (e) { failures.push(`${name}\n   ${e instanceof Error ? e.message : e}`); }
}

check("S1 table rows: earned stars halve, prices and counts untouched", () => {
  const tx = scaleTableBody("star_transactions", [{ id: 1, amount_stars: 200, paid_at: "x", kind: "media" }], 0.5) as any[];
  assert.equal(tx[0].amount_stars, 100);
  assert.equal(tx[0].id, 1);
  const users = scaleTableBody("users", [{ telegram_id: 5, total_spent_stars: 300, purchase_count: 4 }], 0.5) as any[];
  assert.equal(users[0].total_spent_stars, 150);
  assert.equal(users[0].purchase_count, 4);
  const bundles = scaleTableBody("photo_bundles", [{ star_price: 500 }], 0.5) as any[];
  assert.equal(bundles[0].star_price, 500);
  const photos = scaleTableBody("photos", [{ star_value: 50 }], 0.5) as any[];
  assert.equal(photos[0].star_value, 50);
  const clones = scaleTableBody("clones", [{ credit_pack_price_stars: 100, tip_max_stars: 999, spend_tier_whale_stars: 5000 }], 0.5) as any[];
  assert.deepEqual(clones[0], { credit_pack_price_stars: 100, tip_max_stars: 999, spend_tier_whale_stars: 5000 });
});

check("S2 single-object bodies and null values are handled", () => {
  assert.equal((scaleTableBody("users", { total_spent_stars: 10 }, 0.5) as any).total_spent_stars, 5);
  assert.equal((scaleTableBody("users", { total_spent_stars: null }, 0.5) as any).total_spent_stars, null);
});

check("S3 RPC bodies: scalar and mapped fields halve, counts stay", () => {
  assert.equal(scaleRpcBody("revenue_all_time_stars", 1000, 0.5), 500);
  const spend = scaleRpcBody("revenue_fan_spend_stats", [{ fans: 10, buyers: 4, repeat_buyers: 2, one_time: 2, three_plus: 1, total_purchases: 9, repeat_buyer_stars: 400, lifetime_stars: "1000", median_buyer_stars: 60 }], 0.5) as any[];
  assert.equal(spend[0].repeat_buyer_stars, 200);
  assert.equal(spend[0].lifetime_stars, 500);
  assert.equal(spend[0].median_buyer_stars, 30);
  assert.equal(spend[0].fans, 10);
  assert.equal(spend[0].total_purchases, 9);
  const tiers = scaleRpcBody("revenue_fan_tiers", [{ tier: "whale", fans: 3, stars: 800 }], 0.5) as any[];
  assert.deepEqual(tiers[0], { tier: "whale", fans: 3, stars: 400 });
  const counts = [{ clone_id: "a", fans: 5, active: 2, messages: 9, buyers: 1 }];
  assert.deepEqual(scaleRpcBody("revenue_clone_user_stats", counts, 0.5), counts);
});

check("S4 every AGENCY_ROLLUPS entry is mapped; an unmapped one throws (fail closed)", () => {
  for (const fn of AGENCY_ROLLUPS) assert.ok(isMappedRollup(fn), `${fn} has no star-field map`);
  for (const fn of Object.keys(RPC_STAR_FIELDS)) assert.ok(AGENCY_ROLLUPS.has(fn), `${fn} mapped but not an allowed rollup`);
  assert.equal(isMappedRollup("revenue_brand_new"), false);
  assert.equal(isMappedRollup("toString"), false);
  assert.throws(() => scaleRpcBody("revenue_brand_new", [], 0.5), /No star-field map/);
});

check("S5 starMult 1 is the identity", () => {
  const rows = [{ amount_stars: 7 }];
  assert.deepEqual(scaleTableBody("star_transactions", rows, 1), rows);
});

check("T1 stacked math: (1-p)(1-a), platform first, matches applyStackedCut", () => {
  assert.ok(Math.abs(computeStarMult(20, 15) - 0.68) < 1e-12);
  assert.ok(Math.abs(computeStarMult(20, 15) * 1000 - applyStackedCut(1000, 20, 15)) < 1e-9);
  assert.equal(computeStarMult(0, 0), 1);
});

check("T2 usdPerStar default and range", () => {
  assert.equal(DEFAULT_USD_PER_STAR, 0.013);
  assert.equal(normalizeUsdPerStar(null), 0.013);
  assert.equal(normalizeUsdPerStar(undefined), 0.013);
  assert.equal(normalizeUsdPerStar("0.009"), 0.009);
  assert.equal(normalizeUsdPerStar(0.09), 0.09);
  assert.equal(normalizeUsdPerStar(0.001), 0.001);
  assert.equal(normalizeUsdPerStar(0.0005), 0.013);
  assert.equal(normalizeUsdPerStar(0.5), 0.013);
  assert.equal(normalizeUsdPerStar(NaN), 0.013);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
