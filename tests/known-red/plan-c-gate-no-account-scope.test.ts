/**
 * KNOWN RED (W1 lane 1 finding 3, structure S5; REVIEW.md invariant 7 "Isolation", "`[accountId]` routes scope-checked").
 * lib/onlyfans/plan-c-guard.ts:19-29 (planCGate) authenticates the named owner but never asks the backend whether that actor may
 * act on THIS account: the page does (`backend.scope(accountId, actor)`, app/onlyfans/plan-c/page.tsx:24-25), the API routes do
 * not, and plan-c-guard.ts:17 claims "a route cannot forget a gate". Measured: with pilot-scope answering 403 for account of-b,
 * POST .../accounts/of-b/plan-c/conversations/of-b:1/stop is relayed upstream with the shared CONTROL token and returns 200.
 * Turns green when a write on an account outside the actor's pilot scope never reaches the backend and is answered as a Plan C
 * refusal (any non-200 status: backend.scope maps an upstream 403 to 503, so the exact status is the fix's choice).
 * Runs the real route in tests/rules/plan-c-gate-scope.child.ts (only next/headers and the server-only line replaced, fake
 * fetch at the wire), via planCRouteChild in tests/rules/plan-c-fixtures.ts.
 * Team's Claude owns the fix. Not wired into npm scripts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { MOCK_ACCOUNT, planCRouteChild } from "../rules/plan-c-fixtures";

type Scope = Record<string, { status: number; outcome: unknown; posts: number }>;

test("control: the operator's STOP on an account the backend scopes to them goes through the real route once", () => {
  assert.deepEqual(planCRouteChild<Scope>("scope")[MOCK_ACCOUNT], { status: 200, outcome: "recorded", posts: 1 });
});

test("finding 3: a STOP on an account the backend does not scope to this actor is refused with no backend write", () => {
  const foreign = planCRouteChild<Scope>("scope")["of-b"];
  assert.equal(foreign.posts, 0, "the write was relayed upstream for an account outside the actor's pilot scope");
  assert.notEqual(foreign.status, 200);
  assert.equal(foreign.outcome, "refused");
});
