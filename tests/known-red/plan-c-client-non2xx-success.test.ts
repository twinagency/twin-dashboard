/**
 * KNOWN RED (W1 lane 1 finding 15; REVIEW.md invariant 7 "No false success"; Codex Sol final check P2).
 * lib/onlyfans/plan-c-client.ts:52-57 reads the JSON body of a command reply and takes `{schemaVersion, ok:true, outcome:"recorded"}`
 * as success WITHOUT looking at the HTTP status, while this dashboard's own route answers a recorded command only with 200
 * (lib/onlyfans/plan-c-route.ts:36-38). Measured: the same success-shaped body with status 500 or 409 reads ok:true ("recorded"); 202 does too (2xx, not asserted: the route only
 * ever sends 200, but 202 is not "not success" by HTTP).
 * Our proxy never emits that today, so the risk is a proxy or future route change, hence LOW-MEDIUM.
 * Turns green when a non-2xx reply is never success (any non-ok outcome passes: refused/unconfirmed/conflict is the fix's choice).
 * Team's Claude owns the fix. Not wired into npm scripts.
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
