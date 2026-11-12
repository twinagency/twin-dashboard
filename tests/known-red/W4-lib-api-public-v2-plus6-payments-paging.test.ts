import "../support/admin-route-env";
/**
 * KNOWN RED (W4 lib-api-public-v2-plus6 F2, F3; docs/review/W4/lib-api-public-v2-plus6.md). Drives the real
 * lib/api-public-v2.ts publicPayments (real supabase-js through lib/supabase.ts dashboardFetch, real dedupe, real cut
 * lookup via lib/platform-cut.ts) with PostgREST faked at the wire (tests/support/admin-wire.ts, an in-memory
 * globalThis.fetch). Every query is built by the real parsePaymentQuery (lib/api-public-query.ts) from URL params, and
 * every next page passes the raw `nextCursor` string back through it, exactly as app/api/v1/payments/route.ts does.
 *
 * F2 (money): /payments dedupes duplicate star_transactions rows per PAGE. Two duplicate rows (same business key per
 *   lib/star-dedupe.ts: clone, fan, kind, amount, paid_at; different ids, 100 Stars each) count once when they share a
 *   page and twice when a page boundary falls between them, so a client summing pages double-counts.
 *   Control: limit=2 returns one 100-Star row. Red: paging with limit=1 must also sum to 100.
 * F3 (data loss): limit=1000 asks for 1001 rows; PostgREST's max_rows caps the response at 1000, so hasMore reads
 *   false and nextCursor null while 500 more payments exist. BYPASS/ASSUMPTION: the cap is modelled by
 *   capMaxRows() (tests/support/W4-lib-api-public-v2-plus6-extras.ts) as Supabase's default max_rows = 1000; the live
 *   project's setting is unmeasured (LIVE-CHECK in the findings file). Red: paging limit=1000 to the end returns all
 *   1500 distinct ids (a parser cap of 999 and a separate existence probe both pass). Control: the same with limit=500.
 * No cut configured (0%), so stars are gross; the auth/route layer is not exercised (lib only).
 * Team's Claude owns the fix. Not wired into npm scripts on purpose.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CLONE_ID, installWire, type Row } from "../support/admin-wire";
import { capMaxRows, cutTables } from "../support/W4-lib-api-public-v2-plus6-extras";
import { publicPayments } from "../../lib/api-public-v2";
import { isQueryError, parsePaymentQuery, type PaymentQuery } from "../../lib/api-public-query";
import { invalidateCutCache } from "../../lib/platform-cut";

const NOW = Date.parse("2026-11-12T12:00:00.000Z");
const SINCE = "2026-11-01T00:00:00.000Z";
const UNTIL = "2026-11-12T00:00:00.000Z";
/** What the route hands publicPayments for `?limit=&since=&until=[&cursor=]`. */
function query(limit: number, cursor: string | null = null): PaymentQuery {
  const q = parsePaymentQuery(new URLSearchParams({ limit: String(limit), since: SINCE, until: UNTIL, ...(cursor ? { cursor } : {}) }), NOW);
  assert.ok(!isQueryError(q), `harness: the parser accepts the query (${JSON.stringify(q)})`);
  return q;
}

const pay = (id: string, paidAt: string, telegramId = 5, stars = 100): Row =>
  ({ id, clone_id: CLONE_ID, telegram_id: telegramId, kind: "photo", feature: "photo", media_type: "photo",
    amount_stars: stars, paid_at: paidAt, invoice_payload: `fake-payload-${id}` });

// Two rows of the 2026-09 duplicate-payment bug: same business key, different ids.
const DUPES = [pay("dup-a1", "2026-11-10T10:00:00.000Z"), pay("dup-a2", "2026-11-10T10:00:00.000Z")];
const tables = (stx: Row[]) => ({ star_transactions: stx, users: [], ...cutTables() });

/** Follows nextCursor until it is null, as a client does. */
async function pageAll(limit: number) {
  const seen: { id: string; stars: number }[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 10; i++) {
    const p = await publicPayments(CLONE_ID, query(limit, cursor));
    seen.push(...p.payments.map((x) => ({ id: x.id, stars: x.stars })));
    if (!p.nextCursor) return seen;
    cursor = p.nextCursor;
  }
  throw new Error("paging did not end");
}

test("control: F2 harness, limit=2 over two duplicate rows returns one 100-Star payment", async () => {
  invalidateCutCache();
  const w = installWire({ tables: tables(DUPES) });
  try {
    const p = await publicPayments(CLONE_ID, query(2));
    assert.equal(p.payments.length, 1);
    assert.equal(p.totals.stars, 100);
    assert.equal(p.nextCursor, null);
  } finally { w.restore(); }
});

test("F2: paging one row at a time sums the same as one page (duplicates never counted twice)", async () => {
  invalidateCutCache();
  const w = installWire({ tables: tables(DUPES) });
  try {
    const rows = await pageAll(1);
    const sum = rows.reduce((a, r) => a + r.stars, 0);
    assert.equal(sum, 100, `paged sum ${sum} vs single-page 100; rows ${JSON.stringify(rows)}`);
  } finally { w.restore(); }
});

// 1500 distinct payments one minute apart inside the window, newest first.
const MANY = Array.from({ length: 1500 }, (_, i) =>
  pay(`p-${String(i).padStart(5, "0")}`, new Date(Date.parse("2026-11-10T00:00:00.000Z") - i * 60_000).toISOString(), 1000 + i));

const distinctIds = (rows: { id: string }[]) => new Set(rows.map((r) => r.id)).size;

test("control: F3 harness, paging limit=500 over 1500 rows (max_rows 1000) returns every payment", async () => {
  invalidateCutCache();
  const w = installWire({ tables: tables(MANY), override: capMaxRows(1000) });
  try {
    const rows = await pageAll(500);
    assert.equal(rows.length, 1500);
    assert.equal(distinctIds(rows), 1500);
  } finally { w.restore(); }
});

test("F3: paging limit=1000 (the max) over 1500 rows (max_rows 1000) returns every payment", async () => {
  invalidateCutCache();
  const w = installWire({ tables: tables(MANY), override: capMaxRows(1000) });
  try {
    const rows = await pageAll(1000);
    assert.equal(distinctIds(rows), 1500, `paging at the max returned ${rows.length} rows (${distinctIds(rows)} distinct) while 1500 payments match`);
  } finally { w.restore(); }
});
