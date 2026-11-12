"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {parseContentPrice} from "@/lib/onlyfans/content";
type Terms={revision:number;status:string;standardCents?:number;discountCents?:number|null;contentFingerprint:string;label:string;description:string;mediaIds:number[];previewIds:number[];savedPriceCents:number};
type Command={action:"approve"|"withdraw";expectedRevision:number;requestId:string;standardCents?:number;discountCents?:number|null;expectedFingerprint?:string};
const button="rounded-lg border border-line px-3 py-2 text-sm font-semibold disabled:opacity-50";
export default function CommercialTerms({accountId,itemId}:{accountId:string;itemId:string}){
 const path="/api/onlyfans-configuration/accounts/"+encodeURIComponent(accountId)+"/catalogue-terms/"+encodeURIComponent(itemId);
 const [terms,setTerms]=useState<Terms|null>(null),[price,setPrice]=useState(""),[discount,setDiscount]=useState(""),[reviewed,setReviewed]=useState(false);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[pending,setPending]=useState<Command|null>(null);
 const active=useRef(true),lock=useRef(false);
 const read=useCallback(async()=>{
  try{const response=await fetch(path,{credentials:"same-origin",cache:"no-store",redirect:"error"});const body=await response.json();
   if(!active.current)return;
   if(!response.ok||body?.ok!==true||body.terms?.itemId!==itemId||!Number.isInteger(body.terms.revision)){setTerms(null);return;}
   const t=body.terms as Terms;setTerms(t);setPrice((t.savedPriceCents/100).toFixed(2));setDiscount(t.discountCents?(t.discountCents/100).toFixed(2):"");setReviewed(false);
  }catch{if(active.current)setNotice("Terms could not be read.");}
 },[path,itemId]);
 useEffect(()=>{active.current=true;void read();return()=>{active.current=false;};},[read]);
 async function send(command:Command){
  if(lock.current)return;lock.current=true;setBusy(true);setNotice("");
  try{
   const response=await fetch(path,{method:"POST",credentials:"same-origin",redirect:"error",headers:{"Content-Type":"application/json"},body:JSON.stringify(command)});
   const body=await response.json();if(!active.current)return;
   if(response.ok&&body?.ok===true){setPending(null);await read();setNotice(command.action==="approve"?"Terms approved. Product enabling and creator activation are separate controls.":"Terms withdrawn. Future offers are blocked.");}
   else if(body?.outcome==="unconfirmed"||response.status>=500&&response.status!==503){setPending(command);setNotice("Outcome unconfirmed. Retry this same request.");}
   else{setPending(null);await read();setNotice("Refused. Review the refreshed product, price and terms.");}
  }catch{if(active.current){setPending(command);setNotice("Outcome unconfirmed. Retry this same request.");}}
  finally{lock.current=false;if(active.current)setBusy(false);}
 }
 const cents=parseContentPrice(price),dc=discount.trim()?parseContentPrice(discount):null;
 const valid=cents!==null&&cents>=300&&(discount.trim()===""||dc!==null&&dc>=300&&dc<cents);
 if(!terms)return <p className="mt-3 text-sm">Commercial terms unavailable. <button type="button" className={button} onClick={()=>void read()}>Refresh terms</button></p>;
 return <section className="mt-4 rounded-lg border border-line p-3" data-commercial-terms>
  <h4 className="font-semibold">Agency commercial terms</h4>
  <p className="text-sm">{terms.status} · revision {terms.revision} · {terms.mediaIds?.length??0} files, including {terms.previewIds?.length??0} free previews.</p>
  <p className="mt-2 text-sm">{terms.label}: {terms.description}</p>
  <fieldset disabled={busy||!!pending} className="mt-3 space-y-3">
   <label className="block text-sm">Approved price or bundle total (USD)<input aria-label="Approved product price" className="block rounded border bg-transparent p-2" inputMode="decimal" value={price} onChange={e=>setPrice(e.target.value)}/></label>
   <label className="block text-sm">Optional approved discount price (USD)<input aria-label="Approved discount price" className="block rounded border bg-transparent p-2" inputMode="decimal" value={discount} onChange={e=>setDiscount(e.target.value)}/></label>
   <p className="text-xs">Singles must match the saved agency category price. Bundles require the saved explicit total. Leave the discount empty to remove it.</p>
   <label className="flex gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I reviewed this saved product, its files, free previews and exact prices.</label>
   <button type="button" className={button} disabled={!reviewed||!valid} onClick={()=>void send({action:"approve",expectedRevision:terms.revision,requestId:crypto.randomUUID(),standardCents:cents!,discountCents:dc,expectedFingerprint:terms.contentFingerprint})}>Approve these terms</button>
   <button type="button" className={button} disabled={terms.status!=="approved"} onClick={()=>void send({action:"withdraw",expectedRevision:terms.revision,requestId:crypto.randomUUID()})}>Withdraw terms</button>
  </fieldset>
  {pending?<button type="button" className={button} disabled={busy} onClick={()=>void send(pending)}>Retry same request</button>:null}
  {notice?<p role="status" className="mt-2 text-sm">{notice}</p>:null}
 </section>;
}
