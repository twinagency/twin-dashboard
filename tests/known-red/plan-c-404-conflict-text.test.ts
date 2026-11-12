/**
 * KNOWN RED (W1 lane 1 finding 12; REVIEW.md "UI built on a mock contract the backend does not serve", RISKS R5).
 * lib/onlyfans/plan-c-backend.ts:44-45 gives 404 (and 410) the conflict text "This draft or conversation changed since you loaded
 * it". The outcome is correctly "refused" with reload; only the text is wrong: an unserved route (R5) is not a changed draft.
 * Measured: 404 -> error === PLAN_C_CONFLICT_TEXT. Turns green when a 404 says the item or route is not available instead.
 * Team's Claude owns the fix. Not wired into npm scripts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PLAN_C_CONFLICT_TEXT } from "../../lib/onlyfans/plan-c";
import { stopAnswered as answered } from "../rules/plan-c-fixtures";

const stopAnswered = (status: number) => answered(() => new Response(null, { status }));

test("control: a 409 is a conflict with the conflict text", async () => {
  const result = await stopAnswered(409);
  assert.equal(result.ok, false);
  if (!result.ok) { assert.equal(result.outcome, "conflict"); assert.equal(result.error, PLAN_C_CONFLICT_TEXT); }
});

test("finding 12: a 404 is refused without claiming the draft or conversation changed", async () => {
  const result = await stopAnswered(404);
  assert.equal(result.ok, false);
  if (!result.ok) { assert.equal(result.outcome, "refused"); assert.notEqual(result.error, PLAN_C_CONFLICT_TEXT); }
});
