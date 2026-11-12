/**
 * CLAUDE.md "The Twin public API": withModelKey (lib/api-public-route.ts) REJECTS ?clone= with a 400 for BOTH key
 * scopes rather than ignoring it, and the scope comes from the key row, never a parameter. Characterization (green):
 * ?clone=, ?clone_id=, ?cloneId= each answer 400 for a clone key and a fleet key, and the handler is never invoked.
 * W4 lib-analytics-data-plus4 rules check (guard B3 was grep-only). Real supabase-js against the in-memory PostgREST
 * fake at fetch (tests/support/postgrest-wire.ts); any other host throws, any unmodelled request fails the test.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { bearerCall, CLONE, modelKeyRow, newModelKey, serveModelKeys, useWire } from "../support/postgrest-wire";
import { publicOk, withModelKey } from "../../lib/api-public-route";
import { _resetRateLimits } from "../../lib/api-tenant";

const CLONE_KEY = newModelKey();
const FLEET_KEY = newModelKey();
useWire((w) => {
  _resetRateLimits();
  serveModelKeys(w, [modelKeyRow(CLONE_KEY, "clone"), modelKeyRow(FLEET_KEY, "fleet")]);
});

let invoked = 0;
const route = withModelKey(async ({ tenant }) => {
  invoked += 1;
  return publicOk({ scope: tenant.scope });
});

test("a clone key and a fleet key without a clone parameter reach the handler", async () => {
  invoked = 0;
  for (const key of [CLONE_KEY, FLEET_KEY]) assert.equal((await bearerCall(route, key, "", "/api/v1/revenue")).status, 200);
  assert.equal(invoked, 2);
});

test("?clone=, ?clone_id= and ?cloneId= answer 400 for a clone key and a fleet key, and the handler never runs", async () => {
  invoked = 0;
  for (const [name, key] of [["clone", CLONE_KEY], ["fleet", FLEET_KEY]] as const) {
    for (const param of ["clone", "clone_id", "cloneId"]) {
      const res = await bearerCall(route, key, `?${param}=${CLONE}`, "/api/v1/revenue");
      assert.equal(res.status, 400, `${name} key with ?${param}=`);
      assert.equal((await res.json()).ok, false);
    }
  }
  assert.equal(invoked, 0, "handler invoked for a request naming a clone");
});
