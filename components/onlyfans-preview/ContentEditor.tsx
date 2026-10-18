"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { displayContentPrice, parseContentPrice, parseContentItem, parseContentAck, validContentRequest,
  type ContentItem, type ContentPatch, type ContentRequest } from "@/lib/onlyfans/content";

const inputClass = "mt-1 w-full min-w-0 rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink focus:outline-2 focus:outline-accent disabled:opacity-60";
const buttonClass = "rounded-lg border border-line px-3 py-2 text-sm font-semibold text-accent disabled:opacity-50";

export default function ContentEditor({ accountId, itemId }: { accountId: string; itemId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ContentItem | null>(null);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [descriptionEdited, setDescriptionEdited] = useState(false);
  const [price, setPrice] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState<ContentRequest | null>(null);
  const active = useRef(false), submitting = useRef(false), sessionDenied = useRef(false);
  const endpoint = `/api/onlyfans-content/accounts/${encodeURIComponent(accountId)}/items/${encodeURIComponent(itemId)}`;
  const clear = () => { setData(null); setLabel(""); setDescription(""); setPrice(""); setEnabled(false); setRetry(null); };

  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const read = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store", redirect: "error" });
      if (!active.current) return false;
      if ([401, 403].includes(response.status)) {
        sessionDenied.current = true; clear(); setDenied(true);
        setNotice("Your session cannot edit this catalogue. Sign in again."); router.refresh(); return false;
      }
      const next = response.ok ? parseContentItem(await response.json(), accountId, itemId) : null;
      if (!active.current) return false;
      if (!next) { setData(null); setNotice("This catalogue item could not be refreshed. Try again."); return false; }
      setData(next); setLabel(next.label ?? ""); setDescription(next.description ?? ""); setDescriptionEdited(false);
      setPrice(next.priceCents === null ? "" : displayContentPrice(next.priceCents)); setEnabled(next.enabled);
      return true;
    } catch { if (active.current) { setData(null); setNotice("This catalogue item could not be refreshed. Try again."); } return false; }
  }, [accountId, endpoint, itemId, router]);

  async function refresh() {
    setBusy(true); setNotice("Loading current catalogue details…");
    const ok = await read(); if (active.current) { setBusy(false); if (ok) setNotice(""); }
  }
  const patch: ContentPatch = {};
  const cents = parseContentPrice(price);
  if (data) {
    if (data.labelTruncated ? !!label.trim() : label !== data.label) patch.label = label.trim();
    if (data.descriptionTruncated ? descriptionEdited : description !== data.description) patch.description = description.trim();
    if (cents !== null && cents !== data.priceCents) patch.priceCents = cents;
    if (enabled !== data.enabled) patch.enabled = enabled;
  }
  const changedPrice = !!data && price !== (data.priceCents === null ? "" : displayContentPrice(data.priceCents));
  const validPrice = !changedPrice || (cents !== null && (data?.isFreeTeaser ? cents === 0 : cents >= 300));
  const request: ContentRequest | null = data && Object.keys(patch).length && validPrice ? {
    patch, expectedRevision: data.revision, expectedFingerprint: data.fingerprint,
  } : null;

  async function save(command: ContentRequest) {
    if (submitting.current || !validContentRequest(command)) return;
    submitting.current = true; setBusy(true); setNotice("Saving catalogue details…");
    let message = "Save outcome not confirmed. Review the refreshed item or retry the same save.";
    let nextRetry: ContentRequest | null = command;
    let sessionLost = false;
    try {
      const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", redirect: "error", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
      if (!active.current) return;
      if ([401, 403].includes(response.status)) {
        sessionLost = true; sessionDenied.current = true; clear(); setDenied(true);
        setNotice("Your session cannot edit this catalogue. Sign in again."); router.refresh(); return;
      }
      if (response.ok && parseContentAck(await response.json(), { ...command, accountId, itemId })) {
        message = "Save recorded. Current catalogue details refreshed."; nextRetry = null;
      } else if ([400, 404, 409, 413, 503].includes(response.status)) {
        message = response.status === 409 ? "Catalogue item changed. Review the refreshed values before saving again."
          : "The change was refused. Review the refreshed item before trying again.";
        nextRetry = null;
      }
    } catch { /* Retain the exact request because the save may have committed. */ }
    finally {
      if (active.current && !sessionLost) {
        const refreshed = await read();
        if (active.current) {
          if (!sessionDenied.current) setRetry(nextRetry);
          if (refreshed) setNotice(message);
          router.refresh(); setBusy(false);
        }
      }
      if (active.current && sessionLost) setBusy(false);
      submitting.current = false;
    }
  }

  return <div className="mt-4 border-t border-line pt-4" data-of-content-editor={itemId}>
    <button type="button" className={buttonClass} data-of-edit-content-open aria-expanded={open} disabled={busy || denied}
      onClick={() => { if (open) setOpen(false); else { setOpen(true); if (!retry) void refresh(); } }}>{open ? "Close editor" : "Edit catalogue item"}</button>
    {open ? <div className="mt-3 min-w-0">
      {notice ? <p role="status" className="text-sm" data-of-content-notice>{notice}</p> : null}
      {data && !denied ? <form onSubmit={event => { event.preventDefault(); if (request && !retry) void save(request); }}>
        <fieldset disabled={busy || !!retry} className="min-w-0 space-y-3">
          <label className="block text-sm">{data.labelTruncated ? "Replace saved label" : "Item label"}
            <input data-of-edit-content-label className={inputClass} maxLength={160} value={label} onChange={event => setLabel(event.target.value)} />
            {data.labelTruncated ? <span className="mt-1 block text-xs text-muted">The saved label exceeds this editor’s limit. Enter a complete replacement to change it.</span> : null}
          </label>
          <label className="block text-sm">{data.descriptionTruncated ? "Replace saved description" : "Content description"}
            <textarea data-of-edit-content-description className={`${inputClass} min-h-28`} maxLength={2000} value={description} onChange={event => { setDescription(event.target.value); setDescriptionEdited(true); }} />
            <span className="mt-1 block text-xs text-muted">Describe what the fan receives. The reply engine uses this description when offering the item.</span>
            {data.descriptionTruncated ? <span className="mt-1 block text-xs text-muted">The full saved description exceeds this editor’s limit. Enter a complete replacement to change it.</span> : null}
          </label>
          {data.descriptionTruncated ? <button type="button" className="text-xs font-semibold text-accent" onClick={() => { setDescription(""); setDescriptionEdited(true); }}>Clear the saved description</button> : null}
          <label className="block text-sm">Saved price (USD)
            <input data-of-edit-content-price className={inputClass} inputMode="decimal" autoComplete="off" value={price} onChange={event => setPrice(event.target.value)} aria-invalid={!validPrice} />
            <span className="mt-1 block text-xs text-muted">{data.isFreeTeaser ? "This item is a free teaser; its price must remain USD 0.00." : "Paid items: USD 3.00–200.00, with up to two decimal places."}</span>
          </label>
          <label className="flex items-start gap-2 text-sm"><input data-of-edit-content-enabled type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} className="mt-1" /><span>Enabled in the catalogue</span></label>
          <p className="text-xs text-muted">Saved changes apply to future eligible offers. Existing offers keep their recorded terms.</p>
          <button data-of-save-content type="submit" className={buttonClass} disabled={!request || !validContentRequest(request)}>Save catalogue item</button>
        </fieldset>
      </form> : null}
      {retry && !denied ? <div className="mt-3 flex flex-wrap gap-2">
        <button data-of-retry-content disabled={busy} className={buttonClass} onClick={() => void save(retry)}>Retry same save</button>
        <button disabled={busy || !data} className={buttonClass} onClick={() => { setRetry(null); setNotice("Review the refreshed item before editing again."); }}>Use refreshed item</button>
      </div> : null}
      {!data && !denied ? <button type="button" disabled={busy} className={`${buttonClass} mt-3`} onClick={() => void refresh()}>Refresh item</button> : null}
    </div> : null}
  </div>;
}
