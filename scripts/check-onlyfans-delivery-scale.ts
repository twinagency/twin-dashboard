import assert from "node:assert/strict";
import {validConnectionRequest} from "../lib/onlyfans-connections/contract";
import {parseActivationReadiness} from "../lib/onlyfans/activation";
  const activate=(throttleSeconds:unknown,limitUnits:unknown=100000)=>({action:"activate",expectedRevision:1,payload:{limitUnits,throttleSeconds,mediaEnabled:false}});
  for(const delay of [0.1,0.25,1,20,86400])assert(validConnectionRequest(activate(delay)));
  for(const delay of [0,-1,0.01,NaN,Infinity,true,"0.1",86401])assert(!validConnectionRequest(activate(delay)));
  assert(!validConnectionRequest(activate(1,1000001)));
  assert(parseActivationReadiness({deploymentAllowed:true,allFansAllowed:true,allowedFans:[],modelCredentialReady:false,proxySaved:true,selection:null,selectionValid:false,automatedConversations:0,pausedConversations:0,noContactConversations:0,takeoverConversations:0,nextSendAt:null,throttleSeconds:0.25}));

console.log("production delivery interval and allowance checks passed");
