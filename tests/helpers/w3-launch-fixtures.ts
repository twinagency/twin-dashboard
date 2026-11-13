/**
 * DOM-free fixtures for the G07a launch rules (W3 lane 2 ui-onlyfans-launch), trimmed to what they use. Every builder runs the real parser the component uses and fails loudly if
 * the shape drifts, so a red test can never be red because the fixture was wrong. Synthetic ids only (of-a, of-b, decimal fan ids);
 * nothing token or cookie shaped. Shapes follow scripts/check-onlyfans-launch.ts, scripts/check-agency-launch.tsx and
 * scripts/check-onlyfans-native-memory.ts.
 */
import assert from "node:assert/strict";
import { B_CONTRACT_SCHEMA } from "../../lib/onlyfans/launch/b-common";
import { parseAccounts, parseConversations, parseRuntime } from "../../lib/onlyfans/launch/automation/b-automation";
import { parseNativeReadiness } from "../../lib/onlyfans/launch/native";

const ok = <T,>(value: T, passes: boolean, what: string): T => { assert.ok(passes, `fixture: ${what} must pass its real parser`); return value; };
export const STAMP = "2026-11-10T00:00:00Z";
const H = (c: string) => c.repeat(64);

/** GET /api/onlyfans/accounts. */
export function accounts(...ids: string[]) {
  const body = { accounts: ids.map(accountId => ({ accountId, health: "connected", automationMode: "automated" })) };
  return ok(body, parseAccounts(body)?.length === ids.length, "accounts");
}
/** GET /api/onlyfans/accounts/<id>/conversations: one paused conversation with no takeover (so Resume and Take over are live). */
export function conversations(accountId = "of-a") {
  const body = { accountId, page: { nextCursor: null, items: [{ accountId, conversationId: "c-1", revision: 4, automationMode: "paused", takeoverState: "none",
    fan: { displayName: "Fan One" }, lastActivityAt: STAMP, requiresAttention: false }] } };
  return ok(body, parseConversations(body, accountId)?.items.length === 1, "conversations");
}
export function runtime(accountId = "of-a") {
  const body = { accountId, section: "settings", runtimeEnabled: true };
  return ok(body, parseRuntime(body, accountId) !== null, "runtime");
}

/** of-launch-readiness.v1. `enabled` = account runtime; `backfill` adds an archive check whose action is history_backfill. */
export function readiness({ enabled = true, readyToEnable = true, backfill = false } = {}) {
  const check = (key: string, action: string | null) => ({ key, status: action ? "running" : "ready", blocking: action === null, observedAt: STAMP, blocker: null, action });
  const body = { readinessVersion: "of-launch-readiness.v1", observedAt: STAMP, schemaRevision: "0098_ledger_exclusion", readyToEnable,
    checks: [check("connection", null), ...(backfill ? [check("archive", "history_backfill")] : [])],
    accountControl: { enabled, bindingId: "binding-a", revision: 2, unresolvedOutgoing: 0, fingerprint: H("a") },
    coverage: { storedMessages: 10, processedMessages: 10, providerTotalMessages: null, archiveComplete: false, pendingArchiveConversations: 1 },
    catalogue: { usableInspectedItems: 0, inspectedItems: 0, hasMore: false },
    autonomy: { accountEnabled: enabled, deliveryEnabled: false, existingAutomatedConversations: 0, automateNewConversations: false, engagementEnabled: false, workerCapabilities: {} },
    limits: [] };
  return ok(body, parseNativeReadiness(body) !== null, "readiness");
}
/** GET .../automation/accounts/<id>/emergency-stop (AccountControls parser). */
export const stopRead = (opts: Parameters<typeof readiness>[0] = {}, accountId = "of-a") =>
  ({ schemaVersion: B_CONTRACT_SCHEMA, ok: true, accountId, readiness: readiness(opts) });
