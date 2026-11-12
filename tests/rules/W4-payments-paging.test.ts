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
 * rwl r1/r2 (/tmp/pay-findings.md): (a) every limit = dedupeStarRows(own clone's rows), ids and sum, incl. a >50-row
 *     group, another clone's rows interleaved; (b) empty page only with nextCursor null; (c) = F3; (d) dedupe rule only
 *     in lib/star-dedupe.ts; (e) bad cursor row fails closed; oversize group fails closed; short last page = one read;
 *     >1000 fans on a page all named.
 * ASSUMPTIONS in the fake below: max_rows = 1000 (Supabase default; the live setting is unmeasured); `id` sorts
 * bytewise (C collation); only the filters, `or` keyset shape and order publicPayments sends are modelled, anything
 * else throws. No cut configured, so stars are gross; the route/auth layer is not exercised.
 * Run: nice -n 10 node --import tsx --test --test-concurrency=1 tests/rules/W4-payments-paging.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { json, useWire, type WireCall } from "../support/postgrest-wire";
import { publicPayments } from "../../lib/api-public-v2";
import { dedupeStarRows } from "../../lib/star-dedupe";
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

/** users: one named fan per (clone, fan) in stx, filtered by the in.() lists, paged by offset/limit, max_rows capped. */
const inList = (v: string | null) => v?.replace(/^in\.\(|\)$/g, "").split(",") ?? [];
function serveUsers(c: WireCall) {
  const p = c.url.searchParams, clones = inList(p.get("clone_id")), tgs = inList(p.get("telegram_id")), from = Number(p.get("offset") ?? 0);
  const fans = [...new Map(stx.map((r) => [`${r.clone_id}:${r.telegram_id}`, { clone_id: r.clone_id, telegram_id: r.telegram_id, name: `fan-${r.telegram_id}`, username: null }])).values()]
    .filter((f) => clones.includes(String(f.clone_id)) && tgs.includes(String(f.telegram_id)));
  return json(fans.slice(from, from + Math.min(Number(p.get("limit") ?? MAX_ROWS), MAX_ROWS)));
}

const wire = useWire((w) => {
  w.on("GET /rest/v1/star_transactions", serveStx);
  w.on("GET /rest/v1/users", serveUsers);
  for (const t of ["platform_cuts", "agency_creators", "agency_creator_cuts"]) w.on(`GET /rest/v1/${t}`, () => json([]));
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
  for (let pages = 1; pages <= 500; pages++) {
    const p = await publicPayments(CLONE, query(limit, cursor));
    assert.ok(p.count > 0 || p.nextCursor === null, `(b) limit=${limit} page ${pages}: count 0 with a nextCursor`);
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

// 1500 distinct payments one minute apart inside the window, newest first.
const MANY = Array.from({ length: 1500 }, (_, i) =>
  pay(`p-${String(i).padStart(5, "0")}`, new Date(Date.parse("2026-11-10T00:00:00.000Z") - i * 60_000).toISOString(), 1000 + i));
const distinct = (rows: { id: string }[]) => new Set(rows.map((r) => r.id)).size;

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

// A same-paid_at group of 64 rows (> the old 50-row lookahead): 30 fans each paid twice (the duplicate bug), with two
// refunds that share every key field (never collapsed) and a distinct sale interleaved by id.
const BIG = [
  pay("new", "2026-11-10T11:00:00.000Z", 7, 30),
  ...Array.from({ length: 30 }, (_, f) => [pay(`g-${String(f).padStart(2, "0")}-a`, T, 100 + f, 10 + f), pay(`g-${String(f).padStart(2, "0")}-b`, T, 100 + f, 10 + f)]).flat(),
  { ...pay("g-r1", T, 5, -40), invoice_payload: "refund" }, { ...pay("g-r2", T, 5, -40), invoice_payload: "refund" },
  pay("g-15-x", T, 999, 5), pay("old", "2026-11-09T00:00:00.000Z", 8, 20),
];
// The same rows under a second clone, ids interleaved with ours inside each paid_at group, plus one older than all of
// ours: never returned, never a reason for another page (MAJOR-2, r2).
const OTHER = "00000000-0000-4000-8000-000000000002";
const elsewhere = (rows: Row[]) => [...rows, { ...pay("o-last", "2026-11-08T00:00:00.000Z"), clone_id: OTHER }].map((r) => ({ ...r, id: `${r.id}-o`, clone_id: OTHER }));
const dbOrder = (rows: Row[]) => [...rows].sort((a, b) => cmp("paid_at", b.paid_at, String(a.paid_at)) || cmp("id", b.id, String(a.id)));

test("(a) every limit returns exactly dedupeStarRows(all rows), ids and sum, incl. a >50-row same-paid_at group", async () => {
  for (const set of [DUPES, MIXED, BIG]) {
    stx = [...set, ...elsewhere(set)];
    const want = dedupeStarRows(dbOrder(set) as never[]) as unknown as Row[];
    const wantSum = want.reduce((a, r) => a + Number(r.amount_stars), 0);
    for (let limit = 1; limit <= set.length + 1; limit++) {
      const got = await pageAll(limit);
      assert.deepEqual(got.rows.map((r) => r.id), want.map((r) => r.id), `ids at limit=${limit}`);
      assert.equal(got.sum, wantSum, `sum at limit=${limit}`);
    }
  }
});

test("(b) limit=1 over a duplicate pair: one page, one payment, no cursor", async () => {
  stx = DUPES;
  const p = await publicPayments(CLONE, query(1));
  assert.equal(p.count, 1);
  assert.equal(p.nextCursor, null);
});

test("fail closed: a same-paid_at group the boundary read cannot hold whole is refused, not split", async () => {
  stx = Array.from({ length: 1001 }, (_, i) => pay(`z-${String(i).padStart(4, "0")}`, T, 2000 + i));
  await assert.rejects(publicPayments(CLONE, query(1)));
});

test("(e) a page ending on a row whose id cannot be a cursor fails closed instead of minting it", async () => {
  stx = [pay("x),clone_id.neq.0,(y", T), pay("old", "2026-11-09T00:00:00.000Z", 8, 20)];
  await assert.rejects(publicPayments(CLONE, query(1)), /cursor/);
  for (const c of wire.calls("GET /rest/v1/star_transactions")) assert.ok(!c.url.searchParams.has("or"), "the id reached an or= filter");
});

test("a short last page costs one star_transactions read", async () => {
  stx = MANY.slice(0, 500);
  const p = await publicPayments(CLONE, query(1000));
  assert.equal(p.count, 500);
  assert.equal(p.nextCursor, null);
  assert.equal(wire.calls("GET /rest/v1/star_transactions").length, 1);
});

test("(d) the duplicate rule lives in lib/star-dedupe.ts only: the payments read calls dedupeStarRows, keys nothing itself", () => {
  const v2 = readFileSync(new URL("../../lib/api-public-v2.ts", import.meta.url), "utf8");
  const dedupe = readFileSync(new URL("../../lib/star-dedupe.ts", import.meta.url), "utf8");
  const read = v2.slice(v2.indexOf("async function readPayments"), v2.indexOf("export function publicPayments"));
  assert.match(read, /dedupeStarRows\(/);
  assert.doesNotMatch(v2, /starDedupeKey|businessKey/);
  assert.doesNotMatch(dedupe, /export function (starDedupeKey|businessKey|isAdjustmentRow)/);
});

test("MAJOR-1 (r2): a page with more than 1000 distinct fans names every one", async () => {
  // 900 newer payments, then a 300-row paid_at group the 1000-row page ends inside: 1200 rows, 1200 fans.
  stx = Array.from({ length: 1200 }, (_, i) => pay(`f-${String(i).padStart(4, "0")}`, new Date(Date.parse(T) + Math.max(0, 900 - i) * 60_000).toISOString(), 3000 + i));
  const p = await publicPayments(CLONE, query(1000));
  assert.equal(p.count, 1200);
  assert.equal(p.payments.filter((x) => x.fan?.name !== `fan-${x.telegramId}`).length, 0, "payments without their fan's name");
});
