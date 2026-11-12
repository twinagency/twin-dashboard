// KNOWN RED (W4 lib-analytics-data-plus4, docs/review/W4/lib-analytics-data-plus4.md):
// F6 (= lane-5 api-business-connection-plus17 F17): lib/api-public-route.ts only publicOk sets generatedAt and
//     Cache-Control: private, no-store; the 400/401/429/500 replies carry neither, and a 500 hands e.message (RPC names,
//     PG codes) to the internet.
// F11: what a refused request costs, counted at the wire: each over-limit (429) request still sends a last_used_at
//     PATCH to api_keys and a system_logs insert; each wrong-key (401) request sends a system_logs insert.
// Real withModelKey + supabase-js against the in-memory PostgREST fake at fetch (tests/support/postgrest-wire.ts); any
// other host throws. Team's Claude owns the fix.
// Intended runner: init.sh's known-red loop (init.sh:54-56); not wired yet: orchestrator item.
import assert from "node:assert/strict";
import { test } from "node:test";
import { bearerCall, modelKeyRow, newModelKey, serveModelKeys, settle, useWire } from "../support/postgrest-wire";
import { publicOk, withModelKey } from "../../lib/api-public-route";
import { _resetRateLimits } from "../../lib/api-tenant";

const KEY = newModelKey();
const wire = useWire((w) => {
  _resetRateLimits();
  serveModelKeys(w, [modelKeyRow(KEY, "clone")]);
});

const ok = withModelKey(async ({ tenant }) => publicOk({ scope: tenant.scope }));
const boom = withModelKey(async () => {
  throw new Error("revenue_active_chat_buyers failed: x (code 57014)");
});
const counts = () => ({ patch: wire.calls("PATCH /rest/v1/api_keys").length, logs: wire.calls("POST /rest/v1/system_logs").length });
const envelope = async (res: Response, what: string) => {
  assert.equal(res.headers.get("cache-control"), "private, no-store", `${what} has no Cache-Control: private, no-store`);
  assert.equal(typeof (await res.json()).generatedAt, "string", `${what} has no generatedAt`);
};

test("control: a valid key gets 200 with Cache-Control private, no-store and generatedAt", async () => {
  const res = await bearerCall(ok, KEY);
  assert.equal(res.status, 200);
  await envelope(res, "the 200");
});

test("control: ?clone=abc is refused with 400", async () => {
  assert.equal((await bearerCall(ok, KEY, "?clone=abc")).status, 400);
});

test("control: a handler that throws answers 500", async () => {
  assert.equal((await bearerCall(boom, KEY)).status, 500);
});

test("F6: the 400 for ?clone= carries Cache-Control private, no-store and generatedAt", async () => {
  await envelope(await bearerCall(ok, KEY, "?clone=abc"), "the 400");
});

test("F6: the wrong-key 401 and the 121st-request 429 carry Cache-Control private, no-store and generatedAt", async () => {
  const denied = await bearerCall(ok, newModelKey());
  assert.equal(denied.status, 401);
  await envelope(denied, "the 401");
  for (let i = 0; i < 120; i++) await bearerCall(ok, KEY);
  const limited = await bearerCall(ok, KEY);
  assert.equal(limited.status, 429);
  await envelope(limited, "the 429");
});

test("F6: a 500 does not hand the internal error text to the caller", async () => {
  const body = await (await bearerCall(boom, KEY)).json();
  assert.doesNotMatch(String(body.error), /revenue_|code 57014/);
});

test("F6: the 500 carries Cache-Control private, no-store and generatedAt", async () => {
  await envelope(await bearerCall(boom, KEY), "the 500");
});

test("control: with one key, requests 1-120 are served and 121-130 are 429", async () => {
  const statuses: number[] = [];
  for (let i = 0; i < 130; i++) statuses.push((await bearerCall(ok, KEY)).status);
  assert.deepEqual(statuses.slice(0, 120), Array(120).fill(200));
  assert.deepEqual(statuses.slice(120), Array(10).fill(429));
});

test("F11: ten over-limit requests write no last_used_at and at most one system_logs row", async () => {
  for (let i = 0; i < 120; i++) await bearerCall(ok, KEY);
  await settle();
  const before = counts();
  for (let i = 0; i < 10; i++) assert.equal((await bearerCall(ok, KEY)).status, 429);
  await settle();
  const after = counts();
  const cost = `${after.patch - before.patch} last_used_at PATCHes, ${after.logs - before.logs} system_logs inserts for 10 refused requests`;
  assert.equal(after.patch - before.patch, 0, cost);
  assert.ok(after.logs - before.logs <= 1, cost);
});

test("F11: fifty wrong keys cost at most one system_logs insert", async () => {
  const before = counts();
  for (let i = 0; i < 50; i++) {
    const status = (await bearerCall(ok, newModelKey())).status;
    assert.ok(status === 401 || status === 429, `wrong key answered ${status}`); // 429 = a fix's per-source limit
  }
  await settle();
  const logs = counts().logs - before.logs;
  assert.ok(logs <= 1, `${logs} system_logs inserts for 50 wrong keys`);
});
