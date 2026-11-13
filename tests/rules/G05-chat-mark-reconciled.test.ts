/**
 * Regression guard, green since G05. Was KNOWN RED (W1 lane 4 F1; docs/RISKS.md D6; REVIEW.md invariant 7 "Capability": block a diff that loosens who may
 * `mark_reconciled` or release on a live or fansapi binding). A chat-only agency session (canManage false, canChat true) is
 * admitted by lib/onlyfans/agency-scope.ts:53 (middleware) and :74 (chatBackendPath), and the requests route
 * app/api/onlyfans-controls/accounts/[accountId]/conversations/[conversationId]/requests/[requestId]/route.ts:14-40 takes
 * capability "chat", accepts all five actions and any environment, and forwards with no canManage check.
 * Drives the REAL route through tests/rules/core-route.child.ts (see its header for exactly what is replaced); the backend is a
 * fake wire that records every POST to .../requests/<uuid>.
 * Controls: chat-only `complete` in simulation reaches the backend once (D6 accepts it); a MANAGER's `mark_reconciled` reaches
 * it once (so a fix cannot just delete the action).
 * Held since G05: the route gates `mark_reconciled` to managers, refusing 403 before calling upstream.
 * Caveats: (1) `environment` is a client-supplied label (route.ts:37 "A label for the audit string only"); a dashboard gate on
 * that label cannot prove D6 for real bindings, so real-binding release is NOT asserted here (the former Red B was removed in
 * the Codex final check): it needs trusted binding state from the backend. (2) Exposure today is
 * latent: lib/onlyfans/engine-operator.ts:6 says `mark_reconciled` is not served by the backend yet, and RISKS D6 says the
 * backend grant is "synthetic-only today". (3) D6 and REVIEW.md:23 do not define "release", and RISKS.md:37
 * notes the team spec grants chatters real-binding resolution: owner decision pending (findings file, Orphan (d)).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { coreRouteChild } from "./core-fixtures";

const run = () => coreRouteChild("d6");

test("control: a chat-only agency session's simulation `complete` reaches the backend exactly once (D6)", () => {
  const r = run()["chat complete simulation"];
  assert.equal(r.posts, 1);
  assert.equal(r.status, 200);
});

test("control: a manager agency session's `mark_reconciled` reaches the backend exactly once", () => {
  const r = run()["manager mark_reconciled"];
  assert.equal(r.posts, 1);
  assert.equal(r.status, 200);
});

test("F1 A: a chat-only agency session's `mark_reconciled` is refused 403 and never reaches the backend", () => {
  const r = run()["chat mark_reconciled"];
  assert.equal(r.posts, 0, "mark_reconciled from a chat-only session was forwarded to the backend");
  assert.equal(r.status, 403);
});
