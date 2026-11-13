import assert from "node:assert/strict";
import test from "node:test";
import { namedOwnerActor } from "../../lib/onlyfans/plan-c-owner-core";

const token1 = `owner_${"1".repeat(64)}`;
const token2 = `owner_${"2".repeat(64)}`;
const named = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";

test("named owner identity survives login rotation, but not another owner or invalid session", async () => {
  process.env.SUPABASE_URL = "https://fixture.invalid";
  process.env.SUPABASE_SERVICE_KEY = "fixture-service-key";
  let response: unknown = named;
  const seen: string[] = [];
  const fake: typeof fetch = async (_url, init) => {
    const parsed = JSON.parse(String(init?.body));
    seen.push(parsed.p_session_hash);
    return Response.json(response);
  };
  const a = await namedOwnerActor(token1, fake);
  const b = await namedOwnerActor(token2, fake);
  assert.match(String(a), /^op-session:[a-f0-9]{64}$/);
  assert.equal(a, b);
  assert.notEqual(seen[0], seen[1]);
  response = other;
  assert.notEqual(await namedOwnerActor(token1, fake), a);
  response = null;
  assert.equal(await namedOwnerActor(token1, fake), null, "a 200 that says null is a definite miss");
  assert.equal(await namedOwnerActor("invalid", fake), null);
});

test("G04: only a definite miss is null; anything a retry could answer differently is unavailable", async () => {
  const status = (code: number): typeof fetch => async () => Response.json({ message: "x" }, { status: code });
  assert.equal(await namedOwnerActor(token1, status(404)), null);
  for (const code of [408, 425, 429, 500, 502, 503]) assert.equal(await namedOwnerActor(token1, status(code)), "unavailable", `HTTP ${code}`);
  for (const body of ["", "unverified", 123, {}]) assert.equal(await namedOwnerActor(token1, async () => Response.json(body)), "unavailable", `200 ${JSON.stringify(body)}`);
  assert.equal(await namedOwnerActor(token1, async () => new Response("not json")), "unavailable");
  assert.equal(await namedOwnerActor(token1, async () => { throw new Error("offline"); }), "unavailable");
});
