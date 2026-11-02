import assert from "node:assert/strict";
import { validManualMedia, manualPriceCents, canonicalManualMedia } from "../lib/onlyfans/manual-media.ts";
import { commandPayloadProblem, payloadDigest } from "../lib/onlyfans-preview/actions.ts";
import { draftKey, readDraft, writeDraft, clearSubmittedDraft, clearDrafts } from "../lib/onlyfans/inbox-drafts.ts";
let n=0;
const check=(x)=>{assert.ok(x);n++;};
const good={mediaIds:["11","13"],previewIds:["11"],priceCents:1234};
check(validManualMedia(good));
check(validManualMedia({...good,previewIds:[],priceCents:0}));
for(const bad of [{...good,priceCents:299},{...good,priceCents:20001},{...good,priceCents:NaN},
{...good,mediaIds:["11","11"]},{...good,mediaIds:[11]},{...good,previewIds:["11","13"]},
{...good,previewIds:["99"]},{...good,priceCents:0},{...good,url:"https://bad.invalid"},
{...good,mediaIds:["9223372036854775808"]},{...good,mediaIds:[]}])check(!validManualMedia(bad));
for(const [v,c]of [["0",0],["0.00",0],["3.00",300],["12.34",1234],["200",20000]]){assert.equal(manualPriceCents(v),c);n++;}
for(const v of ["", "-1","2.99","200.01","1e2","3.001","NaN","00.30","$5","5,00"]){assert.equal(manualPriceCents(v),null);n++;}
check(canonicalManualMedia(good)!==canonicalManualMedia({...good,priceCents:1300}));

const payload={kind:"manual_message",body:"",media:good};
assert.equal(commandPayloadProblem("send_manual_message",payload),null);n++;
check(payloadDigest(payload)!==payloadDigest({...payload,media:{...good,priceCents:1500}}));
check(commandPayloadProblem("send_manual_message",{kind:"manual_message",body:""})!==null);
clearDrafts();
const a=draftKey("operator-a","creator-a","fan-a"),b=draftKey("operator-a","creator-a","fan-b"),c=draftKey("operator-b","creator-a","fan-a");
const selectedMedia=[{mediaId:"11",kind:"photo",ready:true}];
const frozen=writeDraft(a,{body:"caption",selectedMedia,mediaPaid:true,mediaPrice:"12.34",previewIds:[]});
assert.deepEqual(readDraft(a).selectedMedia,selectedMedia);n++;
assert.equal(readDraft(b).selectedMedia.length,0);n++;
assert.equal(readDraft(c).selectedMedia.length,0);n++;
writeDraft(a,{mediaPrice:"15.00"});
assert.equal(clearSubmittedDraft(a,frozen),false);n++;
assert.equal(readDraft(a).mediaPrice,"15.00");n++;
assert.equal(clearSubmittedDraft(a,readDraft(a)),true);n++;
assert.equal(readDraft(a).selectedMedia.length,0);n++;
console.log(JSON.stringify({checks:n,passed:true}));


// Exercise the live browser adapter too: the composer accepted media-only drafts
// while this layer incorrectly refused them before making a network request.
const { createFetchOnlyFansTransport } = await import('../lib/onlyfans-preview/server-data-source.ts');
const sent=[];
const transport=createFetchOnlyFansTransport(async(url,init)=>{
 const request=JSON.parse(init.body);sent.push({url,request});
 return new Response(JSON.stringify({schemaVersion:'of-controls.v1',ok:true,applied:true,
  accountId:'acc-a',conversationId:'conv-a',action:'manual_message',recordedRevision:7,
  commandKey:'a'.repeat(64),intentId:'12345678-1234-1234-1234-123456789abc',outcome:'queued'}),{status:200});
});
const command={command:'send_manual_message',accountId:'acc-a',conversationId:'conv-a',expectedRevision:7,
 idempotencyKey:'12345678-1234-1234-1234-123456789abc',payload:{kind:'manual_message',body:''}};
for(const media of [{mediaIds:['11'],previewIds:[],priceCents:0},good]){
 for(const caption of ['', '  ', 'My own caption']){
  const result=await transport.submitControl({...command,payload:{...command.payload,body:caption,media}});
  assert.equal(result.accepted,true);assert.equal(sent.at(-1).request.body,caption);
  assert.deepEqual(sent.at(-1).request.media,media);
  assert.deepEqual(Object.keys(sent.at(-1).request).sort(),['action','body','expectedRevision','media','requestKey']);
 }
}
const sentBefore=sent.length;
for(const payload of [command.payload,{...command.payload,body:'  '},
 {...command.payload,media:{...good,mediaIds:[]}},
 {...command.payload,media:{...good,priceCents:299}},
 {...command.payload,media:{...good,description:'Internal AI description must never be sent'}},
 {...command.payload,body:'x'.repeat(4001),media:good},
 {...command.payload,media:good,catalogItemId:1}]){
 assert.equal((await transport.submitControl({...command,payload})).accepted,false);
}
assert.equal(sent.length,sentBefore,'Invalid or empty messages never reach the server');
assert.equal((await transport.submitControl({...command,payload:{kind:'manual_message',body:'Plain reply'}})).accepted,true);
console.log('PASS live adapter: free/paid media-only sends, exact optional captions, invalid media and empty-message rejection');
