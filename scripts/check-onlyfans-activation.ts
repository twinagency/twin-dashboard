import assert from "node:assert/strict";
import { fanSelectionFromText, parseActivationReadiness, validFanSelection } from "../lib/onlyfans/activation";
import { validConfigurationRequest } from "../lib/onlyfans/configuration";

const base = {deploymentAllowed:true, allFansAllowed:false, allowedFans:[123,456], selection:null, selectionValid:true,
  modelCredentialReady:true,proxySaved:true,automatedConversations:1,pausedConversations:5,noContactConversations:1,
  takeoverConversations:1,nextSendAt:null,throttleSeconds:20};
assert(parseActivationReadiness(base));
for (const change of [{apiKey:"private"},{deploymentAllowed:false},{throttleSeconds:0},{throttleSeconds:1.5},
  {nextSendAt:"invalid"},{selection:{mode:"all",fans:[123]}},{pausedConversations:-1},{allowedFans:[true]},
  {modelCredentialReady:"true"},{selectionValid:undefined}]) assert.equal(parseActivationReadiness({...base,...change}),null);
assert.deepEqual(fanSelectionFromText("selected","456, 123 456"),{mode:"selected",fans:[123,456]});
assert.deepEqual(fanSelectionFromText("all",""),{mode:"all",fans:[]});
for (const text of ["","123x","0","-1","1.5","1e3","9007199254740992"]) assert.equal(fanSelectionFromText("selected",text),null);
assert(!validFanSelection({mode:"selected",fans:[]}));
assert(!validFanSelection({mode:"single",fans:[123,456]}));
assert(!validFanSelection({mode:"all",fans:[],activate:true}));
assert(validConfigurationRequest({expectedRevision:1,expectedFingerprint:"a".repeat(64),patch:{fasttScope:{mode:"selected",fans:[123]}}}));
assert(!validConfigurationRequest({expectedRevision:1,expectedFingerprint:"a".repeat(64),patch:{fasttScope:{mode:"selected",fans:[true]}}}));
console.log("PASS activation: strict scope/readiness shapes, safe fan IDs, partial patches and legacy configuration compatibility");
