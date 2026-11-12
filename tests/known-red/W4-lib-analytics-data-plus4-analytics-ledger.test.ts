// KNOWN RED (W4 lib-analytics-data-plus4 F2, F3, F4, docs/review/W4/lib-analytics-data-plus4.md): lib/analytics-data.ts
// getAnalytics publishes partial money as a total.
// F2: the ledger read drops selectAllRowsParallel's `truncated`, so a 57014 on page 2 publishes page 1 as the window's
//     revenue (HTTP 200 on /api/v1/revenue and the operator page).
// F3: the clones read drops its error (`.then((r) => r.data)`), so a failed read renders an empty fleet with 200.
// F4: the weekly-spender star_transactions read has no ORDER BY (the double-read/skip the file documents), and (F4b)
//     drops selectAllRows' `truncated`, so a timeout on its page 2 publishes a partial leaderboard with 200.
// Real supabase-js against the in-memory PostgREST fake at fetch (tests/support/postgrest-wire.ts); any other host
// throws, any unmodelled request or filter answers 599 and crashes the test (plain Error, not a red). Team's Claude owns the fix.
// Intended runner: init.sh's known-red loop (init.sh:54-56); not wired yet: orchestrator item.
import assert from "node:assert/strict";
import { test } from "node:test";
import { NOW, oneStarLedger, pgError, refuseFakeError, rowsReply, serveAnalyticsDefaults, useWire, type WireRequest } from "../support/postgrest-wire";
import { getAnalytics } from "../../lib/analytics-data";

const LEDGER = oneStarLedger(1500, "2026-11-10T00:00:00Z");
const wire = useWire((w) => serveAnalyticsDefaults(w, LEDGER));
const run = () => getAnalytics("1W", null, undefined, { includeCost: false }, NOW);
const ledgerGets = () => wire.calls("GET /rest/v1/star_transactions");
const selects = (r: WireRequest) => r.url.searchParams.get("select") ?? "";
/** The main ledger read: the one that asks for the migration-024 `feature` column. */
const isMainLedger = (r: WireRequest) => selects(r).split(",").includes("feature");
/** The one-row "does the feature column exist" probe, the only read allowed to be unordered. */
const isFeatureProbe = (r: WireRequest) => isMainLedger(r) && r.url.searchParams.get("limit") === "1" && !r.url.searchParams.has("offset");

test("control: 1500 one-star rows over two pages (0-999, 1000-1499) total 1500 stars", async () => {
  const a = await run();
  assert.equal(a.totals.revenueStars, 1500);
  const offsets = ledgerGets().filter((r) => isMainLedger(r) && !isFeatureProbe(r)).map((r) => r.url.searchParams.get("offset"));
  assert.ok(offsets.includes("0") && offsets.includes("1000"), `ledger pages read: ${offsets.join(",")}`);
});

test("control: the main ledger read pages ordered by id", async () => {
  await run();
  const main = ledgerGets().filter((r) => isMainLedger(r) && !isFeatureProbe(r));
  assert.ok(main.length >= 2);
  for (const r of main) assert.match(r.url.searchParams.get("order") ?? "", /(^|,)id\./);
});

test("F2: a statement timeout on main-ledger page 1000-1999 fails the report instead of publishing page 1", async () => {
  const pages = rowsReply(LEDGER);
  // Only the main ledger read fails, so a fix to the weekly read alone (F4) cannot turn this green.
  wire.on("GET /rest/v1/star_transactions", (req) =>
    isMainLedger(req) && req.range && req.range.from >= 1000
      ? pgError(500, "57014", "canceling statement due to statement timeout")
      : pages(req));
  const outcome = await run().then((a) => a.totals.revenueStars, (e: unknown) => e);
  refuseFakeError(outcome);
  assert.ok(outcome instanceof Error, `resolved with totals.revenueStars ${String(outcome)} of 1500`);
});

test("F3: a failed clones read fails the report instead of rendering an empty fleet", async () => {
  wire.on("GET /rest/v1/clones", () => pgError(500, "57014", "canceling statement due to statement timeout"));
  const outcome = await run().then((a) => a.clones.length, (e: unknown) => e);
  refuseFakeError(outcome);
  assert.ok(outcome instanceof Error, `resolved with clones.length ${String(outcome)} as if the fleet were empty`);
});

test("F4: every star_transactions read except the one-row feature probe carries a stable order containing id", async () => {
  await run();
  const reads = ledgerGets().filter((r) => !isFeatureProbe(r));
  assert.ok(reads.length > 0);
  const unordered = reads.filter((r) => !/(^|,)id\./.test(r.url.searchParams.get("order") ?? ""))
    .map((r) => `select=${selects(r)} offset=${r.url.searchParams.get("offset")} order=${r.url.searchParams.get("order")}`);
  assert.deepEqual(unordered, [], "star_transactions read without an order on id");
});

test("F4b: a statement timeout on weekly-spender page 1000-1999 fails the report instead of publishing a partial leaderboard", async () => {
  // All 1500 seeded sales sit inside the rolling week (Nov 10), so the weekly read needs two pages.
  const pages = rowsReply(LEDGER);
  wire.on("GET /rest/v1/star_transactions", (req) =>
    !isMainLedger(req) && req.range && req.range.from >= 1000
      ? pgError(500, "57014", "canceling statement due to statement timeout")
      : pages(req));
  const outcome = await run().then((a) => a.weeklySpenderSummary.buyers, (e: unknown) => e);
  refuseFakeError(outcome);
  // A fix that drops the separate weekly read (one ledger read feeds the week) leaves nothing to fail here; the main
  // ledger read's truncation is F2's test.
  if (!ledgerGets().some((r) => !isMainLedger(r))) return;
  assert.ok(outcome instanceof Error, `resolved with weeklySpenderSummary.buyers ${String(outcome)} of 1500`);
});
