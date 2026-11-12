// KNOWN RED (W4 lib-dashboard-data-plus2 F22, F24, F25, F28, F29, docs/review/W4/lib-dashboard-data-plus2.md):
// lib/dashboard-data.ts getDashboard publishes wrong figures from complete data.
// F22: summary mode cuts the fleet list to 300 BEFORE filtering to overviewCloneId, so a quiet clone's sale vanishes.
// F24: unattributed usage rows (clone_id null) add their cost but `continue` before their errors are counted.
// F25: usage totals ignore `cloneIds`: a read scoped to clone A reports A+B's cost and AI errors.
// F28: 1D hourly buckets start at now-24h, not on an hour, so a 16:10 sale is drawn under the "3 PM" label at hh:27.
// F29: buildBuckets enumerates report days with no cap: a 50-year custom range builds ~18.5k buckets before any query.
// Real supabase-js against the in-memory PostgREST fake at fetch (tests/support/postgrest-wire.ts, dashboard routes in
// tests/support/dashboard-wire.ts); any other host
// throws, any unmodelled request answers 599 and crashes the test (plain Error, not a red). Team's Claude owns the fix.
// Intended runner: init.sh's known-red loop; not wired yet: orchestrator item.
import assert from "node:assert/strict";
import { test } from "node:test";
import { NOW, useWire } from "../support/postgrest-wire";
import { CLONES, dashboardSale, serveDashboardDefaults, usageRollupReply } from "../support/dashboard-wire";
import { A, B } from "../support/ids";
import { harness, outcomeOf } from "../support/outcome";
import { getDashboard } from "../../lib/dashboard-data";
import { REPORT_TZ } from "../../lib/report-time";

const wire = useWire((w) => serveDashboardDefaults(w, CLONES, []));
const serveLedger = (rows: Record<string, unknown>[]) => serveDashboardDefaults(wire, CLONES, rows);

/** Summary mode's cut of the fleet's newest sales (lib/dashboard-data.ts `.slice(0, 300)` before the clone filter). */
const RECENT_CAP = 300;

/** `n` B sales, one second apart, all newer than A's single sale on Nov 10. */
function quietCloneLedger(n: number) {
  const bSales = Array.from({ length: n }, (_, i) => dashboardSale(i, new Date(Date.parse("2026-11-11T00:00:00Z") + i * 1000).toISOString(), B));
  return [...bSales, dashboardSale(9000, "2026-11-10T00:00:00Z", A)];
}

test(`control: summary for clone A shows A's sale when it is inside the ${RECENT_CAP} newest fleet sales`, async () => {
  serveLedger(quietCloneLedger(10));
  const d = await getDashboard("1W", undefined, NOW, null, { overviewCloneId: A });
  assert.deepEqual(d.recent.map((r) => r.cloneId), [A]);
});

test(`F22 summary for clone A keeps A's sale beyond the fleet's ${RECENT_CAP} newest sales`, async () => {
  serveLedger(quietCloneLedger(RECENT_CAP));
  const d = await getDashboard("1W", undefined, NOW, null, { overviewCloneId: A });
  harness(d.perClone[A]?.sales === 1, `A's sale is in the ledger (perClone[A].sales ${d.perClone[A]?.sales})`);
  assert.ok(d.recent.some((r) => r.cloneId === A), `recent has ${d.recent.length} rows, none for clone A (A has 1 sale in the window)`);
});

test("control: attributed usage rows count their cost and AI errors", async () => {
  wire.on("POST /rest/v1/rpc/revenue_usage_rollup", usageRollupReply([{ clone_id: A, cost_usd: 2, calls: 4, errors: 2 }]));
  const d = await getDashboard("1W", undefined, NOW, null);
  assert.equal(d.totals.costUsd, 2);
  assert.equal(d.totals.aiErrors, 2);
  assert.equal(d.perClone[A].aiErrors, 2);
});

test("F24 unattributed usage rows count their AI errors in totals, like their cost", async () => {
  wire.on("POST /rest/v1/rpc/revenue_usage_rollup", usageRollupReply([
    { clone_id: null, cost_usd: 1, calls: 5, errors: 3 },
    { clone_id: A, cost_usd: 2, calls: 4, errors: 2 },
  ]));
  const d = await getDashboard("1W", undefined, NOW, null);
  harness(d.totals.costUsd === 3, `unattributed cost is counted (totals.costUsd ${d.totals.costUsd})`);
  assert.equal(d.totals.aiErrors, 5, `totals.aiErrors ${d.totals.aiErrors}: the 3 unattributed errors vanished`);
});

test("F25 a read scoped to clone A reports only A's usage cost and AI errors", async () => {
  // The fake honours p_clone only, as revenue_usage_rollup(p_start, p_end, p_clone) does (lib/rollup.ts usageRollup); any
  // other argument (p_clones exists only on the agency_* rewrite, lib/agency-fetch.ts) answers PGRST202. So a fix that
  // calls the RPC per clone in cloneIds passes, as does one that filters the rows; a p_clones call stays red.
  wire.on("POST /rest/v1/rpc/revenue_usage_rollup", usageRollupReply([
    { clone_id: A, cost_usd: 2, calls: 4, errors: 2 },
    { clone_id: B, cost_usd: 7, calls: 9, errors: 7 },
  ]));
  const d = await getDashboard("1W", undefined, NOW, [A]);
  harness(d.clones.length === 1 && d.clones[0].id === A, `the clones read is scoped (${d.clones.map((c) => c.id).join(",")})`);
  assert.deepEqual([d.totals.costUsd, d.totals.aiErrors], [2, 2], `totals cost ${d.totals.costUsd} / aiErrors ${d.totals.aiErrors} include clone B`);
});

// 2026-11-12 04:27Z = 15:27 in Sydney (AEDT, +11). The 1D window starts 2026-11-11 15:27 Sydney.
const AT_27 = Date.parse("2026-11-12T04:27:00Z");
const SALE_1610 = "2026-11-11T05:10:00Z"; // 16:10 Sydney on Nov 11, A's sale
const SALE_1540 = "2026-11-11T04:40:00Z"; // 15:40 Sydney on Nov 11, B's sale
const HOUR = 3_600_000;
/** Labels differ only in Intl's space (U+0020 / U+00A0 / U+202F depending on ICU); compare them with plain spaces. */
const norm = (label: unknown) => String(label).replace(/[\s\u00a0\u202f]/g, " ");
/** The label lib/dashboard-data.ts draws for the hour a sale falls in: the same Intl call and zone, on the start of that hour.
 *  (Sydney's offset is whole hours, so the UTC hour start is the report hour start.) */
const hourLabelOf = (iso: string) => {
  const t = Date.parse(iso);
  return norm(new Date(t - (t % HOUR)).toLocaleTimeString("en-US", { hour: "numeric", hour12: true, timeZone: REPORT_TZ }));
};
const bucketOf = (d: { series: Record<string, unknown>[] }, clone: string) => d.series.filter((row) => Number(row[clone]) > 0).map((row) => norm(row.bucket));

test("control: 1D at hh:27 has 24 or 25 hourly buckets", async () => {
  const d = await getDashboard("1D", undefined, AT_27, null);
  assert.ok([24, 25].includes(d.bucketLabels.length), `${d.bucketLabels.length} buckets`);
});

test("F28 1D at hh:27: a 16:10 Sydney sale is drawn under its own hour's label (4 PM), a 15:40 sale under 3 PM", async () => {
  serveLedger([dashboardSale(0, SALE_1610, A), dashboardSale(1, SALE_1540, B)]);
  const d = await getDashboard("1D", undefined, AT_27, null);
  const hitA = bucketOf(d, A), hitB = bucketOf(d, B);
  harness(hitA.length === 1 && hitB.length === 1, `each sale lands in exactly one bucket (A ${hitA.length}, B ${hitB.length})`);
  assert.deepEqual([hitA[0], hitB[0]], [hourLabelOf(SALE_1610), hourLabelOf(SALE_1540)],
    `16:10 sale under "${hitA[0]}", 15:40 sale under "${hitB[0]}" (labels start ${d.bucketLabels.slice(0, 2).map(norm).join(", ")})`);
});

test("control: a 30-day custom range resolves with one bucket per report day", async () => {
  const d = await getDashboard("CUSTOM", { startMs: NOW - 30 * 86_400_000, endMs: NOW }, NOW, null);
  assert.ok([30, 31].includes(d.bucketLabels.length), `${d.bucketLabels.length} buckets`);
});

/**
 * Most buckets a legitimate window needs. The longest real window is ALL: the first ledger row to now, daily buckets
 * (lib/revenue-window.ts resolveRevenueWindow; the fleet's ledger starts in 2026). Ten years of days is a generous
 * ceiling: a fix that clamps the range, coarsens the granularity or refuses all pass; 18.5k daily buckets do not.
 * (lib/revenue-window.ts exports no day count to derive it from: MS_DAY and PERIOD_DAYS are module-private.)
 */
const MAX_BUCKETS = 10 * 366;

test("F29 a 50-year custom range is refused or capped instead of building one bucket per day", async () => {
  // ~0.8 s today; the finding's start=0&end=year-9999 builds ~2.9 M buckets and would not finish in a test.
  const outcome = await outcomeOf(getDashboard("CUSTOM", { startMs: Date.parse("1976-01-01T00:00:00Z"), endMs: NOW }, NOW, null));
  if (outcome instanceof Error) return; // refusing the range is a correct fix
  assert.ok(outcome.bucketLabels.length <= MAX_BUCKETS, `resolved with ${outcome.bucketLabels.length} buckets (> ${MAX_BUCKETS}) and ${outcome.series.length} series rows`);
});
