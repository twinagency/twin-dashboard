"use client";
import {useEffect,useRef,useState} from "react";
type Command={action:"activate"|"stop"|"autonomous"|"supervised";expectedRevision:number;commandKey:string;reason:string};
export default function PilotLifecycle({accountId}:{accountId:string}){
 const path="/api/onlyfans-controls/accounts/"+encodeURIComponent(accountId)+"/plan-c/scope";
 const [scope,setScope]=useState<{status:string;mode:string;revision:number;fanCount:number}|null>(null),[notice,setNotice]=useState("");
 const [reason,setReason]=useState(""),[reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[pending,setPending]=useState<Command|null>(null);
 const active=useRef(false),lock=useRef(false);
 async function read(){try{const response=await fetch(path,{cache:"no-store",redirect:"error"}),body=await response.json();if(active.current)setScope(response.ok&&body.ok?body.scope:null);}catch{if(active.current)setScope(null);}}
 useEffect(()=>{active.current=true;void read();return()=>{active.current=false;};},[path]);
 async function send(command:Command){
  if(lock.current)return;lock.current=true;setBusy(true);
  try{const response=await fetch(path,{method:"POST",redirect:"error",headers:{"Content-Type":"application/json"},body:JSON.stringify(command)}),body=await response.json();
   if(!active.current)return;
   if(response.ok&&body.ok){setPending(null);setReviewed(false);setNotice("Pilot action recorded.");await read();}
   else if(body.outcome==="unconfirmed"){setPending(command);setNotice(body.error);}
   else{setPending(null);setNotice(body.error??"Pilot action refused.");await read();}
  }catch{if(active.current){setPending(command);setNotice("Outcome unconfirmed. Retry this same request.");}}
  finally{lock.current=false;if(active.current)setBusy(false);}
 }
 function act(action:Command["action"]){if(scope)void send({action,expectedRevision:scope.revision,commandKey:Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,"0")).join(""),reason});}
 return <section className="mb-4 rounded-lg border border-line p-4" data-pilot-lifecycle>
  <h2 className="font-semibold">Pilot operation</h2>
  <p className="text-sm">{scope?scope.status+" · "+scope.mode+" · "+scope.fanCount+" explicitly listed fans · revision "+scope.revision:"Current scope unavailable."}</p>
  <button type="button" disabled={busy} onClick={()=>void read()}>Refresh pilot status</button>
  {scope?<fieldset disabled={busy||!!pending} className="mt-3 space-y-2">
   <label className="block text-sm">Reason<input aria-label="Pilot action reason" className="block w-full rounded border p-2" value={reason} onChange={e=>setReason(e.target.value)} maxLength={512}/></label>
   <label className="flex gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I reviewed this creator, audience, product terms, budgets and readiness.</label>
   <p className="text-xs">Stop the pilot before changing its authorization mode.</p>
   <div className="flex flex-wrap gap-3">
    <button type="button" disabled={!reason.trim()||!reviewed||scope.status==="active"} onClick={()=>act("activate")}>Activate reviewed scope</button>
    <button type="button" disabled={!reason.trim()||scope.status==="stopped"} onClick={()=>act("stop")}>Stop pilot</button>
    <button type="button" disabled={!reason.trim()||!reviewed||scope.mode==="autonomous"||scope.status==="active"} onClick={()=>act("autonomous")}>Use autonomous authorization</button>
    <button type="button" disabled={!reason.trim()||!reviewed||scope.mode==="supervised"||scope.status==="active"} onClick={()=>act("supervised")}>Require draft approval</button>
   </div>
  </fieldset>:null}
  {pending?<button type="button" disabled={busy} onClick={()=>void send(pending)}>Retry same pilot action</button>:null}
  {notice?<p role="status" className="mt-2 text-sm">{notice}</p>:null}
 </section>;
}
