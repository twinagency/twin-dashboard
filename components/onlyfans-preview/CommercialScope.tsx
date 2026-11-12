"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {validCommercialCommand,type CommercialCommand} from "@/lib/onlyfans/commercial-scope";
type State={state:string;status?:string;revision:number;eligible?:boolean};
export default function CommercialScope({accountId,readOnly=false}:{accountId:string;readOnly?:boolean}){
 const path="/api/onlyfans-configuration/accounts/"+encodeURIComponent(accountId)+"/commercial";
 const [state,setState]=useState<State|null>(null),[config,setConfig]=useState<Record<string,unknown>|null>(null),[reviewed,setReviewed]=useState(false);
 const [pending,setPending]=useState<CommercialCommand|null>(null),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 const active=useRef(false),lock=useRef(false);
 const read=useCallback(async()=>{
  try{const response=await fetch(path,{cache:"no-store",redirect:"error"}),body=await response.json();
   if(active.current)setState(response.ok&&body.ok&&Number.isInteger(body.commercial?.revision)?body.commercial:null);
  }catch{if(active.current)setState(null);}
 },[path]);
 useEffect(()=>{active.current=true;void read();return()=>{active.current=false;};},[read]);
 async function send(command:CommercialCommand){
  if(lock.current||readOnly)return;lock.current=true;setBusy(true);
  try{const response=await fetch(path,{method:"POST",redirect:"error",headers:{"Content-Type":"application/json"},body:JSON.stringify(command)}),body=await response.json();
   if(!active.current)return;
   if(response.ok&&body.ok){setPending(null);setReviewed(false);setNotice(command.action==="stop"?"Commercial replies stopped.":"Reviewed configuration promoted. Replies remain stopped until operator activation.");await read();}
   else if(response.status>=500&&response.status!==503){setPending(command);setNotice("Outcome unconfirmed. Retry this same request.");}
   else{setPending(null);setNotice(body.error??"Refused. Refresh and review the current configuration.");await read();}
  }catch{if(active.current){setPending(command);setNotice("Outcome unconfirmed. Retry this same request.");}}
  finally{lock.current=false;if(active.current)setBusy(false);}
 }
 const fans=Array.isArray(config?.fans)?config.fans:[],profile=config?.creator_profile as {name?:string}|undefined;
 return <details className="rounded-xl border border-line p-4" data-commercial-scope><summary className="cursor-pointer font-semibold">Commercial review and promotion</summary>
  <p className="mt-2 text-sm">Review the saved products, approved prices, creator profile and explicit audience before promotion. The current contract permits at most 100 listed fans per creator.</p>
  <p className="mt-2 text-sm">{state?state.state+" · "+(state.status??"not promoted")+" · revision "+state.revision:"Status unavailable."}</p>
  <button type="button" disabled={busy} onClick={()=>void read()}>Refresh commercial status</button>
  {!readOnly&&state?.state==="preparation"?<fieldset disabled={busy||!!pending} className="mt-3 space-y-3">
   <label className="block text-sm">Reviewed release configuration<input aria-label="Reviewed release configuration" type="file" accept=".json,application/json" onChange={async event=>{
    setReviewed(false);setConfig(null);const file=event.target.files?.[0];if(!file)return;
    try{if(file.size>16000)throw Error();const value=JSON.parse(await file.text());
     if(!validCommercialCommand({action:"promote",expectedRevision:state.revision,requestId:crypto.randomUUID(),reason:"Reviewed commercial configuration",config:value}))throw Error();
     setConfig(value);setNotice("");
    }catch{setNotice("Choose a reviewed commercial configuration JSON file, up to 16 KB.");}
   }}/></label>
   {config?<div className="text-sm"><p>Creator: {profile?.name??"not supplied"}. Audience: {fans.length} explicitly listed fans.</p>
    <details><summary>Review exact configuration</summary><pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify(config,null,2)}</pre></details>
    <label className="flex gap-2"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I reviewed this creator, audience, approved products and limits.</label></div>:null}
   <button type="button" disabled={!config||!reviewed||fans.length<1||fans.length>100} onClick={()=>config&&void send({action:"promote",expectedRevision:state.revision,requestId:crypto.randomUUID(),reason:"Agency reviewed the creator, audience, products and limits",config})}>Promote reviewed configuration</button>
  </fieldset>:null}
  {!readOnly&&state?.state==="commercial"?<button type="button" className="mt-3" disabled={busy||!!pending||state.status==="stopped"} onClick={()=>void send({action:"stop",expectedRevision:state.revision,requestId:crypto.randomUUID(),reason:"Agency stopped commercial replies"})}>Stop commercial replies</button>:null}
  {pending?<button type="button" disabled={busy} onClick={()=>void send(pending)}>Retry same commercial request</button>:null}
  {notice?<p role="status" className="mt-2 text-sm">{notice}</p>:null}
 </details>;
}
