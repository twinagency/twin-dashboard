/**
 * Regression guard (G05, W1 lane 1 finding 3; REVIEW invariant 7 "Isolation", "`[accountId]` routes scope-checked").
 * lib/onlyfans/plan-c-guard.ts (planCGate) asks the backend's pilot scope for THIS actor on THIS account before relaying any Plan C
 * read or write. A write on an account outside the actor's scope never reaches the backend and is answered as a Plan C refusal.
 * Runs the real conversation route via planCRouteChild("scope") in tests/rules/plan-c-fixtures.ts (child: tests/rules/plan-c-route.child.ts;
 * only next/headers and the server-only line replaced, fake fetch at the wire; pilot-scope answers 403 for any account but MOCK_ACCOUNT).
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
