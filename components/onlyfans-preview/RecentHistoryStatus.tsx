import type { RecentHistory } from "@/lib/onlyfans-connections/recent-history";
/** operator: an internal-operator surface, whose reply was parsed with cost=true; only there is a missing cost worth saying. */
export default function RecentHistoryStatus({ value: v, operator = false }: { value: RecentHistory; operator?: boolean }) {
  const h = v.initialHistory, m = v.memoryProcessing, o = v.olderHistory, a = v.memoryModelAccounting;
  return <section className="mt-3 space-y-1 text-xs text-muted" data-of-recent-history>
    <p role="status" className="font-semibold text-ink">{h.state === "recent_history_ready" ? "Recent history ready" : "Importing initial 30-day history"}</p>
    <p>Fixed start: {new Date(v.cutoffAt).toLocaleString()}. Saved messages are retained.</p>
    <p>{h.messagesSavedInWindow} messages saved across {h.fansWithStoredWindowMessages} fans. {h.conversationsAwaitingWork} conversations awaiting work.</p>
    <p>Memory: {m.state === "ready" ? "Ready for imported recent messages" : "Processing or held"}. {m.messagesProcessed} incoming messages processed, {m.messagesAwaitingProcessing} awaiting processing.</p>
    <p>Older history: {o.completedFanJobs} returning-fan jobs completed, {o.pendingFanJobs} pending.</p>
    <p>Lifetime history: {v.lifetimeHistory.complete ? "Complete" : "Incomplete"}. Lifetime message total is unknown.</p>
    <p>{h.providerRequests} provider HTTP attempts. {h.failedReadAttempts} failed page reads, {h.unfinishedReadAttempts} interrupted reads.</p>
    {h.discoveryError || Object.keys(h.providerErrors).length || m.errors || m.budgetHold ? <p role="alert">Blockers: {[h.discoveryError, ...Object.keys(h.providerErrors), m.budgetHold, m.errors ? `${m.errors} memory errors` : null].filter(Boolean).join(", ")}</p> : null}
    {a ? <><p>Model charges reported: US${a.providerReportedUsd}. Token estimates: US${a.tokenEstimateUsd}.</p>
    <p>Active reservations: US${a.activeReservationUsd}. Unresolved reservations: US${a.unresolvedReservationUsd}.</p></> : operator ? <p>Model cost unavailable.</p> : null}
    {h.providerOrdering === "id_desc_exhaustive_date_filter" ? <p>Timestamp ordering is unverified. Older pages must be checked to prove coverage.</p> : null}
  </section>;
}
