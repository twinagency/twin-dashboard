"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { canBeOffered, catalogueOfferText, parseEngineCatalogue, type CatalogueDecision, type CatalogueDecisionResult, type EngineCatalogueItem, type EngineCataloguePage } from "@/lib/onlyfans/engine-catalogue";
import { parseContentPrice } from "@/lib/onlyfans/content";

export type CatalogueDecider = (item: EngineCatalogueItem, decision: CatalogueDecision) => Promise<CatalogueDecisionResult>;
const usd = (cents: number) => `USD ${(cents / 100).toFixed(2)}`;
const centsText = (cents: number | null) => cents === null ? "" : (cents / 100).toFixed(2);

function ItemRow({ item, readOnly, onDecide }: { item: EngineCatalogueItem; readOnly: boolean; onDecide: CatalogueDecider }) {
  const [price, setPrice] = useState(centsText(item.proposedPriceCents)), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null);
  const cents = parseContentPrice(price), validPrice = cents !== null && cents >= 300;
  const decide = async (decision: CatalogueDecision) => {
    if (busy) return;
    setBusy(true); setMessage(null);
    try { const result = await onDecide(item, decision); setMessage(result.ok ? "Saved. Refreshing the list." : result.error); }
    catch { setMessage("The decision is unconfirmed. Refresh the list before deciding again."); }
    finally { setBusy(false); }
  };
  return <li className="rounded-lg border border-line p-3 text-sm" data-engine-catalogue-item={item.itemId} data-engine-catalogue-status={item.status}>
    <div className="flex flex-wrap items-center justify-between gap-2"><strong className="break-words">{item.label}</strong>
      <span className="rounded-full bg-elev px-2 py-0.5 text-[11px] font-semibold" data-engine-status-badge>{item.status}</span></div>
    <p data-engine-offer-text className={canBeOffered(item) ? "font-semibold" : "text-muted"}>{catalogueOfferText(item)}</p>
    <p className="text-muted">{item.mediaCount} {item.mediaCount === 1 ? "file" : "files"}{item.tags.length ? ` · Tags: ${item.tags.join(", ")}` : " · No tags"}</p>
    {item.status === "approved" && item.approvedPriceCents !== null ? <p data-engine-price="approved">Approved price {usd(item.approvedPriceCents)}</p> :
      <p data-engine-price="proposed">Proposed price {item.proposedPriceCents === null ? "none" : usd(item.proposedPriceCents)} <strong className="text-[#9b2f62]">NEEDS CONFIRM</strong></p>}
    {!readOnly && item.status !== "approved" ? <div className="mt-2 space-y-1">
      <label className="block text-xs">Price to approve (USD)<input aria-label="Price to approve" inputMode="decimal" className="mt-1 w-28 rounded border border-line px-2 py-1 text-base" value={price} onChange={event => { setPrice(event.target.value); setConfirmed(false); }} /></label>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" aria-label="Confirm price" checked={confirmed} disabled={!validPrice} onChange={event => setConfirmed(event.target.checked)} />I confirm this price is correct</label>
      <button type="button" data-engine-approve className="of-control-button of-primary" disabled={busy || !validPrice || !confirmed}
        onClick={() => cents !== null && void decide({ action: "approve", expectedRevision: item.revision, expectedFingerprint: item.fingerprint, confirmedPriceCents: cents })}>Approve for offers</button>
      {!validPrice ? <p className="text-xs text-muted">Enter a price from USD 3.00 to 200.00.</p> : null}
    </div> : null}
    {!readOnly && item.status === "approved" ? <button type="button" data-engine-retire className="of-control-button of-secondary mt-2" disabled={busy}
      onClick={() => void decide({ action: "retire", expectedRevision: item.revision, expectedFingerprint: item.fingerprint })}>Retire</button> : null}
    {message ? <p role="status" className="mt-1 text-xs">{message}</p> : null}
  </li>;
}

export function EngineCatalogueList({ page, readOnly, loadingMore, error, onLoadMore, onDecide }: { page: EngineCataloguePage; readOnly: boolean; loadingMore: boolean;
  error: string | null; onLoadMore: () => void; onDecide: CatalogueDecider }) {
  const approved = page.items.filter(canBeOffered).length;
  return <div data-engine-catalogue-list>
    <p className="text-xs text-muted">{approved} of {page.items.length} shown can be offered. Only approved items are offered by the engine.</p>
    {page.items.length ? <ul className="mt-2 space-y-2">{page.items.map(item => <ItemRow key={`${item.itemId}:${item.revision}`} item={item} readOnly={readOnly} onDecide={onDecide} />)}</ul>
      : <p className="mt-2 text-sm">No catalogue items yet. Sync the vault and create offers first.</p>}
    {page.nextCursor ? <button type="button" data-engine-load-more className="of-control-button of-secondary mt-2" disabled={loadingMore} onClick={onLoadMore}>{loadingMore ? "Loading…" : "Load more"}</button> : null}
    {error ? <p role="alert" className="mt-1 text-xs text-muted">{error}</p> : null}
  </div>;
}

/** Engine catalogue approval. Reads through the dashboard routes; decisions go to the manager-only route. */
export default function EngineCatalogue({ accountId, readOnly, fetchImpl }: { accountId: string; readOnly: boolean; fetchImpl?: typeof fetch }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "unavailable" } | { kind: "ready"; page: EngineCataloguePage }>({ kind: "loading" });
  const [loadingMore, setLoadingMore] = useState(false), [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const read = useCallback(async (cursor: string | null) => {
    const response = await (fetchImpl ?? fetch)(`/api/onlyfans/accounts/${encodeURIComponent(accountId)}/engine/catalogue?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      { credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("unavailable");
    const page = parseEngineCatalogue(await response.json(), accountId);
    if (!page) throw new Error("unreadable");
    return page;
  }, [accountId, fetchImpl]);
  const reload = useCallback(() => {
    const mine = ++generation.current;
    setError(null);
    read(null).then(page => { if (mine === generation.current) setState({ kind: "ready", page }); })
      .catch(() => { if (mine === generation.current) setState({ kind: "unavailable" }); });
  }, [read]);
  useEffect(() => { reload(); return () => { generation.current++; }; }, [reload]);
  const loadMore = async () => {
    if (state.kind !== "ready" || !state.page.nextCursor || loadingMore) return;
    const mine = generation.current, current = state.page;
    setLoadingMore(true); setError(null);
    try {
      const next = await read(current.nextCursor);
      if (mine !== generation.current) return;
      const seen = new Set(current.items.map(item => item.itemId));
      setState({ kind: "ready", page: { ...next, items: [...current.items, ...next.items.filter(item => !seen.has(item.itemId))] } });
    } catch { if (mine === generation.current) setError("More items could not be loaded. Try again."); }
    finally { setLoadingMore(false); }
  };
  const onDecide: CatalogueDecider = async (item, decision) => {
    try {
      const response = await (fetchImpl ?? fetch)(`/api/onlyfans-content/accounts/${encodeURIComponent(accountId)}/engine-catalogue/${encodeURIComponent(item.itemId)}`, {
        method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", headers: { "Content-Type": "application/json" }, body: JSON.stringify(decision) });
      const data = await response.json() as Record<string, unknown>;
      reload();
      if (data.ok === true && data.outcome === "recorded") return { ok: true };
      if (data.ok === false && (data.outcome === "refused" || data.outcome === "unconfirmed") && typeof data.error === "string") return { ok: false, outcome: data.outcome, error: data.error };
    } catch { /* fall through */ }
    reload();
    return { ok: false, outcome: "unconfirmed", error: "The decision is unconfirmed. Refresh the list before deciding again." };
  };
  return <section aria-label="Engine catalogue" data-engine-catalogue>
    <h2 className="font-semibold">Engine catalogue</h2>
    <p className="text-xs text-muted">Items proposed from the synced vault. The engine offers an item only after a manager approves it and confirms its price.</p>
    {state.kind === "loading" ? <p role="status" className="text-sm text-muted">Loading catalogue…</p> : null}
    {state.kind === "unavailable" ? <p role="status" className="text-sm text-muted">The engine catalogue is unavailable. <button type="button" className="underline" onClick={reload}>Retry</button></p> : null}
    {state.kind === "ready" ? <EngineCatalogueList page={state.page} readOnly={readOnly} loadingMore={loadingMore} error={error} onLoadMore={() => void loadMore()} onDecide={onDecide} /> : null}
  </section>;
}
