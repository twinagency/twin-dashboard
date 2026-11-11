"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {parsePreparationState,validPreparationCommand,type PreparationCommand,type PreparationState} from "@/lib/onlyfans/preparation";
const inputClass="block w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm disabled:opacity-50";
const buttonClass="rounded-lg border border-line px-3 py-2 text-sm font-semibold disabled:opacity-50";
export default function Preparation({accountId,readOnly=false}:{accountId:string;readOnly?:boolean}){
 const [state,setState]=useState<PreparationState|null>(null),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 const [provider,setProvider]=useState(""),[creator,setCreator]=useState(""),[requests,setRequests]=useState(""),[credits,setCredits]=useState(""),[per,setPer]=useState(""),[reference,setReference]=useState("");
 const [pending,setPending]=useState<PreparationCommand|null>(null);
 const active=useRef(false),inFlight=useRef(false),generation=useRef(0);
 const path="/api/onlyfans-configuration/accounts/"+encodeURIComponent(accountId)+"/preparation";
 const read=useCallback(async(fill=false)=>{
  const n=++generation.current;
  try{
   const r=await fetch(path,{credentials:"same-origin",cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)});
   const body=await r.json();const next=r.ok&&body.ok===true?parsePreparationState(body.preparation):null;
   if(!active.current||n!==generation.current)return;
   if(!next){setState(null);setNotice("Preparation status is unavailable.");return;}
   setState(next);setNotice("");
   if(fill&&next.configured){const c=next.config;setProvider(c.provider_account);setCreator(c.creator_id);
    setRequests(String(c.limits.provider_requests));setCredits(String(c.limits.provider_credit_budget));setPer(String(c.limits.provider_credits_per_request));setReference(c.qualification.reference);}
  }catch{if(active.current&&n===generation.current){setState(null);setNotice("Preparation status is unavailable.");}}
 },[path]);
 useEffect(()=>{active.current=true;void read(true);return()=>{active.current=false;generation.current++;};},[read]);
 useEffect(()=>{
  if(!state?.configured||state.status!=="configured"||pending)return;
  const timer=setInterval(()=>{if(!inFlight.current)void read();},10000);return()=>clearInterval(timer);
 },[state,pending,read]);
 async function send(command:PreparationCommand){
  if(inFlight.current||readOnly)return;
  inFlight.current=true;setBusy(true);setNotice("");
  try{
   const response=await fetch(path,{method:"POST",credentials:"same-origin",cache:"no-store",redirect:"error",
    headers:{"Content-Type":"application/json"},body:JSON.stringify(command),signal:AbortSignal.timeout(15000)});
   const body=await response.json();if(!active.current)return;
   if(response.ok&&body.ok===true&&parsePreparationState(body.preparation)){
    setPending(null);setNotice("Preparation saved. Provider reads require the approved preparation worker.");await read(true);
   }else if(body.outcome==="unconfirmed"||![400,401,403,404,409,413,503].includes(response.status)){
    setPending(command);setNotice("Outcome unconfirmed. Retry this same request before changing it.");
   }else{setPending(null);setNotice(body.error??"Preparation was refused.");await read();}
  }catch{if(active.current){setPending(command);setNotice("Outcome unconfirmed. Retry this same request before changing it.");}}
  finally{inFlight.current=false;if(active.current)setBusy(false);}
 }
 const held=readOnly||busy||!!pending,configured=state?.configured===true,config=configured?state.config:null;
 const unavailable=!state||(!state.configured&&!state.canPrepare);
 return <details className="rounded-xl border border-line p-4" data-commercial-preparation>
  <summary className="cursor-pointer font-semibold">Creator preparation · FansAPI</summary>
  <p className="mt-2 text-sm">Connect and prepare the latest 1,000 unique photos and videos combined. This preparation keeps automatic replies and sales disabled.</p>
  <p className="mt-2 text-sm">Vault metadata only. Conversation history, ownership coverage, AI descriptions and sales approval remain pending.</p>
  {configured?<div className="my-3 text-sm" data-preparation-status>
   <p>Preparation {state.status}. {state.connected?"Provider identity verified.":"Provider connection awaiting verification."}</p>
   <p>{state.vault?("Vault "+state.vault.status+" · "+state.vault.selected+" selected · "+state.vault.pagesRead+" pages recorded"):"Vault sync awaiting preparation worker."}</p>
   {state.vault?.error?<p>Sync held: {state.vault.error.replaceAll("_"," ")}. Review the status and budget before resuming.</p>:null}
   <p>{state.providerRequestsUsed} / {config!.limits.provider_requests} requests reserved · {state.providerCreditsReserved} / {config!.limits.provider_credit_budget} credits reserved.</p>
   <p>Reserved credits are a spending ceiling estimate, not a provider charge reconciliation.</p>
  </div>:null}
  {unavailable?<p className="my-3 text-sm">Preparation is unavailable for this account. It requires a disabled account and the explicitly selected FansAPI connector.</p>:null}
  <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={event=>{
   event.preventDefault();if(held||unavailable)return;
   const command:PreparationCommand={action:"configure",expectedRevision:configured?state.revision:0,requestId:crypto.randomUUID(),
    reason:"Agency explicitly configured read-only FansAPI creator preparation",
    config:{contract_version:"preparation.v1",provider_account:provider,creator_id:creator,
     qualification:{mode:config?.qualification.mode??"production",reference},
     limits:{provider_requests:Number(requests),provider_credit_budget:Number(credits),provider_credits_per_request:Number(per)}}};
   if(!validPreparationCommand(command)){setNotice("Enter the exact provider identity, approval reference and positive whole-number budgets.");return;}
   void send(command);
  }}>
   <label className="text-sm">FansAPI account ID<input className={inputClass} value={provider} onChange={e=>setProvider(e.target.value)} placeholder="acct_…" required disabled={held||unavailable||configured}/></label>
   <label className="text-sm">OnlyFans creator ID<input className={inputClass} value={creator} onChange={e=>setCreator(e.target.value)} inputMode="numeric" required disabled={held||unavailable||configured}/></label>
   <label className="text-sm">Maximum provider requests<input className={inputClass} value={requests} onChange={e=>setRequests(e.target.value)} type="number" min="1" max="10000" step="1" required disabled={held||unavailable}/></label>
   <label className="text-sm">Maximum provider credits<input className={inputClass} value={credits} onChange={e=>setCredits(e.target.value)} type="number" min="1" max="1000000000" step="1" required disabled={held||unavailable}/></label>
   <label className="text-sm">Approved credits reserved per request<input className={inputClass} value={per} onChange={e=>setPer(e.target.value)} type="number" min="1" step="1" required disabled={held||unavailable}/></label>
   <label className="text-sm">Budget approval reference<input className={inputClass} value={reference} onChange={e=>setReference(e.target.value)} maxLength={200} required disabled={held||unavailable}/></label>
   <div className="flex flex-wrap gap-2 sm:col-span-2">
    <button className={buttonClass} type="submit" disabled={held||unavailable}>{configured&&state.status==="stopped"?"Resume preparation":configured?"Save preparation limits":"Save read-only preparation"}</button>
    <button className={buttonClass} type="button" disabled={busy} onClick={()=>void read(!pending)}>Refresh status</button>
    {configured&&state.status==="configured"?<button className={buttonClass} type="button" disabled={held} onClick={()=>void send({action:"stop",expectedRevision:state.revision,requestId:crypto.randomUUID(),reason:"Agency stopped read-only creator preparation"})}>Stop preparation</button>:null}
    {pending?<button className={buttonClass} type="button" disabled={busy} onClick={()=>void send(pending)}>Retry same request</button>:null}
   </div>
  </form>
  {notice?<p role="status" className="mt-2 text-sm">{notice}</p>:null}
 </details>;
}
