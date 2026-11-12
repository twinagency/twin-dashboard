/** Q14: actual Next request auth + BFF -> actual ASGI agency middleware -> real PostgreSQL authority.
 * Category review, prices, reviewed drafts (approved terms), history coverage, commercial promote and stop,
 * stale revision, denied (read-only) actor, revoked session, spoofed identity and cross-agency refusal.
 * Identity (auth service) and provider wire are explicit SYNTHETIC fixtures; everything else is the real code. */
import assert from "node:assert/strict";
import {createServer,get as httpGet} from "node:http";
import {spawn} from "node:child_process";
import {openSync,closeSync,readFileSync,writeFileSync,existsSync} from "node:fs";
import {createServer as httpsServer} from "node:https";
import {request as httpRequest} from "node:http";
import {randomUUID} from "node:crypto";
const backend=process.env.COMMERCIAL_TEST_BACKEND??"http://127.0.0.1:18787",base=process.env.COMMERCIAL_TEST_ORIGIN??"http://127.0.0.1:3198";
const agency="bc670215-110b-4ea0-8f5c-af3dfe21d253",manager="44444444-4444-4444-8444-444444444444",reader="55555555-5555-4555-8555-555555555555",creator="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222";
type Json=Record<string,any>;
/** next dev compiles each route on first request (minutes on one CPU): warm every route this check uses with a long timeout. */
const warm=(path:string)=>new Promise<void>(resolve=>{const req=httpGet(base+path,{headers:{Cookie:"twin_agency_access=synthetic-manager"},timeout:900000},res=>{res.resume();res.on("end",()=>resolve());});req.on("error",()=>resolve());req.on("timeout",()=>{req.destroy();resolve();});});
async function main(){
 let assigned=creator,active=true;
 const identity=createServer(async(req,res)=>{
  const u=new URL(req.url!,"http://fixture"),json=(v:unknown,status=200)=>{res.writeHead(status,{"Content-Type":"application/json"});res.end(JSON.stringify(v));};
  if(u.pathname==="/auth/v1/user"){
   const id=req.headers.authorization==="Bearer synthetic-manager"?manager:req.headers.authorization==="Bearer synthetic-reader"?reader:null;
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
 const fd=openSync(process.env.NEXT_LOG??"/tmp/commercial-ops-next.log","w");
 const proxy=process.env.COMMERCIAL_TLS_KEY?httpsServer({key:readFileSync(process.env.COMMERCIAL_TLS_KEY),cert:readFileSync(process.env.COMMERCIAL_TLS_CERT!)},(req,res)=>{const upstream=httpRequest({hostname:"127.0.0.1",port:3198,path:req.url,method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode!,r.headers);r.pipe(res);});upstream.on("error",()=>{res.writeHead(502);res.end();});req.pipe(upstream);}):null;
 if(proxy)await new Promise<void>(resolve=>proxy.listen(3199,"0.0.0.0",resolve));
 const nextArgs=process.env.NEXT_MODE!=="start"?["dev","--hostname","127.0.0.1","--port","3198"]:["start","--hostname","127.0.0.1","--port","3198"];
 const child=spawn(process.execPath,["node_modules/next/dist/bin/next",...nextArgs],{cwd:process.cwd(),env:{...process.env,NODE_OPTIONS:"--max-old-space-size=1536",NEXT_TELEMETRY_DISABLED:"1",DASHBOARD_PUBLIC_ORIGIN:base,SUPABASE_URL:"http://127.0.0.1:"+port,SUPABASE_SERVICE_KEY:"synthetic-service",ONLYFANS_API_BASE_URL:backend,ONLYFANS_API_TOKEN:"synthetic-read",ONLYFANS_CONTENT_TOKEN:"synthetic-content",ONLYFANS_CONFIGURATION_TOKEN:"synthetic-configuration"},stdio:["ignore",fd,fd]});
 try{
  for(let n=0;n<240;n++){try{const r=await fetch(base+"/api/onlyfans/accounts");if(r.status===401)break;}catch{}if(n===239)throw Error("Next did not start");await new Promise(r=>setTimeout(r,500));}
  const setup=await(await fetch(backend+"/fixture")).json() as Json;
  const account=setup.account as string;
  for(const leaf of ["vault/category-price/"+setup.folder,"vault/category-review/"+setup.folder,"vault/category-drafts"])await warm("/api/onlyfans-content/accounts/"+account+"/"+leaf);
  for(const leaf of ["preparation","history-coverage","commercial"])await warm("/api/onlyfans-configuration/accounts/"+account+"/"+leaf);
  const vault="/api/onlyfans-content/accounts/"+account+"/vault",cfg="/api/onlyfans-configuration/accounts/"+account;
  const state=async():Promise<Json>=>await(await fetch(backend+"/fixture/state")).json();
  const get=(path:string,token="synthetic-manager")=>fetch(base+path,{redirect:"manual",headers:{Cookie:"twin_agency_access="+token}});
  const post=(path:string,body:unknown,token="synthetic-manager",headers:Record<string,string>={})=>fetch(base+path,{method:"POST",redirect:"manual",headers:{Cookie:"twin_agency_access="+token,Origin:base,"Content-Type":"application/json",...headers},body:JSON.stringify(body)});
  const ok=async(r:Response)=>{assert.equal(r.status,200,await r.clone().text());return r.json() as Promise<Json>;};
  // ---- category price + review + reviewed drafts (approved terms are written by the real draft command)
  let price=(await ok(await get(vault+"/category-price/"+setup.folder))).categoryPrice;
  const pricing={requestId:randomUUID(),priceCents:1200,expectedFingerprint:price.fingerprint};
  assert.equal((await post(vault+"/category-price/"+setup.folder,pricing,"synthetic-reader")).status,403,"read-only actor cannot price");
  await ok(await post(vault+"/category-price/"+setup.folder,pricing));
  const reviewed=await ok(await get(vault+"/category-review/"+setup.folder+"?mediaIds=11,12"));
  assert.equal(reviewed.assets.length,2);
  const drafts={requestId:randomUUID(),category:{folderId:Number(setup.folder),priceCents:1200,categoryPriceRevision:1,classificationConfirmed:true,rightsConfirmed:true,reviewedState:reviewed.reviewedState,
   products:reviewed.assets.map((a:Json)=>({label:"Scenic "+a.mediaId,description:a.description,mediaIds:[a.mediaId],previewMediaIds:[]}))}};
  await ok(await post(vault+"/category-drafts",drafts));
  let s=await state();
  assert.deepEqual(s.terms.map((t:Json)=>[t.revision,t.status,t.standardPriceCents]),[[1,"approved",1200],[1,"approved",1200]],"terms are the exact approved category price");
  assert.deepEqual(s.products.map((p:Json)=>p.enabled),[false,false],"drafts are disabled");
  assert.equal(s.scope,null,"nothing configured yet");
  // ---- preparation (connected provider identity is required to promote)
  const prepPath=cfg+"/preparation";
  await ok(await post(prepPath,{action:"configure",expectedRevision:0,requestId:randomUUID(),reason:"Agency approved isolated preparation fixture",
   config:{contract_version:"preparation.v1",provider_account:setup.providerAccount,creator_id:setup.providerCreator,qualification:{mode:"fixture",reference:"Q14 actual Next/BFF and PG synthetic wire"},
    limits:{provider_requests:4,provider_credit_budget:8,provider_credits_per_request:2}}}));
  assert.equal((await fetch(backend+"/fixture/prepare",{method:"POST"})).status,200);
  // ---- history coverage: read-only, honest when no history import is configured
  const coveragePath=cfg+"/history-coverage";
  assert.notEqual((await fetch(base+coveragePath)).status,200,"coverage needs an agency session");
  let body=await ok(await get(coveragePath));
  assert.deepEqual(body.coverage,{configured:false},"unconfigured history is reported as not configured, never complete");
  assert.equal((await get(coveragePath,"synthetic-reader")).status,200,"read-only actor may read coverage");
  assigned=other;assert.equal((await get(coveragePath)).status,404,"cross-agency coverage");assigned=creator;
  active=false;assert.notEqual((await get(coveragePath)).status,200,"revoked session");active=true;
  assert.equal((await fetch(base+coveragePath+"?x=1",{headers:{Cookie:"twin_agency_access=synthetic-manager"}})).status,400,"no query parameters");
  // ---- commercial state before promotion
  const commercialPath=cfg+"/commercial";
  body=await ok(await get(commercialPath));
  assert.equal(body.commercial.state,"preparation");assert.equal(body.commercial.eligible,true);
  const revision=body.commercial.revision as number;
  assigned=other;assert.equal((await get(commercialPath)).status,404,"cross-agency commercial read");assigned=creator;
  assert.notEqual((await fetch(base+commercialPath)).status,200);
  // ---- promote
  const promotion=await(await fetch(backend+"/fixture/promotion-body")).json() as Json;
  const promote={action:"promote",expectedRevision:revision,requestId:randomUUID(),reason:"Agency approved commercial scope fixture",config:promotion};
  assert.equal((await post(commercialPath,promote,"synthetic-reader")).status,403,"read-only actor cannot promote");
  assert.equal((await post(commercialPath,{...promote,actor:"spoof"})).status,400,"spoofed actor field");
  assert.equal((await post(commercialPath,{...promote,config:{...promotion,unreviewed:true}})).status,400,"unknown config key");
  assert.equal((await post(commercialPath,promote,"synthetic-manager",{Origin:"https://untrusted.invalid"})).status,403,"untrusted origin");
  assigned=other;assert.equal((await post(commercialPath,promote)).status,404,"cross-agency promote");assigned=creator;
  active=false;assert.notEqual((await post(commercialPath,promote)).status,200,"revoked session cannot promote");active=true;
  assert.equal((await post(commercialPath,{...promote,requestId:randomUUID(),expectedRevision:revision+5})).status,409,"stale revision");
  s=await state();assert.equal(s.scope.contractVersion,"preparation.v1","every refusal left the scope untouched");assert.equal(s.commands.filter((c:Json)=>c.kind==="commercial_scope").length,0);
  let response=await post(commercialPath,promote);body=await ok(response);
  assert.equal(body.commercial.contractVersion,"commercial.v1");assert.equal(body.commercial.status,"configured");
  assert.equal(body.commercial.automaticRepliesEnabled,false);assert.equal(body.commercial.replayed,false);
  s=await state();
  assert.equal(s.scope.contractVersion,"commercial.v1");assert.equal(s.scope.status,"configured");assert.equal(s.runtimeEnabled,false);
  assert.deepEqual(s.policy,{enabled:false,mediaEnabled:false},"promotion grants nothing");
  const audit=s.commands.filter((c:Json)=>c.kind==="commercial_scope");
  assert.equal(audit.length,1);assert.equal(audit[0].actor,"agency-user:"+agency+":"+manager,"audited as the authenticated agency user, not a body-supplied name");
  body=await ok(await post(commercialPath,promote));assert.equal(body.commercial.replayed,true,"same request replays");
  assert.equal((await state()).commands.filter((c:Json)=>c.kind==="commercial_scope").length,1,"replay wrote no second audit row");
  assert.equal((await post(commercialPath,{...promote,requestId:randomUUID()})).status,409,"a promoted account cannot be promoted again");
  body=await ok(await get(commercialPath));assert.equal(body.commercial.state,"commercial");assert.equal(body.commercial.status,"configured");
  const promoted=body.commercial.revision as number;
  // ---- stop
  const stop={action:"stop",expectedRevision:promoted,requestId:randomUUID(),reason:"Agency stopped the commercial scope fixture"};
  assert.equal((await post(commercialPath,stop,"synthetic-reader")).status,403);
  assigned=other;assert.equal((await post(commercialPath,stop)).status,404,"cross-agency stop");assigned=creator;
  assert.equal((await post(commercialPath,{...stop,requestId:randomUUID(),expectedRevision:promoted+3})).status,409,"stale stop");
  assert.equal((await state()).scope.status,"configured");
  body=await ok(await post(commercialPath,stop));assert.equal(body.commercial.status,"stopped");
  s=await state();assert.equal(s.scope.status,"stopped");assert.equal(s.runtimeEnabled,false);assert.deepEqual(s.policy,{enabled:false,mediaEnabled:false});
  body=await ok(await post(commercialPath,stop));assert.equal(body.commercial.replayed,true,"same stop replays");
  assert.equal((await state()).commands.filter((c:Json)=>c.kind==="commercial_scope").length,2);
  // ---- the actual backend ingress separately refuses missing scope/contract and an actor that is not the scope's actor
  const endpoint=backend+"/onlyfans/agency/v1/configuration/v1/accounts/"+account+"/commercial";
  const scope=JSON.stringify({creatorIds:[creator],actor:"agency-user:"+agency+":"+manager,canManage:true});
  const viewScope=JSON.stringify({creatorIds:[creator],actor:"agency-user:"+agency+":"+reader,canManage:false});
  const raw=JSON.stringify({action:"stop",expectedRevision:promoted+1,commandKey:"f".repeat(64),actor:"op-session:"+"a".repeat(64),reason:"spoofed actor must fail"});
  const direct=(headers:Record<string,string>)=>fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer synthetic-configuration",...headers},body:raw});
  assert.equal((await direct({"X-OnlyFans-Configuration-Version":"of-configuration.v3"})).status,403,"no agency scope");
  assert.equal((await direct({"X-OnlyFans-Agency-Scope":scope})).status,400,"no contract version");
  assert.equal((await direct({"X-OnlyFans-Agency-Scope":viewScope,"X-OnlyFans-Configuration-Version":"of-configuration.v3"})).status,403,"view-only scope cannot write");
  assert.equal((await direct({"X-OnlyFans-Agency-Scope":scope,"X-OnlyFans-Configuration-Version":"of-configuration.v3"})).status,409,"actor that is not the scope actor");
  assert.equal((await state()).commands.filter((c:Json)=>c.kind==="commercial_scope").length,2,"refused direct calls wrote nothing");
  const final=await state();
  assert.equal(final.providerReads,setup.providerReads+2,"no provider read from any commercial operation");
  // Exact terms review uses the same authenticated BFF and PostgreSQL owner.
  s=await (await fetch(backend+"/fixture/state")).json();
  const productId=String(s.terms[0].itemId);
  const termsPath="/api/onlyfans-configuration/accounts/"+account+"/catalogue-terms/"+productId;
  const currentTerms=(await ok(await get(termsPath))).terms;
  const approveTerms={action:"approve",expectedRevision:currentTerms.revision,expectedFingerprint:currentTerms.contentFingerprint,
    standardCents:1200,discountCents:900,requestId:randomUUID()};
  assert.equal((await post(termsPath,approveTerms,"synthetic-reader")).status,403);
  const termsAck=await ok(await post(termsPath,approveTerms));
  assert.equal(termsAck.terms.discountCents,900);
  assert.equal(termsAck.terms.revision,currentTerms.revision+1);
  assert.deepEqual((await ok(await post(termsPath,approveTerms))).terms,termsAck.terms);
  assert.equal((await post(termsPath,{...approveTerms,requestId:randomUUID()})).status,409);
  assigned=other;assert.equal((await get(termsPath)).status,404);assigned=creator;
  const withdrawn=await ok(await post(termsPath,{action:"withdraw",expectedRevision:termsAck.terms.revision,requestId:randomUUID()}));
  assert.equal(withdrawn.terms.status,"withdrawn");

  if(process.env.COMMERCIAL_BROWSER_READY){
    writeFileSync(process.env.COMMERCIAL_BROWSER_READY,JSON.stringify({account,creator,itemId:productId,base}));
    const done=process.env.COMMERCIAL_BROWSER_DONE!;
    for(let n=0;!existsSync(done);n++){
      if(n>=360)throw Error("browser qualification did not complete");
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    assert.equal(JSON.parse(readFileSync(done,"utf8")).status,"passed","browser qualification failed");
  }
  console.log(JSON.stringify({result:"passed",boundary:"actual Next BFF -> actual ASGI middleware -> PostgreSQL",identity:"synthetic auth service",provider:"synthetic preparation wire only",terms:final.terms.length,commands:final.commands.length}));
 }finally{child.kill("SIGTERM");await new Promise<void>(r=>{if(child.exitCode!==null)r();else child.once("exit",()=>r());});closeSync(fd);identity.close();proxy?.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
