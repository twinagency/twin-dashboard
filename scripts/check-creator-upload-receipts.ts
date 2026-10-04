import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, openAsBlob, readFileSync } from "node:fs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";
import { CreatorUploadError } from "../lib/creator-upload-stream";
import { recoverableUploadQueue } from "../lib/creator-upload-recovery";

const owner = randomUUID(), id = randomUUID();
const receipt = { state: "uploading", bucket: "onboarding-content", storage_path: `creators/${owner}/content_sfw_video/${id}`, lease_token: randomUUID() };
let claimState = "uploading", objectExists = false, finalizeFailures = 0, uploads = 0, finalized = 0, claims: any[] = [], updates: any[] = [];
const db = {
  rpc: async (name: string, params: any) => {
    assert.equal(params.p_creator_id, owner); assert.equal(params.p_upload_id, id);
    if (name === "claim_creator_upload") { claims.push(params); return { data: { ...receipt, state: claimState }, error: null }; }
    assert.equal(name, "finish_creator_upload"); assert.equal(params.p_lease_token, receipt.lease_token);
    finalized++; if (finalizeFailures-- > 0) return { error: { message: "lost_response" } };
    return { data: id, error: null };
  },
  from: (table: string) => {
    assert.equal(table, "creator_upload_receipts"); const predicates: Record<string,unknown> = {};
    const query: any = { update: (values: any) => { updates.push(values); return query; }, eq: (key: string, value: any) => { predicates[key] = value; return query; },
      then: (yes: any, no: any) => { assert.deepEqual(predicates, { id, creator_account_id: owner, lease_token: receipt.lease_token }); return Promise.resolve({ error: null }).then(yes,no); } };
    return query;
  },
  storage: { from: (bucket: string) => {
    assert.equal(bucket,receipt.bucket);
    return { info: async (path: string) => { assert.equal(path,receipt.storage_path); return objectExists ? { data: { size: 5 }, error: null } : { data: null, error: { statusCode: "404" } }; },
      upload: async (path: string, blob: Blob, options: any) => { assert.equal(path,receipt.storage_path); assert.equal(options.upsert,false); assert.equal(await blob.text(),"video"); objectExists=true; uploads++; return {error:null}; } };
  } },
};
function compile(path: string, dependencies: Record<string,any>) {
  const exports: any = {};
  const code=ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(`(function(require,exports){${code}\n})`, { console, Date, Set, Map, URL, Object, Number, JSON, performance })((name:string)=>{
    if(!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`); return dependencies[name];
  },exports); return exports;
}
async function main() {
  const temp=await mkdtemp(join(tmpdir(),"creator-receipt-test-"));
  try {
    const path=join(temp,"video.mp4"); await writeFile(path,"video");
    const helper=compile("lib/creator-upload-receipts.ts",{
      "node:crypto":{createHash},"node:fs":{createReadStream,openAsBlob},"./supabase-service":{serviceClient:()=>db},"./creator-upload-stream":{CreatorUploadError},"./creator-upload-diagnostics":{uploadStage:()=>{}}
    });
    const file={path,size:5,name:"video.mp4",type:"video/mp4"};
    finalizeFailures=1;
    await helper.saveIdempotentCreatorUpload(owner,id,"content_sfw_video",file,"video/mp4");
    assert.equal(uploads,1); assert.equal(finalized,2,"A lost metadata response retries the same atomic finalization");
    assert.equal(claims[0].p_sha256,createHash("sha256").update("video").digest("hex"));
    await helper.saveIdempotentCreatorUpload(owner,id,"content_sfw_video",file,"video/mp4");
    assert.equal(uploads,1,"Existing private storage must not be uploaded again");
    claimState="saved"; await helper.saveIdempotentCreatorUpload(owner,id,"content_sfw_video",file,"video/mp4"); assert.equal(uploads,1);
    claimState="removed"; await assert.rejects(helper.saveIdempotentCreatorUpload(owner,id,"content_sfw_video",file,"video/mp4"), (e:any)=>e.status==="upload_removed");
    claimState="busy"; await assert.rejects(helper.saveIdempotentCreatorUpload(owner,id,"content_sfw_video",file,"video/mp4"), (e:any)=>e.status==="upload_busy");
    claimState="uploading"; finalizeFailures=2;
    await assert.rejects(helper.saveIdempotentCreatorUpload(owner,id,"content_sfw_video",file,"video/mp4"),(e:any)=>e.status==="upload_metadata_error");
    assert.equal(objectExists,true,"Metadata errors must preserve the only durable storage reference");
    assert.equal(uploads,1); assert.ok(updates.at(-1).lease_until);
    const restored=recoverableUploadQueue([{id,name:"video.mp4",size:5,lastModified:1,state:"uploading",file:"must not persist"},{id:randomUUID(),name:"saved.mp4",size:5,lastModified:1,state:"saved"},{id:"x".repeat(36),name:"bad",size:5,lastModified:1}]);
    assert.equal(restored.length,2); assert.equal(restored[0].state,"reselect"); assert.equal(restored[1].state,"saved"); assert.equal("file" in restored[0],false);

    let identity:any={accountId:owner,readOnly:false}, queried=0;
    const statusDb={from:(table:string)=>{
      queried++; let scoped=false;
      const chain:any={select:()=>chain,eq:(key:string,value:string)=>{assert.equal(key,"creator_account_id");assert.equal(value,owner);scoped=true;return chain;},in:()=>chain,
        then:(yes:any,no:any)=>{assert.ok(scoped,"All status reads must be creator-scoped");return Promise.resolve({data:table==="creator_files"?[{id,storage_transfer_status:"verified"}]:[],error:null}).then(yes,no);}}; return chain;
    }};
    const api=compile("app/creator-auth/uploads/route.ts",{"@/lib/view-as":{activeViewAs:async()=>null},"next/server":{NextResponse},"@/lib/creator-session":{CREATOR_SESSION_COOKIE:"creator"},"@/lib/creator-dashboard-identity":{creatorDashboardIdentity:async()=>identity},"@/lib/supabase-service":{serviceClient:()=>statusDb},"@/lib/creator-upload-receipts":{isUploadId:helper.isUploadId}});
    const req=()=>new NextRequest(`https://test.example/creator-auth/uploads?ids=${id}`);
    identity=null; assert.equal((await api.GET(req())).status,401);assert.equal(queried,0);
    identity={accountId:owner,readOnly:true};assert.equal((await api.GET(req())).status,401);assert.equal(queried,0);
    identity={accountId:owner,readOnly:false};
    const response=await api.GET(req());assert.equal(response.status,200);assert.deepEqual(await response.json(),{uploads:[{id,state:"saved"}]});assert.match(response.headers.get("cache-control")!,/no-store/);
    assert.equal((await api.GET(new NextRequest("https://test.example/creator-auth/uploads?ids=not-an-id"))).status,400);
    console.log("Upload receipts passed: content digest, deterministic storage, lost-response retry, stored-object reconciliation, safe metadata failure, refresh recovery and owner-scoped status API.");
  } finally { await rm(temp,{recursive:true,force:true}); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
