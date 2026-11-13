/**
 * RULE G02 (W1 lane 1 finding 7; REVIEW.md invariant 7 "No false success"): plan-c-backend checks every target field of an ack
 * when present, `action` included, so an ack whose action differs from the command (a STOP acked as handback) reads
 * "unconfirmed", never success. A bare contract-minimal ack `{ schemaVersion, ok: true, commandKey, replayed }` stays valid
 * (NEEDS-BACKEND.md section 7). Offline: fake fetch, no network.
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
