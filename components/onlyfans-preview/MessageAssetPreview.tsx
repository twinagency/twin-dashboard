"use client";
import { useEffect, useState } from "react";

export default function MessageAssetPreview({accountId, conversationId, messageId, mediaId, kind}: {accountId:string;conversationId:string;messageId:string;mediaId:string;kind:string}) {
  const [play,setPlay]=useState(false), [retry,setRetry]=useState(0), [url,setUrl]=useState<string|null>(null), [error,setError]=useState(false);
  const fan=conversationId.startsWith(accountId+":")?conversationId.slice(accountId.length+1):"";
  const path=`/api/onlyfans-content/accounts/${encodeURIComponent(accountId)}/message-media/${fan}/${messageId}/${mediaId}/${play?"file":"preview"}`;
  useEffect(()=>{
    const controller=new AbortController();let active=true,objectUrl:string|null=null;
    setUrl(null);setError(false);
    (async()=>{
      for(let attempt=0;attempt<25&&active;attempt++) {
        const response=await fetch(path,{cache:"no-store",signal:controller.signal});
        if(response.status===202){await response.body?.cancel();await new Promise(r=>setTimeout(r,2000));continue;}
        if(!response.ok)throw new Error("Unavailable");
        const blob=await response.blob();
        if(!(play?blob.type.startsWith("video/"):blob.type.startsWith("image/")))throw new Error("Unavailable");
        if(active){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}return;
      }
      if(active)setError(true);
    })().catch(()=>{if(active)setError(true);});
    return()=>{active=false;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[path,play,retry]);
  if(error)return <button type="button" className="rounded border p-2 text-xs" onClick={()=>setRetry(n=>n+1)}>Preview unavailable · Retry</button>;
  if(!url)return <span role="status" className="text-xs">Loading {play?"video":"preview"}…</span>;
  return <div data-of-message-asset={mediaId} className="max-w-full">
    {play?<video src={url} controls autoPlay playsInline className="max-h-96 max-w-full rounded-lg"/>
      :<button type="button" aria-label={kind==="video"?"Play attached video":"Expand attached photo"} onClick={()=>kind==="video"?setPlay(true):window.open(url,"_blank","noopener")} className="relative block overflow-hidden rounded-lg border border-line">
        {/* Private object URL; source credentials never leave the server. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={kind==="video"?"Attached video preview":"Attached photo"} className="max-h-48 max-w-64 object-contain"/>
        {kind==="video"?<span className="absolute bottom-1 left-1 rounded bg-black/70 px-2 text-xs text-white">▶ Play video</span>:null}
      </button>}
  </div>;
}
