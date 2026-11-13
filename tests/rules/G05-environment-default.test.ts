/**
 * Regression guard (G05; REVIEW invariant 7 "No false success", no silent fallback hiding an invariant). The request action route
 * (app/api/onlyfans-controls/accounts/[accountId]/conversations/[conversationId]/requests/[requestId]/route.ts) requires the browser
 * to name `environment` for EVERY action and never picks one itself; the client (lib/onlyfans/engine-operator-client.ts) always sends it.
 * The transport (lib/onlyfans/engine-operator.ts) holds the same rule on its own: a command naming no environment is refused before
 * any network call, never defaulted to the simulation's synthetic evidence.
 * Drives the REAL route through tests/rules/controls-route.child.ts as the internal operator; the backend is a fake wire that records
 * every POST body. Control: VALID_COMMAND (names its environment) reaches the backend once with 200, so the rule cannot drop the action.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { controlsChild } from "./controls-fixtures";
import { createEngineOperatorBackend } from "../../lib/onlyfans/engine-operator";

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

test("the transport refuses a command naming no environment with no backend call", async () => {
  const sent: string[] = [];
  const backend = createEngineOperatorBackend({ baseUrl: "http://backend.invalid", token: "t", fetchImpl: async (_u, init) => { sent.push(String(init?.body)); return new Response(null, { status: 502 }); } });
  const command = { accountId: "of-a", conversationId: "of-a:42", requestId: "0a1b2c3d-1111-4222-8333-444455556661", expectedRevision: 3,
    commandKey: "a".repeat(64), actor: "op-session:" + "b".repeat(64), note: "Checked the receipt" };
  for (const action of ["complete", "request_handover"] as const) {
    const result = await backend({ ...command, action } as Parameters<typeof backend>[0]);
    assert.equal(result.ok === false && result.outcome, "refused", `${action} with no environment was not refused`);
  }
  assert.deepEqual(sent, [], "a command naming no environment reached the backend");
});
