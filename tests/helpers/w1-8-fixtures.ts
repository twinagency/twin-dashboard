/**
 * DOM-free fixtures for W1 lane 8 recent-history / memory tests. Every builder runs the real parser and fails loudly if the shape
 * drifts (parseRecentHistory, parseConnection, parseMemoryProgress, parseRecoveryProgress, parseNativeMemory). Synthetic ids only.
 */
import assert from "node:assert/strict";
import { parseRecentHistory, type RecentHistory } from "../../lib/onlyfans-connections/recent-history";
import { CONNECTION_SCHEMA, parseConnection, type Connection } from "../../lib/onlyfans-connections/contract";
import { parseMemoryProgress, parseNativeMemory, parseRecoveryProgress, type MemoryProgress, type NativeMemory, type RecoveryProgress } from "../../lib/onlyfans/launch/native";

/** A valid of-recent-history.v1 block: initial window and memory both ready. Distinctive money values so a leak is findable. */
export const MODEL_USD = { providerReportedUsd: "12.34", tokenEstimateUsd: "5.67", activeReservationUsd: "8.91", unresolvedReservationUsd: "2.46" };
export function recentHistory(providerOrdering = "created_at_desc_verified"): RecentHistory {
  const value = { schemaVersion: "of-recent-history.v1", startedAt: "2026-11-10T00:00:00Z", cutoffAt: "2026-10-11T00:00:00Z",
    initialHistory: { state: "recent_history_ready", discoveryComplete: true, conversationsDiscovered: 4, conversationsReady: 4, conversationsAwaitingWork: 0,
      messagesSavedInWindow: 30, fansWithStoredWindowMessages: 4, providerErrors: {}, discoveryError: null, providerRequests: 9,
      failedReadAttempts: 0, unfinishedReadAttempts: 0, providerOrdering, elapsedSeconds: 12 },
    memoryProcessing: { state: "ready", messagesProcessed: 20, messagesAwaitingProcessing: 0, incomingMessagesInWindow: 20, errors: 0, budgetHold: null },
    olderHistory: { activatedFanJobs: 2, completedFanJobs: 1, pendingFanJobs: 1 },
    lifetimeHistory: { complete: false, conversationsComplete: 1 },
    memoryModelAccounting: MODEL_USD, percentComplete: null, lifetimeTotalMessages: null };
  const parsed = parseRecentHistory(value);
  assert.ok(parsed, "fixture: recentHistory must pass parseRecentHistory");
  assert.equal(parsed.initialHistory.state, "recent_history_ready");
  return parsed;
}

/** A verified connection whose sync has quarantined (3) and pending (5) messages and no complete sync recorded. */
export const QUARANTINED = 3, PENDING = 5;
export function connection(extra: Record<string, unknown> = {}): Connection {
  const value = { schemaVersion: CONNECTION_SCHEMA, ok: true, connection: { accountId: "of-a", revision: 1, status: "verified", ownerId: "123456",
    expiresAt: "2099-01-01T00:00:00Z", verifiedAt: "2026-11-01T00:00:00Z", lastError: null, outgoingEnabled: false, policyRevision: 0,
    usedUnits: 0, limitUnits: 0, mediaEnabled: false, automateNewConversations: false,
    sync: { discoveryStatus: "running", pages: 2, conversationsComplete: 1, conversationsRemaining: 3, pendingMessages: PENDING,
      quarantinedMessages: QUARANTINED, recoveryRequired: false, lastCompleteSyncAt: null }, ...extra } };
  const parsed = parseConnection(value, "of-a");
  assert.ok(parsed, "fixture: connection must pass parseConnection");
  return parsed;
}

/** One fan's stored-message progress: `processed` of `stored` processed. */
export function memoryProgress(processed: number, stored = 4, lastProcessedAt: string | null = null): MemoryProgress {
  const value = { schemaVersion: "of-history-memory-progress.v1", algorithm: "lexical-v1", storedMessages: stored, processedCurrentMessages: processed,
    pendingMessages: stored - processed, storedMemoryComplete: processed === stored, providerHistoryComplete: null, revision: 1,
    oldestStoredAt: "2026-11-01T00:00:00Z", newestStoredAt: "2026-11-10T00:00:00Z", lastProcessedAt };
  const parsed = parseMemoryProgress(value);
  assert.ok(parsed, "fixture: memory progress must pass parseMemoryProgress");
  return parsed;
}
/** Fan-scoped recovery progress (as b-memory-client parses it: accountId of-a, fan 42), optionally carrying an account-level recentHistory. */
export function recovery(recent?: RecentHistory): RecoveryProgress {
  const value = { schemaVersion: "of-history-recovery.v1", accountId: "of-a", fanId: "42", status: "incomplete", discoveryComplete: true,
    conversationsDiscovered: 4, conversationsComplete: 1, conversationsRetrying: 1, conversationsDeferredForLiveInput: 0, pagesCommitted: 3,
    messagesObserved: 30, messagesAdded: 30, totalMessages: null, percentComplete: null, recentRecoveryNeeded: false,
    ...(recent ? { recentHistory: recent } : {}) };
  const parsed = parseRecoveryProgress(value, "of-a", "42");
  assert.ok(parsed, "fixture: recovery must pass parseRecoveryProgress");
  return parsed;
}
/** A fan memory with no facts. */
export function emptyMemory(): NativeMemory {
  const value = { schemaVersion: "of-history-memory.v1", algorithm: "lexical-v1", revision: 1, version: "a".repeat(64), canonicalDigest: "b".repeat(64),
    fingerprint: "c".repeat(64), summaryKind: "saved_profile_and_source_excerpts", facts: {}, summaries: {}, overrides: {}, interactions: [] };
  const parsed = parseNativeMemory(value);
  assert.ok(parsed, "fixture: memory must pass parseNativeMemory");
  return parsed;
}
