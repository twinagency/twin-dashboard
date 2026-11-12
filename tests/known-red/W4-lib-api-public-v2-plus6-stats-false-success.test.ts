import "../support/admin-route-env";
/**
 * KNOWN RED (W4 lib-api-public-v2-plus6 F12, F13; docs/review/W4/lib-api-public-v2-plus6.md): false success on
 * /api/v1/stats. Drives the real lib/api-public-v2.ts publicStats / publicFleetStats (real supabase-js through
 * lib/supabase.ts, real selectAllRows, real rollup RPC wrappers, real cut lookup) with PostgREST faked at the wire
 * (tests/support/admin-wire.ts). The rollup RPCs answer "no rows" (EMPTY_ROLLUP_RPCS).
 *
 * F12: when the star_transactions read fails (PostgREST 500, statement timeout 57014), selectAllRows returns the rows so
 *   far with truncated:true and publicStats resolves 200-shaped numbers (zero revenue) instead of failing.
 * F13: when the fleet clones read fails, `cloneQ.then(r => r.data ?? [])` turns it into `models: []` and resolves.
 * Fixed = the call rejects (the route then answers 5xx), so no zero is served and cached as a fact.
 * Control: a healthy fake gives the clone's 300-Star sale in last24h and one fleet model. The 15 s snapshot cache is
 * reset before each test (_resetStatsCache). No cut configured (0%).
 * Team's Claude owns the fix. Not wired into npm scripts on purpose.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CLONE_ID, EMPTY_ROLLUP_RPCS, installWire, type Row, type WireOpts } from "../support/admin-wire";
import { cutTables, settle, statementTimeout } from "../support/W4-lib-api-public-v2-plus6-extras";
import { _resetStatsCache, publicFleetStats, publicStats } from "../../lib/api-public-v2";
import { invalidateCutCache } from "../../lib/platform-cut";

const NOW = Date.parse("2026-11-12T12:00:00.000Z");
const sale: Row = { id: "s-1", clone_id: CLONE_ID, telegram_id: 7, kind: "photo", feature: "photo", amount_stars: 300,
  paid_at: "2026-11-12T09:00:00.000Z", invoice_payload: "fake-payload-s-1" };

function wire(override?: WireOpts["override"]) {
  _resetStatsCache();
  invalidateCutCache();
  return installWire({
    tables: {
      star_transactions: [sale],
      clones: [{ id: CLONE_ID, name: "Fake Clone", created_at: "2026-01-01T00:00:00.000Z" }],
      ...cutTables(),
    },
    rpc: EMPTY_ROLLUP_RPCS,
    override,
  });
}

test("control: healthy clone stats show the 300-Star sale in last24h", async () => {
  const w = wire();
  try {
    const s = await publicStats(CLONE_ID, NOW);
    assert.equal(s.windows.last24h.stars, 300);
    assert.equal(s.windows.last24h.sales, 1);
    assert.equal(s.windowsTruncated, false);
  } finally { w.restore(); }
});

test("control: healthy fleet stats list the one clone as a model", async () => {
  const w = wire();
  try {
    const s = await publicFleetStats(NOW);
    assert.deepEqual(s.models?.map((m) => [m.id, m.stars24h]), [[CLONE_ID, 300]]);
  } finally { w.restore(); }
});

test("F12: a failed star_transactions read rejects instead of serving zero revenue", async () => {
  const w = wire((c) => (c.table === "star_transactions" ? statementTimeout() : undefined));
  try {
    const r = await settle(publicStats(CLONE_ID, NOW));
    assert.equal(r.ok, false,
      `publicStats resolved after its payments read failed: ${r.ok ? JSON.stringify({ windows: r.value.windows, windowsTruncated: r.value.windowsTruncated }).slice(0, 300) : ""}`);
  } finally { w.restore(); }
});

test("F13: a failed fleet clones read rejects instead of serving models: []", async () => {
  const w = wire((c) => (c.table === "clones" ? statementTimeout() : undefined));
  try {
    const r = await settle(publicFleetStats(NOW));
    assert.equal(r.ok, false,
      `publicFleetStats resolved after its clones read failed, models=${r.ok ? JSON.stringify(r.value.models) : ""}`);
  } finally { w.restore(); }
});
