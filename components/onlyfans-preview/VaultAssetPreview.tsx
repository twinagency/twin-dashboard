"use client";
import { useEffect, useState } from "react";
import { Image as ImageIcon, Loader2, RefreshCw } from "lucide-react";
import { MediaPreview } from "@/components/CreatorMediaLibrary";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import VaultVideoPlayer from "./VaultVideoPlayer";

export default function VaultAssetPreview({ accountId, mediaId, kind, readOnly = false, refreshKey = 0, tile = false, processing = false }: { accountId: string; mediaId: string; kind: string; readOnly?: boolean; refreshKey?: number; tile?: boolean; processing?: boolean }) {
  const [open,setOpen]=useState(false),[failed,setFailed]=useState(false),[loaded,setLoaded]=useState(false),[attempt,setAttempt]=useState(0);
  useEffect(()=>{if(failed){setFailed(false);setAttempt(value=>value+1);}},[refreshKey]);
  if (!["photo","video","gif"].includes(kind)) return null;
  const source=`/api/onlyfans-content/accounts/${encodeURIComponent(accountId)}/vault/previews/${mediaId}`;
  const label=kind==="video"?"Video":"Photo preview";
  return <>
    {failed ? processing ? <div className="of-preview-pending" data-of-preview-pending={mediaId} data-of-preview-state="processing" title="This file is still being prepared. The preview appears when processing finishes."><Loader2 size={28} aria-hidden="true"/><span>Processing</span></div> :
    <div className="of-preview-pending" data-of-preview-pending={mediaId} data-of-preview-state="unavailable"><ImageIcon size={28} aria-hidden="true"/><span>Preview unavailable</span><button type="button" onClick={()=>{setFailed(false);setLoaded(false);setAttempt(value=>value+1);}}><RefreshCw size={14} aria-hidden="true"/>Retry preview</button></div> :
    <button type="button" data-of-vault-image={mediaId} data-of-preview-state={loaded?"ready":"loading"} aria-label={`View ${label.toLowerCase()} for asset ${mediaId}`}
      className={"relative mb-2 block min-h-16 overflow-hidden rounded-lg border border-line bg-elev " + (tile ? "w-full" : "w-20")} onClick={()=>setOpen(true)}>
      <img className={tile ? "aspect-square w-full object-cover" : undefined} key={attempt} src={source} alt={`${label} of asset ${mediaId}`} loading="lazy" onLoad={()=>setLoaded(true)} onError={()=>setFailed(true)}/>
      {loaded ? null : <span role="status" className="absolute inset-0 grid place-items-center text-xs text-muted">Loading</span>}
    </button>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>{label} · #{mediaId}</DialogTitle></DialogHeader>
      {kind==="video"?open?<VaultVideoPlayer key={accountId+":"+mediaId} accountId={accountId} mediaId={mediaId} poster={source} readOnly={readOnly}/>:null
        :<MediaPreview src={source} expanded alt={`${label} of asset ${mediaId}`} />}
    </DialogContent></Dialog>
  </>;
}
