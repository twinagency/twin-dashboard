/**
 * Regression guard (G05, W1 lane 1 finding 3; REVIEW invariant 7 "Isolation", "`[accountId]` routes scope-checked").
 * lib/onlyfans/plan-c-guard.ts (planCGate) asks the backend's pilot scope for THIS actor on THIS account before relaying any Plan C
 * read or write. A write on an account outside the actor's scope (pilot-scope 401/403) never reaches the backend and is answered
 * as a Plan C refusal. When the scope cannot be established (pilot-scope 5xx/network), only STOP (a brake) is relayed: the backend
 * re-checks account scope and pilot actor on STOP. Every other action is refused with no backend call.
 * Runs the real conversation route via planCRouteChild("scope") in tests/rules/plan-c-fixtures.ts (child: tests/rules/plan-c-route.child.ts;
 * only next/headers and the server-only line replaced, fake fetch at the wire; pilot-scope answers 503 for "of-down", 403 for any other account but MOCK_ACCOUNT).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { MOCK_ACCOUNT, planCRouteChild } from "./plan-c-fixtures";

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

test("F2: a STOP during a pilot-scope outage reaches the backend, which authorizes it", () => {
  assert.deepEqual(planCRouteChild<Scope>("scope")["of-down stop"], { status: 200, outcome: "recorded", posts: 1 });
});

test("F2: a takeover during a pilot-scope outage is refused with no backend write", () => {
  const down = planCRouteChild<Scope>("scope")["of-down takeover"];
  assert.equal(down.posts, 0, "a non-brake write was relayed although the pilot scope could not be established");
  assert.equal(down.status, 503);
  assert.equal(down.outcome, "refused");
});

test("F2: out-of-scope (403) is refused as 403, not reported as an outage", () => {
  assert.equal(planCRouteChild<Scope>("scope")["of-b"].status, 403);
});
