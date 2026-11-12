// KNOWN RED (W4 lib-onlyfans-preview-1 F7): preview scenario overrides keep or drop the wrong evidence.
// withDetailOverrides (lib/onlyfans-preview/scenarios.ts:185-211) replaces the delivery outcome but keeps the old
// evidence: forcing "unknown" onto a refused send keeps the refusal text (teaches the D7 unconfirmed-vs-refused
// confusion), and forcing "sent" onto an unknown send keeps the unresolved attempt ref on a bubble now marked sent
// (rendered as "Receipt recorded"). A stale thread read (scenarios.ts:243-262) blanks the thread's messages.
// Team's Claude owns the fix. Not wired into npm scripts or init.sh (lane may not edit init.sh; window close wires it).
import assert from "node:assert/strict";
import test from "node:test";
import { ACCOUNT_AVA, conversationDetails } from "../../lib/onlyfans-preview/fixtures";
import { createFixtureOnlyFansDataSource, operatorViewer } from "../../lib/onlyfans-preview/fixture-data-source";
import { buildScenarios, DEFAULT_CONTROLS, withDetailOverrides } from "../../lib/onlyfans-preview/scenarios";
import type { ConversationDetail, DeliveryOutcome } from "../../lib/onlyfans-preview/types";
import { dataOf } from "../rules/W4-lib-onlyfans-preview-1-helpers";

const REFUSED = conversationDetails["of-conv-nova-2002"];
const UNKNOWN = conversationDetails["of-conv-ava-1002"];
const THREAD = conversationDetails["of-conv-ava-1001"];
/** Every recorded attempt id in the fixtures: a bubble ref in this set points at an attempt, not a receipt. */
const ATTEMPT_IDS = new Set(Object.values(conversationDetails).flatMap(d => (d.deliveryIncident ? [d.deliveryIncident.attemptId] : [])));
const override = (detail: ConversationDetail, delivery: DeliveryOutcome) => withDetailOverrides(detail, { ...DEFAULT_CONTROLS, delivery });
const outbound = (detail: ConversationDetail) => detail.messages.filter(m => m.direction === "outbound");
const staleRead = () => createFixtureOnlyFansDataSource({ viewer: operatorViewer(),
  scenarios: buildScenarios({ ...DEFAULT_CONTROLS, conversationRead: "stale" }, operatorViewer()) }).getConversation(ACCOUNT_AVA, THREAD.summary.conversationId);

test("control: fixtures and overrides have the shape the F7 checks need", async () => {
  assert.equal(REFUSED.deliveryIncident?.outcome, "failed");
  assert.ok(REFUSED.deliveryIncident?.detail);
  const forcedUnknown = override(REFUSED, "unknown");
  assert.equal(forcedUnknown.summary.delivery, "unknown");
  assert.equal(forcedUnknown.deliveryIncident?.outcome, "unknown");
  assert.ok(outbound(forcedUnknown).length > 0 && outbound(forcedUnknown).every(m => m.delivery === "unknown"));
  assert.equal(UNKNOWN.summary.delivery, "unknown");
  const attemptId = UNKNOWN.deliveryIncident?.attemptId;
  assert.ok(attemptId && ATTEMPT_IDS.has(attemptId));
  assert.ok(outbound(UNKNOWN).some(m => m.evidenceRef === attemptId), "an outbound bubble carries the unknown attempt");
  const forcedSent = outbound(override(UNKNOWN, "sent"));
  assert.ok(forcedSent.length > 0 && forcedSent.every(m => m.delivery === "sent"));
  assert.ok(THREAD.messages.length > 0);
  assert.equal((await staleRead()).status, "stale");
});

test("F7: an incident forced to unknown says the send is unconfirmed, not refused", () => {
  const detail = override(REFUSED, "unknown").deliveryIncident?.detail ?? "";
  assert.doesNotMatch(detail, /refus/i, `unknown incident reads: ${detail}`);
  assert.match(detail, /not confirmed|unconfirmed|unknown/i, `unknown incident reads: ${detail}`);
});

test("F7: a bubble forced to sent carries no attempt ref other than the override's own attempt", () => {
  const forced = override(UNKNOWN, "sent");
  const ownAttempt = forced.deliveryIncident?.attemptId ?? null;
  for (const m of outbound(forced)) {
    if (m.evidenceRef === null || !ATTEMPT_IDS.has(m.evidenceRef)) continue;
    assert.equal(m.evidenceRef, ownAttempt, `sent bubble ${m.messageId} points at attempt ${m.evidenceRef}; the override records ${ownAttempt}`);
  }
});

test("F7: a stale thread read keeps the thread's messages behind its freshness warning", async () => {
  const data = dataOf(await staleRead());
  assert.equal(data?.messages.length, THREAD.messages.length, `stale thread has ${data?.messages.length} of ${THREAD.messages.length} messages`);
});
