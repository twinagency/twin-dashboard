"use client";
import {useEffect,useRef,useState} from "react";
type Coverage={configured:boolean;revision?:number;state?:string;ownership?:string;fans?:{known:number;complete:number;partial:number;unknown:number};gaps?:{openPages:number;openRows:number;exhausted:number}};
type Command={action:"configure";expectedRevision:number;requestId:string;reason:string;spec:Record<string,unknown>};
export default function HistoryPreparation({accountId,readOnly=false}:{accountId:string;readOnly?:boolean}){
 const root="/api/onlyfans-configuration/accounts/"+encodeURIComponent(accountId);
 const [coverage,setCoverage]=useState<Coverage|null>(null),[spec,setSpec]=useState<Record<string,unknown>|null>(null);
 const [reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[pending,setPending]=useState<Command|null>(null),[notice,setNotice]=useState("");
 const active=useRef(false),lock=useRef(false);
 async function read(){try{const response=await fetch(root+"/history-coverage",{cache:"no-store",redirect:"error"}),body=await response.json();if(active.current)setCoverage(response.ok&&body.ok?body.coverage:null);}catch{if(active.current)setCoverage(null);}}
 useEffect(()=>{active.current=true;void read();return()=>{active.current=false;};},[root]);
 async function send(command:Command){
  if(readOnly||lock.current)return;lock.current=true;setBusy(true);
  try{const response=await fetch(root+"/history-import",{method:"POST",redirect:"error",headers:{"Content-Type":"application/json"},body:JSON.stringify(command)}),body=await response.json();
   if(!active.current)return;
   if(response.ok&&body.ok){setPending(null);setReviewed(false);setNotice("History limits saved. The existing preparation worker performs resumable reads.");await read();}
   else if(body.outcome==="unconfirmed"){setPending(command);setNotice(body.error);}
   else{setPending(null);setNotice(body.error??"History import refused.");await read();}
  }catch{if(active.current){setPending(command);setNotice("Outcome unconfirmed. Retry this same request.");}}
  finally{lock.current=false;if(active.current)setBusy(false);}
 }
 return <details className="rounded-xl border border-line p-4" data-history-preparation><summary className="cursor-pointer font-semibold">Conversation and purchase history</summary>
  <p className="mt-2 text-sm">Older purchases remain relevant even when their media is outside the selected 1,000 assets. Missing history does not establish non-ownership.</p>
  <p className="mt-2 text-sm">{coverage?.configured?"History: "+coverage.state+". Ownership coverage: "+coverage.ownership+".":coverage?"History import is not configured.":"Coverage unavailable."}</p>
  {coverage?.fans?<p className="text-sm">{coverage.fans.complete} complete, {coverage.fans.partial} partial and {coverage.fans.unknown} unknown out of {coverage.fans.known} known fans.</p>:null}
  {coverage?.gaps?<p className="text-sm">Open gaps: {coverage.gaps.openPages} pages, {coverage.gaps.openRows} rows; {coverage.gaps.exhausted} exhausted retries. Uncertain evidence remains held for review.</p>:null}
  <button type="button" disabled={busy} onClick={()=>void read()}>Refresh history coverage</button>
  {!readOnly?<fieldset disabled={busy||!!pending||!coverage} className="mt-3 space-y-2">
   <label className="block text-sm">Reviewed history import limits<input type="file" aria-label="Reviewed history import limits" accept=".json,application/json" onChange={async event=>{
    setReviewed(false);setSpec(null);const file=event.target.files?.[0];if(!file)return;
    try{if(file.size>24000)throw Error();const v=JSON.parse(await file.text());if(!v||v.contract_version!=="history-import.v1"||!v.sources)throw Error();setSpec(v);}catch{setNotice("Choose a reviewed history import JSON file, up to 24 KB.");}
   }}/></label>
   {spec?<><details><summary>Review exact import limits</summary><pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify(spec,null,2)}</pre></details>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I reviewed the history boundary, provider limits and webhook evidence.</label></>:null}
   <button type="button" disabled={!reviewed||!spec} onClick={()=>spec&&coverage&&void send({action:"configure",expectedRevision:coverage.revision??0,requestId:crypto.randomUUID(),reason:"Agency reviewed history import boundaries and provider limits",spec})}>Save reviewed history limits</button>
  </fieldset>:null}
  {pending?<button type="button" disabled={busy} onClick={()=>void send(pending)}>Retry same history request</button>:null}
  {notice?<p role="status" className="text-sm">{notice}</p>:null}
 </details>;
}
