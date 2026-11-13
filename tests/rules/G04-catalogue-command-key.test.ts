// RULE G04, was KNOWN RED (REVIEW.md inv 7 "No send, no auto-retry": the idempotency key a user retry reuses; W1 lane 6 finding C6).
// Drives the real POST handler app/api/onlyfans-content/accounts/[accountId]/engine-catalogue/[itemId]/route.ts as the internal
// operator over the fake wire in tests/helpers/W3-api-onlyfans-plus7-harness.ts (see its header for what is replaced). The key was
// `sha256(JSON.stringify([actor, accountId, itemId, body]))`, so the same decision sent with its keys in another order relayed a
// different commandKey and the backend could not dedupe it. Low severity: the shipped UI builds a fixed order and expectedRevision
// limits harm. Exact hash input not pinned.
// Green since G04: the route hashes canonicalContent([actor, accountId, itemId, body]), as vault-route.ts does.
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { ENGINE_CATALOGUE_SCHEMA } from "../../lib/onlyfans/engine-catalogue";
import { call, calls, ensureModuleMocks, reset, upstream, type Call } from "../helpers/W3-api-onlyfans-plus7-harness";

const decision = { action: "approve", expectedRevision: 3, expectedFingerprint: "b".repeat(64), confirmedPriceCents: 1200 };
const reordered = { confirmedPriceCents: 1200, expectedFingerprint: "b".repeat(64), expectedRevision: 3, action: "approve" };
/** A valid catalogue ack echoing the relayed commandKey; item 123, approve, revision 3. */
const ack = (c: Call) => Response.json({ schemaVersion: ENGINE_CATALOGUE_SCHEMA, ok: true, applied: true, accountId: "of-a", itemId: "123",
  commandKey: (c.body as Record<string, unknown> | null)?.commandKey, action: "approve", recordedRevision: 4, status: "approved" });
const decide = (body: unknown) => call("onlyfans-content/accounts/[accountId]/engine-catalogue/[itemId]", { accountId: "of-a", itemId: "123" }, { body });
const keys = () => calls.filter(c => c.method === "POST").map(c => (c.body as Record<string, unknown>).commandKey);

if (ensureModuleMocks(import.meta.url, { controls: 1, rest: 1 })) {
  beforeEach(() => { reset(); upstream(ack); });
  test("control: an identical catalogue retry relays the same commandKey", async () => {
    for (const body of [decision, decision]) assert.equal((await decide(body)).status, 200);
    assert.equal(keys().length, 2);
    assert.match(String(keys()[0]), /^[a-f0-9]{64}$/);
    assert.equal(keys()[1], keys()[0]);
  });

  test("C6: the same catalogue decision with reordered keys relays the same commandKey", async () => {
    for (const body of [decision, reordered]) assert.equal((await decide(body)).status, 200);
    assert.equal(keys().length, 2);
    assert.equal(keys()[1], keys()[0], "key order changed the commandKey of an identical decision");
  });
}
