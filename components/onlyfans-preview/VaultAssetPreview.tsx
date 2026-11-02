"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { MediaPreview } from "@/components/CreatorMediaLibrary";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import VaultVideoPlayer from "./VaultVideoPlayer";
import MediaPreviewState from "./MediaPreviewState";
import { nextPreviewStep, type PreviewState } from "@/lib/onlyfans/section8";

export default function VaultAssetPreview({ accountId, mediaId, kind, readOnly = false, refreshKey = 0, tile = false, processing = false }: { accountId: string; mediaId: string; kind: string; readOnly?: boolean; refreshKey?: number; tile?: boolean; processing?: boolean }) {
  const [open,setOpen]=useState(false),[failed,setFailed]=useState(false),[loaded,setLoaded]=useState(false),[attempt,setAttempt]=useState(0),[state,setState]=useState<PreviewState>("temporary"),[tries,setTries]=useState(1);
  useEffect(()=>{if(failed){setFailed(false);setAttempt(value=>value+1);}},[refreshKey]);
  if (!["photo","video","gif"].includes(kind)) return null;
  const source=`/api/onlyfans-content/accounts/${encodeURIComponent(accountId)}/vault/previews/${mediaId}`;
  // The image element hides the HTTP status, so one authenticated probe classifies the failure. Retries stop after 3 tries.
  async function probe(){
    let status:number|null=null;
    try{const response=await fetch(source,{cache:"no-store",credentials:"same-origin"});status=response.status;await response.body?.cancel();}catch{/* network error stays temporary */}
    const step=nextPreviewStep(tries,{status});
    if(step.action==="retry"){const count=tries+1;setTries(count);setTimeout(()=>{setLoaded(false);setAttempt(value=>value+1);},step.delayMs);return;}
    setState(step.state);setFailed(true);
  }
  const label=kind==="video"?"Video":"Photo preview";
  return <>
    {failed ? processing ? <div className="of-preview-pending" data-of-preview-pending={mediaId} data-of-preview-state="processing" title="This file is still being prepared. The preview appears when processing finishes."><Loader2 size={28} aria-hidden="true"/><span>Processing</span></div> :
    <MediaPreviewState mediaId={mediaId} state={state} onRetry={()=>{setFailed(false);setLoaded(false);setTries(1);setAttempt(value=>value+1);}}/> :
    <button type="button" data-of-vault-image={mediaId} data-of-preview-state={loaded?"ready":"loading"} aria-label={`View ${label.toLowerCase()} for asset ${mediaId}`}
      className={"relative mb-2 block min-h-16 overflow-hidden rounded-lg border border-line bg-elev " + (tile ? "w-full" : "w-20")} onClick={()=>setOpen(true)}>
      <img className={tile ? "aspect-square w-full object-cover" : undefined} key={attempt} src={source} alt={`${label} of asset ${mediaId}`} loading="lazy" onLoad={()=>setLoaded(true)} onError={()=>void probe()}/>
      {loaded ? null : <span role="status" className="absolute inset-0 grid place-items-center text-xs text-muted">Loading</span>}
    </button>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>{label} · #{mediaId}</DialogTitle></DialogHeader>
      {kind==="video"?open?<VaultVideoPlayer key={accountId+":"+mediaId} accountId={accountId} mediaId={mediaId} poster={source} readOnly={readOnly}/>:null
        :<MediaPreview src={source} expanded alt={`${label} of asset ${mediaId}`} />}
    </DialogContent></Dialog>
  </>;
}
