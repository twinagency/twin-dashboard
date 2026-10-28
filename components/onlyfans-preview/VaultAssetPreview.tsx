"use client";
import { useEffect, useState } from "react";
import { Image as ImageIcon, RefreshCw } from "lucide-react";
import { MediaPreview } from "@/components/CreatorMediaLibrary";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import VaultVideoPlayer from "./VaultVideoPlayer";

export default function VaultAssetPreview({ accountId, mediaId, kind, readOnly = false, refreshKey = 0 }: { accountId: string; mediaId: string; kind: string; readOnly?: boolean; refreshKey?: number }) {
  const [open,setOpen]=useState(false),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
  useEffect(()=>{if(failed){setFailed(false);setAttempt(value=>value+1);}},[refreshKey]);
  if (!["photo","video","gif"].includes(kind)) return null;
  const source=`/api/onlyfans-content/accounts/${encodeURIComponent(accountId)}/vault/previews/${mediaId}`;
  const label=kind==="video"?"Video":"Photo preview";
  return <>
    {failed ? <div className="of-preview-pending" data-of-preview-pending={mediaId}><ImageIcon size={28} aria-hidden="true"/><span>Preview preparing</span><button type="button" onClick={()=>{setFailed(false);setAttempt(value=>value+1);}}><RefreshCw size={14} aria-hidden="true"/>Retry preview</button></div> :
    <button type="button" data-of-vault-image={mediaId} aria-label={`View ${label.toLowerCase()} for asset ${mediaId}`}
      className="mb-2 block w-20 overflow-hidden rounded-lg border border-line bg-elev" onClick={()=>setOpen(true)}>
      <img key={attempt} src={source} alt={`${label} of asset ${mediaId}`} loading="lazy" onError={()=>setFailed(true)}/>
    </button>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>{label} · #{mediaId}</DialogTitle></DialogHeader>
      {kind==="video"?open?<VaultVideoPlayer key={accountId+":"+mediaId} accountId={accountId} mediaId={mediaId} poster={source} readOnly={readOnly}/>:null
        :<MediaPreview src={source} expanded alt={`${label} of asset ${mediaId}`} />}
    </DialogContent></Dialog>
  </>;
}
