import assert from "node:assert/strict";
import test from "node:test";
import { engineRequestLabel, parseEngineStatus } from "../../lib/onlyfans/engine-status.ts";

const request = { requestId: "12345678-1234-1234-1234-123456789abc", sourceMessageId: "1",
  status: "waiting_provider", owner: "engine", nextStep: "reconcile_existing_action", actionOutcome: "unknown", actionType: "reply" };
const view = { schemaVersion: "of-engine.v1", state: "current", accountId: "of-a", conversationId: "of-a:42",
  environment: "simulation", mode: "active", salesMode: "paused", truncated: false, requests: [request] };

test("engine status is scoped, versioned and preserves uncertainty", () => {
  const parsed = parseEngineStatus(view, "of-a", "of-a:42");
  assert.equal(parsed.state, "current");
  assert.equal(parsed.salesMode, "paused");
  assert.equal(engineRequestLabel(parsed.requests[0]), "Delivery outcome needs review");
  assert.equal(parseEngineStatus(view, "of-b", "of-b:42"), null);
  assert.equal(parseEngineStatus({ ...view, schemaVersion: "of-engine.v2" }, "of-a", "of-a:42"), null);
  assert.equal(parseEngineStatus({ ...view, requests: [{ ...request, actionOutcome: "delivered" }] }, "of-a", "of-a:42"), null);
  assert.equal(parseEngineStatus({ ...view, requests: [{ ...request, actionType: "unknown" }] }, "of-a", "of-a:42"), null);
  assert.equal(parseEngineStatus({ ...view, requests: [{ ...request, partsCompleted: 3, partsTotal: 2 }] }, "of-a", "of-a:42"), null);
  assert.equal(parseEngineStatus({ ...view, requests: [{ ...request, revision: -1 }] }, "of-a", "of-a:42"), null);
  assert.equal(parseEngineStatus({ ...view, requests: [{ ...request, revision: 2 }] }, "of-a", "of-a:42").requests[0].revision, 2);
  assert.equal(parseEngineStatus({ schemaVersion: "of-engine.v1", state: "unavailable" }, "of-a", "of-a:42").state, "unavailable");
});

test("accepted handover is not presented as a completed request", () => {
  assert.equal(engineRequestLabel({ ...request, status: "handover_accepted", actionOutcome: null }), "Team member accepted responsibility");
  assert.equal(engineRequestLabel({ ...request, status: "open", nextStep: "review_delivery_dependency", actionOutcome: "ready" }), "Reply held while an earlier delivery needs review");
  assert.equal(engineRequestLabel({ ...request, status: "completed", actionOutcome: "accepted" }), "Reply completed");
});


test("offer, purchase and access are not conflated", () => {
  assert.equal(engineRequestLabel({ ...request, status: "waiting_fan", nextStep: "await_purchase_or_question", actionOutcome: "accepted", actionType: "offer" }), "Offer sent; purchase is not confirmed");
  assert.equal(engineRequestLabel({ ...request, status: "waiting_provider", nextStep: "verify_access", actionOutcome: "accepted", actionType: "offer" }), "Purchase recorded; access is not yet confirmed");
  assert.equal(engineRequestLabel({ ...request, status: "completed", actionOutcome: "accepted", actionType: "offer" }), "Purchase and access confirmed");
  assert.equal(engineRequestLabel({ ...request, status: "open", nextStep: "review_access_revocation", actionOutcome: "accepted", actionType: "offer" }), "Access revoked; review required");
});


test("ordered reply parts remain one outstanding request", () => {
  assert.equal(engineRequestLabel({ ...request, status: "open", nextStep: "send_next_part", actionOutcome: "ready", partsCompleted: 1, partsTotal: 3 }), "1 of 3 reply parts sent; remaining parts pending");
  assert.equal(engineRequestLabel({ ...request, status: "open", nextStep: "review_changed_conversation", actionOutcome: "cancelled", partsCompleted: 1, partsTotal: 3 }), "Reply needs review after the conversation changed");
});
