/**
 * KNOWN RED (W1 lane 5 finding 2, handed over by lane 2 f5; REVIEW.md invariant 7 "No false success" / silent fallbacks hiding an
 * invariant). app/api/onlyfans-controls/accounts/[accountId]/conversations/[conversationId]/requests/[requestId]/route.ts:31,38
 * takes `environment` from the browser body and, when it is missing, picks "simulation" itself; lib/onlyfans/engine-operator.ts:15,34
 * then stamps the resolution evidence `synthetic:operator:<note>`. So a body that names no environment is resolved under an
 * environment label the dashboard chose, whatever the binding really is.
 * Drives the REAL route through tests/rules/controls-route.child.ts as the internal operator (withDashboardAccess(null) + a
 * synthetic owner session the fake RPC verifies); the backend is a fake wire that records every POST body.
 * Control: VALID_COMMAND (names its environment) reaches the backend once with 200, so a fix cannot drop the action.
 * Turns green when a body naming no environment never reaches the backend with a dashboard-picked environment label
 * (`synthetic:` or `operator:<simulation|live|fansapi>:`): either the route refuses it (0 posts) or the backend stamps the prefix
 * from the binding (no label sent). Flipping the default from "simulation" to "live" stays red. Team's Claude owns the fix.
 * The refuse-missing route fix needs its client half: lib/onlyfans/engine-operator-client.ts:11 omits `environment` in simulation,
 * so a route-only fix 400s every simulation resolve from the real UI. The control's body (`environment:"simulation"`) is one that
 * client never sends today.
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

test("F2: an operator `complete` naming no environment never reaches the backend under a dashboard-picked environment label", () => {
  const r = run()["no environment"];
  assert.ok(!(r.posts > 0 && /^(synthetic:|operator:(simulation|live|fansapi):)/.test(r.evidenceRef ?? "")),
    `missing environment was forwarded (${r.posts} post, status ${r.status}) with evidenceRef ${r.evidenceRef}`);
});
