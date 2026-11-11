import React from "react";
import {createRoot} from "react-dom/client";
import Preparation from "../../components/onlyfans-preview/Preparation";
declare global {interface Window {preparationCalls:string[];preparationBodies:unknown[];}}
window.preparationCalls=[];window.preparationBodies=[];
const states:Record<string,any>={};
let ambiguous=true;
window.fetch=async(input,options)=>{
 const url=String(input),account=url.split("/").at(-2)!;
 const initial={configured:false,canPrepare:true};states[account]??=initial;
 if(options?.method==="POST"){
  const body=JSON.parse(String(options.body));window.preparationCalls.push(account);window.preparationBodies.push(body);
  if(body.action==="configure"){
   if(states[account].configured&&states[account].requestId===body.requestId)return new Response(JSON.stringify({ok:true,preparation:states[account]}));
   states[account]={configured:true,revision:1,status:"configured",fingerprint:"a".repeat(64),config:body.config,
    providerRequestsUsed:0,providerCreditsReserved:0,automaticRepliesEnabled:false,salesEnabled:false,
    historyCoverage:"pending",ownershipCoverage:"pending",connected:false,vault:null,requestId:body.requestId};
   if(ambiguous){ambiguous=false;return new Response(JSON.stringify({ok:false,outcome:"unconfirmed",error:"fixture response loss"}),{status:502});}
  }else states[account]={...states[account],status:"stopped",revision:2};
 }
 return new Response(JSON.stringify({ok:true,preparation:states[account]}));
};
createRoot(document.getElementById("root")!).render(<main style={{maxWidth:1000,margin:"auto",padding:16}}>
 <Preparation accountId="synthetic-creator"/><hr/><Preparation accountId="read-only-creator" readOnly/>
</main>);
