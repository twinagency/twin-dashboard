/**
 * Regression guard (G05; REVIEW invariant 7 "No false success", no silent fallback hiding an invariant). The request action route
 * (app/api/onlyfans-controls/accounts/[accountId]/conversations/[conversationId]/requests/[requestId]/route.ts) requires the browser
 * to name `environment` for EVERY action and never picks one itself; the client (lib/onlyfans/engine-operator-client.ts) always sends it.
 * Drives the REAL route through tests/rules/controls-route.child.ts as the internal operator; the backend is a fake wire that records
 * every POST body. Control: VALID_COMMAND (names its environment) reaches the backend once with 200, so the rule cannot drop the action.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { controlsChild } from "./controls-fixtures";

const run = () => controlsChild("requests");

test("control: an operator `complete` that names its environment reaches the backend once", () => {
  const r = run().valid;
  assert.equal(r.status, 200);
  assert.equal(r.posts, 1);
});

test("a resolution naming no environment is refused 400 with no backend write", () => {
  const r = run()["no environment"];
  assert.deepEqual({ status: r.status, posts: r.posts }, { status: 400, posts: 0 });
});

test("a non-resolution action naming no environment is refused 400 with no backend write", () => {
  const r = run()["handover no environment"];
  assert.deepEqual({ status: r.status, posts: r.posts }, { status: 400, posts: 0 });
});
