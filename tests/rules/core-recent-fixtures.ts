/**
 * Recent-history fixtures shared by the W1 lane 4 rule tests (core-recent-history-*). Shape copied from
 * scripts/check-recent-history.ts. Not a test file (the rules glob is `*.test.*`). Synthetic values only.
 */
import type { RecentHistory } from "../../lib/onlyfans-connections/recent-history";

export const RECENT: RecentHistory = { schemaVersion: "of-recent-history.v1", startedAt: "2026-11-02T03:00:00Z", cutoffAt: "2026-10-03T03:00:00Z",
  initialHistory: { state: "recent_history_ready", discoveryComplete: true, conversationsDiscovered: 2, conversationsReady: 2, conversationsAwaitingWork: 0,
    messagesSavedInWindow: 12, fansWithStoredWindowMessages: 2, providerErrors: {}, discoveryError: null,
    providerRequests: 8, failedReadAttempts: 0, unfinishedReadAttempts: 0, providerOrdering: "id_desc_exhaustive_date_filter", elapsedSeconds: 42 },
  memoryProcessing: { state: "ready", incomingMessagesInWindow: 7, messagesProcessed: 7, messagesAwaitingProcessing: 0, errors: 0, budgetHold: null },
  olderHistory: { activatedFanJobs: 1, completedFanJobs: 0, pendingFanJobs: 1 }, lifetimeHistory: { complete: false, conversationsComplete: 0 },
  memoryModelAccounting: { providerReportedUsd: "0.004", tokenEstimateUsd: "0", activeReservationUsd: "0.01", unresolvedReservationUsd: "0.02" },
  percentComplete: null, lifetimeTotalMessages: null };
export const CONNECTION = { accountId: "of-1", revision: 1, status: "verified", ownerId: "1", expiresAt: "2026-11-03T03:00:00Z", verifiedAt: "2026-11-02T03:00:00Z",
  lastError: null, outgoingEnabled: true, policyRevision: 1, usedUnits: 0, limitUnits: 100, mediaEnabled: false, automateNewConversations: false };
export const connectionResponse = (c: object) => ({ schemaVersion: "of-connections.v1", ok: true, connection: c });
