// KNOWN RED (W4 lib-analytics-data-plus4 F5, docs/review/W4/lib-analytics-data-plus4.md): lib/analytics-data.ts byDay
// starts at the CONTAINER clock's midnight (setHours(0,0,0,0)) and counts ceil(span)+1 fixed 24h steps, while the rows
// are keyed by REPORT_TZ day. 1W at 2026-11-12T05:00Z (Sydney Nov 12 16:00) charts 9 bars Nov 5..Nov 13 for the
// Nov 6..Nov 12 window: one day before the window and one in the future, both as zero-revenue "measurements" that also
// leave the building through /api/v1/revenue byDay. Team's Claude owns the fix.
// Intended runner: init.sh's known-red loop (init.sh:54-56); not wired yet: orchestrator item.
//
// CLOCK: prod runs with no TZ (UTC). This file pins process.env.TZ = "UTC" itself (measured: Node 23 honours a runtime
// TZ assignment), so init.sh's `env -i PATH HOME NODE_ENV=test` command needs nothing extra; adding TZ=UTC to it is
// equivalent (both measured). The first control measures the effective offset and fails loud if the pin did not take.
// REPORT_TZ is lib/report-time.ts's NEXT_PUBLIC_REPORT_TIMEZONE, default Australia/Sydney; the control asserts it.
// Measured with the Mac's own zone (Europe/Ljubljana, pin removed): also 9 bars Nov 5..Nov 13.
process.env.TZ = "UTC";
import assert from "node:assert/strict";
import { test } from "node:test";
import { NOW, oneStarRow, serveAnalyticsDefaults, useWire } from "../support/postgrest-wire";
import { getAnalytics } from "../../lib/analytics-data";
import { REPORT_TZ } from "../../lib/report-time";

// One 1-star sale at Sydney noon (01:00Z, AEDT +11) on each day Nov 5..Nov 13: the seven window days Nov 6..Nov 12,
// plus the day before the window and the day after now, which the window filters must exclude.
const LEDGER = Array.from({ length: 9 }, (_, i) => oneStarRow(i, `2026-11-${String(5 + i).padStart(2, "0")}T01:00:00Z`));
useWire((w) => serveAnalyticsDefaults(w, LEDGER));
const run = () => getAnalytics("1W", null, undefined, { includeCost: false }, NOW);

test("control: container clock is UTC and REPORT_TZ is Australia/Sydney", () => {
  assert.equal(process.env.TZ, "UTC");
  assert.equal(new Date(NOW).getTimezoneOffset(), 0, "TZ pin did not take; byDay expectations below assume UTC");
  assert.equal(REPORT_TZ, "Australia/Sydney");
});

test("control: the window holds exactly the seven in-window sales", async () => {
  const a = await run();
  assert.equal(a.totals.revenueStars, 7);
});

test("F5: 1W ending Sydney Nov 12 charts exactly Nov 6..Nov 12, one star per day", async () => {
  const a = await run();
  const labels = a.byDay.map((d) => d.label);
  const all = a.byDay.map((d) => `${d.label}=${d.stars}`).join(", ");
  assert.equal(a.byDay.length, 7, `${a.byDay.length} bars for a 7-day window: ${all}`);
  assert.match(labels[0], /^Nov 6\b/, all);
  assert.match(labels[labels.length - 1], /^Nov 12\b/, all);
  for (const d of a.byDay) assert.equal(d.stars, 1, `bar ${d.label}: ${all}`);
  assert.equal(a.byDay.reduce((s, d) => s + d.stars, 0), a.totals.revenueStars);
});
