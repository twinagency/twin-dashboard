"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { DRAFT_STATE_LABELS, MEDIA_SYNC_NOTE, reasonLabel, type DraftState, type SyncDraft, type SyncOperation } from "@/lib/onlyfans/content-sync";
import { connectionHref, syncCall, type SyncReply } from "@/lib/onlyfans/content-sync-client";
import { usd } from "@/lib/onlyfans/offer-import";

const buttonClass = "min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-accent disabled:opacity-50";
const TONE: Record<DraftState, string> = {
  draft: "border-line text-muted", queued: "border-line text-muted", uploading: "border-line text-ink", verifying: "border-line text-ink", synced: "border-good/40 text-good",
  retrying: "border-warn/40 text-warn", connection_required: "border-warn/40 text-warn", needs_review: "border-crit/40 text-crit", outcome_unconfirmed: "border-warn/40 text-warn",
};
const RETRYABLE: DraftState[] = ["retrying", "connection_required", "needs_review", "outcome_unconfirmed"];
const BLOCKERS: Record<string, string> = { media_not_synced: "Not every file is synced to OnlyFans yet.", assets_incomplete: "Not every file is synced to OnlyFans yet.",
  open_conflict: "The OnlyFans terms changed. Review them first.", unpublished_upload_unavailable: "OnlyFans upload without posting isn't available yet.", connection_required: "Connection required." };
export const blockerLabel = (code: string) => BLOCKERS[code] ?? "Needs review.";

/** Per-asset progress, item readiness and recovery actions for one saved draft. */
export default function ContentSyncDraft({ accountId, draft, readOnly = false, unfinished = false, onChanged }:
  { accountId: string; draft: SyncDraft; readOnly?: boolean; unfinished?: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [pending, setPending] = useState<{ operationId: string; body: { requestId: string } } | null>(null);
  const submitting = useRef(false);
  const stuck = RETRYABLE.includes(draft.state);
  const reason = reasonLabel(draft.reason);

  /** Find the recorded upload operation for this draft, then retry exactly that operation. */
  async function retryUpload() {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setNotice("");
    try {
      let target = pending;
      if (!target) {
        let after: string | null = null;
        for (let page = 0; page < 3 && !target; page++) {
          const reply: SyncReply<{ items: SyncOperation[]; nextCursor: string | null }> = await syncCall<{ items: SyncOperation[]; nextCursor: string | null }>(accountId, "/operations?limit=50" + (after ? `&after=${encodeURIComponent(after)}` : ""));
          if (reply.kind !== "ok") { setNotice(reply.kind === "denied" ? "Your session cannot retry this upload. Sign in again." : "Uploads could not be read. Try again."); return; }
          const found = reply.data.items.find(op => op.draftId === draft.draftId && op.retryable);
          if (found) target = { operationId: found.operationId, body: { requestId: crypto.randomUUID() } };
          after = reply.data.nextCursor; if (!after) break;
        }
        if (!target) { setNotice("Nothing can be retried right now. Check the account connection, then refresh."); return; }
      }
      const reply = await syncCall(accountId, `/operations/${encodeURIComponent(target.operationId)}/retry`, { method: "POST", body: target.body });
      if (reply.kind === "unconfirmed") { setPending(target); setNotice(reply.error); return; }
      setPending(null);
      if (reply.kind === "ok") { setNotice("Retry queued."); onChanged(); }
      else if (reply.kind === "refused") setNotice(reply.error);
      else if (reply.kind === "denied") setNotice("Your session cannot retry this upload. Sign in again.");
    } finally { submitting.current = false; setBusy(false); }
  }

  return <article className="min-w-0 rounded-xl border border-line p-3" data-sync-draft={draft.draftId} data-state={draft.state}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h4 className="min-w-0 break-words font-semibold">{draft.label}</h4>
      <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${TONE[draft.state]}`} data-sync-draft-state>{unfinished && draft.state === "draft" ? "Not finished" : DRAFT_STATE_LABELS[draft.state]}</span>
    </div>
    <p className="mt-1 text-sm" data-sync-price>Price for future messages: <span className="font-semibold">{usd(draft.priceCents)}</span> (fixed)</p>
    {unfinished && draft.state === "draft" ? <p className="mt-1 text-sm">The files were not fully sent. Choose them again and save to continue.</p> : null}
    {reason ? <p className="mt-1 text-sm" role="status" data-sync-reason={draft.reason}>{reason}</p> : null}
    <ul className="mt-2 grid min-w-0 gap-1" aria-label={`Files for ${draft.label}`}>
      {[...draft.assets].sort((a, b) => a.order - b.order).map(asset => <li key={asset.assetId} className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 text-xs" data-sync-asset={asset.fileId} data-state={asset.state}>
        <span className="min-w-0 break-all">{asset.order + 1}. {asset.name} · {asset.kind}{asset.freePreview ? " · free preview" : ""}</span>
        <span className={asset.state === "synced" ? "text-good" : asset.state === "needs_review" ? "text-crit" : "text-muted"}>{DRAFT_STATE_LABELS[asset.state]}{asset.attempts > 1 ? `, attempt ${asset.attempts}` : ""}</span>
        {asset.lastError ? <span className="w-full text-muted">{reasonLabel(asset.lastError)}</span> : null}
      </li>)}
    </ul>
    <div className="mt-2 text-sm" data-sync-readiness={draft.readiness.canEnable ? "ready" : "not_ready"}>
      <p>{draft.readiness.mediaSynced ? "Every file is synced to OnlyFans." : "Not every file is synced to OnlyFans yet."} {draft.readiness.canEnable ? "This item can be switched on from its editor." : "This item cannot be switched on yet."}</p>
      {draft.readiness.blockers.length ? <ul className="mt-1 list-inside list-disc text-xs text-muted">{[...new Set(draft.readiness.blockers.map(blockerLabel))].map(label => <li key={label}>{label}</li>)}</ul> : null}
      <p className="mt-1 text-xs text-muted">{draft.itemId ? `Saved as catalogue item ${draft.itemId}, switched ${draft.enabled ? "on" : "off"}. ` : "The catalogue item is created once every file is synced. "}{MEDIA_SYNC_NOTE}</p>
    </div>
    {draft.state === "connection_required" ? <p className="mt-2 text-sm"><Link className="font-semibold text-accent underline" href={connectionHref(accountId)} data-sync-reconnect>Reconnect this account</Link>, then retry the upload.</p> : null}
    {!readOnly && stuck ? <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" className={buttonClass} disabled={busy} data-sync-retry-upload onClick={() => void retryUpload()}>{pending ? "Retry the same request" : "Retry upload"}</button>
      <button type="button" className={buttonClass} disabled={busy} onClick={onChanged}>Refresh status</button>
    </div> : null}
    {notice ? <p className="mt-2 text-sm" role="status" data-sync-draft-notice>{notice}</p> : null}
  </article>;
}
