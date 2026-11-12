/** Full offline browser -> production Next/BFF -> real ASGI/Postgres -> autonomous worker.
 * Identity, provider and model are explicit fixtures. No production action occurs. */
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {createServer as createHttps} from "node:https";
import {request as httpRequest} from "node:http";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {readFileSync,writeFileSync,openSync,closeSync} from "node:fs";
import {spawn} from "node:child_process";
import {chromium,type Page} from "playwright";
const backend=process.env.COMMERCIAL_TEST_BACKEND??"http://backend:8787";
const base=process.env.COMMERCIAL_TEST_ORIGIN??"https://dashboard:3199";
const output=process.env.COMMERCIAL_BROWSER_OUTPUT??"/evidence/browser";
const owner="44444444-4444-4444-8444-444444444444";
const token="owner_"+randomBytes(32).toString("hex");
const tokenHash=createHash("sha256").update(token).digest("hex");
let validSession=true;
type Json=Record<string,any>;
async function main(){
 const identity=createServer(async(req,res)=>{
  const url=new URL(req.url!,"http://fixture");let raw="";for await(const chunk of req)raw+=chunk;
  const args=raw?JSON.parse(raw):{};
  const reply=(body:unknown,status=200)=>{res.writeHead(status,{"Content-Type":"application/json"});res.end(JSON.stringify(body));};
  if(url.pathname.endsWith("/dashboard_owner_session_verify"))return reply(validSession&&args.p_session_hash===tokenHash);
  if(url.pathname.endsWith("/dashboard_plan_c_owner_identity"))return reply(validSession&&args.p_session_hash===tokenHash?owner:null);
  if(url.pathname==="/auth/v1/user")return reply({},401);
  return reply([]);
 });
 await new Promise<void>(r=>identity.listen(0,"127.0.0.1",r));
 const identityPort=(identity.address() as {port:number}).port;
 const proxy=createHttps({key:readFileSync(process.env.COMMERCIAL_TLS_KEY!),cert:readFileSync(process.env.COMMERCIAL_TLS_CERT!)},(req,res)=>{
  const next=httpRequest({hostname:"127.0.0.1",port:3198,method:req.method,path:req.url,headers:req.headers},up=>{res.writeHead(up.statusCode!,up.headers);up.pipe(res);});
  next.on("error",()=>{res.writeHead(502);res.end();});req.pipe(next);
 });
 await new Promise<void>(r=>proxy.listen(3199,"0.0.0.0",r));
 const log=openSync(output+"-next.log","w");
 const next=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3198"],{
  cwd:process.cwd(),env:{...process.env,NODE_ENV:"production",NEXT_TELEMETRY_DISABLED:"1",TWIN_APP_MODE:"onlyfans",
   SUPABASE_URL:"http://127.0.0.1:"+identityPort,SUPABASE_SERVICE_KEY:"synthetic-service",
   DASHBOARD_PUBLIC_ORIGIN:base,DASHBOARD_SESSION_SECRET:"offline-fixture-secret",
   ONLYFANS_API_BASE_URL:backend,ONLYFANS_API_TOKEN:"synthetic-read",ONLYFANS_CONTENT_TOKEN:"synthetic-content",
   ONLYFANS_CONFIGURATION_TOKEN:"synthetic-configuration",ONLYFANS_CONTROL_TOKEN:"synthetic-control"},stdio:["ignore",log,log]});
 let browser:Awaited<ReturnType<typeof chromium.connectOverCDP>>|undefined;
 let page:Page|undefined;
 try{
  for(let n=0;n<120;n++){try{if((await fetch(base+"/api/onlyfans/accounts")).status===401)break;}catch{}
   if(n===119)throw Error("production Next did not start");await new Promise(r=>setTimeout(r,500));}
  browser=await chromium.connectOverCDP(process.env.BROWSER_CDP_URL!);
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
  await context.addCookies([{name:"allie_admin_session",value:token,url:base,secure:true,httpOnly:true,sameSite:"Lax"}]);
  page=await context.newPage();
  const errors:string[]=[];page.on("pageerror",e=>errors.push(String(e)));
  await page.route("**/*",route=>{const url=new URL(route.request().url());return url.origin===base||["data:","blob:"].includes(url.protocol)?route.continue():route.abort();});
  const info=await(await fetch(backend+"/fixture")).json() as Json;
  const account=info.account as string,fan=info.fan as number;
  const cfg="/api/onlyfans-configuration/accounts/"+account;
  const vault="/api/onlyfans-content/accounts/"+account+"/vault";
  await page.goto(base+"/api/onlyfans/accounts");
  const request=async(path:string,body?:unknown)=>page!.evaluate(async({path,body})=>{
   const response=await fetch(path,body===undefined?{cache:"no-store"}:{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
   return {status:response.status,body:await response.json()};
  },{path,body});
  const ok=async(path:string,body?:unknown)=>{const result=await request(path,body);assert.equal(result.status,200,JSON.stringify(result));return result.body as Json;};
  // Explicit fan permission precedes preparation. Initial runtime/policy are disabled.
  await ok("/api/onlyfans-controls/accounts/"+account+"/conversations/"+account+":"+fan,{action:"resume_automation",expectedRevision:0});
  const prep={action:"configure",expectedRevision:0,requestId:randomUUID(),reason:"Offline reviewed preparation",config:info.preparation};
  assert.equal((await request(cfg+"/preparation",{...prep,actor:"spoof"})).status,400);
  await ok(cfg+"/preparation",prep);
  await page.goto(base+"/onlyfans/content?account="+account);
  await page.locator("[data-history-preparation] summary").click();
  const spec={contract_version:"history-import.v1",start_date:"2016-01-01 00:00:00",webhooks:{reference:"offline reviewed subscription"},
   sources:Object.fromEntries(["vault_window","chats","transactions","chargebacks"].map(n=>[n,{requests:100,credits:200,min_interval_seconds:0}]))};
  const history=page.locator("[data-history-preparation]");
  await history.getByLabel("Reviewed history import limits").setInputFiles({name:"history.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(spec))});
  await history.getByRole("checkbox").check();await history.getByRole("button",{name:"Save reviewed history limits",exact:true}).click();
  await page.waitForFunction(async path=>(await(await fetch(path)).json()).coverage.configured,cfg+"/history-coverage");
  assert.equal((await fetch(backend+"/fixture/prepare",{method:"POST"})).status,200);
  const coverage=await ok(cfg+"/history-coverage");
  assert.equal(coverage.coverage.fans.complete,1);
  // Agency reviews the selected classification, description and manual category price.
  const folder=await ok(vault+"/manage/folders",{action:"create",name:"Beach",mediaIds:null,expectedFingerprint:null,requestId:randomUUID()});
  await ok(vault+"/manage/folders/"+folder.targetId,{action:"add",name:null,mediaIds:["31"],expectedFingerprint:folder.fingerprint,requestId:randomUUID()});
  const asset=(await ok(vault+"/manage/assets/31")).asset;
  await ok(vault+"/manage/assets/31",{patch:{description:"One beach photograph."},expectedFingerprint:asset.fingerprint,requestId:randomUUID()});
  const price=(await ok(vault+"/category-price/"+folder.targetId)).categoryPrice;
  await ok(vault+"/category-price/"+folder.targetId,{priceCents:1200,expectedFingerprint:price.fingerprint,requestId:randomUUID()});
  const reviewed=await ok(vault+"/category-review/"+folder.targetId+"?mediaIds=31");
  const products=await ok(vault+"/category-drafts",{requestId:randomUUID(),category:{folderId:Number(folder.targetId),priceCents:1200,
   categoryPriceRevision:1,classificationConfirmed:true,rightsConfirmed:true,reviewedState:reviewed.reviewedState,
   products:[{label:"Beach photo",description:"One beach photograph.",mediaIds:["31"],previewMediaIds:[]}]}});
  const itemId=String(products.items[0].itemId);
  const itemPath="/api/onlyfans-content/accounts/"+account+"/items/"+itemId+"?contract=v2";
  const item=(await ok(itemPath)).item;
  await ok(itemPath,{patch:{enabled:true},expectedRevision:item.revision,expectedFingerprint:item.fingerprint,acknowledgeOverride:true});
  // Real rendered terms controls authorize the optional discount, preserving standard price.
  await page.goto(base+"/onlyfans/content?account="+account);
  await page.getByRole("tab",{name:"Offers",exact:true}).click();
  const editor=page.locator('[data-of-content-editor="'+itemId+'"]');
  await editor.getByRole("button",{name:"Edit catalogue item",exact:true}).click();
  const terms=editor.locator("[data-commercial-terms]");
  await terms.getByLabel("Approved discount price").fill("9.00");
  await terms.getByRole("checkbox").check();await terms.getByRole("button",{name:"Approve these terms",exact:true}).click();
  await page.waitForFunction(async path=>(await(await fetch(path)).json()).terms.discountCents===900,cfg+"/catalogue-terms/"+itemId);
  const currentTerms=await ok(cfg+"/catalogue-terms/"+itemId);
  assert.equal((await request(cfg+"/catalogue-terms/"+itemId,{action:"withdraw",expectedRevision:0,requestId:randomUUID()})).status,409);
  assert.equal((await request("/api/onlyfans-configuration/accounts/no-such-account/catalogue-terms/"+itemId)).status,404);
  await page.screenshot({path:output+"-terms.png",fullPage:true});
  await fetch(backend+"/fixture/sync",{method:"POST"});
  const promotion=await(await fetch(backend+"/fixture/promotion")).json() as Json;
  await page.getByRole("tab",{name:"Vault",exact:true}).click();
  await page.locator("[data-commercial-scope] summary").click();
  const commercial=page.locator("[data-commercial-scope]");
  await commercial.getByLabel("Reviewed release configuration").setInputFiles({name:"release.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(promotion))});
  await commercial.getByRole("checkbox").check();await commercial.getByRole("button",{name:"Promote reviewed configuration",exact:true}).click();
  await page.waitForFunction(async path=>(await(await fetch(path)).json()).commercial.state==="commercial",cfg+"/commercial");
  assert.equal((await(await fetch(backend+"/fixture/state")).json()).grants,0);
  await page.goto(base+"/onlyfans/plan-c?account="+account);
  const pilot=page.locator("[data-pilot-lifecycle]");
  await pilot.getByLabel("Pilot action reason").fill("Reviewed offline normal autonomous journey");
  await pilot.getByRole("checkbox").check();
  await pilot.getByRole("button",{name:"Use autonomous authorization",exact:true}).click();
  const lifecycle="/api/onlyfans-controls/accounts/"+account+"/plan-c/scope";
  await page.waitForFunction(async path=>(await(await fetch(path)).json()).scope.mode==="autonomous",lifecycle);
  const before=await ok(lifecycle);
  await fetch(backend+"/fixture/sync",{method:"POST"});
  await pilot.getByRole("checkbox").check();await pilot.getByRole("button",{name:"Activate reviewed scope",exact:true}).click();
  await page.waitForFunction(async path=>(await(await fetch(path)).json()).scope.status==="active",lifecycle);
  assert.equal((await request(lifecycle,{action:"activate",expectedRevision:before.scope.revision-1,commandKey:"f".repeat(64),reason:"stale refused"})).status,409);
  await page.screenshot({path:output+"-active.png",fullPage:true});
  // Provider inbound stimuli; the actual autonomous worker creates all grants and cards.
  const say=async(text:string)=>await(await fetch(backend+"/fixture/fan-message",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text})})).json() as Json;
  let result=await say("where are you from?");assert.equal(result.posts.at(-1).text,"I am from Brisbane.");
  result=await say("show me a photo");assert.match(result.posts.at(-1).text,/Which particular/);assert.equal(result.grants,0);
  result=await say("show me the beach photo");assert.deepEqual(result.posts.at(-1).mediaFiles,["31"]);assert.equal(result.posts.at(-1).price,12);
  result=await(await fetch(backend+"/fixture/unlock",{method:"POST"})).json() as Json;assert.equal(result.access,1);
  result=await say("Thanks, how is your day?");assert.equal(result.posts.length,4);assert.equal(result.posts.filter((p:Json)=>p.mediaFiles?.length).length,1);
  const anonymous=await browser.newContext({ignoreHTTPSErrors:true}),anon=await anonymous.newPage();
  assert.equal((await anon.goto(base+lifecycle))?.status(),401);await anonymous.close();
  validSession=false;assert.notEqual((await request(lifecycle)).status,200);
  assert.equal((await(await fetch(backend+"/fixture/state")).json()).access,1);
  const evidence={status:"passed",journey:"browser/BFF/backend/Postgres/autonomous worker",identity:"synthetic revocable named-owner service",
   model:"scripted",provider:"mock transport",sourceOverlay:false,backendImage:process.env.QUALIFICATION_BACKEND_IMAGE,dashboardImage:process.env.QUALIFICATION_DASHBOARD_IMAGE,
   posts:result.posts.length,paidCards:1,access:1,consoleErrors:errors,termsRevision:currentTerms.terms.revision};
  writeFileSync(output+"-result.json",JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 }catch(error){
  if(page){writeFileSync(output+"-failed-page.txt",await page.locator("body").innerText().catch(()=>"unavailable"));await page.screenshot({path:output+"-failed.png",fullPage:true}).catch(()=>{});}
  throw error;
 }finally{
  await browser?.close();next.kill("SIGTERM");
  await new Promise<void>(r=>{if(next.exitCode!==null)r();else next.once("exit",()=>r());});
  closeSync(log);proxy.close();identity.close();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
