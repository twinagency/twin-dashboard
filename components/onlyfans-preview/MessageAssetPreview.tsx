"use client";
import { useEffect, useRef, useState } from "react";
import MediaPreviewState from "./MediaPreviewState";
import { classifyPreview, nextPreviewStep, type PreviewState } from "@/lib/onlyfans/section8";

export default function MessageAssetPreview({accountId, conversationId, messageId, mediaId, kind}: {accountId:string;conversationId:string;messageId:string;mediaId:string;kind:string}) {
  const [play,setPlay]=useState(false), [retry,setRetry]=useState(0), [url,setUrl]=useState<string|null>(null), [error,setError]=useState<PreviewState|null>(null);
  // A URL handed to window.open is revoked a minute later, not at unmount: the new tab may not have loaded it yet.
  const opened=useRef<string|null>(null);
  const fan=conversationId.startsWith(accountId+":")?conversationId.slice(accountId.length+1):"";
  const path=`/api/onlyfans-content/accounts/${encodeURIComponent(accountId)}/message-media/${fan}/${messageId}/${mediaId}/${play?"file":"preview"}`;
  useEffect(()=>{
    const controller=new AbortController();let active=true,objectUrl:string|null=null;
    setUrl(null);setError(null);
    (async()=>{
      for(let attempt=1;active;attempt++) {
        let status:number|null=null,blob:Blob|null=null;
        try{
          const response=await fetch(path,{cache:"no-store",signal:controller.signal});
          status=response.status;
          if(response.ok)blob=await response.blob();else await response.body?.cancel();
        }catch{if(!active)return;}
        const mimeOk=blob?(play?blob.type.startsWith("video/"):blob.type.startsWith("image/")):undefined;
        if(blob&&mimeOk){if(active){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}return;}
        const step=nextPreviewStep(attempt,{status:blob?200:status,mimeOk});
        if(step.action==="stop"){if(active)setError(step.state);return;}
        await new Promise(r=>setTimeout(r,step.delayMs));
      }
    })();
    return()=>{active=false;controller.abort();const created=objectUrl;if(created){if(opened.current===created)setTimeout(()=>URL.revokeObjectURL(created),60_000);else URL.revokeObjectURL(created);}};
  },[path,play,retry]);
  if(error)return <MediaPreviewState state={error} onRetry={()=>setRetry(n=>n+1)}/>;
  if(!url)return <span role="status" className="text-xs">Loading {play?"video":"preview"}…</span>;
  return <div data-of-message-asset={mediaId} className="max-w-full">
    {play?<video src={url} controls autoPlay playsInline className="max-h-96 max-w-full rounded-lg"/>
      :<button type="button" aria-label={kind==="video"?"Play attached video":"Expand attached photo"} onClick={()=>{if(kind==="video")setPlay(true);else{opened.current=url;window.open(url,"_blank","noopener");}}} className="relative block overflow-hidden rounded-lg border border-line">
        {/* Private object URL; source credentials never leave the server. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={kind==="video"?"Attached video preview":"Attached photo"} className="max-h-48 max-w-64 object-contain"/>
        {kind==="video"?<span className="absolute bottom-1 left-1 rounded bg-black/70 px-2 text-xs text-white">▶ Play video</span>:null}
      </button>}
  </div>;
}
