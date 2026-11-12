/**
 * KNOWN RED (W1 lane 1 finding 5; REVIEW.md invariant 7 D7 "A refusal the dashboard raises before calling upstream is refused").
 * lib/onlyfans/plan-c-guard.ts:22 passes requireOnlyFansRead's own denial through unchanged (reads.ts denialBody: `{ok,state,code,
 * error}`, no schemaVersion/outcome), and lib/onlyfans/plan-c-client.ts:52-63 ignores the HTTP status, so a pre-call 401 reads
 * "unconfirmed", the intent key is kept and the operator is told "Retrying the same action is safe".
 * Measured end to end: the browser client against the REAL approve route with no dashboard session -> route 401, nothing sent
 * upstream, client outcome "unconfirmed", keys.size() 1.
 * Preconditions: the route really answered 401 (status 0 would mean it threw and the client's catch said unconfirmed for the
 * wrong reason) and nothing went upstream.
 * Turns green under EITHER fix location: the guard answering its denials with a Plan C `outcome:"refused"` body, or the client
 * treating a dashboard denial (or any non-JSON-contract 4xx it raised itself) as refused. Either way: refused, key released.
 * Runs in tests/rules/plan-c-gate-scope.child.ts (real routes; only next/headers and the server-only line replaced; fake fetch
 * at the wire), via planCRouteChild in tests/rules/plan-c-fixtures.ts.
 * Team's Claude owns the fix. Not wired into npm scripts.
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
