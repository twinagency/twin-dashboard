// KNOWN RED (W5 lib-revenue-why-changed-plus2, findings F1 F2 F4 F5 F7 F9; docs/review/W5/lib-revenue-why-changed-plus2.md).
// The "What changed" revenue card (lib/revenue-why-changed.ts getRevenueWhyChanged), driven end to end against a fake
// PostgREST at the fetch wire (filters, order, range, projection honoured; admin access = withDashboardAccess(null)).
// Day 2026-11-01 is a complete past day, so the target and its 30 baseline days are full REPORT_TZ days and the
// result does not depend on the clock.
//   F1 baseline average order: empty days enter the median as 0, so a below-typical order reads as above it.
//   F2 a payment with no clone_id puts "unknown" into clones?id=in.(...) (uuid) → 22P02 → the whole card throws.
//   F4 a "Refund" payload (case/space) is a sale here; the shared classifyRevenueLedgerRow calls it an adjustment.
//   F5 activity RPC failures shrink the 30-day activity median to whatever survived, still presented as 30 days.
//   F7 byClone is cut to 5 rows; the card copy says every creator with revenue appears.
//   F9 any feature-probe error (e.g. a 57014 timeout) silently re-buckets every sale by `kind`.
// One finding per test, prefixed `F<n>:` so each can be wired on its own (`--test-name-pattern='^F7:'`).
// Team's Claude owns the fixes. Not wired into npm scripts; run like init.sh's known-red loop.
import assert from "node:assert/strict";
import test from "node:test";
import { query, TIMEOUT, uuidInFilterError, withWire, type Handler, type WireResponse } from "../rules/W5-lib-revenue-why-changed-plus2-wire";
import { withDashboardAccess } from "../../lib/dashboard-access";
import { getRevenueWhyChanged, priorReportDayKeys, reportDayStartMs } from "../../lib/revenue-why-changed";
import { classifyRevenueLedgerRow } from "../../lib/revenue-ledger";

const DAY = "2026-11-01";
const BASE = priorReportDayKeys(DAY); // 30 keys, newest first
const clone = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = clone(1);
let seq = 0;
type Tx = { id: string; clone_id: string | null; telegram_id: number | null; amount_stars: number; paid_at: string; kind: string | null; feature: string | null; invoice_payload: string | null };
const sale = (day: string, stars: number, extra: Partial<Tx> = {}): Tx => ({
  id: `tx-${String(++seq).padStart(6, "0")}`, clone_id: A, telegram_id: 1000 + seq, amount_stars: stars,
  paid_at: new Date(reportDayStartMs(day) + 12 * 3_600_000 + seq * 1000).toISOString(), kind: "credits", feature: "credits", invoice_payload: "credits", ...extra,
});

function ledger(rows: Tx[], opts: { probe?: WireResponse; messaged?: (startIso: unknown) => number | null } = {}): Handler {
  return ({ method, path, url, body }) => {
    if (path === "star_transactions" && method === "GET") {
      const probe = url.searchParams.get("limit") === "1" && !url.searchParams.has("offset");
      if (probe && opts.probe) return opts.probe;
      return { status: 200, json: query(rows, url) };
    }
    if (path === "clones" && method === "GET") {
      const bad = uuidInFilterError(url, "id");
      if (bad) return bad;
      const ids = [...new Set(rows.map((r) => r.clone_id).filter((id): id is string => id !== null))];
      return { status: 200, json: query(ids.map((id) => ({ id, name: `Creator ${id.slice(-2)}` })), url) };
    }
    if (path === "users" && method === "GET") return { status: 200, json: [] };
    if (path === "rpc/revenue_clone_user_stats_window") return { status: 200, json: [] };
    if (path === "rpc/revenue_messaged_fans") {
      const n = opts.messaged ? opts.messaged(body?.p_start) : 0;
      return n === null ? TIMEOUT : { status: 200, json: n };
    }
    return undefined;
  };
}

const run = (rows: Tx[], opts?: Parameters<typeof ledger>[1]) =>
  withWire(ledger(rows, opts), () => withDashboardAccess(null, () => getRevenueWhyChanged(DAY, null)));
const steadyBaseline = () => BASE.map((d) => sale(d, 1000));

test("control: steady 1000-star day vs a steady baseline reads as no change; refund classifier anchor", async () => {
  const r = await run([sale(DAY, 1000), ...steadyBaseline()]);
  assert.equal(r.totals.sales, 1);
  assert.equal(r.totals.deltaStars, 0);
  assert.equal(r.comparison.sampleDays, 30);
  assert.equal(classifyRevenueLedgerRow({ amount_stars: 50, invoice_payload: "Refund" }).adjustment, true);
});

test("F1: three 300-star orders against a typical 500-star order read as below the baseline, tile and summary", async () => {
  // 10 of the 30 baseline days had one 500-star order; 20 had none (most creators do not sell every day).
  const target = [1, 2, 3].map(() => sale(DAY, 300));
  const r = await run([...target, ...BASE.slice(0, 10).map((d) => sale(d, 500))]);
  assert.ok(r.totals.deltaAverageSaleStars < 0, `average order 300 vs typical 500 reported as delta ${r.totals.deltaAverageSaleStars} (benchmark ${r.comparison.benchmark.averageSaleStars}); summary: ${r.summary.detail}`);
  assert.doesNotMatch(r.summary.detail, /average paid-order value[^.]*above/i, "the summary must not call a below-typical order above the median");
});

test("F2: one payment with no clone_id in the 31-day window does not take the fleet card down", async () => {
  await assert.doesNotReject(
    run([sale(DAY, 1000), sale(BASE[3], 200, { clone_id: null }), ...steadyBaseline()]),
    "a null clone_id must fall through to 'Unknown creator' (or be filtered), not 22P02 the clones lookup",
  );
});

test("F4: a positive 'Refund' payload row is an adjustment, not a paid order", async () => {
  const r = await run([sale(DAY, 1000), sale(DAY, 1000), sale(DAY, 50, { invoice_payload: "Refund" }), ...steadyBaseline()]);
  assert.equal(r.totals.sales, 2, "classifyRevenueLedgerRow (and the Revenue page) call this row an adjustment");
});

test("F5: an activity median that survived on 1 of 30 baseline days is not presented as the 30-day median", async () => {
  const targetStart = new Date(reportDayStartMs(DAY)).toISOString();
  const survivor = new Date(reportDayStartMs(BASE[0])).toISOString();
  // Three 400-star buyers vs one 1000-star sale a day: not concentrated, buyers up, average order down, so the
  // summary reaches the branch that adds "Fans who messaged were also above their prior-30-day median" (:516-518).
  const r = await run([...[1, 2, 3].map(() => sale(DAY, 400)), ...steadyBaseline()], {
    messaged: (startIso) => (startIso === targetStart ? 50 : startIso === survivor ? 10 : null),
  });
  assert.doesNotMatch(r.summary.detail, /Fans who messaged[^.]*median/i, "one surviving day is not a prior-30-day median");
  // Fixed shape named in F5: null baseline, or `activity.usualSampleDays` = baseline days that actually answered.
  const coverage = (r.activity as Record<string, unknown>).usualSampleDays;
  assert.ok(
    r.activity.usualMessagedFans === null || coverage === 1,
    `29 of 30 activity reads failed, yet usualMessagedFans=${r.activity.usualMessagedFans} beside sampleDays=${r.comparison.sampleDays}, usualSampleDays=${coverage}`,
  );
});

test("F7: every creator with revenue on the day appears in byClone (the card copy promises it)", async () => {
  const seven = Array.from({ length: 7 }, (_, i) => sale(DAY, 100 * (i + 1), { clone_id: clone(i + 1) }));
  const r = await run([...seven, ...steadyBaseline()]);
  assert.equal(r.byClone.length, 7, `byClone shows ${r.byClone.length} of 7 earning creators`);
});

test("F9: a timed-out feature probe does not silently re-bucket photo sales as untagged media", async () => {
  const photo = { kind: "media", feature: "photo" };
  const r = await run([sale(DAY, 1000, photo), ...BASE.map((d) => sale(d, 1000, photo))], { probe: TIMEOUT });
  assert.deepEqual(r.byFeature.map((f) => f.label), ["Photos"], "a transient probe error is not a missing column");
});
