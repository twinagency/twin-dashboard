import assert from "node:assert/strict";
import { CONTENT_SCHEMA } from "../lib/onlyfans/content";
import { parseVaultResource,parseVaultEditAck,validVaultEdit,validVaultResource } from "../lib/onlyfans/vault-editing";
import { createVaultBackend } from "../lib/onlyfans/vault-backend";
async function main(){
 const account="acc-a",resource="assets/9007199254740993",hash="a".repeat(64),key="b".repeat(64);
 const metadata={mediaId:"9007199254740993",fingerprint:hash,description:"Approved coast",tags:["coast"]};
 const read={schemaVersion:CONTENT_SCHEMA,ok:true,accountId:account,asset:metadata};
 assert(parseVaultResource(read,account,resource));
 for(const v of [{...read,accountId:"acc-b"},{...read,extra:true},{...read,asset:{...metadata,mediaId:9007199254740993}},{...read,asset:{...metadata,tags:[true]}}])assert.equal(parseVaultResource(v,account,resource),null);
 for(const r of ["assets/-1","folders/2147483648","folders/1/extra","assets/1?other=2","../../secret"])assert(!validVaultResource(r));
 const command={requestId:"00000000-0000-4000-8000-000000000000",patch:{description:"Updated"},expectedFingerprint:hash};
 assert(validVaultEdit(resource,command));
 for(const changed of [{actor:"forged"},{patch:{priceCents:0}},{expectedFingerprint:"bad"},{patch:{tags:Array(13).fill("x")}}])assert(!validVaultEdit(resource,{...command,...changed}));
 const create={requestId:command.requestId,action:"create",name:"Coast",mediaIds:null,expectedFingerprint:null};
 assert(validVaultEdit("folders",create));assert(!validVaultEdit("folders/1",{...create}));
 assert(!validVaultEdit("folders/1",{...create,action:"add",name:null,expectedFingerprint:hash,mediaIds:["1","1"]}));
 const ack={schemaVersion:CONTENT_SCHEMA,ok:true,applied:true,accountId:account,commandKey:key,targetId:metadata.mediaId,fingerprint:"c".repeat(64)};
 assert(parseVaultEditAck(ack,account,resource,key));assert.equal(parseVaultEditAck({...ack,targetId:"2"},account,resource,key),null);
 const posted:string[]=[];
 const backend=createVaultBackend({baseUrl:"http://127.0.0.1:1",token:"synthetic-content",fetchImpl:async(url,init)=>{
  assert.equal(String(url),"http://127.0.0.1:1/onlyfans/content/v1/accounts/acc-a/vault/"+resource);
  assert.equal(init?.credentials,"omit");assert.equal(init?.redirect,"error");assert.equal(new Headers(init?.headers).get("cookie"),null);
  if(init?.method==="GET")return Response.json(read);
  posted.push(String(init?.body));if(posted.length===1)throw new Error("Lost acknowledgement");return Response.json(ack);
 }});
 assert((await backend.readResource(account,resource)).ok);
 const {requestId:_nonce,...patch}=command;const body={...patch,commandKey:key,actor:"op-session:"+hash};
 const lost=await backend.editResource(account,resource,body);assert(!lost.ok&&lost.outcome==="unconfirmed");
 assert((await backend.editResource(account,resource,body)).ok);assert.equal(posted[0],posted[1]);
 console.log("PASS vault edits: exact large asset IDs, scoped metadata, bounded folder actions, no browser actor injection, no cookie forwarding and unchanged retry identity");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
