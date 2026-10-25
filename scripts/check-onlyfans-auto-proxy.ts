import assert from "node:assert/strict";
import {createConnectionBackend} from "../lib/onlyfans-connections/backend";
import {parseActivationReadiness} from "../lib/onlyfans/activation";
import {validConnectionRequest} from "../lib/onlyfans-connections/contract";
async function main(){
  const calls:Record<string,unknown>[]=[];
  const fakeFetch:typeof fetch=async (_url,init)=>{
    const body=JSON.parse(String(init?.body));calls.push(body);
    return Response.json({ok:true,context:{accountId:body.accountId,ownerId:body.accountId?123:null,proxyUrl:"http://synthetic:secret@proxy.invalid:80",fingerprint:"a".repeat(64)}});
  };
  const backend=createConnectionBackend({baseUrl:"https://backend.invalid",token:"synthetic-private-token",fetchImpl:fakeFetch});
  assert((await backend.captureContext("creator-a",null,true)).ok);
  assert.deepEqual(calls[0],{creatorId:"creator-a",accountId:null,assignProxy:true});
  assert((await backend.captureContext("creator-a","of-123")).ok);
  assert.deepEqual(calls[1],{creatorId:"creator-a",accountId:"of-123"});
  const unavailable=createConnectionBackend({baseUrl:"https://backend.invalid",token:"synthetic-token",fetchImpl:async()=>Response.json({code:"proxy_unavailable",error:"private credentials must never pass through"},{status:503})});
  const result=await unavailable.captureContext("creator-a",null,true);
  assert(!result.ok);if(!result.ok)assert.equal(result.error,"No fixed proxy is available for this creator. Ask your administrator to add proxy capacity.");
  const activate=(throttleSeconds:unknown,limitUnits:unknown=100000)=>({action:"activate",expectedRevision:1,payload:{limitUnits,throttleSeconds,mediaEnabled:false}});
  for(const delay of [0.1,0.25,1,20,86400])assert(validConnectionRequest(activate(delay)));
  for(const delay of [0,-1,0.01,NaN,Infinity,true,"0.1",86401])assert(!validConnectionRequest(activate(delay)));
  assert(!validConnectionRequest(activate(1,1000001)));
  assert(parseActivationReadiness({deploymentAllowed:true,allFansAllowed:true,allowedFans:[],modelCredentialReady:false,proxySaved:true,selection:null,selectionValid:false,automatedConversations:0,pausedConversations:0,noContactConversations:0,takeoverConversations:0,nextSendAt:null,throttleSeconds:0.25}));
  console.log("automatic proxy transport and delivery-limit checks passed");
}
main().catch(error=>{console.error(error);process.exitCode=1});
