/**
 * Characterization (W1 lane 1, "rules that hold" PC4; REVIEW.md invariant 7 "carries an idempotency key that a user retry reuses"):
 * inside one client session (lib/onlyfans/plan-c-client.ts:46-64) an unconfirmed answer keeps the intent's commandKey so the retry
 * reuses it, and a definite answer releases it so the next click is a new intent. tests/contracts/plan-c.test.ts:56 already pins
 * this for a dropped connection followed by a success. New here: an HTML 502 from a proxy (not the backend's JSON) is unconfirmed
 * and keeps the key, and a refused or conflict answer (not only a success) releases it. The cross-reload gap is known-red finding 6
 * (tests/known-red/plan-c-key-lost-on-reload.test.ts). Fake fetch only (recordingClient in tests/rules/plan-c-fixtures.ts).
 * Mutation-proven (tests/rules/mutations/W1-lib-onlyfans-plan-c/pc4-*).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PLAN_C_SCHEMA, parsedDraft, recordingClient } from "./plan-c-fixtures";

test("PC4: an HTML 502 is unconfirmed, keeps the key, and the retry reuses it", async () => {
  const draft = parsedDraft();
  const { sent, keys, client } = recordingClient(() => new Response("<html><body>502 Bad Gateway</body></html>", { status: 502, headers: { "Content-Type": "text/html" } }));
  const first = await client.approveDraft(draft);
  assert.equal(first.ok, false); if (!first.ok) { assert.equal(first.outcome, "unconfirmed"); assert.equal(first.reload, true); }
  assert.equal(keys.size(), 1, "the unconfirmed intent's key was dropped");
  await client.approveDraft(draft);
  assert.equal(sent.length, 2); assert.equal(sent[1], sent[0], "the retry minted a new key");
});

test("PC4: a refused or conflict answer releases the key and the next click is a new intent", async () => {
  const bodies: Array<[string, () => Response]> = [
    ["refused", () => Response.json({ schemaVersion: PLAN_C_SCHEMA, ok: false, outcome: "refused", error: "That draft action is invalid.", reload: false }, { status: 400 })],
    ["conflict", () => Response.json({ schemaVersion: PLAN_C_SCHEMA, ok: false, outcome: "conflict", error: "x", reload: true }, { status: 409 })],
  ];
  for (const [name, answer] of bodies) {
    const draft = parsedDraft(), { sent, keys, client } = recordingClient(answer);
    const result = await client.approveDraft(draft);
    assert.equal(result.ok, false, name); if (!result.ok) assert.equal(result.outcome, name);
    assert.equal(keys.size(), 0, `${name} kept the key`);
    await client.approveDraft(draft);
    assert.notEqual(sent[1], sent[0], `${name}: the next click reused a released key`);
  }
});
