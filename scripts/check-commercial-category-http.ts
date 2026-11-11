/** Real Next request auth, BFF transport, ASGI agency middleware, PG authority. Identity/provider are explicit fixtures. */
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {spawn} from "node:child_process";
import {openSync,closeSync} from "node:fs";
import {randomUUID} from "node:crypto";
const backend=process.env.COMMERCIAL_TEST_BACKEND??"http://127.0.0.1:18787",base="http://127.0.0.1:3197";
const agency="bc670215-110b-4ea0-8f5c-af3dfe21d253",manager="44444444-4444-4444-8444-444444444444",reader="55555555-5555-4555-8555-555555555555",creator="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222";
async function main(){
 let assigned=creator,active=true,authReads=0;
 const identity=createServer(async(req,res)=>{
  const u=new URL(req.url!,"http://fixture"),json=(v:unknown,status=200)=>{res.writeHead(status,{"Content-Type":"application/json"});res.end(JSON.stringify(v));};
  if(u.pathname==="/auth/v1/user"){
   authReads++;const id=req.headers.authorization==="Bearer synthetic-manager"?manager:req.headers.authorization==="Bearer synthetic-reader"?reader:null;
   return id?json({id,aud:"authenticated",email:"synthetic@example.invalid",app_metadata:{},user_metadata:{}}):json({},401);
  }
  const table=u.pathname.split("/").at(-1);
  if(table==="agency_memberships")return json(active?[{creator_scope:"all",creator_ids:[],creator_access_revision:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",agency_id:agency,can_manage:u.searchParams.get("user_id")===("eq."+manager)}]:[]);
  if(table==="partner_agencies")return json([{id:agency,name:"Moxy"}]);
  if(table==="agency_creators")return json([{clone_id:assigned}]);
  return json([]);
 });
 await new Promise<void>(resolve=>identity.listen(0,"127.0.0.1",resolve));
 const port=(identity.address() as {port:number}).port;
 const fd=openSync("../evidence/commercial-next.log","w");
 const child=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--hostname","127.0.0.1","--port","3197"],{cwd:process.cwd(),env:{...process.env,NODE_OPTIONS:"--max-old-space-size=1536",NEXT_TELEMETRY_DISABLED:"1",DASHBOARD_PUBLIC_ORIGIN:base,SUPABASE_URL:"http://127.0.0.1:"+port,SUPABASE_SERVICE_KEY:"synthetic-service",ONLYFANS_API_BASE_URL:backend,ONLYFANS_API_TOKEN:"synthetic-read",ONLYFANS_CONTENT_TOKEN:"synthetic-content"},stdio:["ignore",fd,fd]});
 try{
  for(let n=0;n<180;n++){try{const r=await fetch(base+"/api/onlyfans/accounts");if(r.status===401)break;}catch{}if(n===179)throw Error("Next did not start");await new Promise(r=>setTimeout(r,500));}
  const setup=await(await fetch(backend+"/fixture")).json() as {account:string;folder:string;providerReads:number};
  const vault="/api/onlyfans-content/accounts/"+setup.account+"/vault";
  const get=(path:string,token="synthetic-manager",headers:Record<string,string>={})=>fetch(base+path,{redirect:"manual",headers:{Cookie:"twin_agency_access="+token,...headers}});
  const post=(path:string,body:unknown,token="synthetic-manager",headers:Record<string,string>={})=>fetch(base+path,{method:"POST",redirect:"manual",headers:{Cookie:"twin_agency_access="+token,Origin:base,"Content-Type":"application/json",...headers},body:JSON.stringify(body)});
  assert.notEqual((await fetch(base+vault+"/category-price/"+setup.folder)).status,200,"missing agency session");
  let response=await get(vault+"/category-price/"+setup.folder);assert.equal(response.status,200,await response.clone().text());
  let price=(await response.json()).categoryPrice;assert.equal(price.priceCents,null);
  const pricing={requestId:randomUUID(),priceCents:1200,expectedFingerprint:price.fingerprint};
  assert.equal((await post(vault+"/category-price/"+setup.folder,pricing,"synthetic-reader")).status,403);
  assert.equal((await post(vault+"/category-price/"+setup.folder,{...pricing,actor:"spoof"})).status,400);
  assert.equal((await post(vault+"/category-price/"+setup.folder,pricing,"synthetic-manager",{Origin:"https://untrusted.invalid"})).status,403);
  assigned=other;assert.equal((await get(vault+"/category-price/"+setup.folder)).status,404);assigned=creator;
  response=await post(vault+"/category-price/"+setup.folder,pricing);assert.equal(response.status,200,await response.clone().text());
  assert.equal((await post(vault+"/category-price/"+setup.folder,pricing)).status,200,"same price request replays");
  price=(await(await get(vault+"/category-price/"+setup.folder)).json()).categoryPrice;assert.equal(price.priceCents,1200);assert.equal(price.revision,1);
  let reviewed=await(await get(vault+"/category-review/"+setup.folder+"?mediaIds=11,12")).json();
  assert.equal(reviewed.assets.length,2);assert.equal(reviewed.assets[0].description,"A scenic photograph.");
  const category={folderId:Number(setup.folder),priceCents:1200,categoryPriceRevision:1,classificationConfirmed:true,rightsConfirmed:true,
   reviewedState:reviewed.reviewedState,products:reviewed.assets.map((a:{mediaId:string;description:string})=>({label:"Scenic "+a.mediaId,description:a.description,mediaIds:[a.mediaId],previewMediaIds:[]}))};
  const request={requestId:randomUUID(),category};
  assert.equal((await post(vault+"/category-drafts",request,"synthetic-reader")).status,403);
  assert.equal((await post(vault+"/category-drafts",{...request,actor:"spoof"})).status,400);
  await fetch(backend+"/fixture/change-asset",{method:"POST"});
  assert.equal((await post(vault+"/category-drafts",request)).status,409,"reviewed versions became stale");
  reviewed=await(await get(vault+"/category-review/"+setup.folder+"?mediaIds=11,12")).json();
  assert.equal(reviewed.assets[0].description,"A newly corrected description.","review shows current facts");
  const current={requestId:randomUUID(),category:{...category,reviewedState:reviewed.reviewedState,products:category.products.map((p:{mediaIds:string[]})=>({...p,description:reviewed.assets.find((a:{mediaId:string})=>a.mediaId===p.mediaIds[0]).description}))}};
  response=await post(vault+"/category-drafts",current,"synthetic-manager",{"X-OnlyFans-Agency-Scope":JSON.stringify({creatorIds:[other],actor:"spoof",canManage:true})});
  assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json()).items.length,2);
  assert.equal((await post(vault+"/category-drafts",current)).status,200,"same draft request replays");
  const final=await(await fetch(backend+"/fixture")).json();
  assert.deepEqual(final.products,[{price:1200,enabled:false,media:[11]},{price:1200,enabled:false,media:[12]}]);
  assert.equal(final.providerReads,setup.providerReads,"no provider calls for prices, reviews or drafts");
  active=false;assert.notEqual((await post(vault+"/category-drafts",current)).status,200,"revoked session cannot replay");active=true;
  // The actual backend ingress separately rejects a missing scope, contract and actor mismatch.
  const endpoint=backend+"/onlyfans/agency/v1/content/v1/accounts/"+setup.account+"/vault/category-drafts";
  const scope=JSON.stringify({creatorIds:[creator],actor:"agency-user:"+agency+":"+manager,canManage:true});
  const body=JSON.stringify({category:current.category,commandKey:"e".repeat(64),actor:"op-session:"+"a".repeat(64)});
  const direct=(headers:Record<string,string>)=>fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer synthetic-content",...headers},body});
  assert.equal((await direct({"X-OnlyFans-Content-Version":"of-content.v1"})).status,403);
  assert.equal((await direct({"X-OnlyFans-Agency-Scope":scope})).status,400);
  assert.equal((await direct({"X-OnlyFans-Agency-Scope":scope,"X-OnlyFans-Content-Version":"wrong"})).status,400);
  assert.equal((await direct({"X-OnlyFans-Agency-Scope":scope,"X-OnlyFans-Content-Version":"of-content.v1"})).status,400);
  assert(authReads>10);
  console.log(JSON.stringify({result:"passed",boundary:"actual Next auth/BFF -> actual ASGI middleware -> PostgreSQL",identity:"synthetic auth service",provider:"mocked import only",products:final.products,authReads}));
 }finally{child.kill("SIGTERM");await new Promise<void>(r=>{if(child.exitCode!==null)r();else child.once("exit",()=>r());});closeSync(fd);identity.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
