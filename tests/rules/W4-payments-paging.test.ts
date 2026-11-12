import "../support/admin-route-env";
/**
 * Rule (W4 lib-api-public-v2-plus6 F2, F3; promoted from tests/known-red/W4-lib-api-public-v2-plus6-payments-paging.test.ts
 * on side branch 27414b8a, rewritten onto tests/support/postgrest-wire.ts).
 * Drives the real publicPayments (lib/api-public-v2.ts: real supabase-js, real dedupe, real cut lookup) with every
 * query built by the real parsePaymentQuery, and every next page fed the raw `nextCursor`, as app/api/v1/payments does.
 * F2 (money): duplicate star_transactions (lib/star-dedupe.ts business key) were collapsed per PAGE, so a pair split by
 *     a page boundary was counted twice by a client summing pages. Paging at any limit must sum like one page.
 * F3 (data loss): limit=1000 asked for 1001 rows to detect a next page; PostgREST max_rows=1000 capped it, so
 *     nextCursor was null while 500 more payments existed.
 * ASSUMPTIONS in the fake below: max_rows = 1000 (Supabase default; the live setting is unmeasured); `id` sorts
 * bytewise (C collation); only the filters, `or` keyset shape and order publicPayments sends are modelled, anything
 * else throws. No cut configured, so stars are gross; the route/auth layer is not exercised.
 * Run: nice -n 10 node --import tsx --test --test-concurrency=1 tests/rules/W4-payments-paging.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { json, useWire, type WireCall } from "../support/postgrest-wire";
import { publicPayments } from "../../lib/api-public-v2";
import { isQueryError, parsePaymentQuery, type PaymentQuery } from "../../lib/api-public-query";

const CLONE = "00000000-0000-4000-8000-000000000001";
const MAX_ROWS = 1000;
type Row = Record<string, string | number | null>;
let stx: Row[] = [];

const cmp = (col: string, a: unknown, b: string) =>
  col === "paid_at" ? Date.parse(String(a)) - Date.parse(b)
  : col === "amount_stars" ? Number(a) - Number(b)
  : String(a) < b ? -1 : String(a) > b ? 1 : 0;
const OPS: Partial<Record<string, (c: number) => boolean>> = { eq: (c) => c === 0, lt: (c) => c < 0, lte: (c) => c <= 0, gt: (c) => c > 0, gte: (c) => c >= 0 };
const KEYSET = /^\(paid_at\.lt\.([^,]+),and\(paid_at\.eq\.([^,]+),id\.lt\.([^)]+)\)\)$/;

/** star_transactions as PostgREST answers publicPayments: filters, keyset `or`, paid_at/id desc, limit capped at max_rows. */
function serveStx(c: WireCall) {
  let rows = stx;
  for (const [k, v] of c.url.searchParams) {
    if (k === "select" || k === "limit") continue;
    if (k === "order") { assert.equal(v, "paid_at.desc,id.desc", "unmodelled order"); continue; }
    if (k === "or") {
      const m = KEYSET.exec(v);
      assert.ok(m, `unmodelled or=${v}`);
      rows = rows.filter((r) => cmp("paid_at", r.paid_at, m[1]) < 0 || (cmp("paid_at", r.paid_at, m[2]) === 0 && cmp("id", r.id, m[3]) < 0));
      continue;
    }
    const dot = v.indexOf(".");
    const op = OPS[v.slice(0, dot)];
    assert.ok(op && ["clone_id", "paid_at", "amount_stars", "id"].includes(k), `unmodelled filter ${k}=${v}`);
    rows = rows.filter((r) => op(cmp(k, r[k], v.slice(dot + 1))));
  }
  const sorted = [...rows].sort((a, b) => cmp("paid_at", b.paid_at, String(a.paid_at)) || cmp("id", b.id, String(a.id)));
  return json(sorted.slice(0, Math.min(Number(c.url.searchParams.get("limit") ?? MAX_ROWS), MAX_ROWS)));
}

useWire((w) => {
  w.on("GET /rest/v1/star_transactions", serveStx);
  for (const t of ["users", "platform_cuts", "agency_creators", "agency_creator_cuts"]) w.on(`GET /rest/v1/${t}`, () => json([]));
});

const NOW = Date.parse("2026-11-12T12:00:00.000Z");
/** What the route hands publicPayments for `?limit=&since=&until=[&cursor=]`. */
function query(limit: number, cursor: string | null = null): PaymentQuery {
  const p = new URLSearchParams({ limit: String(limit), since: "2026-11-01T00:00:00.000Z", until: "2026-11-12T00:00:00.000Z" });
  if (cursor) p.set("cursor", cursor);
  const q = parsePaymentQuery(p, NOW);
  assert.ok(!isQueryError(q), `harness: the parser accepts the query (${JSON.stringify(q)})`);
  return q;
}

const pay = (id: string, paidAt: string, telegramId = 5, stars = 100): Row => ({
  id, clone_id: CLONE, telegram_id: telegramId, kind: "photo", feature: "photo", media_type: "photo",
  amount_stars: stars, paid_at: paidAt, invoice_payload: `fake-payload-${id}`,
});

/** Follows nextCursor until it is null, as a client does; returns every row and the number of pages. */
async function pageAll(limit: number) {
  const rows: { id: string; stars: number }[] = [];
  let cursor: string | null = null;
  for (let pages = 1; pages <= 20; pages++) {
    const p = await publicPayments(CLONE, query(limit, cursor));
    rows.push(...p.payments.map((x) => ({ id: x.id, stars: x.stars })));
    if (!p.nextCursor) return { rows, pages, sum: rows.reduce((a, r) => a + r.stars, 0) };
    cursor = p.nextCursor;
  }
  throw new Error("paging did not end");
}

// The 2026-09 duplicate-payment bug: same business key, different ids. A different fan's payment at the same
// instant sorts between them, and an older and a newer payment sit on either side.
const T = "2026-11-10T10:00:00.000Z";
const DUPES = [pay("dup-a1", T), pay("dup-a2", T)];
const MIXED = [pay("new", "2026-11-10T11:00:00.000Z", 7, 30), pay("dup-b1", T), pay("dup-b2", T, 9, 50), pay("dup-b3", T), pay("old", "2026-11-09T00:00:00.000Z", 8, 20)];

test("control: limit=2 over two duplicate rows returns one 100-Star payment and no next page", async () => {
  stx = DUPES;
  const p = await publicPayments(CLONE, query(2));
  assert.equal(p.payments.length, 1);
  assert.equal(p.totals.stars, 100);
  assert.equal(p.nextCursor, null);
});

test("F2: paging one row at a time sums the same as one page (a duplicate is never counted twice)", async () => {
  stx = DUPES;
  const { sum, rows } = await pageAll(1);
  assert.equal(sum, 100, `paged sum ${sum} vs single-page 100; rows ${JSON.stringify(rows)}`);
});

test("F2: every page size returns the same rows as one page when duplicates straddle boundaries", async () => {
  stx = MIXED;
  const one = await pageAll(100);
  assert.equal(one.sum, 200, "harness: one page collapses the triple to one 100");
  for (let limit = 1; limit <= MIXED.length; limit++) {
    const paged = await pageAll(limit);
    assert.deepEqual(paged.rows, one.rows, `limit=${limit}`);
  }
});

// 1500 distinct payments one minute apart inside the window, newest first.
const MANY = Array.from({ length: 1500 }, (_, i) =>
  pay(`p-${String(i).padStart(5, "0")}`, new Date(Date.parse("2026-11-10T00:00:00.000Z") - i * 60_000).toISOString(), 1000 + i));
const distinct = (rows: { id: string }[]) => new Set(rows.map((r) => r.id)).size;

test("control: paging limit=500 over 1500 rows (max_rows 1000) returns every payment", async () => {
  stx = MANY;
  const { rows } = await pageAll(500);
  assert.equal(rows.length, 1500);
  assert.equal(distinct(rows), 1500);
});

test("F3: paging limit=1000 (the max) over 1500 rows (max_rows 1000) returns every payment", async () => {
  stx = MANY;
  const { rows } = await pageAll(1000);
  assert.equal(distinct(rows), 1500, `paging at the max returned ${rows.length} rows (${distinct(rows)} distinct) of 1500`);
});

test("F3: a window of exactly one full page ends without an empty extra page", async () => {
  stx = MANY.slice(0, 1000);
  const { rows, pages } = await pageAll(1000);
  assert.equal(distinct(rows), 1000);
  assert.equal(pages, 1);
});
