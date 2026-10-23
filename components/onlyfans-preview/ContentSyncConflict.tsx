"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RESOLUTIONS, type Resolution, type SyncConflict } from "@/lib/onlyfans/content-sync";
import { connectionHref, syncCall, syncTime } from "@/lib/onlyfans/content-sync-client";
import { usd } from "@/lib/onlyfans/offer-import";
import Link from "next/link";

const buttonClass = "min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-accent disabled:opacity-50";
const CHOICES: Record<Resolution, { label: string; help: string }> = {
  accept_source: { label: "Use new source terms", help: "Update this item to the changed OnlyFans terms." },
  keep_crm: { label: "Keep CRM terms", help: "Keep the terms saved in the CRM." },
  disable: { label: "Disable item", help: "Switch this item off so it cannot be offered." },
};
const DONE: Record<Resolution, string> = { accept_source: "Now using the new source terms.", keep_crm: "Keeping the CRM terms.", disable: "This item is switched off." };
type Pending = { conflictId: string; resolution: Resolution; body: { requestId: string; resolution: Resolution; expectedRevision: number; expectedItemFingerprint: string } };

function Terms({ title, terms, lockedText }: { title: string; terms: SyncConflict["current"]; lockedText?: boolean | null }) {
  return <div className="min-w-0 rounded-lg border border-line p-3" data-conflict-terms={title}>
    <h5 className="text-sm font-semibold">{title}</h5>
    <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
      <dt className="text-muted">Price</dt><dd className="font-semibold">{usd(terms.priceCents)}</dd>
      <dt className="text-muted">Media</dt><dd>{terms.mediaCount}</dd>
      <dt className="text-muted">Free previews</dt><dd>{terms.previewCount}</dd>
      <dt className="text-muted">As of</dt><dd>{syncTime(terms.sourceAt, "Unknown date")}</dd>
      {lockedText !== undefined ? <><dt className="text-muted">Locked text</dt><dd>{lockedText === null ? "Unknown" : lockedText ? "Yes, not supported yet" : "No"}</dd></> : null}
    </dl>
  </div>;
}

/** Side-by-side review of changed OnlyFans terms. Nothing changes until a decision is applied. */
export default function ContentSyncConflict({ accountId, readOnly = false, onResolved }: { accountId: string; readOnly?: boolean; onResolved?: () => void }) {
  const [items, setItems] = useState<SyncConflict[] | null>(null), [error, setError] = useState(""), [choice, setChoice] = useState<Record<string, Resolution>>({});
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [retry, setRetry] = useState<Pending | null>(null), [connection, setConnection] = useState(false);
  const controller = useRef<AbortController | null>(null), submitting = useRef(false), resolved = useRef(onResolved);
  resolved.current = onResolved;

  const read = useCallback(async () => {
    const reply = await syncCall<SyncConflict[]>(accountId, "/conflicts?status=open", { signal: controller.current?.signal });
    if (reply.kind === "stale") return;
    if (reply.kind === "ok") { setItems(reply.data); setError(""); return; }
    if (reply.kind === "denied") { setItems(null); setError("Your session cannot read these changes. Sign in again."); return; }
    setError("Changed terms could not be read. Try again.");
  }, [accountId]);
  useEffect(() => { controller.current = new AbortController(); void read(); return () => controller.current?.abort(); }, [read]);

  async function apply(pending: Pending) {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setNotice(""); setConnection(false);
    try {
      const reply = await syncCall(accountId, `/conflicts/${encodeURIComponent(pending.conflictId)}/resolve`, { method: "POST", body: pending.body, signal: controller.current?.signal });
      if (reply.kind === "stale") return;
      if (reply.kind === "denied") { setItems(null); setRetry(null); setError("Your session cannot save this decision. Sign in again."); return; }
      if (reply.kind === "unconfirmed") { setRetry(pending); setNotice(reply.error); return; }
      setRetry(null);
      if (reply.kind === "refused") {
        setConnection(reply.code === "connection_unavailable");
        setNotice(reply.error); await read(); return;
      }
      setNotice(DONE[pending.resolution]); await read(); resolved.current?.();
    } finally { submitting.current = false; setBusy(false); }
  }

  if (items === null && !error) return <p className="mt-3 text-sm text-muted" role="status">Loading changed terms…</p>;
  return <section className="mt-4 min-w-0" aria-label="Changed OnlyFans terms" data-content-sync-conflicts>
    <h4 className="font-semibold">Changed OnlyFans terms</h4>
    {error ? <p className="mt-2 text-sm" role="status">{error} <button type="button" className="font-semibold text-accent underline" onClick={() => void read()}>Try again</button></p> : null}
    {items && !items.length && !error ? <p className="mt-2 text-sm" data-conflicts-empty>No item has changed terms to review.</p> : null}
    {items?.map(conflict => { const selected = choice[conflict.conflictId];
      const submit = () => { if (selected) void apply({ conflictId: conflict.conflictId, resolution: selected, body: { requestId: crypto.randomUUID(), resolution: selected,
        expectedRevision: conflict.revision, expectedItemFingerprint: conflict.itemFingerprint } }); };
      return <form key={conflict.conflictId} className="mt-3 min-w-0 rounded-xl border border-warn/40 p-3" data-sync-conflict={conflict.itemId}
        onSubmit={event => { event.preventDefault(); if (!retry) submit(); }}>
        <p className="text-sm font-semibold">Item {conflict.itemId}: selling is paused until you decide.</p>
        <div className="mt-2 grid min-w-0 gap-3 sm:grid-cols-2">
          <Terms title="Current CRM terms" terms={conflict.current} />
          <Terms title="Changed source terms" terms={conflict.source} lockedText={conflict.source.lockedText} />
        </div>
        <fieldset className="mt-3 min-w-0" disabled={readOnly || busy || !!retry}>
          <legend className="text-sm font-semibold">Your decision</legend>
          {RESOLUTIONS.map(resolution => <label key={resolution} className="mt-2 flex min-w-0 items-start gap-2 text-sm">
            <input type="radio" name={`resolution-${conflict.conflictId}`} className="mt-1" checked={selected === resolution} data-conflict-choice={resolution}
              onChange={() => setChoice(previous => ({ ...previous, [conflict.conflictId]: resolution }))} />
            <span className="min-w-0"><span className="font-semibold">{CHOICES[resolution].label}</span><span className="block text-xs text-muted">{CHOICES[resolution].help}</span></span>
          </label>)}
        </fieldset>
        {readOnly ? <p className="mt-2 text-xs text-muted">Read-only team access</p> : <div className="mt-3 flex flex-wrap gap-2">
          <button type="submit" className={buttonClass} disabled={!selected || busy || !!retry} data-conflict-apply>Apply decision</button>
          {retry && retry.conflictId === conflict.conflictId ? <button type="button" className={buttonClass} disabled={busy} data-conflict-retry onClick={() => void apply(retry)}>Retry the same request</button> : null}
        </div>}
      </form>; })}
    {notice ? <p className="mt-2 text-sm" role="status" data-conflict-notice>{notice}{connection ? <> <Link className="font-semibold text-accent underline" href={connectionHref(accountId)}>Reconnect this account</Link></> : null}</p> : null}
  </section>;
}
