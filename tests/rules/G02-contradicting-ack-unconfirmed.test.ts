/**
 * RULE G02 (W1 lane 1 finding 7, R1 finding 6; REVIEW.md invariant 7 "No false success"): a Plan C ack is success only when its
 * `action` is present and equals the command's. A STOP acked as handback, or acked with no action at all, reads "unconfirmed".
 * The real backend echoes the route's action word in every ack and replay (twin-onlyfans-backend
 * service/conversation_engine/operator_v2.py draft_command, _control_ack, reconcile), so requiring it strands nobody.
 * Other target fields are checked when present (NEEDS-BACKEND.md section 7). Offline: fake fetch, no network.
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

test("finding 6: an ack with no action is unconfirmed, not success", async () => {
  const { action: _action, ...minimal } = full;
  const result = await stopAnswered(() => Response.json(minimal));
  assert.equal(result.ok, false, "an ack that does not say which action it recorded was taken as success");
  if (!result.ok) assert.equal(result.outcome, "unconfirmed");
});
