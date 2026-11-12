// KNOWN RED (W1 lane 7a finding 12, docs/review/W1/preview-plan-c-status-ui.md; REVIEW.md inv 7 "No false
// success" and Structure "duplicate helper where a canonical one exists").
// Finding 11 (1-character engine note) is not tested: the engine route contract only requires non-empty, <= 108
// (requests/[requestId]/route.ts:32); a 6-char minimum is Plan C's, not the engine's (codex final check).
//  12: EngineStatus.tsx:52-54 shows "Take over the conversation first, then accept this request." but Accept
//      responsibility is disabled only while pending, so it can be accepted without taking over. Design-neutral: the
//      test only forbids the copy and an enabled Accept together.
// Team's Claude owns the fix. Not wired into npm scripts. Offline: 7a-harness (jsdom), synthetic engine views. No network.
import assert from "node:assert/strict";
import test from "node:test";
import { button, engineView, q, showEngine, text } from "./7a-harness";

const show = (status: string, mode: "active" | "human") => showEngine(engineView([{ requestId: "7a000000-0000-4000-8000-000000000011", sourceMessageId: "9", status,
  owner: "agency-user", nextStep: "human_review", actionOutcome: null, actionType: "reply", revision: 4 }], { mode }), { onTakeover: () => {}, onAction: async () => ({ ok: true }) });

test("finding 12: control: under human control Accept responsibility is live and the copy is gone", async () => {
  await show("handover_pending", "human");
  assert.equal(button("Accept responsibility")?.disabled, false);
  assert.doesNotMatch(text(), /Take over the conversation first/);
});

test("finding 12: the 'take over first' copy and an enabled Accept responsibility are never shown together", async () => {
  await show("handover_pending", "active");
  assert.ok(q("[data-engine-request]"), "fixture: the request row renders");
  const copy = /Take over the conversation first/.test(text()), accept = button("Accept responsibility");
  assert.ok(!(copy && accept && !accept.disabled), "the copy says take over first while Accept is enabled (hide, disable or reword: any one fixes it)");
});
