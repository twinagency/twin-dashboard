// Regression guard (G25): was KNOWN RED tests/known-red/W4-lib-onlyfans-preview-2-plus2-stop-revision.test.ts (origin/jaka/fix-sweep-20261112), fixed in this PR (lib/onlyfans/controls.ts). Promoted: F13 (mark_no_contact, pause_automation, request_takeover). Original header below.
/**
 * KNOWN RED (W4 lib-onlyfans-preview-2-plus2 F13; REVIEW inv 7 "Holds and STOP: a STOP is never harder to trigger than a
 * go (no fingerprint/revision gate on stop)"). Driven through the real createFetchOnlyFansTransport(fakeFetch)
 * .submitControl, with a fake fetch at the wire answering a schema-valid of-controls.v1 ack.
 *   lib/onlyfans/controls.ts:49 parseControlAck accepts the ack only when recordedRevision === expectedRevision + 1, and
 *   lib/onlyfans-preview/server-data-source.ts:172-179 turns any rejected ack into "unconfirmed" ("The outcome is not
 *   confirmed"). A stop the backend applied at a later revision (the fan kept writing between the operator's read and
 *   the click) therefore reads as not confirmed, inviting a second stop and leaving the operator unsure the bot halted.
 *   Same class as W3 B5/F12/F22 at other sites; this site is new. controls.ts half belongs to lane lib-onlyfans-2.
 *   [m dashboard, i backend: whether the backend ever records a stop at > expected+1 is inferred, not measured.]
 *   This is the dashboard proof for W3 lib-onlyfans-1 F16 (the per-conversation stop sends expectedRevision and needs
 *   an exact revision, controls-backend.ts:21); same class as RISKS R13 (emergency stop gated on an exact fingerprint).
 * Fixed looks like: stop-direction commands (mark_no_contact, pause_automation, request_takeover: each halts the bot on
 * this conversation) read as recorded for an ack that names this account, conversation and action at any later
 * revision; never "unconfirmed" or "refused". The controls pin what must stay refused-to-record: a go-direction command
 * (resume_automation) at a later revision, an ack naming another conversation, and an ack at or below the expected one.
 * Team's Claude owns the fix. Not wired into npm scripts or init.sh.
 * Run: nice -n 10 node --import tsx --test --test-name-pattern='^control' <this file>   (green)
 *      nice -n 10 node --import tsx --test --test-skip-pattern='^control' <this file>   (red, ERR_ASSERTION)
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createFetchOnlyFansTransport } from "../../lib/onlyfans-preview/server-data-source";
import type { CommandRequest } from "../../lib/onlyfans-preview/types";

const ACCOUNT = "of-a", CONVERSATION = "42", EXPECTED = 5;

type Action = "mark_no_contact" | "pause_automation" | "request_takeover" | "resume_automation";
async function stop(action: Action, recordedRevision: number, ackConversation = CONVERSATION) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ schemaVersion: "of-controls.v1", ok: true, applied: true, commandKey: "c".repeat(64),
      accountId: ACCOUNT, conversationId: ackConversation, action, recordedRevision }),
    { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  const command: CommandRequest = { commandId: "cmd-synthetic", idempotencyKey: "idem-synthetic", command: action,
    accountId: ACCOUNT, conversationId: CONVERSATION, expectedRevision: EXPECTED, payload: { kind: "none" } };
  const result = await createFetchOnlyFansTransport(fetchImpl, "https://dashboard.invalid/api/onlyfans").submitControl!(command);
  assert.equal(calls.length, 1, "the stop reached the (fake) control route once");
  return result;
}

for (const action of ["mark_no_contact", "pause_automation", "request_takeover"] as const) {
  test(`control: ${action} acked at expectedRevision + 1 is recorded`, async () => {
    const result = await stop(action, EXPECTED + 1);
    assert.equal(result.outcome, "recorded");
    assert.equal(result.accepted, true);
    assert.equal(result.recordedRevision, EXPECTED + 1);
  });

  test(`F13: ${action} the backend applied at a later revision does not read unconfirmed or refused`, async () => {
    const result = await stop(action, EXPECTED + 3);
    assert.notEqual(result.outcome, "unconfirmed", `the stop was applied at revision ${EXPECTED + 3}; "${result.note}"`);
    assert.notEqual(result.outcome, "refused");
  });
}

test("control: resume_automation (go direction) acked at a later revision is not recorded", async () => {
  assert.notEqual((await stop("resume_automation", EXPECTED + 3)).outcome, "recorded");
});

for (const action of ["mark_no_contact", "pause_automation", "request_takeover"] as const) {
  test(`control: a ${action} ack naming another conversation is not recorded`, async () => {
    assert.notEqual((await stop(action, EXPECTED + 1, "43")).outcome, "recorded");
  });

  test(`control: a ${action} ack at or below the expected revision is not recorded`, async () => {
    assert.notEqual((await stop(action, EXPECTED)).outcome, "recorded");
    assert.notEqual((await stop(action, EXPECTED - 1)).outcome, "recorded");
  });
}
