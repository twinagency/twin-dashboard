/**
 * RULE G02 (R1 finding 5; REVIEW.md invariant 7 "No false success", D7): once an intent's commandKey has had an unconfirmed
 * attempt, only a recorded ack releases it. A later refusal (the dashboard's own pre-call 401, say) proves nothing about the
 * first attempt, which may have committed; a fresh key on the next retry could make the backend act twice. Offline: fake fetch.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PLAN_C_SCHEMA, parsedDraft, recordingClient } from "../rules/plan-c-fixtures";

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

test("finding 5: after the recorded ack the key is released", async () => {
  const { held } = await run([lost, refused, recorded]);
  assert.equal(held, 0);
});
