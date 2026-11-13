"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { engineNextStepText, engineRequestLabel } from "@/lib/onlyfans/engine-status";
import { canReconcile, parseEngineUnresolved, type EngineUnresolvedItem, type EngineUnresolvedPage } from "@/lib/onlyfans/engine-unresolved";
import { submitEngineOperatorCommand } from "@/lib/onlyfans/engine-operator-client";
import type { EngineOperatorResult } from "@/lib/onlyfans/engine-operator-core";
import { EnvironmentBadge, PurchaseEvidenceChip } from "./EngineStatus";

type Current = Extract<EngineUnresolvedPage, { state: "current" }>;

function Row({ item, accountId, canAct, onReconcile }: { item: EngineUnresolvedItem; accountId: string; canAct: boolean;
  onReconcile: (item: EngineUnresolvedItem, note: string) => Promise<EngineOperatorResult> }) {
  const [note, setNote] = useState(""), [busy, setBusy] = useState(false), [result, setResult] = useState<string | null>(null);
  const reconcile = async () => {
    if (busy || !note.trim()) return;
    setBusy(true); setResult(null);
    try { const response = await onReconcile(item, note.trim()); setResult(response.ok ? "Recorded. Refreshing the list." : response.error); }
    catch { setResult("The outcome is unconfirmed. Refresh the list before taking another action."); }
    finally { setBusy(false); }
  };
  return <li className="rounded-lg border border-line p-3 text-sm" data-engine-unresolved-row={item.requestId}>
    <p className="font-semibold">{item.fanLabel ?? "Fan"} <span className="font-normal text-muted">({item.conversationId})</span></p>
    <p>{engineRequestLabel(item)}</p>
    <p className="text-muted" data-engine-owner>Owner: {item.owner}. Next: {engineNextStepText(item.nextStep)}.</p>
    <PurchaseEvidenceChip request={item} accountId={accountId} />
    {item.attemptId ? <p className="break-all text-xs text-muted">Send attempt {item.attemptId}</p> : null}
    {canReconcile(item) && canAct ? <div className="mt-2 space-y-1">
      <label className="block text-xs">What did you check?<input aria-label="Reconciliation evidence" className="mt-1 w-full rounded border border-line px-2 py-1 text-base" maxLength={108} value={note} onChange={event => setNote(event.target.value)} /></label>
      <button type="button" data-engine-reconcile className="of-control-button of-secondary" disabled={busy || !note.trim()} onClick={() => void reconcile()}>Mark reconciled</button>
    </div> : <p className="mt-1 text-xs text-muted" data-engine-no-reconcile>
      {item.attemptId ? "Check the send in this conversation. Reconciling from this list is not available yet." : "Open this conversation to review it."}{" "}
      <a className="text-accent underline" href={`/onlyfans/inbox?account=${encodeURIComponent(accountId)}`}>Open inbox</a></p>}
    {result ? <p role="status" className="text-xs">{result}</p> : null}
  </li>;
}

/** Presentation only: the list, the environment and the Load more control. */
export function EngineUnresolvedList({ page, accountId, canAct, loadingMore, error, onLoadMore, onReconcile }: { page: Current; accountId: string; canAct: boolean;
  loadingMore: boolean; error: string | null; onLoadMore: () => void; onReconcile: (item: EngineUnresolvedItem, note: string) => Promise<EngineOperatorResult> }) {
  return <div data-engine-unresolved-list>
    <p className="text-xs text-muted"><EnvironmentBadge environment={page.environment} /> · {page.items.length} shown, unresolved sends first</p>
    {page.items.length ? <ul className="mt-2 space-y-2">{page.items.map(item =>
      <Row key={`${item.requestId}:${item.revision ?? "r"}`} item={item} accountId={accountId} canAct={canAct} onReconcile={onReconcile} />)}</ul>
      : <p className="mt-2 text-sm">Nothing needs review on this account.</p>}
    {page.nextCursor ? <button type="button" data-engine-load-more className="of-control-button of-secondary mt-2" disabled={loadingMore} onClick={onLoadMore}>{loadingMore ? "Loading…" : "Load more"}</button> : null}
    {error ? <p role="alert" className="mt-1 text-xs text-muted">{error}</p> : null}
  </div>;
}

/** Account-wide view of requests and sends that still need a person. Reads through the dashboard route; never the backend directly. */
export default function EngineUnresolvedPanel({ accountId, canAct, fetchImpl }: { accountId: string; canAct: boolean; fetchImpl?: typeof fetch }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "unavailable"; error: string } | { kind: "ready"; page: Current }>({ kind: "loading" });
  const [loadingMore, setLoadingMore] = useState(false), [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const read = useCallback(async (cursor: string | null): Promise<Current> => {
    const response = await (fetchImpl ?? fetch)(`/api/onlyfans/accounts/${encodeURIComponent(accountId)}/engine/unresolved?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      { credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("unavailable");
    const page = parseEngineUnresolved(await response.json(), accountId);
    if (!page || page.state !== "current") throw new Error("unreadable");
    return page;
  }, [accountId, fetchImpl]);
  const reload = useCallback(() => {
    const mine = ++generation.current;
    setState({ kind: "loading" }); setError(null);
    read(null).then(page => { if (mine === generation.current) setState({ kind: "ready", page }); })
      .catch(() => { if (mine === generation.current) setState({ kind: "unavailable", error: "The list of requests needing review is unavailable." }); });
  }, [read]);
  useEffect(() => { reload(); return () => { generation.current++; }; }, [reload]);
  const loadMore = async () => {
    if (state.kind !== "ready" || !state.page.nextCursor || loadingMore) return;
    const mine = generation.current, current = state.page;
    setLoadingMore(true); setError(null);
    try {
      const next = await read(current.nextCursor);
      if (mine !== generation.current) return;
      const seen = new Set(current.items.map(item => item.requestId));
      setState({ kind: "ready", page: { ...next, items: [...current.items, ...next.items.filter(item => !seen.has(item.requestId))] } });
    } catch { if (mine === generation.current) setError("More requests could not be loaded. Try again."); }
    finally { setLoadingMore(false); }
  };
  const onReconcile = async (item: EngineUnresolvedItem, note: string): Promise<EngineOperatorResult> => {
    if (state.kind !== "ready" || item.revision === undefined) return { ok: false, outcome: "refused", error: "This request cannot be changed from here." };
    const result = await submitEngineOperatorCommand({ accountId, conversationId: item.conversationId, requestId: item.requestId, action: "mark_reconciled",
      expectedRevision: item.revision, note, environment: state.page.environment, fetchImpl });
    reload();
    return result;
  };
  return <section aria-label="Requests needing review" data-engine-unresolved-panel>
    <h2 className="font-semibold">Requests needing review</h2>
    {state.kind === "loading" ? <p role="status" className="text-sm text-muted">Loading requests…</p> : null}
    {state.kind === "unavailable" ? <p role="status" className="text-sm text-muted">{state.error} <button type="button" className="underline" onClick={reload}>Retry</button></p> : null}
    {state.kind === "ready" ? <EngineUnresolvedList page={state.page} accountId={accountId} canAct={canAct} loadingMore={loadingMore} error={error} onLoadMore={() => void loadMore()} onReconcile={onReconcile} /> : null}
  </section>;
}
