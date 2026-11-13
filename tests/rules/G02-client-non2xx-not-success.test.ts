/**
 * RULE G02 (W1 lane 1 finding 15; REVIEW.md invariant 7 "No false success"): the Plan C browser client reads success only from a
 * 2xx whose body says recorded. A non-2xx reply is never success, whatever its body claims (the route answers a recorded
 * command only with 200). Offline: fake fetch, no network.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PLAN_C_SCHEMA, parsedDraft, recordingClient } from "../rules/plan-c-fixtures";

const recorded = (status: number) => () => Response.json({ schemaVersion: PLAN_C_SCHEMA, ok: true, outcome: "recorded", replayed: false, recordedVersion: 1 }, { status });

test("control: a 200 recorded reply is success", async () => {
  const result = await recordingClient(recorded(200)).client.approveDraft(parsedDraft());
  assert.equal(result.ok, true);
});

for (const status of [500, 409])
  test(`finding 15: a ${status} reply with a recorded-shaped body is not success`, async () => {
    const result = await recordingClient(recorded(status)).client.approveDraft(parsedDraft());
    assert.equal(result.ok, false, `HTTP ${status} was read as recorded`);
  });
