// W5 lib-revenue-why-changed-plus2, findings F3 F8 (docs/review/W5/lib-revenue-why-changed-plus2.md).
// lib/revenue-window.ts resolveRevenueWindow, the "one window definition for every revenue surface", against a fake
// PostgREST at the fetch wire (tests/support/postgrest-wire.ts, admin access).
//   F3 (= W4 lane 8 O2, handed here): the ALL lookup drops its error and silently becomes a 180-day window under ALL.
//   F8 CUSTOM without a range falls through to the ALL ledger lookup and is served as all-time revenue.
// Control: ALL starts at the earliest payment; a genuinely empty ledger keeps the 180-day fallback.
// Fixed: both throw (F8 before any ledger read); callers turn the throw into a 5xx or their existing error state.
import "../support/admin-route-env"; // fake Supabase env + server-only shim, before any lib/* module loads
import assert from "node:assert/strict";
import test from "node:test";
import { installWire, json, statementTimeout, type WireCall } from "../support/postgrest-wire";
import { withDashboardAccess } from "../../lib/dashboard-access";
import { resolvePresetRevenueWindow, resolveRevenueWindow } from "../../lib/revenue-window";
import { reportDayStartMs, shiftReportDay } from "../../lib/revenue-why-changed";
import { reportInstant } from "../../lib/report-time";

const NOW = Date.parse("2026-11-12T23:30:00Z"); // 10:30 AEDT on 13 Nov
const LEDGER = [{ paid_at: "2025-03-04T05:06:07.000Z" }, { paid_at: "2026-01-02T03:04:05.000Z" }]; // ascending
type Handler = (c: WireCall) => Response | undefined;
// Models only the earliest-payment read (order=paid_at.asc&limit=1); any other shape is unmodelled and fails loud.
const earliest = (u: URL) => u.searchParams.get("order") === "paid_at.asc" && u.searchParams.get("limit") === "1";
const ledger = (out?: () => Response): Handler => ({ table, method, url }) =>
  table === "star_transactions" && method === "GET" && earliest(url) ? out?.() ?? json(LEDGER.slice(0, 1)) : undefined;
const TIMEOUT = statementTimeout;
async function resolve(h: Handler, period: Parameters<typeof resolveRevenueWindow>[0]) {
  const wire = installWire(h);
  try { return await withDashboardAccess(null, () => resolveRevenueWindow(period, undefined, NOW)); } finally { wire.restore(); }
}

test("control: 1M is 30 Sydney calendar days ending now; ALL through the fake resolves", async () => {
  const today = reportInstant(new Date(NOW)).dayKey;
  assert.deepEqual(resolvePresetRevenueWindow("1M", NOW), { startMs: reportDayStartMs(shiftReportDay(today, -29)), endMs: NOW });
  assert.equal((await resolve(ledger(), "ALL")).endMs, NOW);
});

test("control: an empty ledger (a successful read of no rows) keeps the 180-day ALL fallback", async () => {
  assert.equal((await resolve(ledger(() => json([])), "ALL")).startMs, NOW - 180 * 86_400_000);
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
    if (req.table === "star_transactions") ledgerRead = true;
    return ledger()(req);
  };
  const outcome = await resolve(h, "CUSTOM").then((w) => w, (e: unknown) => e);
  assert.ok(outcome instanceof Error && !ledgerRead, `CUSTOM with no range resolved to ${JSON.stringify(outcome)} (ledger read: ${ledgerRead})`);
});
