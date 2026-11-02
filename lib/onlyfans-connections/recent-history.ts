/** Recent-window coverage is independent of lifetime completeness. */
export type RecentHistory = {
  schemaVersion: "of-recent-history.v1"; startedAt: string; cutoffAt: string;
  initialHistory: { state: "recent_history_ready" | "incomplete"; discoveryComplete: boolean;
    conversationsDiscovered: number; conversationsReady: number; conversationsAwaitingWork: number;
    messagesSavedInWindow: number; fansWithStoredWindowMessages: number;
    providerErrors: Record<string, number>; discoveryError: string | null;
    /** Optional (absent on older backends). Threads the provider answers 404/410 for: counted inside
     *  conversationsAwaitingWork and providerErrors, but they do not block readiness. */
    conversationsUnavailable?: number;
    /** Optional (absent on older backends). providerErrors minus provider_thread_unavailable. */
    blockingProviderErrors?: Record<string, number>;
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
/** Backend keeps unavailable threads inside conversationsAwaitingWork (needed+running) and providerErrors;
 *  only readiness excludes them. These helpers mirror that, and fall back to the old strict rules when the
 *  new fields are absent. */
export const unavailableCount = (h: RecentHistory["initialHistory"]) => h.conversationsUnavailable ?? 0;
export const blockingAwaitingCount = (h: RecentHistory["initialHistory"]) => h.conversationsAwaitingWork - unavailableCount(h);
export const blockingErrors = (h: RecentHistory["initialHistory"]) => h.blockingProviderErrors ?? h.providerErrors;
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
    || !("conversationsUnavailable" in h ? count(h.conversationsUnavailable) && (h.conversationsUnavailable as number) <= (h.conversationsAwaitingWork as number) : true)
    || !("blockingProviderErrors" in h ? obj(h.blockingProviderErrors) && Object.values(h.blockingProviderErrors).every(count) : true)
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
  if (h.state === "recent_history_ready" && (!h.discoveryComplete || blockingAwaitingCount(h as RecentHistory["initialHistory"]) !== 0 || h.discoveryError
    || Object.values(blockingErrors(h as RecentHistory["initialHistory"])).some(Boolean))) return null;
  if (m.state === "ready" && (h.state !== "recent_history_ready" || m.messagesAwaitingProcessing !== 0 || m.errors !== 0 || m.budgetHold)) return null;
  return v as RecentHistory;
}
