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
