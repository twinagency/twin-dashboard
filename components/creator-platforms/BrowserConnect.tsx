"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Download, RefreshCw } from "lucide-react";

const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50";
type Reply = {ok:boolean; phase?:string; version?:string; error?:string; handle?:string|null};
function connector(type:string, payload:Record<string,string> = {}):Promise<Reply> {
  return new Promise(resolve => {
    const id = crypto.randomUUID();
    const finish = (value:Reply) => { window.removeEventListener("message",listen); window.clearTimeout(timer); resolve(value); };
    const listen = (event:MessageEvent) => { if(event.source===window && event.origin===location.origin && event.data?.source==="twin-connector" && event.data.id===id) finish(event.data); };
    const timer = window.setTimeout(()=>finish({ok:false,error:"Install Twin Connect, then refresh this page."}),type==="start"?10000:2000);
    window.addEventListener("message",listen);
    window.postMessage({source:"twin-dashboard",id,type,...payload},location.origin);
  });
}
export default function BrowserConnect({profileId,disabled,onChanged,autoStart=false}:{profileId:string;disabled:boolean;onChanged:()=>Promise<boolean>;autoStart?:boolean}) {
  const [supported,setSupported]=useState<boolean|null>(null),[available,setAvailable]=useState(false),[working,setWorking]=useState(false),[phase,setPhase]=useState("idle"),[notice,setNotice]=useState("");
  const active=useRef(true),latest=useRef(onChanged),autoStarted=useRef(false); latest.current=onChanged;
  useEffect(()=>{ active.current=true; const mobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
    setSupported(!mobile&&location.origin==="https://dashboard.tgaiclone.xyz");
    if(!mobile) void connector("ping").then(async r=>{if(!active.current)return;if(r.ok){const current=await connector("status");if(!active.current)return;if(current.ok&&["waiting","ready","retry","submitting"].includes(current.phase||"")){autoStarted.current=true;setPhase(current.phase!);}}setAvailable(r.ok&&r.version==="1.0.0");});
    return()=>{active.current=false;};
  },[]);
  useEffect(()=>{
    if(!["waiting","ready","retry","submitting"].includes(phase)||disabled)return;
    let running=false;
    const timer=window.setInterval(async()=>{ if(running)return;running=true; try {const result=await connector("status");if(!active.current)return;
      if(!result.ok){setNotice(result.error||"The connector is unavailable. Refresh this page.");return;}
      setPhase(result.phase||"idle");
      if(result.phase==="submitted"){setNotice("Connection submitted. Twin is verifying your account; its status updates here automatically.");await latest.current();}
      else if(result.phase==="ready")setNotice(`Review @${result.handle||"your account"} in the Twin Connect tab, then confirm the connection.`);
      else if(result.phase==="retry")setNotice("The submission could not be confirmed. Check connection status here before retrying in the Twin Connect tab.");
      else if(result.phase==="refused"){setNotice("Connection refused. Refresh its status, then start again.");await latest.current();}
      else if(result.phase==="idle")setNotice("This connection attempt ended. You can start again.");
    }finally{running=false;}},2500); return()=>window.clearInterval(timer);
  },[phase,disabled]);
  useEffect(()=>{
    if(!autoStart||autoStarted.current||!available||supported!==true||disabled||!profileId||working||phase!=="idle")return;
    autoStarted.current=true;void start();
  },[autoStart,available,supported,disabled,profileId,working,phase]);
  async function start(){if(disabled||working||!profileId)return;setWorking(true);setNotice("");const result=await connector("start",{profileId});if(active.current){setWorking(false);if(result.ok){setPhase(result.phase||"waiting");setNotice("Sign in on the OnlyFans tab. Twin Connect will then ask you to confirm the account.");}else setNotice(result.error||"Connection setup could not start. Refresh and try again.");}}
  async function cancel(){await connector("cancel");if(active.current){setPhase("idle");setNotice("Connection attempt cancelled.");}}
  const waiting=["waiting","ready","retry","submitting"].includes(phase);
  return <section className="space-y-4 border-t border-line pt-5" data-browser-connect>
    <p className="text-sm text-muted">Sign in on the OnlyFans tab, confirm the account, then return to your space.</p>
    {supported===null?<p role="status" className="text-sm text-muted">Preparing your connection…</p>:supported===false?<div role="status" className="space-y-2 rounded-xl border border-line bg-panel p-4"><p className="text-sm font-semibold">Continue on a computer</p><p className="text-sm text-muted">This version uses Twin Connect for desktop Chrome or Edge. Open this page on your computer to connect. You can use your account on your phone afterwards.</p></div>:available?<div className="space-y-3"><div className="flex flex-wrap gap-3"><button className={`${button} bg-accent text-white`} disabled={disabled||working||waiting} onClick={()=>void start()}>{working?"Opening OnlyFans…":waiting?"Connection in progress":"Open OnlyFans"}<ArrowRight size={16}/></button>{waiting?<button className={button} disabled={disabled||working} onClick={()=>void cancel()}>Cancel connection</button>:null}</div></div>:<div className="space-y-3 rounded-xl border border-line bg-panel p-4"><p className="text-sm font-semibold">Desktop connection setup</p><p className="text-sm text-muted">This version needs Twin Connect installed once on your computer.</p><details><summary className="cursor-pointer text-sm font-semibold">Set up Twin Connect</summary><div className="mt-3 space-y-3"><a href="/creator-auth/platforms/onlyfans/connector" download className={button}><Download size={16}/>Download Twin Connect</a><ol className="list-decimal space-y-2 pl-5 text-sm text-muted"><li>Download and extract the ZIP into a folder you will keep.</li><li>In Chrome, open <code>chrome://extensions</code>. In Edge, open <code>edge://extensions</code>.</li><li>Turn on Developer mode, choose Load unpacked, and select the extracted folder.</li><li>Refresh this Twin page, then choose Connect OnlyFans.</li></ol><button className={button} disabled={disabled||working} onClick={async()=>{setWorking(true);const r=await connector("ping");if(active.current){setAvailable(r.ok&&r.version==="1.0.0");setNotice(r.ok?"Twin Connect is ready.":"Refresh this page after installing Twin Connect.");setWorking(false);}}}><RefreshCw size={16}/>Check installation</button></div></details></div>}
    {notice?<p role="status" className="text-sm">{notice}</p>:null}
    <p className="text-xs text-muted">Your password stays on OnlyFans. Connecting submits your session for verification. Your agency manages outgoing-message activation separately.</p>
  </section>;
}
