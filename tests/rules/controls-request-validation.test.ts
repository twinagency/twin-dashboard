/**
 * Characterization (W1 lane 5 CH-F; finding 8 safety net for a `parseEngineOperatorCommand` refactor). The REAL requests route
 * (app/api/onlyfans-controls/accounts/[accountId]/conversations/[conversationId]/requests/[requestId]/route.ts:24-32) refuses each
 * malformed body with 400 `outcome:"refused"` before anything reaches the backend. Each case breaks exactly one rule (so another rule
 * cannot mask it): an unknown key (:30), a note over 108 characters, a control character, an untrimmed or blank note (:32), no note
 * on a resolution (:30 hasOwn + :32 typeof), expectedRevision -1, 2^31-1 or 3.5 (:27), an unknown action sent without a note (:26),
 * environment "prod" (:31). Control: a 108-character note (the boundary) is accepted and posted once. One test per rule.
 * Internal operator, driven through tests/rules/controls-route.child.ts (see tests/rules/controls-wire.ts for what is replaced).
 * Not duplicated [m grep tests/]: no other test drives this route's 400 rules (tests/components/engine-ui.test.tsx fakes the route).
 * Mutation-proven, one per case (tests/rules/mutations/W1-app-onlyfans-controls/f-*): each mutation relaxes one rule and turns only
 * its case red; "note missing on complete" needs a two-site mutation (f-11) because :30 and :32 both refuse it.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { INVALID_COMMANDS, controlsChild } from "./controls-fixtures";

const run = () => controlsChild("validation");

test("control: a complete with a 108-character note reaches the backend once", () => {
  const r = run()["note 108 chars"];
  assert.equal(r.status, 200, `answered ${r.status}`);
  assert.equal(r.posts, 1);
});

for (const name of INVALID_COMMANDS) test(`CH-F: a request body with ${name} is refused 400 and never reaches the backend`, () => {
  const r = run()[name];
  assert.equal(r.status, 400, `${name} answered ${r.status}`);
  assert.equal(r.outcome, "refused");
  assert.equal(r.posts, 0, `${name} reached the backend`);
});
