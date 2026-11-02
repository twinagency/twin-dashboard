import assert from "node:assert/strict";
import { readRevenueSections } from "../lib/revenue-sections";
import type { DashboardData } from "../lib/dashboard-data";
import type { AnalyticsData } from "../lib/analytics-data";
async function main() {
  const dashboard = { totals: { stars: 1234 } } as DashboardData;
  const analytics = { totals: { revenueStars: 1234 } } as AnalyticsData;
  const complete = await readRevenueSections(Promise.resolve(dashboard), Promise.resolve(analytics));
  assert.equal(complete.dashboard, dashboard);
  assert.equal(complete.analytics, analytics);
  assert.equal(complete.analyticsError, null);
  const partial = await readRevenueSections(Promise.resolve(dashboard), Promise.reject(new Error("database timeout")));
  assert.equal(partial.dashboard, dashboard, "Keep actual earnings when secondary analytics fail");
  assert.equal(partial.analytics, null, "Unavailable conversion metrics must never become zero");
  assert.ok(partial.analyticsError);
  await assert.rejects(readRevenueSections(Promise.reject(new Error("ledger unavailable")), Promise.resolve(analytics)), /ledger unavailable/);
  await assert.rejects(readRevenueSections(Promise.reject(new Error("ledger unavailable")), Promise.reject(new Error("analytics unavailable"))), /ledger unavailable/);
  console.log("Revenue section checks passed: complete data, partial analysis, ledger failure, combined failure");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
