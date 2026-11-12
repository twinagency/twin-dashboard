// KNOWN RED (W5 lib-revenue-why-changed-plus2, findings F3 F8; docs/review/W5/lib-revenue-why-changed-plus2.md).
// lib/revenue-window.ts resolveRevenueWindow, the "one window definition for every revenue surface", against a fake
// PostgREST at the fetch wire (admin access).
//   F3 (= W4 lane 8 O2, handed here): the ALL lookup drops its error and silently becomes a 180-day window under ALL.
//   F8 CUSTOM without a range falls through to the ALL ledger lookup and is served as all-time revenue.
// What holds today (ALL starts at the earliest payment) is characterized in
// tests/rules/W5-lib-revenue-why-changed-plus2-revenue-rules.test.ts, not here.
// Team's Claude owns the fixes. Not wired into npm scripts; run like init.sh's known-red loop.
import assert from "node:assert/strict";
import test from "node:test";
import { query, TIMEOUT, withWire, type Handler, type WireResponse } from "../rules/W5-lib-revenue-why-changed-plus2-wire";
import { withDashboardAccess } from "../../lib/dashboard-access";
import { resolvePresetRevenueWindow, resolveRevenueWindow } from "../../lib/revenue-window";
import { reportDayStartMs, shiftReportDay } from "../../lib/revenue-why-changed";
import { reportInstant } from "../../lib/report-time";

const NOW = Date.parse("2026-11-12T23:30:00Z"); // 10:30 AEDT on 13 Nov
const LEDGER = [{ paid_at: "2025-03-04T05:06:07.000Z" }, { paid_at: "2026-01-02T03:04:05.000Z" }];
const ledger = (out?: WireResponse): Handler => ({ path, method, url }) =>
  path === "star_transactions" && method === "GET" ? out ?? { status: 200, json: query(LEDGER, url) } : undefined;
const resolve = (h: Handler, period: Parameters<typeof resolveRevenueWindow>[0]) =>
  withWire(h, () => withDashboardAccess(null, () => resolveRevenueWindow(period, undefined, NOW)));

test("control: 1M is 30 Sydney calendar days ending now; ALL through the fake resolves", async () => {
  const today = reportInstant(new Date(NOW)).dayKey;
  assert.deepEqual(resolvePresetRevenueWindow("1M", NOW), { startMs: reportDayStartMs(shiftReportDay(today, -29)), endMs: NOW });
  assert.equal((await resolve(ledger(), "ALL")).endMs, NOW);
});

test("F3: a failed ALL lookup is an error, not a 180-day window labelled ALL", async () => {
  await assert.rejects(
    resolve(ledger(TIMEOUT), "ALL"),
    "a timeout on the earliest-payment lookup must not become 180 days of revenue presented as all time",
  );
});

test("F8: CUSTOM without a range is refused, not served as all-time revenue", async () => {
  let ledgerRead = false;
  const h: Handler = (req) => {
    if (req.path === "star_transactions") ledgerRead = true;
    return ledger()(req);
  };
  const outcome = await resolve(h, "CUSTOM").then((w) => w, (e: unknown) => e);
  assert.ok(outcome instanceof Error && !ledgerRead, `CUSTOM with no range resolved to ${JSON.stringify(outcome)} (ledger read: ${ledgerRead})`);
});
