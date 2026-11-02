"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LEDGER_ERROR_TEXT, LEDGER_STATUS_TEXT, parseLedger, retryAdvice } from "@/lib/onlyfans/launch/ledger-model";
import { parseNativeLedger, type LedgerEvidence, type NativeLedger } from "@/lib/onlyfans/launch/native";
import { Section, StateLine, buttonClass, postCommand, useCanManage, useLaunchResource, when, formatCents } from "../a-shared";

function Investigation({ evidence: e, ledger, manage, submit }: { evidence: LedgerEvidence; ledger: NativeLedger; manage: boolean; submit: (command: unknown) => Promise<void> }) {
  const [reason, setReason] = useState(""), [busy, setBusy] = useState(false);
  async function resolve() {
    if (!manage || busy || !reason.trim()) return;
    setBusy(true);
    await submit({ path: "ledger/resolve", id: null, body: { expectedFingerprint: ledger.fingerprint, evidenceHash: e.evidenceHash, reason: reason.trim() } });
    setBusy(false);
  }
  return <li className="min-w-0 rounded-lg border border-line p-3 text-sm" data-ledger-evidence={e.evidenceHash}>
    <p className="break-words font-semibold">{e.providerTransactionId} · {e.outcome}{e.resolved ? " · reconciled" : ""}</p>
    <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3"><dt>Fan</dt><dd className="break-words">{e.fanId ?? "Unlinked"}</dd><dt>Transaction</dt><dd className="break-words">{e.transactionId ?? "Unlinked"}</dd><dt>Message</dt><dd className="break-words">{e.messageId ?? "Unknown"}</dd><dt>Amount</dt><dd>{formatCents(e.amountCents, e.currency)}</dd><dt>Recorded</dt><dd>{when(e.recordedAt)}</dd><dt>Payment status</dt><dd>{e.status ?? "Unknown"}</dd></dl>
    <p className="mt-1 break-all text-xs">Evidence {e.evidenceHash}</p>{e.blocker ? <p>{e.blocker.replaceAll("_", " ")}</p> : null}
    {e.supportedAction === "reconcile_evidence" && !e.resolved ? <div className="mt-2 space-y-2"><label className="block text-xs">Investigation reason<input className="min-h-11 w-full rounded border border-line px-2" disabled={!manage || busy} value={reason} onChange={q => setReason(q.target.value)} maxLength={512}/></label>
      <button className={buttonClass} disabled={!manage || busy || !reason.trim()} onClick={() => void resolve()}>Reconcile verified transaction evidence</button><p className="text-xs text-muted">The backend verifies transaction, fan, message and ownership evidence. Ambiguous matches remain unresolved.</p></div> : null}
  </li>;
}
export default function PurchasesScreen({ accountId }: { accountId: string }) {
  const [cursor, setCursor] = useState<string | null>(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [pending, setPending] = useState<unknown | null>(null);
  const currentAccount = useRef(accountId), mounted = useRef(true); currentAccount.current = accountId;
  useEffect(() => { mounted.current = true; setCursor(null); setBusy(false); setNotice(""); setPending(null); return () => { mounted.current = false; }; }, [accountId]);
  const canonicalParser = useCallback((value: unknown) => parseLedger(value, accountId), [accountId]);
  const status = useLaunchResource(accountId, "purchases", canonicalParser);
  const evidence = useLaunchResource(accountId, `purchases/evidence${cursor === null ? "" : `?cursor=${encodeURIComponent(cursor)}`}`, parseNativeLedger);
  const manage = useCanManage(accountId), ledger = status.state.kind === "ok" ? status.state.data : null, details = evidence.state.kind === "ok" ? evidence.state.data : null;
  const advice = ledger ? retryAdvice(ledger, manage === true) : null;
  async function submit(command: unknown) {
    if (busy || manage !== true) return;
    const target = accountId; setBusy(true);
    const q = await postCommand(target, command);
    if (!mounted.current || currentAccount.current !== target) return;
    setBusy(false); setPending(!q.ok && q.outcome === "unconfirmed" ? command : null);
    const retry = typeof command === "object" && command !== null && "path" in command && command.path === "ledger/retry";
    setNotice(q.ok ? retry ? "Retry queued. Reconciliation is not complete merely because the request was recorded. Reading current status and evidence." : "Evidence command recorded. Reading current state; unresolved matches and holds remain until the backend confirms resolution." : q.error);
    status.reload(); evidence.reload();
  }
  async function retry() {
    if (!ledger || !advice?.allowed || busy || pending !== null) return;
    await submit({ path: "ledger/retry", id: null, body: { expectedConnectionRevision: ledger.connectionRevision, expectedScanFingerprint: ledger.scanFingerprint } });
  }
  return <div className="space-y-4">
    <Section title="Purchase ledger and recovery">
      <StateLine state={status.state} retry={status.reload} label="canonical purchase ledger"/>
      {status.state.kind === "pending" ? <p role="alert">{status.state.error}<button className={buttonClass} onClick={status.reload}>Retry read</button></p> : null}
      {ledger ? <>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm" data-ledger-status={ledger.status}>
          <dt>Scan state</dt><dd>{LEDGER_STATUS_TEXT[ledger.status]}</dd><dt>Frozen window</dt><dd>{when(ledger.windowStart)} to {when(ledger.windowEnd)}</dd><dt>Page offset</dt><dd>{ledger.pageOffset ?? "Not started"}. This is a position, not a percentage.</dd>
          <dt>Active lease</dt><dd>{ledger.leaseActive ? "A worker holds the scan lease" : "No active lease"}</dd><dt>Connection current</dt><dd>{ledger.connectionCurrent ? "Yes" : "No"}</dd><dt>Connection revision</dt><dd>{ledger.connectionRevision ?? "Unavailable"}</dd>
          <dt>Last completed pass</dt><dd>{when(ledger.lastCompleteAt)}</dd><dt>Last full pass</dt><dd>{when(ledger.lastFullAt)}</dd><dt>Next retry or poll</dt><dd>{when(ledger.nextPollAt)}</dd><dt>Error category</dt><dd>{ledger.lastError ? LEDGER_ERROR_TEXT[ledger.lastError] : "None recorded"}</dd>
          <dt>Unlinked paid purchases</dt><dd>{ledger.unlinkedPaidCount}</dd><dt>Conflicting records</dt><dd>{ledger.conflictCount}</dd><dt>Commerce hold</dt><dd>{ledger.commerceHeld ? "Held" : "No hold reported"}</dd>
        </dl>
        {ledger.requiresInvestigation ? <p role="note" data-ledger-investigate className="rounded-lg border border-line p-3 text-sm">Investigation is required. A retry does not resolve conflicting evidence, establish ownership, clear a hold or prove that the ledger completed.</p> : null}
        <div className="flex flex-wrap gap-2"><button className={buttonClass} disabled={busy} onClick={() => { status.reload(); evidence.reload(); }}>Refresh ledger status</button><button data-ledger-retry className={buttonClass} disabled={busy || pending !== null || !advice?.allowed} onClick={() => void retry()}>Queue ledger retry</button></div>
        {advice && !advice.allowed ? <p data-ledger-retry-disabled className="text-xs text-muted">{advice.reason}</p> : null}
      </> : null}
      <p role="status" data-ledger-note className="text-sm">{notice}</p>
    </Section>
    <Section title="Transaction investigation">
      <p className="text-sm">Sending a paid message does not establish ownership. Verified purchase evidence determines ownership.</p>
      <StateLine state={evidence.state} retry={evidence.reload} label="transaction investigation evidence"/>
      {evidence.state.kind === "pending" ? <p role="alert">{evidence.state.error}<button className={buttonClass} onClick={evidence.reload}>Retry evidence read</button></p> : null}
      {details ? <>
        <details className="rounded-lg border border-line p-2 text-sm"><summary>Investigation read metadata</summary><dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3"><dt>Observed</dt><dd>{when(details.observedAt)}</dd><dt>Current creator binding</dt><dd>{details.bindingCurrent ? "Yes" : "No"}</dd><dt>Ledger fresh</dt><dd>{details.fresh ? "Yes" : "No"}</dd><dt>Lease until</dt><dd>{when(details.leaseUntil)}</dd><dt>Unresolved transactions</dt><dd>{details.unresolvedTransactions}</dd><dt>Conflicting evidence</dt><dd>{details.conflictingEvidence}</dd></dl></details>
        {details.evidence.length ? <ul className="space-y-3">{details.evidence.map(e => <Investigation key={`${e.evidenceHash}-${details.fingerprint}`} evidence={e} ledger={details} manage={manage === true && !busy && pending === null} submit={submit}/>)}</ul> : <p className="text-sm">No transaction evidence on this page.</p>}
        <div className="flex flex-wrap gap-2"><button className={buttonClass} disabled={cursor === null} onClick={() => setCursor(null)}>Newest evidence</button><button className={buttonClass} disabled={details.nextCursor === null} onClick={() => setCursor(details.nextCursor)}>Older evidence</button></div>
      </> : null}
    </Section>
    {pending !== null ? <div className="flex flex-wrap gap-2"><button className={buttonClass} disabled={manage !== true || busy} onClick={() => void submit(pending)}>Retry identical ledger command</button><button className={buttonClass} disabled={busy} onClick={() => { setPending(null); setNotice("Review the current ledger before another action."); }}>Use current ledger view</button></div> : null}
  </div>;
}
