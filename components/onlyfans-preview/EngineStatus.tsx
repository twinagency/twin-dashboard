"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { appendEnginePage, engineEnvironmentIsReal, engineEnvironmentLabel, engineNextStepText, engineRequestLabel, engineRequestPurchase,
  isUnresolvedRequest, parseEngineStatus, type EngineEnvironment, type EngineRequestView } from "@/lib/onlyfans/engine-status";
import { engineActionNeedsNote, type EngineOperatorAction, type EngineOperatorResult } from "@/lib/onlyfans/engine-operator";
import { engineControlLabel } from "@/lib/onlyfans/engine-controls";

export type EngineActionHandler = (requestId: string, action: EngineOperatorAction, revision: number, note?: string, environment?: EngineEnvironment) => Promise<EngineOperatorResult>;
/** Fetches the next page for a cursor. Returns the raw backend view; it is parsed here and nothing else is trusted. */
export type EnginePageLoader = (cursor: string) => Promise<unknown>;

export const purchasesHref = (accountId: string) => `/onlyfans/launch?account=${encodeURIComponent(accountId)}&screen=purchases`;

export function EnvironmentBadge({ environment }: { environment: EngineEnvironment }) {
  return <span data-engine-environment={environment} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${engineEnvironmentIsReal(environment) ? "bg-[#fdecef] text-[#9b2f62]" : "bg-elev text-muted"}`}>{engineEnvironmentLabel(environment)}</span>;
}

export function PurchaseEvidenceChip({ request, accountId }: { request: EngineRequestView; accountId: string }) {
  const evidence = engineRequestPurchase(request);
  if (!evidence) return null;
  return <p data-engine-purchase={evidence.state} className="text-muted">
    <span className="font-semibold">{evidence.label}</span>. {evidence.detail}
    {evidence.amountCents !== undefined ? ` Amount USD ${(evidence.amountCents / 100).toFixed(2)}.` : ""}
    {evidence.providerTransactionId ? ` Transaction ${evidence.providerTransactionId}.` : ""}{" "}
    <a className="text-accent underline" href={purchasesHref(accountId)} data-engine-purchases-link>Open purchases</a>
  </p>;
}

function RequestRow({ request, accountId, environment, humanControl, onAction, onTakeover, takeoverPending }: {
  request: EngineRequestView; accountId: string; environment: EngineEnvironment; humanControl: boolean;
  onAction?: EngineActionHandler; onTakeover?: () => void; takeoverPending?: boolean }) {
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const run = async (action: EngineOperatorAction) => {
    if (!onAction || request.revision === undefined || pending) return;
    setPending(true); setResult(null);
    try {
      const response = await onAction(request.requestId, action, request.revision, engineActionNeedsNote(action) ? note.trim() || undefined : undefined, environment);
      setResult(response.ok ? "Action recorded. Refreshing the request." : response.error);
    } catch { setResult("The outcome is unconfirmed. Refresh the request before taking another action."); }
    finally { setPending(false); }
  };
  const editable = onAction && request.revision !== undefined;
  return <li data-engine-request={request.requestId} data-engine-unresolved={isUnresolvedRequest(request)}>
    <p>{engineRequestLabel(request)}</p>
    <p className="text-muted" data-engine-owner>Owner: {request.owner}. Next: {engineNextStepText(request.nextStep)}.</p>
    <PurchaseEvidenceChip request={request} accountId={accountId} />
    {editable && ["open", "waiting_fan", "waiting_provider"].includes(request.status) ?
      <button type="button" className="of-control-button of-secondary" disabled={pending} onClick={() => void run("request_handover")}>Request responsibility</button> : null}
    {editable && request.status === "handover_pending" ? <>
      {humanControl ? null : <p className="text-muted">Take over the conversation first, then accept this request.</p>}
      {humanControl || !onTakeover ? null : <button type="button" data-engine-takeover className="of-control-button of-secondary" disabled={takeoverPending} onClick={onTakeover}>{engineControlLabel("request_takeover", true)}</button>}
      <button type="button" className="of-control-button of-secondary" disabled={pending || !humanControl} onClick={() => void run("accept_handover")}>Accept responsibility</button>
    </> : null}
    {editable && request.status === "handover_accepted" ? <>
      <label>Review evidence <input className="w-full text-base" aria-label="Review evidence" value={note} maxLength={108} onChange={event => setNote(event.target.value)} placeholder="What did you check?" /></label>
      <button type="button" className="of-control-button of-secondary" disabled={pending || !note.trim()} onClick={() => void run("complete")}>Mark completed</button>
      <button type="button" className="of-control-button of-secondary" disabled={pending || !note.trim()} onClick={() => void run("decline")}>Mark declined</button>
    </> : null}
    {result ? <p role="status">{result}</p> : null}
  </li>;
}

export function EngineStatus({ value, accountId, conversationId, onAction, onLoadMore, onTakeover, takeoverPending }: {
  value: unknown; accountId: string; conversationId: string; onAction?: EngineActionHandler; onLoadMore?: EnginePageLoader;
  /** The existing generic takeover control. Request handover is separate and needs it first. */
  onTakeover?: () => void; takeoverPending?: boolean }) {
  const status = useMemo(() => value === undefined ? undefined : parseEngineStatus(value, accountId, conversationId), [value, accountId, conversationId]);
  const [loaded, setLoaded] = useState<{ requests: EngineRequestView[]; cursor: string | null } | null>(null);
  const [busy, setBusy] = useState(false), [loadError, setLoadError] = useState<string | null>(null);
  // Any change to the first page (another conversation, a new request, revision or outcome) invalidates later pages: they could be stale or skip rows.
  const signature = status?.state === "current" ? `${accountId}|${conversationId}|` + status.requests.map(request => `${request.requestId}:${request.revision ?? "r"}:${request.actionOutcome}`).join(",") + "|" + (status.nextCursor ?? "") : "";
  const current = useRef(signature);
  useEffect(() => { current.current = signature; setLoaded(null); setLoadError(null); }, [signature]);
  if (value === undefined) return null;
  if (!status || status.state === "unavailable") return <section aria-label="Conversation requests" role="status">
    <h2 className="of-section-heading">Conversation requests</h2>
    <p className="text-xs text-muted">Request status is unavailable.</p>
  </section>;
  const requests = loaded ? appendEnginePage(status.requests, loaded.requests) : status.requests;
  const nextCursor = loaded ? loaded.cursor : status.nextCursor;
  const unresolved = requests.filter(isUnresolvedRequest), finished = requests.filter(request => !isUnresolvedRequest(request));
  const humanControl = status.mode === "human";
  const loadMore = async () => {
    if (!onLoadMore || !nextCursor || busy) return;
    setBusy(true); setLoadError(null);
    const requested = signature;
    try {
      const raw = await onLoadMore(nextCursor);
      // The first page changed while this page was in flight: its cursor is invalid, so the page is dropped.
      if (current.current !== requested) return;
      const page = parseEngineStatus(raw, accountId, conversationId);
      if (!page || page.state !== "current") throw new Error("unreadable");
      setLoaded({ requests: appendEnginePage(loaded?.requests ?? [], page.requests), cursor: page.nextCursor });
    } catch { if (current.current === requested) setLoadError("More requests could not be loaded. Try again."); }
    finally { setBusy(false); }
  };
  const list = (items: EngineRequestView[], label: string, kind: string) => items.length ? <>
    <h3 className="mt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted" data-engine-group={kind}>{label}</h3>
    <ul className="mt-1 space-y-1 text-xs">{items.map(request =>
      <RequestRow key={`${request.requestId}:${request.revision ?? "read"}`} request={request} accountId={accountId} environment={status.environment}
        humanControl={humanControl} onAction={onAction} onTakeover={onTakeover} takeoverPending={takeoverPending} />)}</ul></> : null;
  return <section aria-label="Conversation requests" data-of-engine-status data-engine-environment-section={status.environment}>
    <h2 className="of-section-heading">Conversation requests</h2>
    <p className="text-xs text-muted"><EnvironmentBadge environment={status.environment} /> · {status.mode === "active" ? "AI replies active" : status.mode === "human" ? "Human control" : "AI replies paused"}</p>
    {engineEnvironmentIsReal(status.environment) ? <p className="text-xs text-muted">Actions here affect a real creator account.</p> : null}
    {status.salesMode === "paused" ? <p className="text-xs text-muted">Selling paused until the fan clearly reopens it.</p> :
      status.salesMode === "reopened_scoped" ? <p className="text-xs text-muted">Selling reopened for the requested items.</p> : null}
    {requests.length ? <>{list(unresolved, "Needs attention", "unresolved")}{list(finished, "Finished", "finished")}</> : <p className="text-xs text-muted">No requests recorded.</p>}
    {nextCursor && onLoadMore ? <button type="button" data-engine-load-more className="of-control-button of-secondary mt-2" disabled={busy} onClick={() => void loadMore()}>{busy ? "Loading…" : "Load more requests"}</button> :
      status.truncated ? <p className="text-xs text-muted">Showing the most recent requests.</p> : null}
    {loadError ? <p role="alert" className="text-xs text-muted">{loadError}</p> : null}
  </section>;
}
