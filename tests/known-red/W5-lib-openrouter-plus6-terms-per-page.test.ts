// KNOWN RED (W5 lib-openrouter-plus6 F21; docs/review/W5/lib-openrouter-plus6.md). lib/agency-fetch.ts:50,63 +
// lib/platform-cut.ts:261-271.
// F21: dashboardFetch resolves the viewer's terms (getViewerTermsFor) on every PostgREST response, and the lookup has
//      no TTL cache (React cache() is a passthrough outside an RSC render), so an agency getDashboard re-reads
//      platform_cuts once per ledger page: DB load grows with the ledger, and a cut edited mid-read yields a snapshot
//      at mixed multipliers.
// Measured as: the number of `GET /rest/v1/platform_cuts` requests during one agency getDashboard does not depend on
// how many pages the revenue ledger takes (500 rows = 1 page vs 2,500 rows = 3+ pages; lib/select-all.ts pages by
// 1,000). Design-neutral: one lookup per flight, a TTL cache, or terms passed in all give equal counts.
// Control: the admin path (no access) reads both ledgers in full at gross and never looks up platform_cuts.
// Real getDashboard → real supabase-js + dashboardFetch, PostgREST faked at the wire (tests/support/postgrest-wire.ts +
// tests/support/dashboard-wire.ts serveDashboardDefaults; agency reads are scoped with `and=(...)` → scopedRows,
// RPCs renamed agency_<fn>).
// Team's Claude owns the fix. Intended runner: init.sh's known-red loop (init.sh:54-56); not wired yet: orchestrator item.
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { CLONE, rowsReply, useWire, type Wire } from "../support/postgrest-wire";
import { dashboardClone, dashboardSale, serveDashboardDefaults } from "../support/dashboard-wire";
import { harness, scopedRows } from "../support/W5-lib-openrouter-plus6-wire";
import { getDashboard } from "../../lib/dashboard-data";
import { withDashboardAccess } from "../../lib/dashboard-access";
import { __setViewerTermsOverrideForTests, invalidateCutCache } from "../../lib/platform-cut";
import type { AgencyIdentity } from "../../lib/agency-identity";

const AGENCY_ID = "bbbbbbbb-cccc-4ddd-8eee-000000000021";
const agency: AgencyIdentity = { id: AGENCY_ID, name: "Fake Agency", cloneIds: [CLONE], canManage: false };
const CUTS = "GET /rest/v1/platform_cuts";
const RPCS = ["revenue_usage_rollup", "revenue_clone_user_stats_window", "revenue_clone_user_stats", "revenue_messaged_fans", "revenue_active_chat_buyers"];

let ledger: Record<string, unknown>[] = [];
const wire = useWire((w: Wire) => {
  serveDashboardDefaults(w, []);
  w.on("GET /rest/v1/clones", (req) => scopedRows([dashboardClone(CLONE, "fake")])(req));
  w.on("GET /rest/v1/star_transactions", (req) => scopedRows(ledger)(req));
  w.on("GET /rest/v1/users", (req) => scopedRows([])(req));
  w.on("GET /rest/v1/photos", (req) => scopedRows([])(req));
  for (const fn of RPCS) {
    const reply = fn.endsWith("_fans") || fn.endsWith("_buyers") ? () => ({ body: 0 }) : () => ({ body: [] });
    w.on(`POST /rest/v1/rpc/${fn}`, reply);
    w.on(`POST /rest/v1/rpc/agency_${fn}`, reply);
  }
  w.on(CUTS, rowsReply([{ agency_id: AGENCY_ID, clone_id: null, cut_pct: 20, usd_per_star: null }]));
});
beforeEach(() => {
  __setViewerTermsOverrideForTests(null);
  invalidateCutCache();
});
afterEach(() => { ledger = []; });

const recent = () => new Date(Date.now() - 3_600_000).toISOString();
const ledgerOf = (n: number) => Array.from({ length: n }, (_, i) => dashboardSale(i + 1, recent(), CLONE));
// Ranged star_transactions reads: the one-row column probe (dashboard-data.ts:263) plus each page.
const ledgerPages = () => wire.calls("GET /rest/v1/star_transactions").filter((r) => r.range != null).length;

/** platform_cuts reads and ledger page reads during one getDashboard over an n-row ledger. */
async function cutReadsFor(n: number, access: AgencyIdentity | null) {
  ledger = ledgerOf(n);
  wire.requests.length = 0;
  invalidateCutCache();
  const d = await withDashboardAccess(access, () => getDashboard("1M"));
  return { cuts: wire.calls(CUTS).length, pages: ledgerPages(), stars: d.totals.stars };
}

test("control: F21 the admin path reads a 1-page and a 3-page ledger in full at gross, with no platform_cuts lookup", async () => {
  const small = await cutReadsFor(500, null);
  const big = await cutReadsFor(2500, null);
  harness(big.pages > small.pages, `the big ledger took more pages (${small.pages} vs ${big.pages})`);
  harness(small.cuts === 0 && big.cuts === 0, `the admin path looked up platform_cuts (${small.cuts}, ${big.cuts})`);
  assert.deepEqual([small.stars, big.stars], [500, 2500]);
});

test("F21: an agency getDashboard reads platform_cuts the same number of times for a 1-page and a 3-page ledger", async () => {
  const small = await cutReadsFor(500, agency);
  const big = await cutReadsFor(2500, agency);
  harness(big.pages > small.pages, `the big ledger took more pages (${small.pages} vs ${big.pages})`);
  harness(small.cuts > 0, "the agency read resolved its terms from platform_cuts on the wire");
  harness(Math.abs(big.stars - 2500 * 0.8) < 1e-6, `the agency sees NET at its 20 % cut (${big.stars})`);
  assert.equal(big.cuts, small.cuts,
    `platform_cuts read ${small.cuts}× for ${small.pages} ranged ledger read(s) but ${big.cuts}× for ${big.pages}: the terms lookup runs per page`);
});
