import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";
import { creatorContentCompleted, isAnyCreatorContentKind } from "../lib/creator-content-requirements";
import { creatorUploadApiAllowed } from "../lib/creator-upload-api-policy";

const owner=randomUUID(), other=randomUUID(), id=randomUUID(), otherId=randomUUID();
const original={id,creator_account_id:owner,kind:"content_sfw_video",bucket:"onboarding-content",storage_path:`creators/${owner}/content_sfw_video/${id}`,original_name:"Synthetic test.mp4",mime_type:"video/mp4",size_bytes:1024,storage_transfer_status:"verified",created_at:new Date().toISOString()};
let identity:any, file:any, storageFailure=false, deletionFailure=false, reference=false, applicationStatus="draft", signed=0, stored=0, queries=0, viewAs=false;
let events:string[]=[];
function query(table:string) {
  queries++; let operation="read", filters:Record<string,unknown>={}, values:any, singleton=false;
  const chain:any={select:()=>chain,eq:(key:string,value:any)=>{filters[key]=value;return chain;},neq:()=>chain,in:()=>chain,order:()=>chain,range:()=>chain,limit:()=>chain,
    maybeSingle:()=>{singleton=true;return chain;},delete:()=>{operation="delete";return chain;},update:(value:any)=>{operation="update";values=value;return chain;},upsert:()=>{operation="upsert";return chain;},
    then:(yes:any,no:any)=>Promise.resolve().then(()=>{
      if(["creator_files","creator_applications","creator_clone_links","creator_onboarding_progress","creator_upload_receipts"].includes(table) && operation!=="upsert") {
        // Path-reference checking is deliberately global, only after ownership.
        if(!(table==="creator_files" && "storage_path" in filters)) assert.equal(filters.creator_account_id,owner,`${table} requires current creator scope`);
      }
      if(operation!=="read") {
        events.push(`${table}:${operation}`);
        if(table==="creator_files" && operation==="delete") { if(deletionFailure)return {error:{message:"lost database response"}};file=null; }
        if(table==="creator_files" && operation==="update") Object.assign(file,values);
        return {error:null};
      }
      if(table==="creator_applications")return {data:{status:applicationStatus},error:null};
      if(table==="creator_onboarding_progress")return {data:{content_completed:false,voice_completed:true},error:null};
      if(table==="creator_clone_links")return {data:[],error:null};
      if(table==="creator_files") {
        if("storage_path" in filters)return {data:[],error:null};
        const matching=file && (!filters.id || filters.id===file.id) && (!filters.kind || filters.kind===file.kind) && file.creator_account_id===filters.creator_account_id;
        return {data:singleton?(matching?file:null):(matching?[file]:[]),error:null};
      }
      return {data:reference?[{id:otherId}]:[],error:null};
    }).then(yes,no)};return chain;
}
const db={from:query,storage:{from:(bucket:string)=>{assert.equal(bucket,"onboarding-content");return {
  info:async(path:string)=>{assert.equal(path,original.storage_path);return {data:{size:1024},error:null};},
  createSignedUrl:async(path:string,ttl:number)=>{assert.equal(path,original.storage_path);assert.equal(ttl,3600);signed++;return {data:{signedUrl:"https://private-storage.invalid/owned-test-only"},error:null};},
  remove:async(paths:string[])=>{assert.equal(paths.length,1);assert.equal(paths[0],original.storage_path);stored++;events.push("storage:remove");return {error:storageFailure?{message:"synthetic storage error"}:null};},
}}}};
function compile(path:string,deps:Record<string,any>) {const exports:any={};const code=ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(`(function(require,exports){${code}\n})`,{Date,Promise,Set,Map,JSON,console})((name:string)=>{if(!(name in deps))throw new Error(`Unexpected dependency ${name}`);return deps[name];},exports);return exports;}
const helper=compile("lib/creator-file-gallery.ts",{
 "./creator-content-requirements":{creatorContentCompleted,isAnyCreatorContentKind},"./supabase-service":{serviceClient:()=>db},
 "./creator-upload-policy":{creatorUploadsEditable:(status:string)=>status==="draft"},"./flirt-onboarding":{creatorOnboardingEditable:(status:string)=>status==="draft"},
});
const deps={"next/server":{NextResponse},"@/lib/creator-session":{CREATOR_SESSION_COOKIE:"creator"},"@/lib/creator-dashboard-identity":{creatorDashboardIdentity:async()=>identity},"@/lib/supabase-service":{serviceClient:()=>db},"@/lib/view-as":{activeViewAs:async()=>viewAs?{}:null},"@/lib/creator-upload-receipts":{isUploadId:(s:string)=>/^[a-f0-9-]{36}$/i.test(s)},"@/lib/form-origin":{trustedFormOrigin:(req:Request)=>req.headers.get("origin")==="https://test.example"},"@/lib/creator-file-gallery":helper};
const list=compile("app/creator-auth/files/route.ts",deps), access=compile("app/creator-auth/files/[id]/access/route.ts",deps), removal=compile("app/creator-auth/files/[id]/route.ts",deps);
const request=(path:string,method="GET",origin="https://test.example")=>new NextRequest(`https://test.example${path}`,{method,headers:{origin}});
const context=(requested=id)=>({params:Promise.resolve({id:requested})});
function reset(){identity={accountId:owner,cloneIds:[],readOnly:false,applicationSubmitted:false};file={...original};events=[];signed=stored=queries=0;reference=storageFailure=deletionFailure=viewAs=false;applicationStatus="draft";}
async function main(){
 reset();identity=null;
 assert.equal((await list.GET(request("/creator-auth/files?kind=content_sfw_video"))).status,401);
 assert.equal((await access.GET(request("/creator-auth/files/any/access"),context())).status,401);
 assert.equal((await removal.DELETE(request("/creator-auth/files/any","DELETE"),context())).status,401);assert.equal(queries+signed+stored,0);
 reset();identity.readOnly=true;assert.equal((await access.GET(request("/creator-auth/files/any/access"),context())).status,401);assert.equal(signed,0);
 reset();const listed=await (await list.GET(request("/creator-auth/files?kind=content_sfw_video"))).json();
 assert.equal(listed.files.length,1);assert.equal(listed.files[0].previewAvailable,true);assert.equal(listed.files[0].removalAvailable,true);assert.equal("storage_path" in listed.files[0],false);assert.equal("bucket" in listed.files[0],false);
 const playback=await access.GET(request("/creator-auth/files/any/access"),context());assert.equal(playback.status,200);assert.equal(signed,1);assert.equal((await playback.json()).expiresIn,3600);
 assert.equal((await access.GET(request("/creator-auth/files/any/access"),context(otherId))).status,404);assert.equal(signed,1,"Foreign records cannot obtain playback URLs");
 const deletes=stored;await removal.DELETE(request("/creator-auth/files/any","DELETE"),context(otherId));assert.equal(stored,deletes,"Foreign records cannot reach Storage deletion");
 file.storage_path=`creators/${other}/content_sfw_video/${id}`;assert.equal((await access.GET(request("/creator-auth/files/any/access"),context())).status,404);assert.equal(signed,1);
 reset();assert.equal((await removal.DELETE(request("/creator-auth/files/any","DELETE","https://attacker.invalid"),context())).status,403);assert.equal(queries+stored,0);
 reset();reference=true;assert.equal((await removal.DELETE(request("/creator-auth/files/any","DELETE"),context())).status,409);assert.equal(stored,0,"Referenced content cannot be deleted");
 reset();identity.cloneIds=[otherId];assert.equal((await removal.DELETE(request("/creator-auth/files/any","DELETE"),context())).status,409);assert.equal(stored,0);
 reset();applicationStatus="submitted";assert.equal((await removal.DELETE(request("/creator-auth/files/any","DELETE"),context())).status,409);assert.equal(stored,0);
 reset();storageFailure=true;assert.equal((await removal.DELETE(request("/creator-auth/files/any","DELETE"),context())).status,503);assert.deepEqual(events,["storage:remove"]);assert.ok(file,"Storage failure must preserve metadata");
 reset();deletionFailure=true;assert.equal((await removal.DELETE(request("/creator-auth/files/any","DELETE"),context())).status,503);assert.ok(file);assert.equal(file.storage_transfer_status,"failed");assert.ok(events.indexOf("storage:remove")<events.indexOf("creator_files:delete"));
 deletionFailure=false;assert.equal((await removal.DELETE(request("/creator-auth/files/any","DELETE"),context())).status,200);assert.equal(file,null);
 assert.equal((await removal.DELETE(request("/creator-auth/files/any","DELETE"),context())).status,200,"Removal is safe to retry");
 assert.equal(creatorUploadApiAllowed("/creator-auth/files","GET",false),true);
 assert.equal(creatorUploadApiAllowed(`/creator-auth/files/${id}/access`,"GET",false),true);
 assert.equal(creatorUploadApiAllowed(`/creator-auth/files/${id}`,"DELETE",false),true);
 for(const path of ["/creator-auth/files-other",`/creator-auth/files/${id}/other`,"/creator-management"])assert.equal(creatorUploadApiAllowed(path,"GET",false),false);
 assert.equal(creatorUploadApiAllowed("/creator-auth/uploads","POST",false),false);assert.equal(creatorUploadApiAllowed("/creator-auth/files","GET",true),false);
 console.log("Private gallery passed: pre-clone list, actual record ownership, signed playback scope, origin/read-only guards, reference protection, private path validation, Storage-first removal, partial-failure retry and explicit middleware methods.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
