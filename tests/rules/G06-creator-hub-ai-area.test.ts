// RULE G06 (REVIEW.md inv 7 "No false success"): the creator hub "AI replies" line reads "On, outgoing replies enabled" only
// when the sender is running; any other sender state says replies are not going out (or the sender is unavailable), as the
// per-conversation label (lib/onlyfans/ai-visibility.ts) already does.
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
    assert.ok(!area || !ENABLED.test(area.state), `creator-hub.ts ignores sender.state "${state}": "${area?.state}"`);
  }
});

test("X2: a disconnected account or a stale, missing or future sender observation never reads outgoing replies enabled", () => {
  const now = Date.now(), iso = (offset: number) => new Date(now + offset).toISOString();
  const cases: Array<[string, OfAccount]> = [
    ["disconnected", { ...account("running", null, iso(0)), health: "disconnected" } as OfAccount],
    ["stale by a day", account("running", null, iso(-86_400_000))],
    ["stale by 181s", account("running", null, iso(-181_000))],
    ["future", account("running", null, iso(60_000))],
    ["missing observedAt", account("running", null, null as unknown as string)],
  ];
  for (const [name, input] of cases) {
    const area = aiArea(input);
    assert.ok(!area || !ENABLED.test(area.state), `creator-hub aiArea reads "${area?.state}" for a ${name} sender (ai-visibility.ts refuses it)`);
  }
});
