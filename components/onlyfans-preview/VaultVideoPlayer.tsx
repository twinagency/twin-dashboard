"use client";
import {useEffect,useState} from "react";
import {parseVideo,type VideoState} from "@/lib/onlyfans/vault-media";

/** A video's prepare key, kept while its outcome is unresolved (unprepared, pending, running, network error, any 5xx: the route labels an upstream timeout "refused" though the prepare may have run) so a reopen or Retry repeats
 * that prepare. A definite refusal or a ready/failed video releases it, and the next prepare is a new one. In-page only, not across a reload.
 * Opening reads the recorded status first and prepares only a video that is not ready or already preparing. */
const prepareKeys=new Map<string,string>();
const prepareKey=(base:string)=>{if(!prepareKeys.has(base))prepareKeys.set(base,crypto.randomUUID());return prepareKeys.get(base)!;};

export default function VaultVideoPlayer({accountId,mediaId,poster,readOnly=false}:{accountId:string;mediaId:string;poster:string;readOnly?:boolean}){
  const [state,setState]=useState<VideoState|null>(null),[notice,setNotice]=useState("Preparing your video…"),[playbackError,setPlaybackError]=useState(""),[denied,setDenied]=useState(false),[retry,setRetry]=useState(0);
  const base=`/api/onlyfans-content/accounts/${encodeURIComponent(accountId)}/vault/videos/${mediaId}`;
  useEffect(()=>{let live=true,running=false;let timer:ReturnType<typeof setTimeout>|undefined;const controller=new AbortController();
    setState(null);setNotice("Preparing your video…");setPlaybackError("");setDenied(false);
    async function read(prepare=false,first=false){if(running)return;running=true;
      try{const response=await fetch(base,{method:prepare?"POST":"GET",credentials:"same-origin",cache:"no-store",redirect:"error",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]),
        ...(prepare?{headers:{"Content-Type":"application/json"},body:JSON.stringify({requestId:prepareKey(base)})}:{})});
        const value=response.ok?parseVideo(await response.json(),accountId,mediaId):null;
        if(value?!["unprepared","pending","running"].includes(value.status):prepare&&response.status<500&&!response.ok&&(await response.json().catch(()=>null))?.outcome==="refused")prepareKeys.delete(base);
        if([401,403].includes(response.status)){if(live){setState(null);setPlaybackError("");setDenied(true);setNotice("Sign in again to play this video.");}live=false;controller.abort();return;}
        if(!value)throw Error([401,403].includes(response.status)?"Sign in again to play this video.":"This video could not be prepared. Sync the vault, then try again.");
        if(first&&!value.ready&&!["pending","running"].includes(value.status)){running=false;await read(true);return;}
        if(live){setState(value);if(value.ready||["pending","running"].includes(value.status))timer=setTimeout(()=>void read(),value.ready?15000:2000);setNotice(value.ready?"":value.lastError==="protected_playback_not_supported"?"OnlyFans protects this video. Playback is not supported in this dashboard yet. You can still select it for an eligible offer.":value.status==="pending"||value.status==="running"?"Preparing your video…":readOnly?"This video is not ready. Ask a team manager to prepare it.":"This video is unavailable. Sync the vault, then try again.");}
      }catch(error){if(live)setNotice(error instanceof Error?error.message:"Video unavailable.");}finally{running=false;}}
    void read(false,!readOnly);
    return()=>{live=false;controller.abort();clearTimeout(timer);};
  },[accountId,mediaId,base,retry,readOnly]);
  return <div className="min-w-0" data-of-video-player>
    {state?.ready?<video key={base+":"+retry} className="mx-auto max-h-[70vh] w-full rounded-lg bg-black object-contain" controls playsInline preload="metadata" poster={poster} src={base+"/stream"}
      onError={()=>setPlaybackError("This video could not play in this browser. Sync the vault or retry playback.")} aria-label={`Video asset ${mediaId}`} />:null}
    {playbackError||notice?<p className="mt-3 text-sm text-muted" role="status">{playbackError||notice}</p>:null}
    {!denied&&state?.lastError!=="protected_playback_not_supported"&&(playbackError||notice&&!notice.startsWith("Preparing"))?<button type="button" className="mt-3 min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-accent" onClick={()=>{setState(null);setNotice("Preparing your video…");setPlaybackError("");setRetry(value=>value+1);}}>Retry video</button>:null}
  </div>;
}
