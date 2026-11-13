/**
 * RULE G02 (R1 finding 5; REVIEW.md invariant 7 "No false success", D7): once an intent's commandKey has had an unconfirmed
 * attempt, only a recorded ack releases it. A later refusal (the dashboard's own pre-call 401, say) proves nothing about the
 * first attempt, which may have committed; a fresh key on the next retry could make the backend act twice. Offline: fake fetch.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PLAN_C_SCHEMA, parsedDraft, recordingClient, recordingFetch } from "../rules/plan-c-fixtures";
import { createPlanCClient } from "../../lib/onlyfans/plan-c-client";

const refused = () => Response.json({ schemaVersion: PLAN_C_SCHEMA, ok: false, outcome: "refused", error: "Sign in again.", reload: false }, { status: 401 });
const lost = (): Response => { throw new TypeError("connection reset"); };
const recorded = () => Response.json({ schemaVersion: PLAN_C_SCHEMA, ok: true, outcome: "recorded", replayed: true, recordedVersion: 1 });

/** Approves the same draft once per answer, in order; returns the keys sent and the store size after. */
async function run(answers: Array<() => Response>) {
  let i = 0;
  const { sent, keys, client } = recordingClient(() => answers[i++]());
  const draft = parsedDraft(), outcomes: string[] = [];
  for (let n = 0; n < answers.length; n++) { const r = await client.approveDraft(draft); outcomes.push(r.ok ? "recorded" : r.outcome); }
  return { sent, outcomes, held: keys.size() };
}

test("control: a refusal with no earlier unconfirmed attempt releases the key, so the next attempt is a new intent", async () => {
  const { sent, outcomes, held } = await run([refused, refused]);
  assert.deepEqual(outcomes, ["refused", "refused"]);
  assert.notEqual(sent[0], sent[1]);
  assert.equal(held, 0);
});

test("finding 5: unconfirmed, then refused, then retry reuses the first key", async () => {
  const { sent, outcomes } = await run([lost, refused, recorded]);
  assert.deepEqual(outcomes, ["unconfirmed", "refused", "recorded"], "precondition: the three answers were read as intended");
  assert.equal(sent[1], sent[0]);
  assert.equal(sent[2], sent[0], "a refusal after an unconfirmed attempt released the key; the retry could act twice");
});

test("finding 5: a recorded ack clears the hold, so a later refusal releases the key again", async () => {
  const { sent, outcomes, held } = await run([lost, recorded, refused, refused]);
  assert.deepEqual(outcomes, ["unconfirmed", "recorded", "refused", "refused"], "precondition: the four answers were read as intended");
  assert.equal(sent[1], sent[0], "the retry after the lost reply reuses the key");
  assert.notEqual(sent[3], sent[2], "the hold outlived the recorded ack, so keys are never released for this intent again");
  assert.equal(held, 0);
});

test("codex final P1: a held key survives a new client for the same account (remount), so the retry cannot act twice", async () => {
  let i = 0;
  const answers = [lost, recorded];
  const { sent, fetchImpl } = recordingFetch(() => answers[i++]());
  const draft = parsedDraft();
  await createPlanCClient({ accountId: "acc-remount", fetchImpl }).approveDraft(draft);
  const retry = await createPlanCClient({ accountId: "acc-remount", fetchImpl }).approveDraft(draft);
  assert.equal(retry.ok, true, "precondition: the retry was recorded");
  assert.equal(sent[1], sent[0], "the remounted client minted a fresh key for an intent whose first attempt may have committed");
});

test("control: a held key is per account; another account's same-looking intent gets its own key", async () => {
  const a = recordingFetch(() => lost()), b = recordingFetch(() => lost());
  await createPlanCClient({ accountId: "acc-iso-a", fetchImpl: a.fetchImpl }).approveDraft(parsedDraft());
  await createPlanCClient({ accountId: "acc-iso-b", fetchImpl: b.fetchImpl }).approveDraft(parsedDraft());
  assert.notEqual(a.sent[0], b.sent[0]);
});
