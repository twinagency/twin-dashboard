/**
 * Characterization (W1 lane 5 CH-C; REVIEW.md invariant 7 "Isolation", RISKS D3 named owner): all five Plan C routes under
 * app/api/onlyfans-controls/accounts/[accountId]/plan-c/ (drafts GET, unresolved GET, unresolved/[id]/reconcile POST,
 * conversations/[conversationId]/[action] POST, drafts/[requestId]/[generation]/[action] POST) answer 403 with zero backend calls
 * for a verified operator session whose named-owner lookup resolves to nothing, because planCGate ->
 * planCOperatorOnly (lib/onlyfans/plan-c-route.ts:22) insists on `pilotActor`. Control: the same five requests with a named owner
 * reach the backend. Driven through tests/rules/controls-route.child.ts (fake owner-identity RPC answers null or a UUID).
 * Not duplicated: lane 4 CH2 pins requireOnlyFansRead's pilotActor resolution; lane 1 PC1 pins the owner core;
 * tests/contracts/plan-c.test.ts pins planCOperatorOnly given a ctx. None drives the five route handlers end to end.
 * Mutation-proven: c-1 lets planCOperatorOnly fall back to `ctx.actor` when `pilotActor` is null (only the "no named owner" test red).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PLAN_C_ROUTES, controlsChild } from "./controls-fixtures";

const run = () => controlsChild("plan-c-no-owner");

test("control: with a named owner the five Plan C routes reach the backend", () => {
  for (const route of PLAN_C_ROUTES) {
    const r = run()["named owner"][route];
    assert.equal(r.status, 200, `${route} answered ${r.status}`);
    assert.equal(r.calls.length, 1, `${route} backend calls`);
  }
});

test("CH-C: without a named owner every Plan C route answers 403 and never reaches the backend", () => {
  for (const route of PLAN_C_ROUTES) {
    const r = run()["no owner"][route];
    assert.equal(r.status, 403, `${route} answered ${r.status}`);
    assert.deepEqual(r.calls, [], `${route} reached the backend without a named owner`);
  }
});
