"use client";
import { useState } from "react";
import { engineRequestLabel, parseEngineStatus, type EngineRequestView } from "@/lib/onlyfans/engine-status";
import type { EngineOperatorAction, EngineOperatorResult } from "@/lib/onlyfans/engine-operator";

export type EngineActionHandler = (requestId: string, action: EngineOperatorAction, revision: number, note?: string) => Promise<EngineOperatorResult>;

function RequestRow({ request, onAction }: { request: EngineRequestView; onAction?: EngineActionHandler }) {
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const run = async (action: EngineOperatorAction) => {
    if (!onAction || request.revision === undefined || pending) return;
    setPending(true); setResult(null);
    try {
      const response = await onAction(request.requestId, action, request.revision, note.trim() || undefined);
      setResult(response.ok ? "Action recorded. Refreshing the request." : response.error);
    } catch { setResult("The outcome is unconfirmed. Refresh the request before taking another action."); }
    finally { setPending(false); }
  };
  const editable = onAction && request.revision !== undefined;
  return <li data-engine-request={request.requestId}>
    <p>{engineRequestLabel(request)}</p>
    {editable && ["open", "waiting_fan", "waiting_provider"].includes(request.status) ?
      <button type="button" className="of-control-button of-secondary" disabled={pending} onClick={() => void run("request_handover")}>Request responsibility</button> : null}
    {editable && request.status === "handover_pending" ? <>
      <p className="text-muted">Take over the conversation first, then accept this request.</p>
      <button type="button" className="of-control-button of-secondary" disabled={pending} onClick={() => void run("accept_handover")}>Accept responsibility</button>
    </> : null}
    {editable && request.status === "handover_accepted" ? <>
      <label>Review evidence <input className="w-full text-base" aria-label="Review evidence" value={note} maxLength={108} onChange={event => setNote(event.target.value)} placeholder="What did you check?" /></label>
      <button type="button" className="of-control-button of-secondary" disabled={pending || !note.trim()} onClick={() => void run("complete")}>Mark completed</button>
      <button type="button" className="of-control-button of-secondary" disabled={pending || !note.trim()} onClick={() => void run("decline")}>Mark declined</button>
    </> : null}
    {result ? <p role="status">{result}</p> : null}
  </li>;
}

export function EngineStatus({ value, accountId, conversationId, onAction }: { value: unknown; accountId: string; conversationId: string; onAction?: EngineActionHandler }) {
  if (value === undefined) return null;
  const status = parseEngineStatus(value, accountId, conversationId);
  if (!status || status.state === "unavailable") return <section aria-label="Conversation requests" role="status">
    <h2 className="of-section-heading">Conversation requests</h2>
    <p className="text-xs text-muted">Request status is unavailable.</p>
  </section>;
  return <section aria-label="Conversation requests" data-of-engine-status>
    <h2 className="of-section-heading">Conversation requests</h2>
    <p className="text-xs text-muted">Simulation · {status.mode === "active" ? "AI replies active" : status.mode === "human" ? "Human control" : "AI replies paused"}</p>
    {status.salesMode === "paused" ? <p className="text-xs text-muted">Selling paused until the fan clearly reopens it.</p> :
      status.salesMode === "reopened_scoped" ? <p className="text-xs text-muted">Selling reopened for the requested items.</p> : null}
    {status.requests.length ? <ul className="mt-2 space-y-1 text-xs">{status.requests.map(request =>
      <RequestRow key={`${request.requestId}:${request.revision ?? "read"}`} request={request} onAction={onAction} />)}</ul> : <p className="text-xs text-muted">No requests recorded.</p>}
    {status.truncated ? <p className="text-xs text-muted">Showing the most recent requests.</p> : null}
  </section>;
}
