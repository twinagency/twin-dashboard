// RULE G06 (REVIEW.md "UI built on a mock contract the backend does not serve" + Structure "silent fallbacks hiding an
// invariant"): readRuntime reads the workspace settings route's real envelope {schemaVersion, workspace: <of-workspace.v2
// settings>} and validates the inner payload strictly; a settings payload missing a required boolean (e.g.
// historyRecoveryRequired) is refused, never read as "no recovery flagged". Offline: fake fetch, synthetic values.
import assert from "node:assert/strict";
import test from "node:test";
import { readRuntime } from "../../lib/onlyfans/launch/automation/b-automation-client";
import { parseWorkspace } from "../../lib/onlyfans/workspace";
import { ONLYFANS_PREVIEW_SCHEMA_VERSION } from "../../lib/onlyfans-preview/types";

const SETTINGS = {
  schemaVersion: "of-workspace.v2",
  section: "settings",
  accountId: "acc-a",
  asOf: "2026-11-12T10:00:00Z",
  lastCompleteSyncAt: null,
  historyRecoveryRequired: true,
  providerConnectionVerified: true,
  runtimeEnabled: true,
  deliveryPolicy: { revision: 1, enabled: true, mediaEnabled: false, usedUnits: 2, limitUnits: 10 },
  configuration: null,
};
// Exactly what the workspace route returns on success (route.ts:18).
const ENVELOPE = { schemaVersion: ONLYFANS_PREVIEW_SCHEMA_VERSION, workspace: SETTINGS };

async function withRouteFetch<T>(run: () => Promise<T>, served: unknown = ENVELOPE) {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    calls.push(String(url));
    return new Response(JSON.stringify(served), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    return { value: await run(), calls };
  } finally {
    globalThis.fetch = original;
  }
}

test("control: the route's inner settings payload is a valid of-workspace.v2 settings read", () => {
  assert.notEqual(parseWorkspace(SETTINGS, "acc-a", "settings"), null);
});

test("control: readRuntime reaches the workspace settings route once", async () => {
  const { calls } = await withRouteFetch(() => readRuntime("acc-a"));
  assert.deepEqual(calls, ["/api/onlyfans/accounts/acc-a/workspace/settings"]);
});

test("F1: readRuntime reads the route's real envelope", async () => {
  const { value, calls } = await withRouteFetch(() => readRuntime("acc-a"));
  assert.equal(calls.length, 1);
  assert.equal(value.kind, "ok", "b-automation.ts parses the envelope as if it were the inner settings payload");
  if (value.kind === "ok") {
    assert.equal(value.data.runtimeEnabled, true);
    assert.equal(value.data.historyRecoveryRequired, true);
  }
});

// Through readRuntime, not parseRuntime (a fix may replace or delete it). readRuntime refused every payload before
// the F1 fix, so the full envelope must read ok first; otherwise a refused missing-flag read would prove nothing.
test("X2: readRuntime refuses a settings payload missing historyRecoveryRequired", async () => {
  const { historyRecoveryRequired: _omitted, ...missing } = SETTINGS;
  const full = await withRouteFetch(() => readRuntime("acc-a"));
  assert.equal(full.value.kind, "ok", "precondition (F1): readRuntime never reads the real envelope, so the missing flag cannot be checked");
  const { value, calls } = await withRouteFetch(() => readRuntime("acc-a"), { ...ENVELOPE, workspace: missing });
  assert.equal(calls.length, 1);
  assert.notEqual(value.kind, "ok", "b-automation.ts reads a missing historyRecoveryRequired as false (no recovery flagged)");
});
