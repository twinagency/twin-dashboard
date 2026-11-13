/**
 * RULE G02 (W1 lane 1 finding 5; REVIEW.md invariant 7 D7 "A refusal the dashboard raises before calling upstream is refused"):
 * planCGate tags every authorizeOnlyFansRead denial with a Plan C `outcome: "refused"` body, so the browser client reads the
 * dashboard's own pre-call denial (no session, 401, nothing sent upstream) as refused and releases the intent key, never as
 * "unconfirmed, retrying is safe". Preconditions: the route really answered 401 and nothing went upstream.
 * Runs in tests/rules/plan-c-route.child.ts (real routes; only next/headers and the server-only line replaced; fake fetch
 * at the wire), via planCRouteChild in tests/rules/plan-c-fixtures.ts. Offline.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { planCRouteChild } from "../rules/plan-c-fixtures";

type ClientRun = { outcome: string; keys: number; posts: number; status: number };

test("control: a Plan C refusal from the real route (conversation of another account) is refused and releases the key", () => {
  assert.deepEqual(planCRouteChild<ClientRun>("client-refused"), { outcome: "refused", keys: 0, posts: 0, status: 400 });
});

test("finding 5: the dashboard's own pre-call denial (no session) is refused, not unconfirmed, and releases the key", () => {
  const run = planCRouteChild<ClientRun>("client-denied");
  assert.notEqual(run.status, 0, "precondition: the route never answered (it threw, so the client's catch made it unconfirmed)");
  assert.equal(run.status, 401, "precondition: the route answered its own no-session denial");
  assert.equal(run.posts, 0, "precondition: nothing was sent upstream");
  assert.equal(run.outcome, "refused");
  assert.equal(run.keys, 0);
});
