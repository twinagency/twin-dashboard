/**
 * CLAUDE.md "The Twin public API": neither public revenue path runs the cost rollup. getAnalytics(..., { includeCost:
 * false }) (lib/analytics-data.ts) must never request rpc/revenue_usage_rollup, the most expensive query on the page,
 * whose result the public API is forbidden to return. Characterization (green): with includeCost:false the RPC is never
 * requested; with includeCost:true it is (so the assertion can see the call when it happens). Guard G10 checks only that
 * the callers pass the flag. Real supabase-js against the in-memory PostgREST fake at fetch
 * (tests/support/postgrest-wire.ts); any other host throws, any unmodelled request or filter fails the test.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { NOW, serveAnalyticsDefaults, useWire } from "../support/postgrest-wire";
import { getAnalytics } from "../../lib/analytics-data";

const ROLLUP = "POST /rest/v1/rpc/revenue_usage_rollup";
const wire = useWire((w) => serveAnalyticsDefaults(w, []));

test("includeCost:true requests revenue_usage_rollup once and reports costIncluded", async () => {
  const a = await getAnalytics("1W", null, undefined, { includeCost: true }, NOW);
  assert.equal(wire.calls(ROLLUP).length, 1);
  assert.equal(a.costIncluded, true);
});

test("includeCost:false never requests revenue_usage_rollup, for one clone or the fleet", async () => {
  for (const cloneId of [null, "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"]) {
    for (const period of ["1D", "1W", "1M"] as const) {
      const a = await getAnalytics(period, cloneId, undefined, { includeCost: false }, NOW);
      assert.equal(a.costIncluded, false);
    }
  }
  assert.equal(wire.calls(ROLLUP).length, 0, "the public path paid for the cost rollup");
  assert.ok(wire.requests.length > 0, "getAnalytics reached the wire");
});
