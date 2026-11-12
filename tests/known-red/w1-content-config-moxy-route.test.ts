// KNOWN RED (REVIEW.md inv 7 "No send, no auto-retry", inv 6 "Secrets"; W1 lane 6 findings C1, C2, C8; route halves of lane 3 F4/F5/F13).
// Drives the real POST handler app/api/onlyfans-configuration/accounts/[accountId]/moxy/route.ts as the internal operator with a
// fake wire (tests/helpers/w1-content-config-route-harness.ts: route.ts mocked, upstream https://backend.invalid, synthetic tokens).
// C1: the route relays the PUT with no idempotency key (moxy/route.ts:41 `backend.save(accountId, body, ctx.actor)`), so a user
//     retry after a lost response is a new write. Fixed looks like a stable identity in the upstream PUT body, either a hashed
//     `commandKey` (64 hex) or a `requestId`: the same for the same change from the same session, different for a different change.
//     The exact hash input is not pinned, but the test sends no requestId: a fix that REQUIRES a kept client requestId in the request
//     body needs a TEST-CHANGE here. Mode "preview", not "off": lane 3 F16 will change the shape of an Off.
// C2: a successful save answers the raw upstream ack (moxy/route.ts:42 `NextResponse.json(result.ack, ...)`), so any unchecked upstream
//     key reaches the browser. Fixed looks like a by-name projection, e.g. `{ ok, accountId, moxy: { mode, revision, readiness } }`
//     that still passes the UI's moxyAck (MoxyControls.tsx:83).
// C8: the route hand-parses JSON (moxy/route.ts:27-37) instead of readCommandJson, so a duplicate `mode` key is accepted and the last
//     one is relayed. Fixed looks like `readCommandJson(request, 130000)` (duplicate keys refused 400).
// Team's Claude owns the fixes. Not wired into npm scripts or init.sh yet (lane 10). Runs with init.sh's plain commands (the file
// re-runs itself under --experimental-test-module-mocks, see ensureModuleMocks):
//   node --import tsx --test --test-name-pattern='^control' tests/known-red/w1-content-config-moxy-route.test.ts   (green)
//   node --import tsx --test --test-skip-pattern='^control' tests/known-red/w1-content-config-moxy-route.test.ts   (red, ERR_ASSERTION)
import assert from "node:assert/strict";
import test from "node:test";
import { moxyAck } from "../../lib/onlyfans/moxy";
import { BACKEND, ROUTES, call, calls, ensureModuleMocks, moxyAckFor, moxyChange as change, upstream } from "../helpers/w1-content-config-route-harness";

const save = (body: unknown) => call(ROUTES.moxy, { accountId: "of-a" }, { body });

if (ensureModuleMocks(import.meta.url, { controls: 1, rest: 3 })) {
  test("control: an invalid Moxy change is refused 400 before any upstream call", async () => {
    upstream(moxyAckFor());
    const refused = await save({ ...change, commandKey: "f".repeat(64) });
    assert.equal(refused.status, 400);
    assert.equal(calls.length, 0, "an invalid change never reaches upstream");
    const saved = await save(change);
    assert.equal(saved.status, 200, "control: a valid change is relayed and acked");
    assert.equal(calls.length, 1, "the mocked session fetch carried the PUT (route.ts mock applied)");
    assert.equal(calls[0].method, "PUT"); assert.equal(calls[0].url, `${BACKEND}/onlyfans/configuration/v1/accounts/of-a/moxy`);
  });

  test("C1: a retried identical Moxy save relays the same commandKey, a different change a different one", async () => {
    upstream(moxyAckFor());
    const preview = { ...change, mode: "preview" };
    for (const body of [preview, preview, { ...preview, expectedRevision: 5 }]) assert.equal((await save(body)).status, 200);
    assert.equal(calls.length, 3);
    /** The stable identity in an upstream PUT body: a 64-hex commandKey, else a non-empty requestId, else null. */
    const identity = (body: Record<string, unknown> | null) => typeof body?.commandKey === "string" && /^[a-f0-9]{64}$/.test(body.commandKey) ? body.commandKey
      : typeof body?.requestId === "string" && body.requestId.length > 0 ? body.requestId : null;
    const keys = calls.map(c => identity(c.body));
    for (const key of keys) assert.notEqual(key, null, `upstream PUT keys ${Object.keys(calls[0].body ?? {}).sort().join(",")} carry no commandKey or requestId`);
    assert.equal(keys[0], keys[1], "a retry of the same change must carry the same key");
    assert.notEqual(keys[2], keys[0], "a different change must carry a different key");
  });

  test("C2: a successful Moxy save does not echo unknown upstream keys", async () => {
    upstream(moxyAckFor({ internalDebug: "sentinel-debug" }, { debugTrace: "sentinel-trace" }));
    const response = await save(change);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.equal(moxyAck(JSON.parse(text), "of-a", change), true, "the answer must still satisfy the UI's moxyAck");
    assert.equal(text.includes("sentinel-debug"), false, "top-level upstream key reached the browser");
    assert.equal(text.includes("sentinel-trace"), false, "unchecked moxy.* upstream key reached the browser");
  });

  test("C8: a Moxy body with a duplicate mode key is refused 400 before any upstream call", async () => {
    upstream(moxyAckFor());
    const response = await save('{"expectedRevision":1,"mode":"off","settings":{},"mode":"on"}');
    assert.equal(response.status, 400, "duplicate keys must be refused, not resolved to the last one");
    assert.equal(calls.length, 0, "no upstream call");
  });
}
