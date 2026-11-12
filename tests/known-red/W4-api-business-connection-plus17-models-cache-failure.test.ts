// KNOWN RED (W4 api-business-connection-plus17 F4): app/api/models/route.ts:12-23 never checks `r.ok`: an OpenRouter
// error body without `data` (429/5xx JSON) is mapped to [], cached for an hour and answered 200 []. app/api/fx/route.ts:12-17
// does the same with its static fallback rate: one failed FX call pins the fallback for an hour.
// Fixed looks like: cache only an OK, non-empty upstream answer; on failure answer an error (e.g. 502) uncached, so the
// first request after the upstream recovers serves the live catalogue / rate.
// Each test loads a FRESH copy of the route module (dropped from require.cache, helper freshModule) because both routes
// keep a module-level cache, and each asserts its own upstream call count so a cache shared across modules (the S10 fix)
// cannot make a test pass without asking the upstream.
// Known limit: if the S10 fix moves the cache into a shared lib module, freshModule no longer resets it, so the control's
// cached catalogue would answer the 429 test with 0 OpenRouter calls and its "asked once" precondition fails. That is a
// harness break, not a regression: reset the shared cache per test (or freshModule the lib too) under a TEST-CHANGE.
// Team's Claude owns the fix. Not wired into npm scripts.
import assert from "node:assert/strict";
import test from "node:test";
import { freshModule, json, withWire, type Call } from "../rules/W4-api-business-connection-plus17-helpers";
import { AUD_PER_USD } from "../../lib/money";

type Route = { GET: () => Promise<Response> };
const freshModels = () => freshModule<Route>("app/api/models/route.ts");
const freshFx = () => freshModule<Route>("app/api/fx/route.ts");
const OPENROUTER = "openrouter.ai";
const FX = "open.er-api.com";

const CATALOGUE = { data: [
  { id: "z/zeta", name: "Zeta", pricing: { prompt: "0.000002", completion: "0.000004" } },
  { id: "a/alpha", pricing: { prompt: "0.000001" } },
] };
const RATE_LIMITED = { error: { message: "Rate limit exceeded", code: 429 } };
const LIVE_AUD = 1.61;

/** Answers `host` with the next scripted response per call; a call past the script is unexpected. */
function upstream(host: string, script: (() => Response)[]) {
  let i = 0;
  return (c: Call) => (c.url.hostname === host && i < script.length ? script[i++]() : undefined);
}
async function call(route: Route) {
  const res = await route.GET();
  return { status: res.status, body: await res.json() as unknown };
}

test("control: OpenRouter 200 {data} answers the mapped, name-sorted catalogue", async () => {
  await withWire(upstream(OPENROUTER, [() => json(CATALOGUE)]), async stub => {
    const r = await call(freshModels());
    assert.equal(stub.to(OPENROUTER).length, 1);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, [
      { id: "a/alpha", name: "a/alpha", prompt: 0.000001, completion: 0 },
      { id: "z/zeta", name: "Zeta", prompt: 0.000002, completion: 0.000004 },
    ]);
  });
});

test("control: FX 200 answers the live rate", async () => {
  await withWire(upstream(FX, [() => json({ result: "success", rates: { AUD: LIVE_AUD } })]), async stub => {
    const r = await call(freshFx());
    assert.equal(stub.to(FX).length, 1);
    assert.deepEqual(r.body, { usd_to_aud: LIVE_AUD });
  });
});

test("F4: an OpenRouter 429 is not answered as HTTP 200 with an empty catalogue", async () => {
  await withWire(upstream(OPENROUTER, [() => json(RATE_LIMITED, 429)]), async stub => {
    const r = await call(freshModels());
    assert.equal(stub.to(OPENROUTER).length, 1, "precondition: OpenRouter was asked once");
    assert.ok(!(r.status === 200 && Array.isArray(r.body) && r.body.length === 0), `429 answered ${r.status} ${JSON.stringify(r.body)}`);
  });
});

test("F4: after an OpenRouter 429, the recovered catalogue is served (the empty list is not cached for an hour)", async () => {
  await withWire(upstream(OPENROUTER, [() => json(RATE_LIMITED, 429), () => json(CATALOGUE)]), async stub => {
    const route = freshModels();
    await call(route);
    const r = await call(route);
    assert.equal(stub.to(OPENROUTER).length, 2, "OpenRouter was not asked again after the 429");
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body) && r.body.length === 2, `after recovery answered ${JSON.stringify(r.body)}`);
  });
});

test("F4: after an FX 503, the recovered live rate is served (the fallback is not cached for an hour)", async () => {
  assert.notEqual(AUD_PER_USD, LIVE_AUD, "precondition: the live rate differs from the static fallback");
  const script = [() => json({ result: "error", "error-type": "unavailable" }, 503), () => json({ result: "success", rates: { AUD: LIVE_AUD } })];
  await withWire(upstream(FX, script), async stub => {
    const route = freshFx();
    await call(route);
    const r = await call(route);
    assert.equal(stub.to(FX).length, 2, "the FX API was not asked again after the 503");
    assert.deepEqual(r.body, { usd_to_aud: LIVE_AUD });
  });
});
