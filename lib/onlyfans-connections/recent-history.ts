/** Recent-window coverage is independent of lifetime completeness. */
export type RecentHistory = {
  schemaVersion: "of-recent-history.v1"; startedAt: string; cutoffAt: string;
  initialHistory: { state: "recent_history_ready" | "incomplete"; discoveryComplete: boolean;
    conversationsDiscovered: number; conversationsReady: number; conversationsAwaitingWork: number;
    messagesSavedInWindow: number; fansWithStoredWindowMessages: number;
    providerErrors: Record<string, number>; discoveryError: string | null;
    providerRequests: number; failedReadAttempts: number; unfinishedReadAttempts: number;
    providerOrdering: string; elapsedSeconds: number };
  memoryProcessing: { state: "ready" | "incomplete"; messagesProcessed: number; messagesAwaitingProcessing: number;
    incomingMessagesInWindow: number; errors: number; budgetHold: string | null };
  olderHistory: { activatedFanJobs: number; completedFanJobs: number; pendingFanJobs: number };
  lifetimeHistory: { complete: boolean; conversationsComplete: number };
  memoryModelAccounting: { providerReportedUsd: string; tokenEstimateUsd: string;
    activeReservationUsd: string; unresolvedReservationUsd: string };
  percentComplete: null; lifetimeTotalMessages: null;
};
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const money = (v: unknown) => typeof v === "string" && /^\d+(?:\.\d+)?$/.test(v);
const stamp = (v: unknown) => typeof v === "string" && v.endsWith("Z") && Number.isFinite(Date.parse(v));
export function parseRecentHistory(v: unknown): RecentHistory | null {
  if (!obj(v) || v.schemaVersion !== "of-recent-history.v1" || !stamp(v.startedAt) || !stamp(v.cutoffAt)
    || v.percentComplete !== null || v.lifetimeTotalMessages !== null || !obj(v.initialHistory)
    || !obj(v.memoryProcessing) || !obj(v.olderHistory) || !obj(v.lifetimeHistory) || !obj(v.memoryModelAccounting)) return null;
  const h = v.initialHistory, m = v.memoryProcessing, o = v.olderHistory, l = v.lifetimeHistory, a = v.memoryModelAccounting;
  if (!["recent_history_ready", "incomplete"].includes(String(h.state)) || typeof h.discoveryComplete !== "boolean"
    || !["conversationsDiscovered", "conversationsReady", "conversationsAwaitingWork", "messagesSavedInWindow", "fansWithStoredWindowMessages", "providerRequests", "failedReadAttempts", "unfinishedReadAttempts"].every(k => count(h[k]))
    || !obj(h.providerErrors) || !Object.values(h.providerErrors).every(count)
    || !(h.discoveryError === null || typeof h.discoveryError === "string")
    || typeof h.providerOrdering !== "string" || typeof h.elapsedSeconds !== "number" || !Number.isFinite(h.elapsedSeconds) || h.elapsedSeconds < 0
    || !["ready", "incomplete"].includes(String(m.state)) || !["messagesProcessed", "messagesAwaitingProcessing", "incomingMessagesInWindow", "errors"].every(k => count(m[k]))
    || !(m.budgetHold === null || typeof m.budgetHold === "string")
    || !["activatedFanJobs", "completedFanJobs", "pendingFanJobs"].every(k => count(o[k]))
    || typeof l.complete !== "boolean" || !count(l.conversationsComplete)
    || !["providerReportedUsd", "tokenEstimateUsd", "activeReservationUsd", "unresolvedReservationUsd"].every(k => money(a[k]))) return null;
  if ((h.conversationsReady as number) + (h.conversationsAwaitingWork as number) !== h.conversationsDiscovered
    || (m.messagesProcessed as number) + (m.messagesAwaitingProcessing as number) !== m.incomingMessagesInWindow
    || (o.completedFanJobs as number) + (o.pendingFanJobs as number) !== o.activatedFanJobs) return null;
  if (h.state === "recent_history_ready" && (!h.discoveryComplete || h.conversationsAwaitingWork !== 0 || h.discoveryError || Object.values(h.providerErrors).some(Boolean))) return null;
  if (m.state === "ready" && (h.state !== "recent_history_ready" || m.messagesAwaitingProcessing !== 0 || m.errors !== 0 || m.budgetHold)) return null;
  return v as RecentHistory;
}
