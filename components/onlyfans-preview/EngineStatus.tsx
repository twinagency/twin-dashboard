import { engineRequestLabel, parseEngineStatus } from "@/lib/onlyfans/engine-status";

export function EngineStatus({ value, accountId, conversationId }: { value: unknown; accountId: string; conversationId: string }) {
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
      <li key={request.requestId}>{engineRequestLabel(request)}</li>)}</ul> : <p className="text-xs text-muted">No requests recorded.</p>}
    {status.truncated ? <p className="text-xs text-muted">Showing the most recent requests.</p> : null}
  </section>;
}
