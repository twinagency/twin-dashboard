import "../support/admin-route-env";
/**
 * KNOWN RED (W4 lib-api-public-v2-plus6 F6; docs/review/W4/lib-api-public-v2-plus6.md): `/api/v1/fans?min_spent=N`
 * filters on GROSS users.total_spent_stars while each row comes back NET of the clone's cut, so a clone key gets rows
 * showing less than N (and can bisect the threshold to recover gross and the exact cut, the oracle the finding names).
 * Drives the real lib/api-public.ts publicFans (real supabase-js through lib/supabase.ts, real cut lookup through
 * lib/platform-cut.ts, which resolves admin access outside a request scope, verified: cookies() throws "outside a
 * request scope" -> null) with PostgREST faked at the wire (tests/support/admin-wire.ts). The query is built by the real
 * parseFanQuery (lib/api-public-query.ts) from `?min_spent=500`, as app/api/v1/fans/route.ts does.
 * Fixture: three fans with gross lifetime spend 1000 / 600 / 100. Red: platform cut 20% (creator view = 0.8 x gross),
 * min_spent=500 must return only rows whose returned (net) total_spent_stars >= 500 (today: 800 and 480).
 * Control: no cut configured, the same filter holds.
 * Team's Claude owns the fix. Not wired into npm scripts on purpose.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CLONE_ID, installWire, type Row } from "../support/admin-wire";
import { publicFans } from "../../lib/api-public";
import { invalidateCutCache } from "../../lib/platform-cut";
import { isQueryError, parseFanQuery } from "../../lib/api-public-query";
import { cutTables } from "../support/W4-lib-api-public-v2-plus6-extras";

const fan = (telegramId: number, spent: number): Row =>
  ({ clone_id: CLONE_ID, telegram_id: telegramId, name: `fake fan ${telegramId}`, total_spent_stars: spent, purchase_count: 1 });
const FANS = [fan(1, 1000), fan(2, 600), fan(3, 100)];

async function minSpentRows(platformCutPct?: number) {
  const opts = parseFanQuery(new URLSearchParams({ min_spent: "500" }), Date.parse("2026-11-12T12:00:00.000Z"));
  assert.ok(!isQueryError(opts), `harness: the parser accepts min_spent=500 (${JSON.stringify(opts)})`);
  invalidateCutCache();
  const w = installWire({ tables: { users: FANS, ...cutTables(platformCutPct) } });
  try {
    return (await publicFans(CLONE_ID, 100, opts)).fans.map((f) => Number(f.total_spent_stars));
  } finally { w.restore(); }
}

test("control: with no cut, min_spent=500 returns only rows showing >= 500", async () => {
  const spent = await minSpentRows();
  assert.deepEqual(spent, [1000, 600]);
});

test("F6: with a 20% cut, min_spent=500 returns only rows showing >= 500 (the threshold applies to what is shown)", async () => {
  const spent = await minSpentRows(20);
  assert.ok(spent.length > 0, "harness: the filtered list is not empty");
  const below = spent.filter((s) => s < 500);
  assert.deepEqual(below, [], `rows returned for min_spent=500 show ${JSON.stringify(spent)}`);
});
