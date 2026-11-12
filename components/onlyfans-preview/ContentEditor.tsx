"use client";

import { inputCls } from "@/components/clone/fields";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { displayContentPrice, parseContentPrice, type ContentPatch } from "@/lib/onlyfans/content";
import { parseContentItemV2 as parseContentItem, parseContentAckV2 as parseContentAck, validContentRequestV2 as validContentRequest,
  type ContentItemV2 as ContentItem, type ContentRequestV2 as ContentRequest } from "@/lib/onlyfans/content-v2";
import type { SyncDraft } from "@/lib/onlyfans/content-sync";
import { syncCall, type SyncReply } from "@/lib/onlyfans/content-sync-client";
import ContentSyncDraft from "./ContentSyncDraft";
import CommercialTerms from "./CommercialTerms";

const inputClass = `${inputCls} mt-1 disabled:opacity-50`;
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
  const [override, setOverride] = useState(false);
  const [syncDraft, setSyncDraft] = useState<SyncDraft | null>(null);
  const active = useRef(false), submitting = useRef(false), sessionDenied = useRef(false);
  const endpoint = `/api/onlyfans-content/accounts/${encodeURIComponent(accountId)}/items/${encodeURIComponent(itemId)}?contract=v2`;
  const clear = () => { setData(null); setLabel(""); setDescription(""); setPrice(""); setEnabled(false); setRetry(null); };

  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  // The sync draft that created this item, if any. Lookup problems never block the existing editor.
  const findDraft = useCallback(async () => {
    let after: string | null = null;
    for (let page = 0; page < 4; page++) {
      const reply: SyncReply<{ items: SyncDraft[]; nextCursor: string | null }> = await syncCall<{ items: SyncDraft[]; nextCursor: string | null }>(accountId, "/drafts?limit=50" + (after ? `&after=${encodeURIComponent(after)}` : ""));
      if (!active.current || reply.kind !== "ok") return;
      const hit = reply.data.items.find(draft => draft.itemId === itemId);
      if (hit) { setSyncDraft(hit); return; }
      after = reply.data.nextCursor; if (!after) return;
    }
  }, [accountId, itemId]);
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
      setPrice(next.priceCents === null ? "" : displayContentPrice(next.priceCents)); setEnabled(next.enabled); setOverride(false);
      void findDraft();
      return true;
    } catch { if (active.current) { setData(null); setNotice("This catalogue item could not be refreshed. Try again."); } return false; }
  }, [accountId, endpoint, findDraft, itemId, router]);

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
  const source = data?.provenance ?? null;
  // A fixed imported price may only change with an explicit operator override.
  const needsOverride = !!source && patch.priceCents !== undefined && patch.priceCents !== source.sourcePriceCents;
  // Media that is not fully synced to OnlyFans can never be switched on from here.
  const enableBlocked = !!syncDraft && !syncDraft.readiness.canEnable && !!data && !data.enabled;
  const request: ContentRequest | null = data && Object.keys(patch).length && validPrice && (!needsOverride || override) && !(enableBlocked && patch.enabled === true) ? {
    patch, expectedRevision: data.revision, expectedFingerprint: data.fingerprint, acknowledgeOverride: needsOverride && override,
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
          <label className="block text-sm">{data.pricingMode === "fixed" ? "Price for future messages (USD)" : "Saved price (USD)"}
            <input data-of-edit-content-price className={inputClass} inputMode="decimal" autoComplete="off" value={price} onChange={event => setPrice(event.target.value)} aria-invalid={!validPrice} />
            <span className="mt-1 block text-xs text-muted">{data.isFreeTeaser ? "This item is a free teaser; its price must remain USD 0.00." : data.pricingMode === "fixed" ? "Fixed. Every future offer of this item uses this exact amount. USD 3.00–200.00, with up to two decimal places." : "Paid items: USD 3.00–200.00, with up to two decimal places."}</span>
          </label>
          {source ? <p className="text-sm" data-of-content-source>Price from selected OnlyFans offer: USD {displayContentPrice(source.sourcePriceCents)}{source.sourceAt ? `, sent ${new Date(source.sourceAt).toLocaleDateString()}` : ""}.
            {data.priceOverridden ? " The saved price is an operator override." : ""}{source.withdrawn ? " This draft was withdrawn." : ""}</p> : null}
          {needsOverride ? <label className="flex items-start gap-2 text-sm"><input data-of-edit-content-override type="checkbox" checked={override} onChange={event => setOverride(event.target.checked)} className="mt-1" /><span>Override the price from the selected OnlyFans offer</span></label> : null}
          <label className="flex items-start gap-2 text-sm"><input data-of-edit-content-enabled type="checkbox" checked={enabled} disabled={enableBlocked} onChange={event => setEnabled(event.target.checked)} className="mt-1" /><span>Enabled in the catalogue</span></label>
          {enableBlocked ? <p className="text-sm" role="status" data-of-content-enable-blocked>This item can&apos;t be switched on until every file is synced to OnlyFans and nothing needs review.</p> : null}
          {syncDraft ? <ContentSyncDraft accountId={accountId} draft={syncDraft} onChanged={() => void findDraft()} /> : null}
          <p className="text-xs text-muted">Saved changes apply to future eligible offers. Existing offers keep their recorded terms.</p>
          <button data-of-save-content type="submit" className={buttonClass} disabled={!request || !validContentRequest(request)}>Save catalogue item</button>
        </fieldset>
      </form> : null}
      {data && !denied ? <CommercialTerms key={data.fingerprint} accountId={accountId} itemId={itemId}/> : null}
      {retry && !denied ? <div className="mt-3 flex flex-wrap gap-2">
        <button data-of-retry-content disabled={busy} className={buttonClass} onClick={() => void save(retry)}>Retry same save</button>
        <button disabled={busy || !data} className={buttonClass} onClick={() => { setRetry(null); setNotice("Review the refreshed item before editing again."); }}>Use refreshed item</button>
      </div> : null}
      {!data && !denied ? <button type="button" disabled={busy} className={`${buttonClass} mt-3`} onClick={() => void refresh()}>Refresh item</button> : null}
    </div> : null}
  </div>;
}
