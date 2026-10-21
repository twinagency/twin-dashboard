// ── Checks that every named Revenue period means the same timestamps ─────────
//
// The Revenue page combines chart/headline data with deeper analytics. A
// calendar-month chart beside a rolling-30×24h conversation funnel is not one
// report, even if both controls say "1M". These stay offline so the boundary
// rule is protected without a live Supabase connection.

import { readFileSync } from "node:fs";
import { resolvePresetRevenueWindow } from "../lib/revenue-window";
import { reportDayStartMs, shiftReportDay } from "../lib/revenue-why-changed";
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

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

console.log("revenue window consistency\n");

check("W1 multi-day presets use Sydney calendar-day starts", () => {
  const now = Date.parse("2026-08-28T02:15:00.000Z"); // 12:15 PM Sydney
  const month = resolvePresetRevenueWindow("1M", now);
  assert(month, "1M must resolve to a window");
  equal(month.endMs, now, "1M window end");
  equal(reportInstant(new Date(month.startMs)).dayKey, "2026-07-30", "1M first Sydney date");
  equal(month.startMs, reportDayStartMs("2026-07-30"), "1M begins at Sydney midnight");
});

check("W2 the calendar rule survives Sydney's 23-hour DST-start day", () => {
  const now = Date.parse("2026-10-04T13:30:00.000Z"); // Oct 5, 12:30 AM AEDT
  const week = resolvePresetRevenueWindow("1W", now);
  assert(week, "1W must resolve to a window");
  const today = reportInstant(new Date(now)).dayKey;
  const expectedFirst = shiftReportDay(today, -6);
  equal(reportInstant(new Date(week.startMs)).dayKey, expectedFirst, "seven named report dates, not 7×24h");
  equal(week.startMs, reportDayStartMs(expectedFirst), "DST week begins at Sydney midnight");
});

check("W3 1D stays a rolling 24-hour operational window", () => {
  const now = Date.parse("2026-10-04T13:30:00.000Z");
  const day = resolvePresetRevenueWindow("1D", now);
  assert(day, "1D must resolve to a window");
  equal(day.endMs - day.startMs, 24 * 60 * 60 * 1000, "1D duration");
});

check("W4 explicit custom dates pass through unchanged and ALL requests one shared earliest lookup", () => {
  const explicit = { startMs: 101, endMs: 202 };
  equal(resolvePresetRevenueWindow("CUSTOM", 999, explicit), explicit, "custom range identity");
  equal(resolvePresetRevenueWindow("ALL", 999), null, "ALL defers to one ledger lookup");
});

check("W5 dashboard, analytics, and cache all use the shared resolver", () => {
  const dashboard = source("lib/dashboard-data.ts");
  const analytics = source("lib/analytics-data.ts");
  const cache = source("lib/revenue-cache.ts");
  assert(/resolveRevenueWindow\(/.test(dashboard), "dashboard must resolve the shared window");
  assert(/resolveRevenueWindow\(/.test(analytics), "analytics must resolve the shared window");
  assert(/const sharedRange = await resolveRevenueWindow\(/.test(cache), "cache must resolve once for both halves");
  assert(/getDashboard\(period, sharedRange, nowMs(?:,|\))/.test(cache), "dashboard must receive the shared range");
  assert(/getAnalytics\(period, cloneId, sharedRange, undefined, nowMs\)/.test(cache), "analytics must receive the shared range");
});

console.log(`\n  ${passed} passed`);
for (const failure of failures) console.error(`  ✗ ${failure}`);
console.log(failures.length === 0 ? "\nALL PASS" : `\n${failures.length} FAILURE(S)`);
process.exit(failures.length === 0 ? 0 : 1);
