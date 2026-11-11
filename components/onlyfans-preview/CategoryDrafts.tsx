"use client";
import {useEffect,useRef,useState} from "react";
import {inputCls} from "@/components/clone/fields";
import {parseContentPrice} from "@/lib/onlyfans/content";
import {parseCategoryPrice,parseCategoryReview,type CategoryPrice,type CategoryReview,type CategoryDraft} from "@/lib/onlyfans/commercial-categories";
const button="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-accent disabled:opacity-50";
type Pending={path:string;body:unknown;kind:"price"|"drafts"};
export default function CategoryDrafts({accountId,folderId,selectedIds,onCreated}:{accountId:string;folderId:string;selectedIds:string[];onCreated:()=>void}){
 const base="/api/onlyfans-content/accounts/"+encodeURIComponent(accountId)+"/vault";
 const [price,setPrice]=useState<CategoryPrice|null>(null),[input,setInput]=useState("");
 const [review,setReview]=useState<CategoryReview|null>(null),[descriptions,setDescriptions]=useState<Record<string,string>>({});
 const [classified,setClassified]=useState(false),[rights,setRights]=useState(false),[busy,setBusy]=useState(false);
 const [notice,setNotice]=useState(""),[retry,setRetry]=useState<Pending|null>(null);
 const active=useRef(true),lock=useRef(false);
 useEffect(()=>{active.current=true;void refreshPrice();return()=>{active.current=false;};},[accountId,folderId]);
 async function refreshPrice(){
  try{
   const response=await fetch(base+"/category-price/"+folderId,{cache:"no-store",credentials:"same-origin",redirect:"error"});
   const next=response.ok?parseCategoryPrice(await response.json(),accountId,folderId):null;
   if(!active.current)return;
   setPrice(next);if(next?.priceCents!==null&&next?.priceCents!==undefined)setInput((next.priceCents/100).toFixed(2));
   if(!next)setNotice("The category price could not be loaded. Refresh before making changes.");
  }catch{if(active.current)setNotice("The category price could not be loaded.");}
 }
 async function execute(command:Pending){
  if(lock.current)return;lock.current=true;setBusy(true);setNotice("");
  try{
   const response=await fetch(base+command.path,{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",redirect:"error",body:JSON.stringify(command.body)});
   const result=await response.json().catch(()=>null);if(!active.current)return;
   if(response.ok&&result?.ok===true){
    setRetry(null);setReview(null);setClassified(false);setRights(false);
    if(command.kind==="price"){await refreshPrice();setNotice("Agency category price saved. Review selected media to create disabled drafts.");}
    else{setNotice(String(result.items?.length??0)+" disabled drafts recorded. Review each product before enabling it.");onCreated();}
   }else if(result?.outcome==="unconfirmed"||response.status>=500&&response.status!==503){
    setRetry(command);setNotice("The outcome is unconfirmed. Refresh or retry this same request.");
   }else{
    setRetry(null);setReview(null);setClassified(false);setRights(false);
    setNotice("The request was refused. Refresh the category, price and media before trying again.");
   }
  }catch{if(active.current){setRetry(command);setNotice("The outcome is unconfirmed. Retry the same request to avoid duplicate changes.");}}
  finally{lock.current=false;if(active.current)setBusy(false);}
 }
 async function reviewSelected(){
  if(lock.current||!selectedIds.length)return;lock.current=true;setBusy(true);setNotice("");
  try{
   const response=await fetch(base+"/category-review/"+folderId+"?mediaIds="+encodeURIComponent(selectedIds.join(",")),{cache:"no-store",credentials:"same-origin",redirect:"error"});
   const next=response.ok?parseCategoryReview(await response.json(),accountId,selectedIds):null;
   if(!active.current)return;
   setReview(next);setClassified(false);setRights(false);
   if(next){setDescriptions(Object.fromEntries(next.assets.map(a=>[a.mediaId,a.description??""])));setNotice("Review the current descriptions and classification below. Correct unknown or unsupported details before approval.");}
   else setNotice("This category cannot be reviewed for selling yet. Resolve uncertain classification or unavailable media first.");
  }catch{if(active.current)setNotice("The current category review could not be loaded.");}
  finally{lock.current=false;if(active.current)setBusy(false);}
 }
 const cents=parseContentPrice(input),ready=!!review&&review.assets.length===selectedIds.length&&classified&&rights&&!!price?.priceCents&&cents===price.priceCents&&review.assets.every(a=>!!descriptions[a.mediaId]?.trim());
 function create(){
  if(!ready||!review||!price?.priceCents)return;
  const category:CategoryDraft={folderId:Number(folderId),priceCents:price.priceCents,categoryPriceRevision:price.revision,
   classificationConfirmed:true,rightsConfirmed:true,reviewedState:review.reviewedState,
   products:review.assets.map(a=>({label:(a.kind==="video"?"Video":"Photo")+" #"+a.mediaId,description:descriptions[a.mediaId].trim(),mediaIds:[a.mediaId],previewMediaIds:[]}))};
  void execute({kind:"drafts",path:"/category-drafts",body:{requestId:crypto.randomUUID(),category}});
 }
 return <details className="mt-4 rounded-xl border border-line p-4" data-of-category-drafts><summary className="cursor-pointer font-semibold">Agency category pricing &amp; draft singles</summary>
  <p className="mt-2 text-sm text-muted">Set this category’s single-asset price manually. Bundles need a separate approved total. Drafts stay disabled until product review.</p>
  <fieldset disabled={busy||!!retry} className="mt-3 space-y-3">
   <label className="block text-sm">Single photo or video price (USD)<input aria-label="Category single price" className={inputCls} inputMode="decimal" value={input} onChange={e=>setInput(e.target.value)}/></label>
   <button className={button} type="button" disabled={!price||cents===null||cents===price.priceCents} onClick={()=>price&&cents!==null&&void execute({kind:"price",path:"/category-price/"+folderId,body:{requestId:crypto.randomUUID(),priceCents:cents,expectedFingerprint:price.fingerprint}})}>Save agency price</button>
   <p className="text-xs text-muted">{price?.priceCents?"Saved price: $"+(price.priceCents/100).toFixed(2)+" per single asset.":"No agency price saved."}</p>
   <button className={button} type="button" disabled={!price?.priceCents||!selectedIds.length||selectedIds.length>25||cents!==price.priceCents} onClick={()=>void reviewSelected()}>Review {selectedIds.length} selected singles</button>
   {review?<div className="space-y-3">
    <p className="text-sm font-semibold">Current category: {review.categoryName}</p>
    {review.assets.map(a=><label className="block text-sm" key={a.mediaId}>{a.kind==="video"?"Video":"Photo"} #{a.mediaId}{a.durationSeconds!==null?" · "+a.durationSeconds+"s":""}{a.analysisNote?<span className="block text-xs text-muted">{a.analysisNote}</span>:null}{a.classificationUncertain?<span className="block text-xs text-muted">Classification needs agency review.</span>:null}<textarea aria-label={"Reviewed description "+a.mediaId} className={inputCls+" min-h-20 w-full"} maxLength={2000} value={descriptions[a.mediaId]??""} onChange={e=>setDescriptions(old=>({...old,[a.mediaId]:e.target.value}))}/></label>)}
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={classified} onChange={e=>setClassified(e.target.checked)}/>I reviewed this classification and the factual descriptions, including any unknown details.</label>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={rights} onChange={e=>setRights(e.target.checked)}/>The creator has authorised selling these selected assets.</label>
    <button className={button} type="button" disabled={!ready} onClick={create}>Create disabled single drafts</button>
   </div>:null}
  </fieldset>
  {notice?<p role="status" className="mt-3 text-sm">{notice}</p>:null}
  {retry?<button type="button" className={button} disabled={busy} onClick={()=>void execute(retry)}>Retry same request</button>:null}
 </details>;
}
