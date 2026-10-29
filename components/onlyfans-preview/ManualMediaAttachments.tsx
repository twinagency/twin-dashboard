"use client";
import { useState } from "react";
import { ImagePlus, X } from "lucide-react";
import type { InboxDraft } from "@/lib/onlyfans/inbox-drafts";
import { writeDraft } from "@/lib/onlyfans/inbox-drafts";
import { manualPriceCents } from "@/lib/onlyfans/manual-media";
import type { VaultItem } from "@/lib/onlyfans/vault";
import VaultMediaPicker from "./VaultMediaPicker";
import VaultAssetPreview from "./VaultAssetPreview";

export default function ManualMediaAttachments({ accountId, draftId, draft, disabled }: {
  accountId: string; draftId: string; draft: InboxDraft; disabled: boolean;
}) {
  const [open, setOpen] = useState(false), [notice, setNotice] = useState("");
  const selected = new Map(draft.selectedMedia.map(row => [row.mediaId, row]));
  const update = (patch: Parameters<typeof writeDraft>[1]) => writeDraft(draftId, { catalogItemId: "", ...patch });
  function toggle(row: VaultItem) {
    const next = new Map(selected);
    if (next.has(row.mediaId)) next.delete(row.mediaId);
    else if (row.ready && next.size < 20) next.set(row.mediaId, row);
    update({ selectedMedia: [...next.values()], previewIds: draft.previewIds.filter(id => next.has(id)) });
  }
  return <section aria-label="Attach media" className="min-w-0 space-y-3">
    <button type="button" data-of-attach-vault disabled={disabled} onClick={() => { setNotice(""); setOpen(true); }}
      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-sm font-semibold text-accent hover:bg-elev disabled:opacity-50">
      <ImagePlus size={18} aria-hidden="true" />{selected.size ? "Add more media" : "Add media"}
      {selected.size ? <span className="rounded-full bg-elev px-2 text-xs">{selected.size}</span> : null}
    </button>
    {selected.size ? <div className="rounded-xl border border-line bg-panel p-3">
      <div className="flex gap-3 overflow-x-auto pb-2" aria-label="Selected attachments">
        {[...selected.values()].map(row => <div key={row.mediaId} className="relative w-28 shrink-0" data-of-selected-media={row.mediaId}>
          <VaultAssetPreview tile accountId={accountId} mediaId={row.mediaId} kind={row.kind} />
          <button type="button" disabled={disabled} aria-label={"Remove asset " + row.mediaId} onClick={() => toggle(row)}
            className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-black/70 text-white"><X size={15} /></button>
          <p className="mt-1 truncate text-xs" title={row.description || undefined}>{row.description || row.kind + " " + row.mediaId}</p>
          {draft.mediaPaid ? <label className="mt-1 flex min-h-8 items-center gap-1 text-xs"><input type="checkbox" disabled={disabled}
            checked={draft.previewIds.includes(row.mediaId)} onChange={() => update({ previewIds: draft.previewIds.includes(row.mediaId) ? draft.previewIds.filter(id => id !== row.mediaId) : [...draft.previewIds, row.mediaId] })} />Free preview</label> : null}
        </div>)}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <div className="inline-flex rounded-lg bg-elev p-1" role="group" aria-label="Attachment price">
          <button type="button" disabled={disabled} aria-pressed={!draft.mediaPaid} onClick={() => update({ mediaPaid: false, previewIds: [] })}
            className={"rounded-md px-3 py-2 text-sm font-semibold " + (!draft.mediaPaid ? "bg-panel text-ink shadow-sm" : "text-muted")}>Free</button>
          <button type="button" disabled={disabled} aria-pressed={draft.mediaPaid} onClick={() => update({ mediaPaid: true })}
            className={"rounded-md px-3 py-2 text-sm font-semibold " + (draft.mediaPaid ? "bg-panel text-ink shadow-sm" : "text-muted")}>Set price</button>
        </div>
        {draft.mediaPaid ? <label className="flex min-w-0 flex-wrap items-center gap-2 text-sm">Total price (USD)<input data-of-manual-price aria-label="Total price (USD)"
          type="text" inputMode="decimal" maxLength={6} placeholder="3.00" disabled={disabled} value={draft.mediaPrice}
          title="USD 3.00 to 200.00 for all selected attachments"
          onChange={e => update({ mediaPrice: e.target.value })} className="w-24 rounded-lg border border-line bg-panel px-3 py-2 text-ink" /></label>
          : <span className="text-sm text-muted">Free attachment{selected.size === 1 ? "" : "s"}</span>}
      </div>
      {draft.mediaPaid ? <p className="mt-2 text-xs" data-of-manual-total>{manualPriceCents(draft.mediaPrice) ? "USD " + (manualPriceCents(draft.mediaPrice)! / 100).toFixed(2) + " total" : "Enter a price from USD 3.00 to 200.00."}</p> : null}
    </div> : null}
    {notice ? <p role="alert" className="text-sm">{notice}</p> : null}
    {open ? <VaultMediaPicker accountId={accountId} connectionRevision={null} selected={selected} initialMode="vault" purpose="message" allowUpload={false}
      onToggle={toggle} onClose={() => setOpen(false)} onChanged={() => {}} onDenied={() => { setOpen(false); setNotice("Your session cannot read this creator's media. Refresh or sign in again."); }} /> : null}
  </section>;
}
