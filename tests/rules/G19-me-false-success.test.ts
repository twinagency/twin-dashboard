// G19 regression guard (was KNOWN RED W4 api-business-connection-plus17 F2; fixed in #392). Before the fix, GET /api/v1/me
// dropped the clones query's `error`, so a database failure answered 200 ok:true with model:null (clone key) or models:[]
// (fleet key) on the first call any client makes, and the client concluded its key sees nothing. Now the error surfaces
// (withModelKey answers 500); a 503 would also pass. Never ok:true with no model.
import assert from "node:assert/strict";
import test from "node:test";
import { anyOf, as, CLONE_A, isRest, modelKeyWire, pgError, table, withWire, type Call, type Responder } from "./G19-harness";
import { GET } from "../../app/api/v1/me/route";

// Fixture markers, not credentials: withModelKey looks keys up by sha256 and validates no format.
const KEYS = {
  clone: { key: "TEST-FIXTURE-NOT-A-SECRET-public-key-clone", row: { id: "key-clone", clone_id: CLONE_A, scope: "clone", label: "synthetic clone key" } },
  fleet: { key: "TEST-FIXTURE-NOT-A-SECRET-public-key-fleet", row: { id: "key-fleet", clone_id: null, scope: "fleet", label: "synthetic fleet key" } },
};
const CLONE_ROW = { id: CLONE_A, slug: "clone-a", name: "Clone A", status: "active", timezone: "UTC" };
const clonesOk: Responder = c => (isRest(c, "clones") && c.method === "GET" ? table([CLONE_ROW], c) : undefined);
const clonesDown: Responder = c => (isRest(c, "clones") && c.method === "GET" ? pgError(500) : undefined);

async function me(scope: "clone" | "fleet", clones: Responder) {
  const { key, row } = KEYS[scope];
  return withWire(anyOf(modelKeyWire(key, row), clones), async stub => {
    const res = await as(null, () => GET(new Request("http://localhost/api/v1/me", { headers: { authorization: `Bearer ${key}` } })));
    // A fix may answer plain text (e.g. a bare 503): parse JSON only when the route says it is JSON.
    const body = ((res.headers.get("content-type") ?? "").includes("json") ? await res.json() : {}) as { ok?: boolean; model?: unknown; models?: unknown[] | null };
    assert.ok(stub.calls.some((c: Call) => isRest(c, "clones")), "precondition: the route read clones");
    return { status: res.status, body };
  });
}

test("control: a clone key with the clones query OK answers ok:true and its model", async () => {
  const { status, body } = await me("clone", clonesOk);
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(body.model, CLONE_ROW);
});

test("F2: a clone key whose clones query fails is not answered 200 ok:true with model:null", async () => {
  const { status, body } = await me("clone", clonesDown);
  assert.ok(!(status === 200 && body.ok === true && body.model === null),
    `database failure answered ${status} ${JSON.stringify(body).slice(0, 200)}`);
});

test("F2: a fleet key whose clones query fails is not answered 200 ok:true with models:[]", async () => {
  const { status, body } = await me("fleet", clonesDown);
  assert.ok(!(status === 200 && body.ok === true && Array.isArray(body.models) && body.models.length === 0),
    `database failure answered ${status} ${JSON.stringify(body).slice(0, 200)}`);
});
