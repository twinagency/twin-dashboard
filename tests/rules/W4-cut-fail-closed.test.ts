import "../support/admin-route-env";
/**
 * Rule (W4 cut-helper-dedupe, rwl R1 decision): a public API money row whose cut does not resolve FAILS CLOSED
 * (throws), never passes GROSS out as net. Was: lib/api-public-v2.ts netStars `if (!cuts) return gross`, and
 * lib/api-public.ts publicFleetFans kept gross when cuts.get missed. star_transactions.clone_id and users.clone_id are
 * NOT NULL + FK (bot db/migrations/015), so a miss is a broken invariant; the null-clone rows below are impossible
 * live and exist only to break it. The fake answers a "null" uuid lookup the way Postgres does (22P02).
 * REACHABILITY: /payments skips null ids in its cut lookup, so it reaches net() with no cut. /stats and fleet /fans
 * look up every row's id and resolveCloneCuts fills an entry for each, keyed exactly as they read it back (same value,
 * Map SameValueZero), so through those public functions a missing cut is unreachable for ANY wire response: a null id
 * rejects at the lookup (22P02) and a valid uuid gets an entry (no row = 0%). Their gross fallback is therefore
 * guarded by net() itself, tested directly below.
 * Drives the real publicFleetPayments/publicFleetStats/publicFleetFans/publicPayments over tests/support/postgrest-wire.ts.
 * Fixture: clone A platform cut 20%, one 100-Star sale on A and one 100-Star sale with clone_id null.
 * Also MEASURES the /payments vs /revenue claim: per-row rounding to 0.01 Star vs one cut on the aggregate.
 * Run: nice -n 10 node --import tsx --test --test-concurrency=1 tests/rules/W4-cut-fail-closed.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { json, useWire, type WireCall } from "../support/postgrest-wire";
import { publicFleetPayments, publicFleetStats, publicPayments, _resetStatsCache } from "../../lib/api-public-v2";
import { publicFleetFans } from "../../lib/api-public";
import { applyCut } from "../../lib/platform-cut";
import { net } from "../../lib/revenue-projection";
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

/** The call must reject, and no response may exist to carry the null-clone row's 100 gross Stars. */
async function failsClosed(call: () => Promise<unknown>) {
  let out: unknown;
  await assert.rejects(async () => { out = await call(); });
  assert.equal(out, undefined);
}

test("control: a resolved row is net (100 x 0.8)", async () => {
  _resetStatsCache();
  stx = [pay("a", A)];
  users = [{ clone_id: A, telegram_id: 1, total_spent_stars: 100 }];
  assert.deepEqual((await publicFleetPayments(query())).payments.map((x) => x.stars), [80]);
  assert.equal((await publicFleetStats(NOW)).windows.last24h.stars, 80);
  assert.deepEqual((await publicFleetFans(100)).fans.map((r) => r.total_spent_stars), [80]);
});

test("fleet /payments: a row with no resolved cut reaches net() and throws, never gross", async () => {
  stx = [pay("a", A), pay("n", null)];
  await failsClosed(() => publicFleetPayments(query()));
});

test("fleet /stats: a null clone rejects (22P02 at the cut lookup), never gross", async () => {
  _resetStatsCache();
  stx = [pay("a", A), pay("n", null)];
  await failsClosed(() => publicFleetStats(NOW));
});

test("fleet /fans: a null clone rejects (22P02 at the cut lookup), never gross", async () => {
  users = [{ clone_id: A, telegram_id: 1, total_spent_stars: 100 }, { clone_id: null, telegram_id: 2, total_spent_stars: 100 }];
  await failsClosed(() => publicFleetFans(100));
});

test("net(): a missing cut throws in both modes (the guard /stats and /fans rely on), never gross", () => {
  for (const mode of ["agency", "creator"] as const) assert.throws(() => net(100, undefined, mode), /No cut resolved/);
  assert.equal(net(100, { platformPct: 20, agencyCreatorPct: 0 }, "agency"), 80);
});

test("measured: /payments sums per-row-rounded Stars, /revenue cuts the aggregate; they differ by <= 0.005 Star per payment", async () => {
  stx = [pay("r1", R, 1), pay("r2", R, 1, "2026-11-12T10:00:00.000Z"), pay("r3", R, 1, "2026-11-12T09:00:00.000Z")];
  const p = await publicPayments(R, query());
  const aggregate = applyCut(3, CUTS[R]); // what scaleAnalyticsData does to /revenue's totals.revenueStars
  const diff = Math.abs(p.totals.stars - aggregate);
  assert.ok(diff > 0, `expected per-row rounding to diverge here (payments ${p.totals.stars}, revenue ${aggregate})`);
  assert.ok(diff <= 0.005 * p.count + 1e-9, `diff ${diff} over the per-row rounding bound`);
});
