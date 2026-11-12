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
  /** Our model cost. Default deny: only parseRecentHistory(v, true) sets it, and only operator responses pass true. */
  memoryModelAccounting?: { providerReportedUsd: string; tokenEstimateUsd: string;
    activeReservationUsd: string; unresolvedReservationUsd: string };
  percentComplete: null; lifetimeTotalMessages: null;
};
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const money = (v: unknown) => typeof v === "string" && /^\d+(?:\.\d+)?$/.test(v);
const stamp = (v: unknown) => typeof v === "string" && v.endsWith("Z") && Number.isFinite(Date.parse(v));
/** Diagnostic codes rendered to the browser: lowercase, short segments, so a token or URL cannot pass as one. */
export const DIAGNOSTIC_CODE = /^[a-z][a-z0-9]{0,19}(?:[_:.-][a-z0-9]{1,20}){0,7}$/;
/** Anything else becomes this fixed code: still non-null (a blocker stays visible), never the verbatim text. */
const code = (v: string) => DIAGNOSTIC_CODE.test(v) ? v : "unrecognized";
/** Blank means "no blocker" (the old truthiness), so it can never refuse a ready block. */
const optCode = (v: unknown) => v === null || !(v as string).trim() ? null : code(v as string);
export function parseRecentHistory(v: unknown, cost = false): RecentHistory | null {
  if (!obj(v) || v.schemaVersion !== "of-recent-history.v1" || !stamp(v.startedAt) || !stamp(v.cutoffAt)
    || v.percentComplete !== null || v.lifetimeTotalMessages !== null || !obj(v.initialHistory)
    || !obj(v.memoryProcessing) || !obj(v.olderHistory) || !obj(v.lifetimeHistory)) return null;
  const h = v.initialHistory, m = v.memoryProcessing, o = v.olderHistory, l = v.lifetimeHistory;
  if (!["recent_history_ready", "incomplete"].includes(String(h.state)) || typeof h.discoveryComplete !== "boolean"
    || !["conversationsDiscovered", "conversationsReady", "conversationsAwaitingWork", "messagesSavedInWindow", "fansWithStoredWindowMessages", "providerRequests", "failedReadAttempts", "unfinishedReadAttempts"].every(k => count(h[k]))
    || !obj(h.providerErrors) || !Object.values(h.providerErrors).every(count)
    || !(h.discoveryError === null || typeof h.discoveryError === "string")
    || typeof h.providerOrdering !== "string" || typeof h.elapsedSeconds !== "number" || !Number.isFinite(h.elapsedSeconds) || h.elapsedSeconds < 0
    || !["ready", "incomplete"].includes(String(m.state)) || !["messagesProcessed", "messagesAwaitingProcessing", "incomingMessagesInWindow", "errors"].every(k => count(m[k]))
    || !(m.budgetHold === null || typeof m.budgetHold === "string")
    || !["activatedFanJobs", "completedFanJobs", "pendingFanJobs"].every(k => count(o[k]))
    || typeof l.complete !== "boolean" || !count(l.conversationsComplete)) return null;
  if ((h.conversationsReady as number) + (h.conversationsAwaitingWork as number) !== h.conversationsDiscovered
    || (m.messagesProcessed as number) + (m.messagesAwaitingProcessing as number) !== m.incomingMessagesInWindow
    || (o.completedFanJobs as number) + (o.pendingFanJobs as number) !== o.activatedFanJobs) return null;
  // Guards read the projected values: a blank blocker is null (no blocker); any other off-shape string is "unrecognized" and still blocks "ready".
  const discoveryError = optCode(h.discoveryError), budgetHold = optCode(m.budgetHold);
  if (h.state === "recent_history_ready" && (!h.discoveryComplete || h.conversationsAwaitingWork !== 0 || discoveryError || Object.values(h.providerErrors).some(Boolean))) return null;
  if (m.state === "ready" && (h.state !== "recent_history_ready" || m.messagesAwaitingProcessing !== 0 || m.errors !== 0 || budgetHold)) return null;
  // Off-shape keys merge into "unrecognized", summed and clamped (a merge never refuses). A Map: no prototype writes.
  const errors = new Map<string, number>();
  for (const [k, c] of Object.entries(h.providerErrors)) errors.set(code(k), Math.min(Number.MAX_SAFE_INTEGER, (errors.get(code(k)) ?? 0) + (c as number)));
  // A new object naming every field: unknown keys at any level never reach the browser.
  const n = (x: unknown) => x as number, s = (x: unknown) => x as string;
  const r: RecentHistory = { schemaVersion: "of-recent-history.v1", startedAt: s(v.startedAt), cutoffAt: s(v.cutoffAt),
    initialHistory: { state: h.state as RecentHistory["initialHistory"]["state"], discoveryComplete: h.discoveryComplete as boolean,
      conversationsDiscovered: n(h.conversationsDiscovered), conversationsReady: n(h.conversationsReady), conversationsAwaitingWork: n(h.conversationsAwaitingWork),
      messagesSavedInWindow: n(h.messagesSavedInWindow), fansWithStoredWindowMessages: n(h.fansWithStoredWindowMessages),
      providerErrors: Object.fromEntries(errors), discoveryError,
      providerRequests: n(h.providerRequests), failedReadAttempts: n(h.failedReadAttempts), unfinishedReadAttempts: n(h.unfinishedReadAttempts),
      providerOrdering: code(s(h.providerOrdering)), elapsedSeconds: n(h.elapsedSeconds) },
    memoryProcessing: { state: m.state as RecentHistory["memoryProcessing"]["state"], messagesProcessed: n(m.messagesProcessed),
      messagesAwaitingProcessing: n(m.messagesAwaitingProcessing), incomingMessagesInWindow: n(m.incomingMessagesInWindow), errors: n(m.errors),
      budgetHold },
    olderHistory: { activatedFanJobs: n(o.activatedFanJobs), completedFanJobs: n(o.completedFanJobs), pendingFanJobs: n(o.pendingFanJobs) },
    lifetimeHistory: { complete: l.complete as boolean, conversationsComplete: n(l.conversationsComplete) },
    percentComplete: null, lifetimeTotalMessages: null };
  // Our cost, operator only. Absent or invalid drops only itself, never the block (the browser re-parses an agency's stripped copy).
  const a = v.memoryModelAccounting, keys = ["providerReportedUsd", "tokenEstimateUsd", "activeReservationUsd", "unresolvedReservationUsd"] as const;
  if (cost && obj(a) && keys.every(k => money(a[k]))) r.memoryModelAccounting = { providerReportedUsd: s(a.providerReportedUsd),
    tokenEstimateUsd: s(a.tokenEstimateUsd), activeReservationUsd: s(a.activeReservationUsd), unresolvedReservationUsd: s(a.unresolvedReservationUsd) };
  return r;
}
