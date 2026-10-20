"use client";
import { useState } from "react";
import { MediaPreview } from "@/components/CreatorMediaLibrary";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import VaultVideoPlayer from "./VaultVideoPlayer";

export default function VaultAssetPreview({ accountId, mediaId, kind, readOnly = false }: { accountId: string; mediaId: string; kind: string; readOnly?: boolean }) {
  const [open,setOpen]=useState(false);
  if (!["photo","video"].includes(kind)) return null;
  const source=`/api/onlyfans-content/accounts/${encodeURIComponent(accountId)}/vault/previews/${mediaId}`;
  const label=kind==="video"?"Video":"Photo preview";
  return <>
    <button type="button" data-of-vault-image={mediaId} aria-label={`View ${label.toLowerCase()} for asset ${mediaId}`}
      className="mb-2 block w-20 overflow-hidden rounded-lg border border-line bg-elev" onClick={()=>setOpen(true)}>
      <MediaPreview src={source} alt={`${label} of asset ${mediaId}`} />
    </button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>{label} · #{mediaId}</DialogTitle></DialogHeader>
      {kind==="video"?open?<VaultVideoPlayer key={accountId+":"+mediaId} accountId={accountId} mediaId={mediaId} poster={source} readOnly={readOnly}/>:null
        :<MediaPreview src={source} expanded alt={`${label} of asset ${mediaId}`} />}
      <p className="text-xs text-muted">If unavailable, sync the vault to refresh its saved preview.</p>
    </DialogContent></Dialog>
  </>;
}
