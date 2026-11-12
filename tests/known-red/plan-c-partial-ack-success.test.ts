/**
 * KNOWN RED (W1 lane 1 finding 7; REVIEW.md invariant 7 "No false success").
 * lib/onlyfans/plan-c-backend.ts:49-56 checks an ack's target fields "when present" (NEEDS-BACKEND.md:128) but never its `action`,
 * although the contract's acks carry one (tests/contracts/plan-c-mock-backend.ts:110,125,140). Measured: a STOP answered by an
 * otherwise matching ack that says `action:"handback"` returns ok:true, shown as "Stop recorded". That contradicts the code's own
 * "checked when present" rule, so it is the tested defect here.
 * NOT tested (recommendation only, needs a backend contract change): requiring the target fields. NEEDS-BACKEND.md:128 defines the
 * minimal ack as `{ schemaVersion, ok: true, commandKey, replayed }`, so a bare ack is contract-valid today.
 * Turns green when an ack whose `action` is present and differs from the command's action reads "unconfirmed".
 * Team's Claude owns the fix. Not wired into npm scripts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CONVERSATION, KEY, MOCK_ACCOUNT, PLAN_C_SCHEMA, stopAnswered } from "../rules/plan-c-fixtures";

const full = { schemaVersion: PLAN_C_SCHEMA, ok: true, accountId: MOCK_ACCOUNT, conversationId: CONVERSATION, action: "stop", commandKey: KEY, recordedRevision: 8, replayed: false };

test("control: a full matching STOP ack is success", async () => {
  const result = await stopAnswered(() => Response.json(full));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.recordedRevision, 8);
});

test("finding 7: an ack for a STOP that says action handback is unconfirmed, not success", async () => {
  const result = await stopAnswered(() => Response.json({ ...full, action: "handback" }));
  assert.equal(result.ok, false, "a contradicting ack was taken as success");
  if (!result.ok) assert.equal(result.outcome, "unconfirmed");
});
