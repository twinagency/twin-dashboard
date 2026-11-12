/**
 * KNOWN RED (W4 lib-api-public-v2-plus6 F31; docs/review/W4/lib-api-public-v2-plus6.md): lib/api-sim.ts simRevenue is
 * documented as "DETERMINISTIC BY SEED. The same ?seed= gives the same data every time, so a screenshot, a bug report
 * and a test all refer to the same numbers" (lib/api-sim.ts:19-21; app/api/admin/v1/sim/revenue/route.ts:16-17 "the
 * same seed is the same model every time"), but the route passes Date.now() and the weekend factor comes from the
 * calendar day of `nowMs`, which shifts the rng stream: the same seed and period give a different total tomorrow.
 * Pure, no wire. Control: same seed + same nowMs is deep-equal. Red: same seed + same period, nowMs one day apart, must
 * give the same totals.revenueStars. If the owner instead decides "same seed, same day" is the contract, the fix is a
 * comment change on both files and this test moves with a TEST-CHANGE line.
 * Team's Claude owns the fix. Not wired into npm scripts on purpose.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { simRevenue } from "../../lib/api-sim";

const SEED = 42;
const NOW = Date.parse("2026-11-12T12:00:00.000Z");
const DAY = 86_400_000;

test("control: same seed and same instant give identical data", () => {
  assert.deepEqual(simRevenue(SEED, "1M", NOW), simRevenue(SEED, "1M", NOW));
});

test("F31: same seed and period one day later give the same revenue total", () => {
  const today = simRevenue(SEED, "1M", NOW).totals.revenueStars;
  const tomorrow = simRevenue(SEED, "1M", NOW + DAY).totals.revenueStars;
  assert.equal(tomorrow, today, `seed ${SEED}, period 1M: ${today} today vs ${tomorrow} a day later`);
});
