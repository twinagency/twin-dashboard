import { blockingAwaitingCount, blockingErrors, unavailableCount, type RecentHistory } from "@/lib/onlyfans-connections/recent-history";
export default function RecentHistoryStatus({ value: v }: { value: RecentHistory }) {
  const h = v.initialHistory, m = v.memoryProcessing, o = v.olderHistory, a = v.memoryModelAccounting;
  const unavailable = unavailableCount(h), blocking = Object.keys(blockingErrors(h));
  return <section className="mt-3 space-y-1 text-xs text-muted" data-of-recent-history>
    <p role="status" className="font-semibold text-ink">{h.state === "recent_history_ready" ? "Recent history ready" : "Importing initial 30-day history"}</p>
    <p>Fixed start: {new Date(v.cutoffAt).toLocaleString()}. Saved messages are retained.</p>
    <p>{h.messagesSavedInWindow} messages saved across {h.fansWithStoredWindowMessages} fans. {blockingAwaitingCount(h)} conversations awaiting work.</p>
    {unavailable ? <p data-of-history-unavailable>{unavailable} conversations unavailable (provider 404), not blocking.</p> : null}
    <p>Memory: {m.state === "ready" ? "Ready for imported recent messages" : "Processing or held"}. {m.messagesProcessed} incoming messages processed, {m.messagesAwaitingProcessing} awaiting processing.</p>
    <p>Older history: {o.completedFanJobs} returning-fan jobs completed, {o.pendingFanJobs} pending.</p>
    <p>Lifetime history: {v.lifetimeHistory.complete ? "Complete" : "Incomplete"}. Lifetime message total is unknown.</p>
    <p>{h.providerRequests} provider HTTP attempts. {h.failedReadAttempts} failed page reads, {h.unfinishedReadAttempts} interrupted reads.</p>
    {h.discoveryError || blocking.length || m.errors || m.budgetHold ? <p role="alert">Blockers: {[h.discoveryError, ...blocking, m.budgetHold, m.errors ? `${m.errors} memory errors` : null].filter(Boolean).join(", ")}</p> : null}
    <p>Model charges reported: US${a.providerReportedUsd}. Token estimates: US${a.tokenEstimateUsd}.</p>
    <p>Active reservations: US${a.activeReservationUsd}. Unresolved reservations: US${a.unresolvedReservationUsd}.</p>
    {h.providerOrdering === "id_desc_exhaustive_date_filter" ? <p>Timestamp ordering is unverified. Older pages must be checked to prove coverage.</p> : null}
  </section>;
}
