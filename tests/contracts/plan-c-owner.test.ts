import assert from "node:assert/strict";
import test from "node:test";
import { planCOwnerActor } from "../../lib/onlyfans/plan-c-owner-core";

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
  const a = await planCOwnerActor(token1, fake);
  const b = await planCOwnerActor(token2, fake);
  assert.match(a ?? "", /^op-session:[a-f0-9]{64}$/);
  assert.equal(a, b);
  assert.notEqual(seen[0], seen[1]);
  response = other;
  assert.notEqual(await planCOwnerActor(token1, fake), a);
  for (const invalid of [null, "", "unverified", 123]) {
    response = invalid;
    assert.equal(await planCOwnerActor(token1, fake), null);
  }
  assert.equal(await planCOwnerActor("invalid", fake), null);
  assert.equal(await planCOwnerActor(token1, async () => { throw new Error("offline"); }), null);
});
