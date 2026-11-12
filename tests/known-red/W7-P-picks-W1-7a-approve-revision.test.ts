/**
 * KNOWN RED (W1 lane 7a finding 5, wire part; REVIEW.md invariant 7 "Approve ... carry the version they saw (expectedRevision,
 * generation)"). lib/onlyfans/plan-c-client.ts approveDraft posts only `{expectedVersion, commandKey}`; the conversation revision
 * the operator saw (`draft.conversationRevision`, parsed at plan-c.ts:123) never leaves the browser, so a draft that went stale
 * after a new fan message is approvable unless the backend bumps draftVersion. The route also refuses the key today
 * (plan-c-route.ts approve `exactly(body, ["expectedVersion","commandKey"])`), so the fix spans client + route + backend contract.
 * Written by W7 P-picks (confirm-over-find). Offline: fake fetch only. Team's Claude owns the fix. Not wired into npm scripts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createPlanCClient } from "../../lib/onlyfans/plan-c-client";
import { MOCK_ACCOUNT, PLAN_C_SCHEMA, parsedDraft, scopedDraft } from "../rules/plan-c-fixtures";

async function approveBody() {
  const bodies: Record<string, unknown>[] = [];
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ schemaVersion: PLAN_C_SCHEMA, ok: true, outcome: "recorded" }), { status: 200 });
  }) as typeof fetch;
  const draft = parsedDraft({ ...scopedDraft(), conversationRevision: 7 });
  assert.equal(draft.conversationRevision, 7, "fixture must carry the revision the operator saw");
  await createPlanCClient({ accountId: MOCK_ACCOUNT, fetchImpl }).approveDraft(draft);
  assert.equal(bodies.length, 1);
  return { body: bodies[0], draft };
}

test("control: approve carries the draft version the operator saw", async () => {
  const { body, draft } = await approveBody();
  assert.equal(body.expectedVersion, draft.draftVersion);
});

test("finding 5: approve carries the conversation revision the operator saw", async () => {
  const { body } = await approveBody();
  assert.equal(body.expectedRevision, 7, `approve body keys ${Object.keys(body).join(",")} omit the conversation revision`);
});
