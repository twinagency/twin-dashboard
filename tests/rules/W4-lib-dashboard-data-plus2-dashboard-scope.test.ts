// RULE (W4 lib-dashboard-data-plus2 C4, C5; holds today, mutation-proven in tests/rules/mutations/W4-lib-dashboard-data-plus2/):
// lib/dashboard-data.ts getDashboard's ledger read.
// C4: a truncated revenue ledger (57014 on page 1000-1999) fails the dashboard; it never publishes page 1 as the total
//     (the analytics sibling, lane-8 F2, does not hold this; the dashboard does, :275).
// C5: `cloneIds` scopes the clones read (id=in.(...)) and every paged ledger read (clone_id=in.(...)); totals follow.
// Real supabase-js against the in-memory PostgREST fake at fetch (tests/support/postgrest-wire.ts, dashboard routes in
// tests/support/dashboard-wire.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { NOW, rowsReply, useWire, type WireRequest } from "../support/postgrest-wire";
import { CLONES, dashboardSale, serveDashboardDefaults, statementTimeout } from "../support/dashboard-wire";
import { A, B } from "../support/ids";
import { harness, outcomeOf } from "../support/outcome";
import { getDashboard } from "../../lib/dashboard-data";

const LEDGER = Array.from({ length: 1500 }, (_, i) => dashboardSale(i, "2026-11-10T00:00:00Z", A));
const wire = useWire((w) => serveDashboardDefaults(w, CLONES, LEDGER));
const filter = (r: WireRequest, column: string) => r.filters.find((f) => f.column === column);
/** Paged ledger reads (selectAllRowsParallel adds offset); excludes the one-row probe and the v2 bundle lookup. */
const ledgerPages = () => wire.calls("GET /rest/v1/star_transactions").filter((r) => r.url.searchParams.has("offset"));

test("C4 control: 1500 sales over two ledger pages total 1500 stars", async () => {
  const d = await getDashboard("1W", undefined, NOW, null);
  assert.equal(d.totals.stars, 1500);
  harness(ledgerPages().some((r) => r.range?.from === 1000), "page 1000-1999 was read");
});

test("C4 a statement timeout on ledger page 1000-1999 fails the dashboard instead of publishing page 1", async () => {
  const pages = rowsReply(LEDGER);
  wire.on("GET /rest/v1/star_transactions", (req) =>
    req.url.searchParams.has("offset") && req.range && req.range.from >= 1000
      ? statementTimeout()
      : pages(req));
  const outcome = await outcomeOf(getDashboard("1W", undefined, NOW, null));
  assert.ok(outcome instanceof Error, outcome instanceof Error ? "" : `resolved with totals.stars ${outcome.totals.stars} of 1500`);
  assert.match(outcome.message, /complete revenue ledger/);
});

const MIXED = [dashboardSale(1, "2026-11-10T00:00:00Z", A, 5), dashboardSale(2, "2026-11-10T00:00:00Z", B, 7)];

test("C5 cloneIds scopes the clones read to id=in.(A) and the page lists only A", async () => {
  serveDashboardDefaults(wire, CLONES, MIXED);
  const d = await getDashboard("1W", undefined, NOW, [A]);
  const reads = wire.calls("GET /rest/v1/clones");
  assert.ok(reads.length >= 1);
  for (const r of reads) assert.deepEqual([filter(r, "id")?.op, filter(r, "id")?.value], ["in", `(${A})`], `clones read ${r.url.search}`);
  assert.deepEqual(d.clones.map((c) => c.id), [A]);
});

test("C5 cloneIds scopes every paged ledger read to clone_id=in.(A) and totals hold only A's stars", async () => {
  serveDashboardDefaults(wire, CLONES, MIXED);
  const d = await getDashboard("1W", undefined, NOW, [A]);
  const pages = ledgerPages();
  assert.ok(pages.length >= 1);
  for (const r of pages) assert.deepEqual([filter(r, "clone_id")?.op, filter(r, "clone_id")?.value], ["in", `(${A})`], `ledger read ${r.url.search}`);
  assert.equal(d.totals.stars, 5);
});
