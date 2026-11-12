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
/** Bounded machine-code shape for any backend reason/blocker string that can reach the browser (also parseConnectionRunner `reason`). */
export const BOUNDED_CODE = /^[A-Za-z0-9:_.-]{1,80}$/;
const code = (v: unknown): v is string => typeof v === "string" && BOUNDED_CODE.test(v);
export function parseRecentHistory(v: unknown): RecentHistory | null {
  if (!obj(v) || v.schemaVersion !== "of-recent-history.v1" || !stamp(v.startedAt) || !stamp(v.cutoffAt)
    || v.percentComplete !== null || v.lifetimeTotalMessages !== null || !obj(v.initialHistory)
    || !obj(v.memoryProcessing) || !obj(v.olderHistory) || !obj(v.lifetimeHistory) || !obj(v.memoryModelAccounting)) return null;
  const h = v.initialHistory, m = v.memoryProcessing, o = v.olderHistory, l = v.lifetimeHistory, a = v.memoryModelAccounting;
  if (!["recent_history_ready", "incomplete"].includes(String(h.state)) || typeof h.discoveryComplete !== "boolean"
    || !["conversationsDiscovered", "conversationsReady", "conversationsAwaitingWork", "messagesSavedInWindow", "fansWithStoredWindowMessages", "providerRequests", "failedReadAttempts", "unfinishedReadAttempts"].every(k => count(h[k]))
    || !obj(h.providerErrors) || !Object.entries(h.providerErrors).every(([k, n]) => code(k) && count(n))
    || !(h.discoveryError === null || code(h.discoveryError))
    || !code(h.providerOrdering) || typeof h.elapsedSeconds !== "number" || !Number.isFinite(h.elapsedSeconds) || h.elapsedSeconds < 0
    || !["ready", "incomplete"].includes(String(m.state)) || !["messagesProcessed", "messagesAwaitingProcessing", "incomingMessagesInWindow", "errors"].every(k => count(m[k]))
    || !(m.budgetHold === null || code(m.budgetHold))
    || !["activatedFanJobs", "completedFanJobs", "pendingFanJobs"].every(k => count(o[k]))
    || typeof l.complete !== "boolean" || !count(l.conversationsComplete)
    || !["providerReportedUsd", "tokenEstimateUsd", "activeReservationUsd", "unresolvedReservationUsd"].every(k => money(a[k]))) return null;
  if ((h.conversationsReady as number) + (h.conversationsAwaitingWork as number) !== h.conversationsDiscovered
    || (m.messagesProcessed as number) + (m.messagesAwaitingProcessing as number) !== m.incomingMessagesInWindow
    || (o.completedFanJobs as number) + (o.pendingFanJobs as number) !== o.activatedFanJobs) return null;
  if (h.state === "recent_history_ready" && (!h.discoveryComplete || h.conversationsAwaitingWork !== 0 || h.discoveryError || Object.values(h.providerErrors).some(Boolean))) return null;
  if (m.state === "ready" && (h.state !== "recent_history_ready" || m.messagesAwaitingProcessing !== 0 || m.errors !== 0 || m.budgetHold)) return null;
  // A new object naming every field: unknown keys at any level never reach the browser.
  const n = (x: unknown) => x as number, s = (x: unknown) => x as string;
  return { schemaVersion: "of-recent-history.v1", startedAt: s(v.startedAt), cutoffAt: s(v.cutoffAt),
    initialHistory: { state: h.state as RecentHistory["initialHistory"]["state"], discoveryComplete: h.discoveryComplete as boolean,
      conversationsDiscovered: n(h.conversationsDiscovered), conversationsReady: n(h.conversationsReady), conversationsAwaitingWork: n(h.conversationsAwaitingWork),
      messagesSavedInWindow: n(h.messagesSavedInWindow), fansWithStoredWindowMessages: n(h.fansWithStoredWindowMessages),
      providerErrors: Object.fromEntries(Object.entries(h.providerErrors).map(([k, c]) => [k, n(c)])), discoveryError: h.discoveryError as string | null,
      providerRequests: n(h.providerRequests), failedReadAttempts: n(h.failedReadAttempts), unfinishedReadAttempts: n(h.unfinishedReadAttempts),
      providerOrdering: s(h.providerOrdering), elapsedSeconds: n(h.elapsedSeconds) },
    memoryProcessing: { state: m.state as RecentHistory["memoryProcessing"]["state"], messagesProcessed: n(m.messagesProcessed),
      messagesAwaitingProcessing: n(m.messagesAwaitingProcessing), incomingMessagesInWindow: n(m.incomingMessagesInWindow), errors: n(m.errors),
      budgetHold: m.budgetHold as string | null },
    olderHistory: { activatedFanJobs: n(o.activatedFanJobs), completedFanJobs: n(o.completedFanJobs), pendingFanJobs: n(o.pendingFanJobs) },
    lifetimeHistory: { complete: l.complete as boolean, conversationsComplete: n(l.conversationsComplete) },
    memoryModelAccounting: { providerReportedUsd: s(a.providerReportedUsd), tokenEstimateUsd: s(a.tokenEstimateUsd),
      activeReservationUsd: s(a.activeReservationUsd), unresolvedReservationUsd: s(a.unresolvedReservationUsd) },
    percentComplete: null, lifetimeTotalMessages: null };
}
