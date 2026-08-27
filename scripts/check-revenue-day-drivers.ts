// ── Checks for the Earnings "What drove this day?" card ─────────────────────
// Run: npm run test:drivers
//
// These checks intentionally stay offline. The card's purpose is to make a
// surprising number explainable, so its most important guarantees should not
// depend on a live database being available when CI runs.

import { aggregateRevenueDay, reportDayStartMs, shiftReportDay } from "../lib/revenue-why-changed";
import { reportInstant } from "../lib/report-time";

let passed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push(`${name}\n      ${error instanceof Error ? error.message : String(error)}`);
  }
}

function equal(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const purchase = (
  id: string,
  cloneId: string,
  telegramId: number | null,
  stars: number,
  feature: string,
  adjustment = false,
) => ({ id, cloneId, telegramId, stars, paidAt: "2026-08-25T00:00:00.000Z", feature, adjustment });

console.log("revenue day drivers\n");

check("D1 one fan paying two clones is one fleet buyer", () => {
  const day = aggregateRevenueDay(
    [
      purchase("a", "alana", 101, 6_000, "tip"),
      purchase("b", "sasha", 101, 4_000, "photo"),
      purchase("c", "alana", 202, 500, "credits"),
    ],
    null,
  );
  equal(day.totals.buyers, 2, "fleet buyer count");
  const top = [...day.buyers.values()].sort((a, b) => b.stars - a.stars)[0];
  equal(top.telegramId, 101, "top buyer identity");
  equal(top.stars, 10_000, "top buyer totals payments across clones");
  equal(top.byClone.size, 2, "top buyer retains clone context");
});

check("D2 refunds change net proceeds but never become a sale or a largest payment", () => {
  const day = aggregateRevenueDay([
    purchase("payment", "alana", 101, 1_000, "tip"),
    purchase("refund", "alana", 101, -400, "refund", true),
  ]);
  equal(day.totals.stars, 600, "net proceeds");
  equal(day.totals.grossPaymentStars, 1_000, "incoming payment volume");
  equal(day.totals.refundStars, 400, "refund amount");
  equal(day.totals.sales, 1, "refund is not a sale");
  equal(day.totals.buyers, 1, "refund is not a second buyer");
  equal(day.largestPayment?.id, "payment", "largest payment ignores refund");
  equal(day.features.get("refund")?.stars, -400, "refund remains visible in the net ledger mix");
});

check("D3 day boundaries use the report timezone through both DST changes", () => {
  for (const key of ["2026-04-05", "2026-10-04"]) {
    const start = reportDayStartMs(key);
    equal(reportInstant(new Date(start)).dayKey, key, `${key} local date at its start`);
    equal(reportInstant(new Date(start - 1)).dayKey, shiftReportDay(key, -1), `${key} previous millisecond belongs to prior day`);
  }
  equal(reportDayStartMs("2026-10-05") - reportDayStartMs("2026-10-04"), 23 * 60 * 60 * 1000, "Sydney DST-start day length");
  equal(reportDayStartMs("2026-04-06") - reportDayStartMs("2026-04-05"), 25 * 60 * 60 * 1000, "Sydney DST-end day length");
});

check("D4 date shifts keep calendar days instead of adding 24 UTC hours", () => {
  equal(shiftReportDay("2028-03-01", -1), "2028-02-29", "leap day");
  equal(shiftReportDay("2026-01-01", -1), "2025-12-31", "year boundary");
});

console.log(`\n  ${passed} passed`);
for (const failure of failures) console.error(`  ✗ ${failure}`);
console.log(failures.length === 0 ? "\nALL PASS" : `\n${failures.length} FAILURE(S)`);
process.exit(failures.length === 0 ? 0 : 1);
