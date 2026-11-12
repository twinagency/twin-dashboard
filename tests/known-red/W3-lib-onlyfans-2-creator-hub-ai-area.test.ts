// KNOWN RED (W3-lib-onlyfans-2 codex X1; REVIEW.md inv 7 "No false success" (no label claims a send without backend
// evidence)): lib/onlyfans/creator-hub.ts:60-64 aiArea labels the creator hub "AI replies" line from runtime.enabled +
// runtime.deliveryEnabled only and ignores runtime.sender.state, so an account whose sender is stopped reads
// "On, outgoing replies enabled" (CreatorHub.tsx:115). The per-conversation label already treats a non-running sender
// as unavailable (lib/onlyfans/ai-visibility.ts:18 "Sender unavailable").
// Fixed: only a running sender may read "On, outgoing replies enabled"; any other sender state says replies are not
// going out (or the sender is unavailable). The fixture passes every other account-level check of ai-visibility.ts:13-20
// (health connected, runtime + delivery enabled, observedAt fresh), so a fix that shares that helper keeps the control.
// Team's Claude owns the fix; not wired into npm scripts.
import assert from "node:assert/strict";
import test from "node:test";
import { aiArea } from "../../lib/onlyfans/creator-hub";
import type { OfAccount } from "../../lib/onlyfans-preview/types";

const ENABLED = /outgoing replies enabled/i;
const account = (state: string, reason: string | null, observedAt: string) =>
  ({ health: "connected", runtime: { enabled: true, deliveryEnabled: true, sender: { state, observedAt, reason } } }) as OfAccount;

test("control: a running sender with runtime and delivery enabled reads enabled", () => {
  const observedAt = new Date().toISOString();
  const area = aiArea(account("running", null, observedAt));
  assert.ok(area && ENABLED.test(area.state), area?.state);
  if (area && Object.hasOwn(area, "checkedAt")) assert.equal(area.checkedAt, observedAt);
});

test("X1: a stopped sender never reads outgoing replies enabled", () => {
  for (const [state, reason] of [["stopped", null], ["stopped", "Sender stopped by operator."], ["unhealthy", null]] as const) {
    const area = aiArea(account(state, reason, new Date().toISOString()));
    assert.ok(!area || !ENABLED.test(area.state), `creator-hub.ts:64 ignores sender.state "${state}": "${area?.state}"`);
  }
});
