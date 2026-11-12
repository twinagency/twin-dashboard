// KNOWN RED (REVIEW.md inv 7 "No send, no auto-retry": the idempotency key a user retry reuses; W1 lane 6 finding C6).
// Drives the real POST handler app/api/onlyfans-content/accounts/[accountId]/engine-catalogue/[itemId]/route.ts as the internal
// operator with a fake wire (tests/helpers/w1-content-config-route-harness.ts). The key is
// `sha256(JSON.stringify([actor, accountId, itemId, body]))` (route.ts:28), so the same decision sent with its keys in another order
// relays a different commandKey and the backend cannot dedupe it. Low severity: the shipped UI builds a fixed order
// (EngineCatalogue.tsx:32,36) and expectedRevision limits harm. Fixed looks like hashing a canonical form (`canonicalContent([...])`,
// as vault-route.ts:23 does). Exact hash input not pinned.
// Team's Claude owns the fix. Not wired into npm scripts or init.sh yet (lane 10). Runs with init.sh's plain commands (the file
// re-runs itself under --experimental-test-module-mocks, see ensureModuleMocks):
//   node --import tsx --test --test-name-pattern='^control' tests/known-red/w1-content-config-catalogue-key.test.ts   (green)
//   node --import tsx --test --test-skip-pattern='^control' tests/known-red/w1-content-config-catalogue-key.test.ts   (red, ERR_ASSERTION)
import assert from "node:assert/strict";
import test from "node:test";
import { ROUTES, call, calls, catalogueAck, decision, ensureModuleMocks, upstream } from "../helpers/w1-content-config-route-harness";

const reordered = { confirmedPriceCents: 1200, expectedFingerprint: "b".repeat(64), expectedRevision: 3, action: "approve" };
const decide = (body: unknown) => call(ROUTES.catalogue, { accountId: "of-a", itemId: "123" }, { body });

if (ensureModuleMocks(import.meta.url, { controls: 1, rest: 1 })) {
  test("control: an identical catalogue retry relays the same commandKey", async () => {
    upstream(catalogueAck);
    for (const body of [decision, decision]) assert.equal((await decide(body)).status, 200);
    assert.equal(calls.length, 2, "the mocked session fetch carried both POSTs (route.ts mock applied)");
    assert.match(String(calls[0].body?.commandKey), /^[a-f0-9]{64}$/);
    assert.equal(calls[1].body?.commandKey, calls[0].body?.commandKey);
  });

  test("C6: the same catalogue decision with reordered keys relays the same commandKey", async () => {
    upstream(catalogueAck);
    for (const body of [decision, reordered]) assert.equal((await decide(body)).status, 200);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].body?.commandKey, calls[0].body?.commandKey, "key order changed the commandKey of an identical decision");
  });
}
