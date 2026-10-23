"use client";
import { useRef, useState } from "react";
import { bFetch } from "@/lib/onlyfans/launch/b-common";
import { LEDGER_STATUS_TEXT, LEDGER_ERROR_TEXT, parseLedger, retryAdvice, type Ledger } from "@/lib/onlyfans/launch/live/ledger-model";
import { Section, StateLine, Unavailable, buttonClass, launchBase, useAccess, useJsonResource, when } from "../a-shared";

const RETRY_REFUSAL: Record<string, string> = { ledger_busy: "A scan is running right now. Wait for it, then refresh.", ledger_not_held: "The scan is no longer held. Refresh the status.",
  ledger_state_changed: "The ledger changed since you loaded it. The status was refreshed; review it before retrying.", command_conflict: "That retry key was already used for a different request. Refresh." };

export default function LedgerScreen({ accountId }: { accountId: string }) {
  const parse = useRef((v: unknown) => parseLedger(v, accountId)).current;
  const { state, reload } = useJsonResource(`${launchBase(accountId)}/ledger`, parse);
  const access = useAccess(accountId);
  const [busy, setBusy] = useState(false), [note, setNote] = useState("");
  const live = state.kind === "ok" ? state.data : null;

  async function retry(l: Ledger) {
    if (busy || !l.scanFingerprint || l.connectionRevision === null) return;
    setBusy(true); setNote("");
    const r = await bFetch(`${launchBase(accountId)}/command`, { method: "POST", body: { path: "ledger/retry", id: null, body: { expectedConnectionRevision: l.connectionRevision, expectedScanFingerprint: l.scanFingerprint } } });
    setBusy(false);
    const d = r.kind === "ok" ? (r.data as { data?: { outcome?: string; queuedAt?: string } }).data : undefined;
    if (r.kind === "ok" && d?.outcome === "queued") setNote(`Retry queued at ${when(d.queuedAt ?? null)}. The worker has not read the ledger yet, so nothing is reconciled and the status below is unchanged until it does.`);
    else if (r.kind === "ok") setNote("The answer was not understood. Refresh the status before trying again.");
    else if (r.kind === "readonly" || r.kind === "denied") setNote("Your access does not allow a retry.");
    else if (r.kind === "unconfirmed") setNote("Unknown whether the retry was queued. Refresh the status; pressing retry again is safe because it repeats the same request.");
    else if (r.kind === "refused") setNote(RETRY_REFUSAL[r.code ?? ""] ?? r.error);
    else setNote(r.kind === "unavailable" ? r.error : "The retry was not accepted.");
    reload();
  }

  const advice = live ? retryAdvice(live, access?.canManage === true) : null;
  return <div className="space-y-4">
    <StateLine state={state} retry={reload} label="purchase ledger status" />
    {state.kind === "unavailable" ? <Unavailable screen="Purchases" error={state.error} /> : null}
    {live ? <>
      <Section title="Ledger reconciliation" id="ledger-status">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm" data-ledger-status={live.status}>
          <dt className="text-muted">Status</dt><dd className="font-semibold text-ink">{LEDGER_STATUS_TEXT[live.status]}</dd>
          <dt className="text-muted">Last complete pass</dt><dd>{live.lastCompleteAt ? when(live.lastCompleteAt) : "None yet: reconciliation pending"}</dd>
          <dt className="text-muted">Last full 90-day pass</dt><dd>{live.lastFullAt ? when(live.lastFullAt) : "None yet"}</dd>
          <dt className="text-muted">Window</dt><dd>{live.windowStart ? `${when(live.windowStart)} to ${when(live.windowEnd)}` : "Not started"}</dd>
          <dt className="text-muted">Page offset</dt><dd>{live.pageOffset ?? "n/a"} (a position, not a percentage)</dd>
          <dt className="text-muted">Next attempt</dt><dd>{live.nextPollAt ? when(live.nextPollAt) : "Not scheduled"}</dd>
          <dt className="text-muted">Last error</dt><dd>{live.lastError ? LEDGER_ERROR_TEXT[live.lastError] : "None recorded"}</dd>
          <dt className="text-muted">Scan running</dt><dd>{live.leaseActive ? "Yes" : "No"}</dd>
          <dt className="text-muted">Connection current</dt><dd>{live.connectionCurrent ? "Yes" : "No, the scan will restart on the current connection"}</dd>
          <dt className="text-muted">Sales on hold</dt><dd>{live.commerceHeld ? "Yes, until ownership is reconciled" : "No"}</dd>
          <dt className="text-muted">Conflicting records</dt><dd>{live.conflictCount}</dd>
          <dt className="text-muted">Paid, not linked to a message</dt><dd>{live.unlinkedPaidCount}</dd>
        </dl>
        {live.requiresInvestigation ? <p data-ledger-investigate role="note" className="rounded-lg border border-[#f0c3cb] bg-[#fff5f6] p-3 text-sm text-ink">
          Needs investigation before repeated retries: {[live.status === "held" && (live.lastError === "unsupported_ledger_response" || live.lastError === "unsupported_ledger_pagination") ? "the provider answer was not accepted" : null,
            live.conflictCount ? `${live.conflictCount} conflicting record${live.conflictCount === 1 ? "" : "s"}` : null, live.unlinkedPaidCount ? `${live.unlinkedPaidCount} paid purchase${live.unlinkedPaidCount === 1 ? "" : "s"} not linked to a message` : null].filter(Boolean).join("; ")}.
          A retry cannot resolve conflicts, mark anything paid, or clear a hold.</p> : null}
      </Section>
      <Section title="Retry" id="ledger-retry">
        <p className="text-xs text-muted">A retry makes a held scan due so the worker re-reads the same window. It does not contact the provider from here and does not reconcile anything.</p>
        <button type="button" className={buttonClass} disabled={busy || !advice?.allowed} onClick={() => void retry(live)} data-ledger-retry>{busy ? "Queuing…" : "Queue a retry"}</button>
        {advice && !advice.allowed ? <p data-launch-state="retry-disabled" className="text-xs text-muted">{advice.reason}</p> : null}
        <p aria-live="polite" role="status" data-ledger-note className="min-h-5 text-sm text-ink">{note}</p>
      </Section></> : null}
  </div>;
}
