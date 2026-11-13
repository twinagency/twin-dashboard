/**
 * RULE G02 (W1 lane 1 finding 12; REVIEW.md "UI built on a mock contract the backend does not serve", RISKS R5): a Plan C write
 * answered 404 or 410 is refused with a reload, but never with the conflict text "This draft or conversation changed": an
 * unserved route or a missing target is not a changed draft. Only 409 is a conflict. Offline: fake fetch, no network.
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
