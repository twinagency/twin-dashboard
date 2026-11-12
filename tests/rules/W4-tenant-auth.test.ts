import "../support/admin-route-env";
/**
 * Rule (W4 lib-api-public-v2-plus6 F4, F29; promoted from tests/known-red/W4-lib-api-public-v2-plus6-tenant-auth.test.ts
 * on jaka/w7-close-20261112): lib/api-tenant.ts authenticateModel, the only gate on the internet-facing /api/v1/*.
 * Drives the real function (real sha256 lookup via real supabase-js through lib/supabase.ts) with PostgREST faked at
 * the wire by a minimal inline fetch (the review branch's tests/support/admin-wire.ts is not on this base); the key is
 * a synthetic 43-char test string, stored only as its sha256 in the fake api_keys table.
 * F29: an api_keys read error (statement timeout) must not answer 401 "invalid or revoked API key" (a client would
 *   discard a valid key during an outage).
 * F4: the 121st request in a window makes no api_keys request at all.
 * Control: the key authenticates as its clone, and the 121st request in a minute is refused with 429.
 * Run: nice -n 10 node --import tsx --test --test-concurrency=1 tests/rules/W4-tenant-auth.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { withModelKey } from "../../lib/api-public-route";
import { _rateLimitEntries, _resetRateLimits, authenticateModel, hashKey, RATE_LIMIT_PER_MINUTE } from "../../lib/api-tenant";

const CLONE_ID = "00000000-0000-4000-8000-000000000001";
const KEY = "synthetic-test-key-" + "a".repeat(24); // 43 chars, obviously fake
const NOW = Date.parse("2026-11-12T12:00:00.000Z");
const req = () => new Request("http://localhost/api/v1/revenue", { headers: { authorization: `Bearer ${KEY}` } });
const keyRow = { id: "key-1", clone_id: CLONE_ID, scope: "clone", label: "fake test key", key_hash: hashKey(KEY), revoked_at: null };

type Call = { method: string; url: URL };
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });

/** Fakes PostgREST for api_keys (GET by key_hash, PATCH last_used_at) and the system_logs insert. Anything else fails loud. */
function installWire(opts: { fail?: boolean; row?: Record<string, unknown> } = {}) {
  const row = opts.row ?? keyRow;
  const calls: Call[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (url.pathname === "/rest/v1/system_logs") return new Response(null, { status: 201 });
    if (url.pathname !== "/rest/v1/api_keys") throw new Error(`fake wire: unmodelled ${method} ${url.href}`);
    calls.push({ method, url });
    if (opts.fail) return json({ code: "57014", message: "canceling statement due to statement timeout", details: null, hint: null }, 500);
    if (method === "PATCH") return new Response(null, { status: 204 });
    return json(url.searchParams.get("key_hash") === `eq.${row.key_hash}` ? [row] : []);
  }) as typeof fetch;
  return { calls, idle: () => new Promise((r) => setTimeout(r, 10)), restore: () => { globalThis.fetch = real; } };
}

test("control: a valid key authenticates as its clone; request 121 in a minute is 429", async () => {
  _resetRateLimits();
  const w = installWire();
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
  const w = installWire({ fail: true });
  try {
    const r = await authenticateModel(req(), NOW);
    assert.equal(r.ok, false, "harness: an outage cannot authenticate");
    if (!r.ok) {
      assert.notEqual(r.status, 401, `a database outage answered 401 "${r.error}"`);
      assert.equal(r.status, 503);
      assert.ok(!/57014|timeout|statement/i.test(r.error), `error detail leaked: "${r.error}"`);
    }
  } finally { w.restore(); }
});

test("F29: the public route answers an api_keys outage 503 with a short Retry-After", async () => {
  _resetRateLimits();
  const w = installWire({ fail: true });
  try {
    const res = await withModelKey(async () => { throw new Error("handler must not run"); })(req());
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("retry-after"), "10");
    await w.idle();
  } finally { w.restore(); }
});

test("F4: a request over the per-key limit makes no api_keys request", async () => {
  _resetRateLimits();
  const w = installWire();
  try {
    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) await authenticateModel(req(), NOW + i);
    await w.idle();
    const before = w.calls.length;
    const over = await authenticateModel(req(), NOW + RATE_LIMIT_PER_MINUTE);
    await w.idle();
    assert.equal(over.ok ? 200 : over.status, 429, "harness: request 121 is rate limited");
    const during = w.calls.slice(before).map((c) => `${c.method} ${c.url.search}`);
    assert.deepEqual(during, [], "the rate-limited request still read (and stamped) api_keys");
  } finally { w.restore(); }
});

test("control: unknown keys never enter the limiter, so random keys cannot grow it", async () => {
  _resetRateLimits();
  const w = installWire();
  try {
    for (let i = 0; i < 5; i++) {
      const r = await authenticateModel(new Request("http://localhost/", { headers: { authorization: `Bearer random-${i}` } }), NOW);
      assert.equal(r.ok ? 200 : r.status, 401);
    }
    assert.equal(_rateLimitEntries(), 0, "a key that does not resolve must not take a limiter slot");
    assert.equal((await authenticateModel(req(), NOW)).ok, true);
    assert.equal(_rateLimitEntries(), 1);
    await w.idle();
  } finally { w.restore(); }
});

test("control: a fleet row that names a clone is refused 401 and takes no limiter slot", async () => {
  _resetRateLimits();
  const w = installWire({ row: { ...keyRow, scope: "fleet" } });
  try {
    const r = await authenticateModel(req(), NOW);
    assert.equal(r.ok ? 200 : r.status, 401);
    assert.equal(_rateLimitEntries(), 0);
    await w.idle();
  } finally { w.restore(); }
});
