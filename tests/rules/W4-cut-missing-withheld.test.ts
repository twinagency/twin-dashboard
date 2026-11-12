import "../support/admin-route-env";
/**
 * Rule (W4 cut-helper-dedupe): a public API row whose cut cannot be resolved (null clone_id) WITHHOLDS its money,
 * never passes GROSS out as net, and never throws (one bad row must not 500 a fleet page).
 * Was: lib/api-public-v2.ts netStars `if (!cuts) return gross`; lib/api-public.ts publicFleetFans kept gross when
 * cuts.get missed, and String(null) = "null" was looked up as a clone id.
 * Drives the real publicFleetPayments/publicFleetStats/publicFleetFans/publicPayments over tests/support/postgrest-wire.ts.
 * Fixture: clone A platform cut 20% (agency mult 0.8), one 100-Star sale on A and one 100-Star sale with clone_id null.
 * Also MEASURES the /payments vs /revenue claim: per-row rounding to 0.01 Star vs one cut on the aggregate.
 * Run: nice -n 10 node --import tsx --test --test-concurrency=1 tests/rules/W4-cut-missing-withheld.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { json, useWire, type WireCall } from "../support/postgrest-wire";
import { publicFleetPayments, publicFleetStats, publicPayments, _resetStatsCache } from "../../lib/api-public-v2";
import { publicFleetFans } from "../../lib/api-public";
import { applyCut } from "../../lib/platform-cut";
import { isQueryError, parsePaymentQuery } from "../../lib/api-public-query";

const A = "00000000-0000-4000-8000-0000000000a1";
const R = "00000000-0000-4000-8000-0000000000b2"; // rounding clone: 2.5% cut
const CUTS: Record<string, number> = { [A]: 20, [R]: 2.5 };
const NOW = Date.parse("2026-11-12T12:00:00.000Z");
type Row = Record<string, string | number | null>;
let stx: Row[] = [];
let users: Row[] = [];

const pay = (id: string, clone: string | null, stars = 100, paidAt = "2026-11-12T11:00:00.000Z"): Row => ({
  id, clone_id: clone, telegram_id: 5, kind: "photo", feature: "photo", media_type: "photo",
  amount_stars: stars, paid_at: paidAt, invoice_payload: `p-${id}`,
});

/** star_transactions: eq on clone_id/id/paid_at only, newest first, offset/limit; other filters ignored (window covers all rows). */
function serveStx(c: WireCall) {
  const p = c.url.searchParams;
  const eq = (k: string) => p.get(k)?.startsWith("eq.") ? p.get(k)!.slice(3) : null;
  const rows = stx.filter((r) => (eq("clone_id") === null || r.clone_id === eq("clone_id")) && (eq("paid_at") === null || r.paid_at === eq("paid_at")))
    .filter((r) => !p.get("id")?.startsWith("lt.") || String(r.id) < p.get("id")!.slice(3))
    .filter((r) => !p.get("paid_at")?.startsWith("lt.") || Date.parse(String(r.paid_at)) < Date.parse(p.get("paid_at")!.slice(3)));
  const from = Number(p.get("offset") ?? 0);
  return json(rows.slice(from, from + Number(p.get("limit") ?? 1000)));
}

useWire((w) => {
  w.on("GET /rest/v1/star_transactions", serveStx);
  w.on("GET /rest/v1/users", (c) => json(c.url.searchParams.has("total_spent_stars") || c.url.searchParams.get("select")?.includes("total_spent_stars") ? users : []));
  w.on("GET /rest/v1/platform_cuts", (c) => {
    const id = c.url.searchParams.get("clone_id")?.slice(3) ?? "";
    // PostgREST on a uuid column: "null" is not a uuid (22P02). Nothing may look a null clone up.
    if (!(id in CUTS) && !/^[0-9a-f-]{36}$/.test(id)) return json({ code: "22P02", message: `invalid input syntax for type uuid: "${id}"` }, 400);
    return json(id in CUTS ? [{ cut_pct: CUTS[id] }] : []);
  });
  for (const t of ["agency_creators", "agency_creator_cuts"]) w.on(`GET /rest/v1/${t}`, () => json([]));
  w.on("GET /rest/v1/clones", () => json([{ id: A, name: "a" }]));
  for (const f of ["revenue_clone_user_stats", "revenue_clone_user_stats_window"]) w.on(`POST /rest/v1/rpc/${f}`, () => json([]));
});

function query(limit = 100) {
  const q = parsePaymentQuery(new URLSearchParams({ limit: String(limit), since: "2026-11-01T00:00:00.000Z", until: "2026-11-12T12:00:00.000Z" }), NOW);
  assert.ok(!isQueryError(q), JSON.stringify(q));
  return q;
}

test("fleet /payments: the null-clone row is withheld, the resolved row is net, the page still returns", async () => {
  stx = [pay("a", A), pay("n", null)];
  const p = await publicFleetPayments(query());
  assert.deepEqual(p.payments.map((x) => [x.id, x.stars]), [["a", 80]]);
  assert.equal(p.totals.stars, 80, "totals carry gross from the unresolved row");
  assert.equal(p.count, 1);
});

test("fleet /stats: windows and byFeature exclude the null-clone row, no throw", async () => {
  _resetStatsCache();
  stx = [pay("a", A), pay("n", null)];
  const s = await publicFleetStats(NOW);
  assert.equal(s.windows.last24h.stars, 80);
  assert.equal(s.windows.last30d.stars, 80);
  assert.equal(s.byFeature24h.reduce((a, f) => a + f.stars, 0), 80);
});

test("fleet /fans: a null-clone fan's total_spent_stars is withheld (null), never gross; resolved fan is net", async () => {
  users = [{ clone_id: A, telegram_id: 1, total_spent_stars: 100 }, { clone_id: null, telegram_id: 2, total_spent_stars: 100 }];
  const f = await publicFleetFans(100);
  assert.deepEqual(f.fans.map((r) => [r.telegram_id, r.total_spent_stars]), [[1, 80], [2, null]]);
});

test("measured: /payments sums per-row-rounded Stars, /revenue cuts the aggregate; they differ by <= 0.005 Star per payment", async () => {
  stx = [pay("r1", R, 1), pay("r2", R, 1, "2026-11-12T10:00:00.000Z"), pay("r3", R, 1, "2026-11-12T09:00:00.000Z")];
  const p = await publicPayments(R, query());
  const aggregate = applyCut(3, CUTS[R]); // what scaleAnalyticsData does to /revenue's totals.revenueStars
  const diff = Math.abs(p.totals.stars - aggregate);
  assert.ok(diff > 0, `expected per-row rounding to diverge here (payments ${p.totals.stars}, revenue ${aggregate})`);
  assert.ok(diff <= 0.005 * p.count + 1e-9, `diff ${diff} over the per-row rounding bound`);
});

test("one rule: both public files withhold through the shared helper, neither falls back to gross", () => {
  for (const f of ["../../lib/api-public-v2.ts", "../../lib/api-public.ts"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.ok(/netOrWithheld\(/.test(src), `${f} does not use the shared helper`);
    assert.ok(!/return gross;/.test(src), `${f} passes gross through`);
  }
});
