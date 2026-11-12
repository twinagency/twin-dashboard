import "../support/admin-route-env";
/**
 * KNOWN RED (W4 lib-api-public-v2-plus6 F4, F29; docs/review/W4/lib-api-public-v2-plus6.md): lib/api-tenant.ts
 * authenticateModel, the only gate on the internet-facing /api/v1/*. Drives the real function (real sha256 lookup via
 * real supabase-js through lib/supabase.ts) with PostgREST faked at the wire (tests/support/admin-wire.ts); the key is
 * a synthetic 43-char test string, stored only as its sha256 in the fake api_keys table. The clock is the function's
 * own `now` argument; the in-memory limiter is reset per test (_resetRateLimits).
 * F29: an api_keys read error (statement timeout) is folded into "not found", so a database outage answers 401
 *   "invalid or revoked API key", which tells a client to discard a valid key. Fixed = 503 (any non-401).
 * F4: the limiter runs AFTER the key lookup (select + fire-and-forget last_used_at update), so a key already over 120
 *   requests/minute still costs the micro database a round trip per 429. Fixed = the 121st request in the window
 *   makes no api_keys request at all.
 * Control: the key authenticates as its clone, and the 121st request in a minute is refused with 429.
 * Team's Claude owns the fix. Not wired into npm scripts on purpose.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CLONE_ID, installWire } from "../support/admin-wire";
import { statementTimeout } from "../support/W4-lib-api-public-v2-plus6-extras";
import { _resetRateLimits, authenticateModel, hashKey, RATE_LIMIT_PER_MINUTE } from "../../lib/api-tenant";

const KEY = "synthetic-test-key-" + "a".repeat(24); // 43 chars, obviously fake
const NOW = Date.parse("2026-11-12T12:00:00.000Z");
const req = () => new Request("http://localhost/api/v1/revenue", { headers: { authorization: `Bearer ${KEY}` } });
const keyRow = { id: "key-1", clone_id: CLONE_ID, scope: "clone", label: "fake test key", key_hash: hashKey(KEY), revoked_at: null };

test("control: a valid key authenticates as its clone; request 121 in a minute is 429", async () => {
  _resetRateLimits();
  const w = installWire({ tables: { api_keys: [keyRow] } });
  try {
    const first = await authenticateModel(req(), NOW);
    assert.deepEqual(first, { ok: true, tenant: { keyId: "key-1", cloneId: CLONE_ID, scope: "clone", label: "fake test key" } });
    for (let i = 1; i < RATE_LIMIT_PER_MINUTE; i++) assert.equal((await authenticateModel(req(), NOW + i)).ok, true);
    const over = await authenticateModel(req(), NOW + RATE_LIMIT_PER_MINUTE);
    assert.equal(over.ok ? 200 : over.status, 429);
    await w.idle();
  } finally { w.restore(); }
});

test("F29: an api_keys read failure is not reported as an invalid key (401)", async () => {
  _resetRateLimits();
  const w = installWire({ tables: { api_keys: [keyRow] }, override: (c) => (c.table === "api_keys" ? statementTimeout() : undefined) });
  try {
    const r = await authenticateModel(req(), NOW);
    assert.equal(r.ok, false, "harness: an outage cannot authenticate");
    if (!r.ok) assert.notEqual(r.status, 401, `a database outage answered 401 "${r.error}"`);
  } finally { w.restore(); }
});

test("F4: a request over the per-key limit makes no api_keys request", async () => {
  _resetRateLimits();
  const w = installWire({ tables: { api_keys: [keyRow] } });
  try {
    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) await authenticateModel(req(), NOW + i);
    await w.idle();
    const before = w.rest("api_keys").length;
    const over = await authenticateModel(req(), NOW + RATE_LIMIT_PER_MINUTE);
    await w.idle();
    assert.equal(over.ok ? 200 : over.status, 429, "harness: request 121 is rate limited");
    const during = w.rest("api_keys").map((c) => `${c.method} ${c.url.search}`);
    assert.deepEqual(during.slice(before), [], "the rate-limited request still read (and stamped) api_keys");
  } finally { w.restore(); }
});
