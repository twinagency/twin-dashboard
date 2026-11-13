/**
 * DOM-free fixtures for the G07a/G07b launch rules (W3 lane 2 ui-onlyfans-launch), trimmed to what they use. Every builder runs the real parser the component uses and fails loudly if
 * the shape drifts, so a red test can never be red because the fixture was wrong. Synthetic ids only (of-a, of-b, decimal fan ids);
 * nothing token or cookie shaped. Shapes follow scripts/check-onlyfans-launch.ts, scripts/check-agency-launch.tsx and
 * scripts/check-onlyfans-native-memory.ts.
 */
import assert from "node:assert/strict";
import { B_CONTRACT_SCHEMA } from "../../lib/onlyfans/launch/b-common";
import { LAUNCH_SCHEMA } from "../../lib/onlyfans/launch/a-types";
import { parseAccounts, parseConversations, parseRuntime } from "../../lib/onlyfans/launch/automation/b-automation";
import { parseEngagementAction, parseEngagementPage, parseEngagementSettings, parseNativePersonality, parseNativeReadiness,
  parsePersonalityHistory, validPolicy, type EngagementPolicy } from "../../lib/onlyfans/launch/native";
import { parseMemoryEnvelope, parseMemoryPageEnvelope } from "../../lib/onlyfans/launch/memory/b-memory-client";

const ok = <T,>(value: T, passes: boolean, what: string): T => { assert.ok(passes, `fixture: ${what} must pass its real parser`); return value; };
export const STAMP = "2026-11-10T00:00:00Z";
const H = (c: string) => c.repeat(64);

/** `{ schemaVersion: "of-launch.v1", ok, accountId, data }`, the A/B/C BFF envelope useLaunchResource unwraps. */
export const launchEnvelope = (data: unknown, accountId = "of-a") => ({ schemaVersion: LAUNCH_SCHEMA, ok: true, accountId, data });
export const access = (canManage = true, accountId = "of-a") => launchEnvelope({ canManage }, accountId);

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

/** Engagement settings and follow-up actions (EngagementPanel parsers). */
export const POLICY: EngagementPolicy = { enabled: false, offers: false, follow_ups: true, reengagement: false, offer_delay_hours: 24, follow_up_delay_hours: 24,
  reengage_delay_hours: 168, expiry_hours: 24, fan_daily_limit: 1, fan_weekly_limit: 2, account_hourly_limit: 5, account_daily_limit: 20,
  unpaid_cooldown_hours: 48, repeat_item_days: 30, follow_up_text: "Server follow-up text", reengage_text: "Server reengage text" };
export function settings(revision = 3, accountId = "of-a") {
  const body = { schemaVersion: B_CONTRACT_SCHEMA, ok: true, accountId, engagementVersion: "of-engagement.v1", revision, bindingCurrent: true, settings: POLICY };
  assert.ok(validPolicy(POLICY), "fixture: policy must pass validPolicy");
  return ok(body, parseEngagementSettings(body) !== null, "engagement settings");
}
export const ACTION_A = "0a1b2c3d-1111-4222-8333-444455556661", ACTION_B = "0a1b2c3d-1111-4222-8333-444455556662", ACTION_OLD = "0a1b2c3d-1111-4222-8333-444455556663";
export function action(actionId: string, extra: Record<string, unknown> = {}) {
  const row = { actionId, kind: "follow_up", status: "scheduled", reason: null, fanId: "42", dueAt: STAMP, expiresAt: "2026-11-11T00:00:00Z",
    intentId: null, cancelRequested: false, ...extra };
  return ok(row, parseEngagementAction(row) !== null, "engagement action");
}
export function followUps(actions: unknown[], nextCursor: string | null = null, accountId = "of-a") {
  const body = { schemaVersion: B_CONTRACT_SCHEMA, ok: true, accountId, engagementVersion: "of-engagement.v1", nextCursor, actions };
  return ok(body, parseEngagementPage(body)?.actions.length === actions.length, "engagement page");
}
/** POST .../follow-ups reply carrying the row after the command. */
export const actionReply = (row: unknown, accountId = "of-a") => ({ schemaVersion: B_CONTRACT_SCHEMA, ok: true, accountId, engagementVersion: "of-engagement.v1", action: row });

/** A draft personality with a saved review (scripts/check-onlyfans-launch.ts `draft`). */
export function personality() {
  const body = { version: "of-personality.v1", state: "draft", revision: 1, bindingId: "binding-a",
    document: { source: "canonical_history", review: { persona: "Short, warm replies." },
      draft: { creatorFacts: [], writingStyle: [], operationalInstructions: [],
        suggestedPersona: { text: "Short replies", attribution: "unknown", evidenceIds: [], selected: false, requiresReview: true, basis: "observed_account_style", warning: null },
        evidence: [], coverage: { inputMessages: 20, uniqueMessages: 20, sampledMessages: 20, authorship: { creator: 0, agency: 0, unknown: 20, automation: 0 },
          method: "bounded sample", limitations: ["Not full provider history."] } } },
    configurationRevision: 3, configurationCurrent: true, configurationFingerprint: H("a"), conflicts: [], requiresFactResolution: [], factComparisons: [],
    readiness: { ready: false, reviewRequired: true, blockers: ["personality_not_approved"],
      model: { state: "ready", modelId: "synthetic-model", provider: "synthetic", reasoningEffort: { state: "default", saved: null, resolved: null } },
      credential: { state: "missing", configured: false, metadataAvailable: true }, budget: { state: "unset", dailyCostCapCents: 0 },
      tone: { state: "ready", conflicts: [], reviewRequired: true } },
    createdAt: STAMP, actor: "op:1", commandKey: H("b") };
  return ok(body, parseNativePersonality(body) !== null, "personality");
}
export function personalityHistory() {
  const body = { revisions: [{ revision: 1, state: "draft", actor: "op:1", createdAt: STAMP }], nextBefore: null };
  return ok(body, parsePersonalityHistory(body) !== null, "personality history");
}

/** Native memory for one fan (scripts/check-onlyfans-native-memory.ts `detail`), at memory version `version`. */
export const FAN = "42", V1 = H("1"), V2 = H("2");
const recovery = (accountId: string, fanId: string | null) => ({ schemaVersion: "of-history-recovery.v1", accountId, fanId, status: "incomplete", discoveryComplete: true,
  conversationsDiscovered: 2, conversationsComplete: 1, conversationsRetrying: 0, conversationsDeferredForLiveInput: 0, pagesCommitted: 1, messagesObserved: 10,
  messagesAdded: 10, totalMessages: null, percentComplete: null, recentRecoveryNeeded: false });
export function memoryPage(accountId = "of-a") {
  const body = { schemaVersion: B_CONTRACT_SCHEMA, ok: true, accountId, memoryVersion: "of-history-memory.v1", nextCursor: null, progress: recovery(accountId, null),
    fans: [{ fanId: FAN, displayName: "Fan One", username: null, storedMessages: 10, processedMessages: 10, memoryRevision: 1, lastProcessedAt: STAMP, archive: null }] };
  return ok(body, parseMemoryPageEnvelope(body, accountId) !== null, "memory fan page");
}
export function memoryDetail(version = V1, accountId = "of-a") {
  const body = { schemaVersion: B_CONTRACT_SCHEMA, ok: true, accountId, fanId: FAN,
    memory: { schemaVersion: "of-history-memory.v1", algorithm: "english-patterns.v1", revision: version === V1 ? 1 : 2, version, canonicalDigest: H("e"), fingerprint: H("f"),
      facts: { home_city: { value: "Brisbane", source: "operator" } }, summaries: {}, overrides: {}, interactions: [], summaryKind: "saved_profile_and_source_excerpts" },
    progress: { schemaVersion: "of-history-memory-progress.v1", algorithm: "english-patterns.v1", storedMessages: 10, processedCurrentMessages: 10, pendingMessages: 0,
      storedMemoryComplete: true, providerHistoryComplete: null, revision: 1, oldestStoredAt: STAMP, newestStoredAt: STAMP, lastProcessedAt: STAMP },
    recovery: recovery(accountId, FAN) };
  return ok(body, parseMemoryEnvelope(body, accountId, FAN) !== null, "fan memory");
}
