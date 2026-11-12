// KNOWN RED (W5 lib-openrouter-plus6 F5, F6; docs/review/W5/lib-openrouter-plus6.md). lib/revenue-cache.ts.
// F5: an analytics rejection becomes {analytics:null, analyticsError} (lib/revenue-sections.ts:18-21) and refresh()
//     caches it with a fresh fetchedAt (:104-109): for the next 60 s every read gets the failure without retrying, and
//     a failed refresh replaces a previously good analytics half (the next response must still carry the good copy,
//     stale allowed, never null).
// F6: clearRevenueCache() (:195-197) empties `cache` but not `inflight`: a refresh started before a clone write is
//     joined by a read issued after the clear, and then writes its pre-write snapshot back as fresh for 60 s. A read
//     issued after the clear must get the post-write ledger (7 stars), stale or not; the 3-star snapshot never counts.
// Real getRevenueRollup → real getDashboard + getAnalytics → real supabase-js, PostgREST faked at the wire
// (tests/support/postgrest-wire.ts serveAnalyticsDefaults + tests/support/dashboard-wire.ts serveDashboardDefaults,
// both verbatim from W4). Nothing is mocked at a module boundary.
// - getAnalytics is made to fail by answering its revenue_fan_tiers RPC (lib/rollup.ts:148) with a 57014 timeout.
// - "An analytics read happened" = any request to a route only getAnalytics uses (ANALYTICS_ONLY below), so a fix
//   that calls one RPC twice, or drops one, still counts as one more read, never as none.
// - "A clone write" = the ledger the fake serves changes. F6 parks the pre-clear flight on revenue_fan_tiers and waits
//   for getDashboard's buyer-name read (`users` with `telegram_id=in.`), which getDashboard only issues after its
//   ledger read has been answered (lib/dashboard-data.ts:292-333 then :614): the pre-clear snapshot is then fixed.
// - Waits are on wire signals (waitFor), bounded; every test ends with the wire quiet, so no background refresh leaks
//   requests into the next test's counts. Each test uses its own period (its own cache key).
// Team's Claude owns the fix. Intended runner: init.sh's known-red loop (init.sh:54-56); not wired yet: orchestrator item.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { CLONE, oneStarLedger, pgError, rowsReply, serveAnalyticsDefaults, useWire, type WireRequest } from "../support/postgrest-wire";
import { dashboardClone, serveDashboardDefaults } from "../support/dashboard-wire";
import { harness } from "../support/W5-lib-openrouter-plus6-wire";
import { clearRevenueCache, getRevenueRollup } from "../../lib/revenue-cache";
import { withDashboardAccess } from "../../lib/dashboard-access";
import type { Period } from "../../lib/dashboard-data";

const FAN_TIERS = "POST /rest/v1/rpc/revenue_fan_tiers";
const ANALYTICS_ONLY = new Set([
  "GET /rest/v1/paywall_hits", FAN_TIERS, "POST /rest/v1/rpc/revenue_paywall_stats",
  "POST /rest/v1/rpc/revenue_fan_spend_stats", "POST /rest/v1/rpc/revenue_conversation_funnel",
]);
const recent = () => new Date(Date.now() - 3_600_000).toISOString();
const ledgerOf = (n: number) => oneStarLedger(n, recent(), CLONE);

let ledger: Record<string, unknown>[] = [];
let analyticsFails = false;
let gate: Promise<void> | null = null;

const wire = useWire((w) => {
  serveAnalyticsDefaults(w);
  serveDashboardDefaults(w, [dashboardClone(CLONE, "fake")]);
  w.on("GET /rest/v1/star_transactions", (req) => rowsReply(ledger)(req));
  w.on(FAN_TIERS, async () => {
    if (gate) await gate;
    return analyticsFails ? pgError(500, "57014", "canceling statement due to statement timeout") : { body: [] };
  });
});
beforeEach(() => {
  clearRevenueCache();
  ledger = ledgerOf(3);
  analyticsFails = false;
  gate = null;
});
afterEach(async () => {
  gate = null;
  await quiet();
});

const read = (period: Period, options?: { force?: boolean }) => withDashboardAccess(null, () => getRevenueRollup(period, null, undefined, options));
const route = (r: WireRequest) => `${r.method} ${r.path}`;
const analyticsReads = () => wire.requests.filter((r) => ANALYTICS_ONLY.has(route(r))).length;
const isBuyerNameRead = (r: WireRequest) => route(r) === "GET /rest/v1/users" && r.filters.some((f) => f.column === "telegram_id" && f.op === "in");

/** Resolves true as soon as `cond` holds (checked once per macrotask), false after `max` turns. */
async function waitFor(cond: () => boolean, max = 400): Promise<boolean> {
  for (let i = 0; i < max; i++) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 1));
  }
  return cond();
}
/** The wire is quiet: no new request for 10 consecutive turns (a background refresh has finished or never started). */
async function quiet(): Promise<void> {
  let last = -1, still = 0;
  for (let i = 0; i < 1000 && still < 10; i++) {
    const n = wire.requests.length;
    still = n === last ? still + 1 : 0;
    last = n;
    await new Promise((r) => setTimeout(r, 1));
  }
}
function hold() {
  let release!: () => void;
  gate = new Promise<void>((r) => { release = r; });
  return { release: () => { gate = null; release(); } };
}
/** A pre-clear flight is parked on revenue_fan_tiers and its dashboard ledger read has been answered. */
async function untilPreClearSnapshotFixed() {
  const parked = await waitFor(() => wire.calls(FAN_TIERS).length >= 1 && wire.requests.some(isBuyerNameRead));
  harness(parked, "the first flight never parked on revenue_fan_tiers after its dashboard ledger read");
}

// ── controls ────────────────────────────────────────────────────────────────
test("control: a second read inside the TTL is served from cache (no new analytics read) with the same numbers", async () => {
  const a = await read("1D");
  assert.equal(a.dashboard.totals.stars, 3);
  harness(a.analytics, "analytics present");
  const reads = analyticsReads();
  harness(reads > 0, "an analytics read is visible on the wire");
  const b = await read("1D");
  await quiet();
  assert.equal(analyticsReads(), reads);
  assert.equal(b.stale, false);
  assert.equal(b.dashboard.totals.stars, 3);
});

test("control: clearRevenueCache after a finished read makes the next read fetch the new ledger", async () => {
  await read("6M");
  const reads = analyticsReads();
  ledger = ledgerOf(5);
  clearRevenueCache();
  const b = await read("6M");
  assert.ok(analyticsReads() > reads);
  assert.equal(b.dashboard.totals.stars, 5);
});

test("control: an analytics failure keeps the earnings half (analytics null, analyticsError set)", async () => {
  analyticsFails = true;
  const a = await read("1Y");
  assert.equal(a.dashboard.totals.stars, 3);
  assert.equal(a.analytics, null);
  assert.ok(a.analyticsError);
});

// ── F5 ──────────────────────────────────────────────────────────────────────
test("F5: a failed analytics read is not cached as fresh: the next read inside the TTL reads analytics again", async () => {
  analyticsFails = true;
  const first = await read("1W");
  harness(first.analyticsError, "analytics failed");
  analyticsFails = false;
  const reads = analyticsReads();
  const second = await read("1W");
  // Either the second read is a fresh one (no error), or it serves the failure marked stale while it refreshes behind.
  const retried = await waitFor(() => analyticsReads() > reads);
  assert.ok(retried && (second.analyticsError == null || second.stale),
    `analytics failed once and the next read inside the TTL got the cached failure (stale:${second.stale}, new analytics read:${retried})`);
});

test("F5: a refresh whose analytics fails does not replace the good analytics the next read gets", async () => {
  const good = await read("2W");
  harness(good.analytics, "first read has analytics");
  analyticsFails = true;
  await read("2W", { force: true });
  analyticsFails = false;
  const next = await read("2W");
  assert.notEqual(next.analytics, null,
    `the next read after a failed refresh got analytics null (stale:${next.stale}) though a good copy existed`);
});

// ── F6 ──────────────────────────────────────────────────────────────────────
test("F6: a read issued after clearRevenueCache, while a pre-clear refresh is still running, sees the post-write ledger", async () => {
  const h = hold();
  const before = read("1M"); // reads the 3-star ledger, then parks on revenue_fan_tiers
  await untilPreClearSnapshotFixed();
  ledger = ledgerOf(7); // the clone write
  clearRevenueCache();
  const after = read("1M");
  h.release();
  harness((await before).dashboard.totals.stars === 3, "the pre-clear refresh read the pre-write ledger");
  const r = await after;
  assert.equal(r.dashboard.totals.stars, 7, `the post-clear read was served the pre-clear snapshot (${r.dashboard.totals.stars} stars, stale:${r.stale})`);
});

test("F6: a pre-clear refresh that finishes after clearRevenueCache does not become the fresh entry", async () => {
  const h = hold();
  const before = read("3M");
  await untilPreClearSnapshotFixed();
  ledger = ledgerOf(7);
  clearRevenueCache();
  h.release();
  harness((await before).dashboard.totals.stars === 3, "the pre-clear refresh read the pre-write ledger");
  const r = await read("3M");
  assert.equal(r.dashboard.totals.stars, 7,
    `the read after the clear got the pre-clear snapshot (${r.dashboard.totals.stars} stars, stale:${r.stale})`);
});
