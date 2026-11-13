// RULE G04 R1 (#390 finding 5): lib/onlyfans-preview/actions.ts intentRequestKey, the delivery-resolution requestKey sent by
// lib/onlyfans-preview/server-data-source.ts. It must pass the controls route's shape check, be the same for the same intent (a retry
// reuses it) and differ when the intent differs, including only the expected revision.
import assert from "node:assert/strict";
import test from "node:test";
import { createCommandRequest, intentRequestKey } from "../../lib/onlyfans-preview/actions";
import { createFetchOnlyFansTransport } from "../../lib/onlyfans-preview/server-data-source";

// app/api/onlyfans-controls/accounts/[accountId]/conversations/[conversationId]/route.ts, the resolve_delivery_evidence requestKey check.
const ROUTE_SHAPE = /^[a-f0-9-]{36}$/;
const resolve = (expectedRevision: number, attemptId = "attempt-1") => createCommandRequest({ command: "resolve_delivery_evidence", accountId: "of-a",
  conversationId: "c-1", expectedRevision, payload: { kind: "delivery_resolution", attemptId, decision: "delivered", providerMessageId: "77" } });
const key = (expectedRevision: number, attemptId = "attempt-1") => intentRequestKey(resolve(expectedRevision, attemptId).idempotencyKey);

test("finding 5: the transport sends intentRequestKey(idempotencyKey), in the route's shape, not the raw idempotency key", async () => {
  const bodies: Record<string, unknown>[] = [];
  const transport = createFetchOnlyFansTransport(async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return new Response(null, { status: 503 }); });
  const command = resolve(3);
  await transport.submitControl!(command);
  assert.equal(bodies.length, 1, "the resolution was posted");
  assert.equal(bodies[0].requestKey, intentRequestKey(command.idempotencyKey));
  assert.match(String(bodies[0].requestKey), ROUTE_SHAPE);
});

test("finding 5: the key has the UUID shape the route accepts, is deterministic, and differs per revision and per attempt", () => {
  assert.match(key(3), ROUTE_SHAPE);
  assert.match(key(3), /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
  assert.equal(key(3), key(3), "the same intent must send the same key");
  assert.notEqual(key(4), key(3), "a new revision is a new intent");
  assert.notEqual(key(3, "attempt-2"), key(3));
});
