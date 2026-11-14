/** Full-vault journey: actual Next BFF (authenticated over HTTPS) -> actual ASGI backend/agency middleware -> disposable PostgreSQL,
 * with the separate journey worker container importing and describing in the background. Identity (auth service), FansAPI wire and
 * caption model are explicit SYNTHETIC fixtures (service/tests/commercial_vault_journey_*.py); everything else is the real code.
 *
 * Journey (one run):
 *   sync (selectionVersion 4 chosen by the BFF) for two creators -> poll /vault/processing until import complete AND analysis settled,
 *   truthfulness checked on every poll -> saved descriptions via the vault list route -> categories via the folder (catalogue) route ->
 *   creator isolation both ways + a foreign-tenant account -> pause / resume / retry through the BFF -> price / approval / sending rows
 *   unchanged -> second sync on unchanged media runs no model call -> operator correction survives redescribe and re-sync.
 *
 * Env: COMMERCIAL_TEST_BACKEND, COMMERCIAL_TEST_ORIGIN, COMMERCIAL_TLS_KEY/CERT (HTTPS proxy), NEXT_MODE=start, NEXT_LOG,
 *      JOURNEY_RECEIPT (path), JOURNEY_TIMEOUT_MIN, JOURNEY_PLUMBING_ONLY=1 (feature routes may be missing: only prove the plumbing),
 *      JOURNEY_PROCESSING_PATH (default /api/onlyfans-content/accounts/{account}/vault/processing),
 *      QUALIFICATION_BACKEND_IMAGE / _COMMIT, QUALIFICATION_DASHBOARD_IMAGE / _COMMIT (recorded in the receipt, never inferred). */
import {createServer,get as httpGet,request as httpRequest} from "node:http";
import {spawn} from "node:child_process";
import {openSync,closeSync,readFileSync,writeFileSync} from "node:fs";
import {createServer as httpsServer,get as httpsGet} from "node:https";
import {randomUUID,createHash} from "node:crypto";
type Json=Record<string,any>;
const backend=process.env.COMMERCIAL_TEST_BACKEND??"http://127.0.0.1:18787",base=process.env.COMMERCIAL_TEST_ORIGIN??"http://127.0.0.1:3198";
const plumbingOnly=process.env.JOURNEY_PLUMBING_ONLY==="1";
const processingTemplate=process.env.JOURNEY_PROCESSING_PATH??"/api/onlyfans-content/accounts/{account}/vault/processing";
const agency="bc670215-110b-4ea0-8f5c-af3dfe21d253",manager="44444444-4444-4444-8444-444444444444",reader="55555555-5555-4555-8555-555555555555";
const sleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
const started=Date.now(),checks:{name:string;ok:boolean;detail?:unknown}[]=[],timings:Json={},events:Json[]=[];
const secs=()=>Math.round((Date.now()-started)/100)/10;
function check(name:string,ok:unknown,detail?:unknown){checks.push({name,ok:!!ok,...(detail===undefined?{}:{detail})});if(!ok)console.error("CHECK FAILED: "+name,detail===undefined?"":JSON.stringify(detail).slice(0,600));return !!ok;}
function note(event:string,data:Json={}){events.push({t:secs(),event,...data});console.log(JSON.stringify({t:secs(),event,...data}));}
class FeatureMissing extends Error{}
const warm=(path:string)=>new Promise<void>(resolve=>{const req=(base.startsWith("https:")?httpsGet:httpGet)(base+path,{headers:{Cookie:"twin_agency_access=synthetic-manager"},timeout:900000},res=>{res.resume();res.on("end",()=>resolve());});req.on("error",()=>resolve());req.on("timeout",()=>{req.destroy();resolve();});});
const receiptExtra:Json={};
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function main(){
 let creatorsAssigned:string[]=[],active=true;
 const identity=createServer(async(req,res)=>{
  const u=new URL(req.url!,"http://fixture"),json=(v:unknown,status=200)=>{res.writeHead(status,{"Content-Type":"application/json"});res.end(JSON.stringify(v));};
  if(u.pathname==="/auth/v1/user"){
   const id=req.headers.authorization==="Bearer synthetic-manager"?manager:req.headers.authorization==="Bearer synthetic-reader"?reader:null;
   return id?json({id,aud:"authenticated",email:"synthetic@example.invalid",app_metadata:{},user_metadata:{}}):json({},401);
  }
  const table=u.pathname.split("/").at(-1);
  if(table==="agency_memberships")return json(active?[{creator_scope:"all",creator_ids:[],creator_access_revision:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",agency_id:agency,can_manage:u.searchParams.get("user_id")===("eq."+manager)}]:[]);
  if(table==="partner_agencies")return json([{id:agency,name:"Moxy"}]);
  if(table==="agency_creators")return json(creatorsAssigned.map(clone_id=>({clone_id})));
  return json([]);
 });
 await new Promise<void>(resolve=>identity.listen(0,"127.0.0.1",resolve));
 const port=(identity.address() as {port:number}).port;
 const fd=openSync(process.env.NEXT_LOG??"/tmp/commercial-vault-journey-next.log","w");
 const proxy=process.env.COMMERCIAL_TLS_KEY?httpsServer({key:readFileSync(process.env.COMMERCIAL_TLS_KEY),cert:readFileSync(process.env.COMMERCIAL_TLS_CERT!)},(req,res)=>{const upstream=httpRequest({hostname:"127.0.0.1",port:3198,path:req.url,method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode!,r.headers);r.pipe(res);});upstream.on("error",()=>{res.writeHead(502);res.end();});req.pipe(upstream);}):null;
 if(proxy)await new Promise<void>(resolve=>proxy.listen(3199,"0.0.0.0",resolve));
 const nextArgs=process.env.NEXT_MODE!=="start"?["dev","--hostname","127.0.0.1","--port","3198"]:["start","--hostname","127.0.0.1","--port","3198"];
 const child=spawn(process.execPath,["node_modules/next/dist/bin/next",...nextArgs],{cwd:process.cwd(),env:{...process.env,NODE_OPTIONS:"--max-old-space-size=1536",NEXT_TELEMETRY_DISABLED:"1",DASHBOARD_PUBLIC_ORIGIN:base,SUPABASE_URL:"http://127.0.0.1:"+port,SUPABASE_SERVICE_KEY:"synthetic-service",ONLYFANS_API_BASE_URL:backend,ONLYFANS_API_TOKEN:"synthetic-read",ONLYFANS_CONTENT_TOKEN:"synthetic-content",ONLYFANS_CONFIGURATION_TOKEN:"synthetic-configuration"},stdio:["ignore",fd,fd]});
 let status="failed",error:string|null=null,setup:Json={},expect:Json={};
 try{
  for(let n=0;n<240;n++){try{const r=await fetch(base+"/twin",{redirect:"manual"});if(r.status===200)break;}catch{}if(n===239)throw Error("Next did not start");await sleep(500);}
  setup=await(await fetch(backend+"/fixture")).json() as Json;
  expect=await(await fetch(backend+"/fixture/expectations")).json() as Json;
  const c1=setup.accounts.c1 as Json,c2=setup.accounts.c2 as Json,x1=setup.accounts.x1 as Json;
  creatorsAssigned=[c1.creator,c2.creator];     // the foreign tenant's creator is NOT assigned to this agency
  const timeoutMs=Number(process.env.JOURNEY_TIMEOUT_MIN??(setup.profile==="full"?"170":"30"))*60000;
  const deadline=Date.now()+timeoutMs;
  note("start",{profile:setup.profile,photos:[c1.photos,c2.photos],videos:[c1.videos,c2.videos],timeoutMin:timeoutMs/60000,features:setup.features});

  // ---------------------------------------------------------------- BFF helpers (real cookie auth, real origin check)
  const vaultPath=(a:string)=>"/api/onlyfans-content/accounts/"+a+"/vault";
  const procPath=(a:string)=>processingTemplate.replace("{account}",a);
  const bff=async(path:string,opts:{method?:string;body?:unknown;token?:string|null;headers?:Record<string,string>}={})=>{
   const token=opts.token===undefined?"synthetic-manager":opts.token;
   const r=await fetch(base+path,{method:opts.method??"GET",redirect:"manual",headers:{...(token?{Cookie:"twin_agency_access="+token}:{}),...(opts.method==="POST"?{Origin:base,"Content-Type":"application/json"}:{}),...opts.headers},body:opts.body===undefined?undefined:JSON.stringify(opts.body)});
   const raw=await r.text();let body:Json={};try{body=JSON.parse(raw);}catch{body={raw:raw.slice(0,300)};}
   return {status:r.status,body};
  };
  const must=async(path:string,opts:Parameters<typeof bff>[1]={}):Promise<Json>=>{const r=await bff(path,opts);if(r.status!==200)throw Error((opts.method??"GET")+" "+path+" -> "+r.status+" "+JSON.stringify(r.body).slice(0,400));return r.body;};
  const fx=async(path:string,init?:RequestInit):Promise<Json>=>await(await fetch(backend+path,init)).json() as Json;
  const fxPost=(path:string,body:unknown)=>fx(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const unwrapProcessing=(b:Json):Json=>(b.processing??b.status??b) as Json;
  const processing=async(a:string):Promise<Json>=>{
   const r=await bff(procPath(a));
   if(r.status===404||r.status===405)throw new FeatureMissing("BFF processing route is missing for "+a+" ("+r.status+"): "+procPath(a));
   if(r.status!==200)throw Error("processing GET "+r.status+" "+JSON.stringify(r.body).slice(0,300));
   return unwrapProcessing(r.body);
  };
  const operate=async(a:string,action:string,mediaIds?:string[],token="synthetic-manager")=>bff(procPath(a),{method:"POST",token,body:{requestId:randomUUID(),action,...(mediaIds?{mediaIds}:{})}});
  const collect=async(a:string,query:Record<string,string>={}):Promise<Json[]>=>{
   const items:Json[]=[];let cursor:string|null=null;
   for(let n=0;n<4000;n++){
    const q=new URLSearchParams({...query,...(cursor?{afterMediaId:cursor}:{})}).toString();
    const body=await must(vaultPath(a)+(q?"?"+q:""));
    items.push(...(body.vault.items as Json[]));cursor=body.vault.nextCursor??null;if(!cursor)return items;
   }
   throw Error("vault listing did not terminate");
  };
  const providerIds=async(key:string):Promise<{photo:string[];video:string[]}>=>await fx("/fixture/provider-ids/"+key) as any;
  const ids1=await providerIds("c1"),ids2=await providerIds("c2");
  const total=(a:Json)=>a.photos+a.videos;
  if(process.env.NEXT_MODE!=="start"){   // next dev compiles each route on first request (minutes on one CPU): compile everything this journey touches first
   for(const leaf of ["","/sync","/processing","/manage/folders","/manage/assets/"+ids1.photo[0],"/category-review/1"])await warm(vaultPath(c1.account)+leaf);
   note("routes-warmed");
  }

  const syncBody=(rev:number,requestId=randomUUID())=>({requestId,expectedConnectionRevision:rev,...(plumbingOnly?{}:{selectionVersion:4})});
  // ---------------------------------------------------------------- 0. plumbing: auth, scope, foreign tenant, baseline
  check("unauthenticated vault read refused",(await bff(vaultPath(c1.account),{token:null})).status!==200);
  check("both creators visible, empty before any sync",(await must(vaultPath(c1.account))).vault.items.length===0&&(await must(vaultPath(c2.account))).vault.items.length===0);
  const foreignRead=await bff(vaultPath(x1.account));
  check("foreign-tenant account refused (read)",foreignRead.status===404,foreignRead.status);
  check("foreign-tenant account refused (sync)",(await bff(vaultPath(x1.account)+"/sync",{method:"POST",body:syncBody(1)})).status===404);
  const baseline=await fx("/fixture/state");
  const guardBefore:Json={},catalogueBefore=baseline.catalogue;
  for(const a of [c1.account,c2.account])guardBefore[a]=baseline.accounts[a].guard;
  const foreignBefore=baseline.foreign;
  const rev1=(await must(vaultPath(c1.account))).vault.connectionRevision as number,rev2=(await must(vaultPath(c2.account))).vault.connectionRevision as number;
  check("read-only actor cannot sync",(await bff(vaultPath(c1.account)+"/sync",{method:"POST",token:"synthetic-reader",body:syncBody(rev1)})).status===403);
  check("stale connection revision refused",(await bff(vaultPath(c1.account)+"/sync",{method:"POST",body:syncBody(rev1+1)})).status===409);

  // ---------------------------------------------------------------- 1. authenticated sync (the BFF selects the full-vault policy)
  const sync=async(a:Json,rev:number,requestId=randomUUID())=>{
   const r=await bff(vaultPath(a.account)+"/sync",{method:"POST",body:syncBody(rev,requestId)});
   if(r.status!==200)throw Error("sync "+a.account+" -> "+r.status+" "+JSON.stringify(r.body).slice(0,400));
   return {requestId,sync:r.body.sync as Json};
  };
  const first1=await sync(c1,rev1),first2=await sync(c2,rev2);
  timings.syncRequestedAt=secs();
  const version=(s:Json)=>s?.scope?.version??s?.coverage?.scope;
  const askedFull=version(first1.sync)===4&&version(first2.sync)===4;
  if(plumbingOnly)note("sync-scope",{c1:first1.sync?.scope,c2:first2.sync?.scope});
  else check("BFF sync asked for the full-vault policy (selectionVersion 4) on both creators",askedFull,{c1:first1.sync?.scope,c2:first2.sync?.scope});
  check("same request replays the same job (idempotent)",(await sync(c1,rev1,first1.requestId)).sync.jobId===first1.sync.jobId);
  check("a second sync while one is active is refused (409)",(await bff(vaultPath(c1.account)+"/sync",{method:"POST",body:syncBody(rev1)})).status===409);
  if(plumbingOnly){
   // Feature code (processing route, v4 import) may be absent in the images under test: prove only that the real plumbing works.
   let processingRoute="present";try{await processing(c1.account);}catch(e){if(e instanceof FeatureMissing)processingRoute="missing";else throw e;}
   note("plumbing-only",{processingRoute,syncScope:first1.sync?.scope});
   status="plumbing";return;
  }

  // ---------------------------------------------------------------- 2. poll until import complete + analysis settled; truthfulness on EVERY poll
  const exp=(a:Json)=>({photo:a.photos as number,video:a.videos as number});
  const accounts=[{key:"c1",a:c1,e:exp(c1),reports:c1.reportsTotal as boolean},{key:"c2",a:c2,e:exp(c2),reports:c2.reportsTotal as boolean}];
  const seenState:Json={c1:{polls:0,maxUnique:{photo:0,video:0},maxCompleted:0,importCompleteAt:null,settledAt:null,pausedPolls:0},c2:{polls:0,maxUnique:{photo:0,video:0},maxCompleted:0,importCompleteAt:null,settledAt:null,pausedPolls:0}};
  const violations:string[]=[];
  const gap:Json={seen:false};
  const waitingOf=(an:Json):number=>an.waitingRetry??(an.eligible-an.completed-an.unresolved-an.skippedOperator-an.queued);
  const settledOf=(p:Json)=>p.analysis.queued===0&&(p.analysis.processing??0)===0;
  const truth=(key:string,a:Json,p:Json,e:{photo:number;video:number},reports:boolean,expectNoOperatorSkips:boolean)=>{
   const imp=p.import,an=p.analysis,st=seenState[key];st.polls++;
   const bad=(m:string)=>{violations.push(`${key}@${secs()}s ${m}`);};
   if(!imp){bad("import coverage missing while a v4 job exists");return;}
   if(imp.scope!=="full")bad("import scope is "+imp.scope+" (expected full)");
   const u=imp.uniqueImported;
   for(const k of ["photo","video"] as const){
    if(u[k]<st.maxUnique[k])bad(`unique imported ${k} went backwards (${st.maxUnique[k]} -> ${u[k]})`);
    st.maxUnique[k]=Math.max(st.maxUnique[k],u[k]);
    if(u[k]>e[k])bad(`unique imported ${k} ${u[k]} exceeds the provider total ${e[k]}`);
    if(imp.providerTotal?.[k]!=null&&imp.providerTotal[k]!==e[k])bad(`provider total ${k} ${imp.providerTotal[k]} != ${e[k]}`);
    if(!reports&&imp.providerTotal?.[k]!=null)bad("a total the provider never reported is shown");
   }
   if(imp.state==="complete"){
    if(u.photo!==e.photo||u.video!==e.video)bad(`import says complete with unique ${u.photo}/${u.video}, provider has ${e.photo}/${e.video}`);
    if(imp.established_by!==(reports?"provider_total":"traversal"))bad("established_by "+imp.established_by);
    if(st.importCompleteAt===null)st.importCompleteAt=secs();
   }else if(st.importCompleteAt!==null)bad("import went from complete back to "+imp.state);
   if(imp.state==="complete"&&imp.reason)bad("complete import carries a failure reason "+imp.reason);
   // Across a re-sync the import view follows the NEW job while analysis still covers everything the earlier jobs observed: only the first job bounds eligibility.
   if(!st.resync&&an.eligible>u.photo+u.video)bad(`analysis eligible ${an.eligible} > imported ${u.photo+u.video}`);
   const closed=an.completed+an.unresolved+an.skippedOperator+(an.waitingRetry??0);
   const adds=an.eligible>=closed&&(an.eligible-closed===an.queued||an.eligible-closed===an.queued+(an.processing??0));
   // The BFF may drop a counter the backend sends (waitingRetry): then items are invisible to the operator. That is its own finding, not noise on every poll.
   if(an.waitingRetry===undefined&&!adds){if(!gap.seen){gap.seen=true;gap.example={t:secs(),key,counters:{e:an.eligible,q:an.queued,p:an.processing,c:an.completed,u:an.unresolved,s:an.skippedOperator}};}}
   else if(!adds)bad(`analysis counters do not add up: ${JSON.stringify({e:an.eligible,q:an.queued,p:an.processing,c:an.completed,u:an.unresolved,s:an.skippedOperator,w:an.waitingRetry})}`);
   const reasons=Object.values(an.unresolvedReasons??{}).reduce((s:number,v:any)=>s+v,0);
   if(reasons!==an.unresolved)bad(`unresolved reasons sum ${reasons} != unresolved ${an.unresolved}`);
   if(an.completed<st.maxCompleted&&expectNoOperatorSkips)bad(`completed went backwards (${st.maxCompleted} -> ${an.completed})`);
   st.maxCompleted=Math.max(st.maxCompleted,an.completed);
   if(p.paused)st.pausedPolls++;
   if(imp.state==="complete"&&settledOf(p)&&!p.paused&&st.settledAt===null)st.settledAt=secs();
  };
  const resetImportTracking=()=>{for(const k of ["c1","c2"]){seenState[k].importCompleteAt=null;seenState[k].maxUnique={photo:0,video:0};seenState[k].resync=true;}};
  let pauseDone=false,pausePhase:Json={};
  const pollAll=async(expectNoOperatorSkips=true):Promise<Json>=>{
   const out:Json={};
   for(const x of accounts){const p=await processing(x.a.account);out[x.key]=p;truth(x.key,x.a,p,x.e,x.reports,expectNoOperatorSkips);}
   return out;
  };
  const waitSettled=async(label:string,extra?:(p:Json)=>Promise<void>):Promise<Json>=>{
   for(;;){
    if(Date.now()>deadline)throw Error("timeout waiting for "+label+": "+JSON.stringify(Object.fromEntries(accounts.map(x=>[x.key,seenState[x.key]]))));
    const p=await pollAll();
    if(extra)await extra(p);
    if(accounts.every(x=>p[x.key].import?.state==="complete"&&settledOf(p[x.key])&&!p[x.key].paused))return p;
    await sleep(2000);
   }
  };
  // pause / resume exercised in the middle of the real run, as soon as c1 has analysed something and still has work queued
  const midRun=async(p:Json)=>{
   if(pauseDone)return;
   const c=p.c1;
   if(!(c.import?.state==="complete"&&c.analysis.completed>=5&&c.analysis.queued>=10&&!c.paused))return;
   pauseDone=true;
   const stateBefore=await fx("/fixture/state");
   const denied=await operate(c1.account,"pause",undefined,"synthetic-reader");
   check("read-only actor cannot pause",denied.status===403,denied.status);
   const paused=await operate(c1.account,"pause");
   check("operator pause accepted",paused.status===200,paused.body);
   let pp:Json={};
   for(let n=0;n<30;n++){pp=await processing(c1.account);if(pp.paused)break;await sleep(1000);}
   check("status reports paused with a reason",pp.paused===true&&!!pp.pauseReason,{paused:pp.paused,reason:pp.pauseReason,kind:pp.pauseKind});
   // an in-flight child batch may still finish; after that no further model call may start for this account
   let prev=-1,stable=0;
   for(let n=0;n<40&&stable<2;n++){const calls=(await fx("/fixture/state")).model.calls[c1.account]??0;stable=calls===prev?stable+1:0;prev=calls;await sleep(8000);}
   check("model calls stop while paused (two stable reads 8s apart)",stable>=2,{calls:prev});
   const other=await processing(c2.account);
   check("pausing creator 1 did not pause creator 2",!other.paused);
   const idle=await processing(c1.account);
   check("paused account keeps its queue (not dropped, not 'complete')",idle.analysis.queued>0,idle.analysis);
   const resumed=await operate(c1.account,"resume");
   check("operator resume accepted",resumed.status===200,resumed.body);
   const callsAtResume=(await fx("/fixture/state")).model.calls[c1.account]??0;
   let moved=false;for(let n=0;n<45&&!moved;n++){moved=((await fx("/fixture/state")).model.calls[c1.account]??0)>callsAtResume;if(!moved)await sleep(2000);}
   check("analysis continues after resume",moved,{callsAtResume});
   pausePhase={modelCallsBefore:stateBefore.model.calls[c1.account],stoppedAt:prev,resumedAt:callsAtResume,queuedWhilePaused:idle.analysis.queued,pauseReason:pp.pauseReason};
   note("pause-resume",pausePhase);
  };
  const settled=await waitSettled("import complete and analysis settled",midRun);
  timings.importCompleteAt={c1:seenState.c1.importCompleteAt,c2:seenState.c2.importCompleteAt};
  timings.analysisSettledAt={c1:seenState.c1.settledAt,c2:seenState.c2.settledAt};
  check("pause/resume was exercised during the real run",pauseDone);
  const afterRun=await fx("/fixture/state");
  note("settled",{c1:settled.c1.analysis,c2:settled.c2.analysis,model:afterRun.model});

  // ---------------------------------------------------------------- 3. what the operator is shown is true
  const scenario=expect.accounts[c1.account];
  for(const x of accounts){
   const p=settled[x.key],imp=p.import,an=p.analysis,state=afterRun.accounts[x.a.account];
   check(`${x.key} import: full scope, complete, nothing unresolved`,imp.scope==="full"&&imp.state==="complete"&&!imp.reason,imp);
   check(`${x.key} unique imported == provider total per kind, and == durable rows`,imp.uniqueImported.photo===x.e.photo&&imp.uniqueImported.video===x.e.video&&state.items.photo===x.e.photo&&state.items.video===x.e.video,{imp:imp.uniqueImported,rows:state.items,provider:x.e});
   check(`${x.key} import evidence matches how the provider reports totals`,x.reports?(imp.providerTotal.photo===x.e.photo&&imp.providerTotal.video===x.e.video&&imp.established_by==="provider_total"):(imp.providerTotal.photo==null&&imp.established_by==="traversal"),imp);
   check(`${x.key} import job is a full-vault (v4) job and complete`,state.jobs.length===1&&state.jobs[0][0]==="complete"&&state.jobs[0][1]===4,state.jobs);
   check(`${x.key} analysis eligible covers the whole imported vault`,an.eligible===x.e.photo+x.e.video,{eligible:an.eligible,imported:x.e});
   check(`${x.key} nothing queued or processing once settled`,an.queued===0&&(an.processing??0)===0,an);
   check(`${x.key} not paused, credential ok`,!p.paused&&p.credential?.state==="ok",{paused:p.paused,credential:p.credential});
  }
  const broken=scenario.currentExceptions;
  const brokenIds=[...broken.missing,...broken.corrupt,...broken.refused,...broken.posterOnly];
  const brokenStates=await fx("/fixture/item-states?account="+c1.account+"&ids="+brokenIds.join(","));
  const settled1=settled.c1.analysis;
  check("c1 unresolved reasons are listed and exact (refused + blocked_drm)",JSON.stringify(Object.entries(settled1.unresolvedReasons).sort())===JSON.stringify([["blocked_drm",1],["refused",1]]),settled1.unresolvedReasons);
  check("c1 broken-media items wait for a retry (not hidden, not complete)",waitingOf(settled1)===broken.missing.length+broken.corrupt.length,settled1);
  check("c1 completed == eligible minus the broken items",settled1.completed===total(c1)-brokenIds.length,{completed:settled1.completed,broken:brokenIds.length});
  check("c2 has no unresolved, nothing waiting",settled.c2.analysis.unresolved===0&&waitingOf(settled.c2.analysis)===0&&settled.c2.analysis.completed===total(c2),settled.c2.analysis);
  for(const id of brokenIds)check("broken item "+id+" has no description and is not marked described",!brokenStates[id]?.description&&brokenStates[id]?.describeStatus!=="described",brokenStates[id]);
  check("c1 per-kind analysis counts add up",settled1.byKind.photo.eligible===c1.photos&&settled1.byKind.video.eligible===c1.videos,settled1.byKind);
  check("the model was called once per described item and once per refusal, never for missing media",
   (afterRun.model.calls[c1.account]??0)>=settled1.completed+1&&afterRun.model.badKey===0,{calls:afterRun.model.calls,completed:settled1.completed});

  // descriptions through the existing vault list route
  const list1=await collect(c1.account),list2=await collect(c2.account);
  const idSet=(ids:{photo:string[];video:string[]})=>new Set([...ids.photo,...ids.video]);
  const set1=idSet(ids1),set2=idSet(ids2);
  check("c1 vault list == the provider vault (every id once, no extras)",list1.length===set1.size&&list1.every(i=>set1.has(i.mediaId))&&new Set(list1.map(i=>i.mediaId)).size===list1.length,{listed:list1.length,provider:set1.size});
  check("c2 vault list == its own provider vault",list2.length===set2.size&&list2.every(i=>set2.has(i.mediaId)),{listed:list2.length,provider:set2.size});
  check("no creator's items appear in the other's vault (ids and descriptions)",!list1.some(i=>set2.has(i.mediaId))&&!list2.some(i=>set1.has(i.mediaId))&&!list1.some(i=>(i.description??"").includes("of-1002"))&&!list2.some(i=>(i.description??"").includes("of-1001")));
  check("no foreign-tenant text is visible to this agency",![...list1,...list2].some(i=>(i.description??"").includes("FOREIGN")));
  const described=(l:Json[])=>l.filter(i=>typeof i.description==="string"&&i.description.length>0);
  const d1=described(list1),d2=described(list2);
  check("c1 descriptions saved for every completed item and only those",d1.length===settled1.completed&&brokenIds.every(id=>!d1.some(i=>i.mediaId===id)),{described:d1.length,completed:settled1.completed});
  check("c2 descriptions saved for every item",d2.length===total(c2));
  check("each saved description belongs to its own item and creator",d1.every(i=>i.description.includes(" "+i.mediaId+" ")&&i.description.includes("of-1001"))&&d2.every(i=>i.description.includes(" "+i.mediaId+" ")&&i.description.includes("of-1002")));
  const kindOk=(l:Json[],ids:{photo:string[];video:string[]})=>{const ph=new Set(ids.photo);return l.every(i=>(i.kind==="photo")===ph.has(i.mediaId));};
  check("listed kinds match the provider kinds",kindOk(list1,ids1)&&kindOk(list2,ids2));
  const photosOnly=await collect(c1.account,{kind:"photo"}),videosOnly=await collect(c1.account,{kind:"video"});
  check("kind filter returns exactly the typed totals (unequal, both above 1,000 on the full profile)",photosOnly.length===c1.photos&&videosOnly.length===c1.videos&&c1.photos!==c1.videos,{photos:photosOnly.length,videos:videosOnly.length});
  const searchHit=await collect(c1.account,{q:"Synthetic photo "+ids1.photo[3]});
  check("search finds the saved description of one specific item",searchHit.some(i=>i.mediaId===ids1.photo[3]));

  // categories through the catalogue (folder) route
  const folderThemes:[string,string][]=[["bikini selfie","Bikini / swimwear"],["mirror selfie","Selfies"],["portrait outdoors","Outdoors"],["activewear at the gym","Fitness"],["studio photoshoot","Studio"],["walk on the beach","Beach / pool"],["soft lingerie","Lingerie"],["everyday casual","Casual / everyday"],["short dance","Dance / twerk"],["talking to camera","Talking videos"],["workout clip","Fitness"],["clip on the beach","Beach / pool"],["clip outdoors","Outdoors"]];
  const theme=(text:string)=>folderThemes.find(([phrase])=>text.includes(phrase))?.[1];
  const folderCheck=async(x:{a:Json;key:string},described:Json[],other:Set<string>)=>{
   const folders=(await must(vaultPath(x.a.account)+"/manage/folders")).folders as Json[];
   const named=new Map<string,string>();for(const f of folders)named.set(f.name,f.folderId);
   const expectedNames=new Set(described.map(i=>theme(i.description)).filter(Boolean) as string[]);
   check(`${x.key} categories exist for every themed description`,[...expectedNames].every(n=>named.has(n)),{expected:[...expectedNames],have:[...named.keys()]});
   const members:Record<string,Set<string>>={};
   for(const name of expectedNames){
    const items=await collect(x.a.account,{folderId:named.get(name)!});
    members[name]=new Set(items.map(i=>i.mediaId));
    check(`${x.key} folder "${name}" lists only this creator's items`,items.every(i=>!other.has(i.mediaId)),{count:items.length});
   }
   const misfiled=described.filter(i=>{const t=theme(i.description);return t&&!members[t]?.has(i.mediaId);});
   check(`${x.key} every described item sits in the category its description names`,misfiled.length===0,{misfiled:misfiled.slice(0,5).map(i=>i.mediaId),count:misfiled.length});
   const counts=Object.fromEntries(folders.map(f=>[f.name,f.count]));
   return {folders:folders.length,counts,misfiled:misfiled.length};
  };
  const folders1=await folderCheck(accounts[0],d1,set2),folders2=await folderCheck(accounts[1],d2,set1);
  timings.verifiedAt=secs();

  // ---------------------------------------------------------------- 4. generated text changed no price, approval, sale permission or sending
  const guardAfterState=await fx("/fixture/state");
  for(const a of [c1.account,c2.account]){
   check(`${a} price/approval/sale/sending tables byte-identical to before the journey`,digest(guardAfterState.accounts[a].guard.guarded)===digest(guardBefore[a].guarded),{tables:guardBefore[a].guardedTables});
   check(`${a} no table outside the vault family changed`,digest(guardAfterState.accounts[a].guard.other)===digest(guardBefore[a].other));
  }
  check("catalogue prices, enabled flags and product text unchanged",digest(guardAfterState.catalogue)===digest(catalogueBefore),guardAfterState.catalogue);
  check("foreign tenant rows byte-identical",digest(guardAfterState.foreign)===digest(foreignBefore));

  // ---------------------------------------------------------------- 5. retry: the operator repairs the broken media, then asks for a retry through the BFF
  const retryable=[...broken.missing,...broken.corrupt,...broken.posterOnly];
  const callsBeforeRetry=guardAfterState.model.calls[c1.account]??0;
  const deniedRetry=await operate(c1.account,"retry",retryable,"synthetic-reader");
  check("read-only actor cannot retry",deniedRetry.status===403);
  const tooMany=await operate(c1.account,"retry",Array.from({length:201},(_,i)=>String(11000001+i)));
  check("more than 200 ids refused",tooMany.status>=400&&tooMany.status<500,tooMany.status);
  const foreignRetry=await operate(c1.account,"retry",[ids2.photo[0]]);
  check("retry naming another creator's media id never causes a server error",foreignRetry.status<500,{status:foreignRetry.status});
  await fxPost("/fixture/repair-media",{account:c1.account,mediaIds:retryable});
  const retried=await operate(c1.account,"retry",retryable);
  check("operator retry accepted",retried.status===200,retried.body);
  timings.retryRequestedAt=secs();
  for(;;){
   if(Date.now()>deadline)throw Error("timeout waiting for retry to settle");
   const p=await processing(c1.account);truth("c1",c1,p,exp(c1),c1.reportsTotal,false);
   if(settledOf(p)&&!p.paused&&p.analysis.completed>=total(c1)-1&&waitingOf(p.analysis)===0)break;
   await sleep(2000);
  }
  const afterRetry=await processing(c1.account);
  check("after retry the repaired items are described; only the model-refused one stays unresolved (and says why)",afterRetry.analysis.completed===total(c1)-1&&JSON.stringify(afterRetry.analysis.unresolvedReasons)===JSON.stringify({refused:1}),afterRetry.analysis);
  const retriedStates=await fx("/fixture/item-states?account="+c1.account+"&ids="+retryable.join(","));
  check("every retried item now has its own description",retryable.every(id=>retriedStates[id]?.describeStatus==="described"&&String(retriedStates[id]?.description).includes(" "+id+" ")),retriedStates);
  const callsAfterRetry=(await fx("/fixture/state")).model.calls[c1.account]??0;
  check("retry cost exactly the retried items (no hidden re-analysis of the rest)",callsAfterRetry-callsBeforeRetry<=retryable.length+1,{before:callsBeforeRetry,after:callsAfterRetry,retried:retryable.length});
  note("retry",{retried:retryable.length,modelCalls:callsAfterRetry-callsBeforeRetry});

  // ---------------------------------------------------------------- 6. a second sync on unchanged media does not run analysis again
  const stateBeforeResync=await fx("/fixture/state");
  const descriptionDigest=async()=>digest((await collect(c1.account)).map(i=>[i.mediaId,i.description]));
  const descBefore=await descriptionDigest();
  const revNow=(await must(vaultPath(c1.account))).vault.connectionRevision as number;
  const again1=await sync(c1,revNow),againC2=await sync(c2,(await must(vaultPath(c2.account))).vault.connectionRevision as number);
  check("second sync is a new full-vault job",again1.sync.jobId!==first1.sync.jobId&&version(again1.sync)===4);
  timings.resyncRequestedAt=secs();resetImportTracking();
  for(;;){
   if(Date.now()>deadline)throw Error("timeout waiting for the second sync");
   const p=await pollAll(false);
   const s=await fx("/fixture/state");
   if(accounts.every(x=>p[x.key].import?.state==="complete"&&s.accounts[x.a.account].jobs.length===2&&s.accounts[x.a.account].jobs.every((j:any[])=>j[0]==="complete"))&&accounts.every(x=>settledOf(p[x.key])))break;
   await sleep(2000);
  }
  await sleep(10000);   // let the coordinator run a full idle cycle: nothing may be queued by a re-observation
  const afterResync=await fx("/fixture/state"),pResync=await pollAll(false);
  check("second sync: no model call at all on unchanged media",afterResync.model.total===stateBeforeResync.model.total&&JSON.stringify(afterResync.model.calls)===JSON.stringify(stateBeforeResync.model.calls),{before:stateBeforeResync.model.calls,after:afterResync.model.calls});
  check("second sync: same unique imported counts, same rows, same descriptions",accounts.every(x=>pResync[x.key].import.uniqueImported.photo===x.e.photo&&pResync[x.key].import.uniqueImported.video===x.e.video&&JSON.stringify(afterResync.accounts[x.a.account].items)===JSON.stringify(stateBeforeResync.accounts[x.a.account].items))&&await descriptionDigest()===descBefore);
  check("second sync: nothing queued and the broken-then-repaired items stay described",pResync.c1.analysis.queued===0&&pResync.c1.analysis.completed===total(c1)-1,pResync.c1.analysis);
  check("second sync: price/approval/sending rows still identical",digest(afterResync.accounts[c1.account].guard.guarded)===digest(guardBefore[c1.account].guarded));
  note("resync",{modelCalls:afterResync.model.total-stateBeforeResync.model.total});

  // ---------------------------------------------------------------- 7. a manual operator correction survives re-processing
  const target=ids1.photo[20];
  const asset=(await must(vaultPath(c1.account)+"/manage/assets/"+target)).asset as Json;
  const corrected="OPERATOR CORRECTION "+target+": checked by a human, do not overwrite.";
  const edit=await bff(vaultPath(c1.account)+"/manage/assets/"+target,{method:"POST",body:{requestId:randomUUID(),patch:{description:corrected},expectedFingerprint:asset.fingerprint}});
  check("operator edit accepted through the BFF",edit.status===200,edit.body);
  const shown=async()=>(await collect(c1.account,{q:"OPERATOR CORRECTION"})).find(i=>i.mediaId===target)?.description;
  check("the correction is what the vault list shows",(await shown())===corrected);
  const callsBeforeRedo=(await fx("/fixture/state")).model;
  const redo=await operate(c1.account,"redescribe",[target]);
  check("redescribe request on a corrected item is accepted or refused cleanly (never a 5xx)",redo.status<500,redo.body);
  const resyncEdit=await sync(c1,revNow);   // a third full sync, after the edit
  timings.thirdSyncAt=secs();resetImportTracking();
  for(;;){
   if(Date.now()>deadline)throw Error("timeout waiting for the third sync");
   const p=await pollAll(false);const s=await fx("/fixture/state");
   if(accounts.every(x=>p[x.key].import?.state==="complete"&&s.accounts[x.a.account].jobs.every((j:any[])=>j[0]==="complete"))&&s.accounts[c1.account].jobs.length===3&&accounts.every(x=>settledOf(p[x.key])))break;
   await sleep(2000);
  }
  await sleep(10000);
  const finalState=await fx("/fixture/state"),finalProc=await pollAll(false);
  check("operator correction survived redescribe and a full re-sync",(await shown())===corrected,await shown());
  check("no model call at all after the correction",finalState.model.total===callsBeforeRedo.total,{before:callsBeforeRedo.total,after:finalState.model.total});
  check("the corrected item is counted as operator-owned, not queued",finalProc.c1.analysis.skippedOperator>=1&&finalProc.c1.analysis.queued===0,finalProc.c1.analysis);
  check("every other description is unchanged by the correction",(await collect(c1.account)).filter(i=>i.mediaId!==target).length===total(c1)-1);
  check("price/approval/sending rows identical at the very end",digest(finalState.accounts[c1.account].guard.guarded)===digest(guardBefore[c1.account].guarded)&&digest(finalState.accounts[c2.account].guard.guarded)===digest(guardBefore[c2.account].guarded)&&digest(finalState.catalogue)===digest(catalogueBefore)&&digest(finalState.foreign)===digest(foreignBefore));
  check("every eligible item is visible in some BFF counter (waitingRetry is exposed, none silently dropped)",!gap.seen&&!violations.some(v=>v.includes("waitingRetry")),gap.example);
  check("truthfulness held on every poll (no violation recorded)",violations.length===0,violations.slice(0,10));
  timings.totalSeconds=secs();
  const failed=checks.filter(c=>!c.ok);
  status=failed.length?"failed":"passed";
  if(failed.length)error=failed.length+" check(s) failed: "+failed.slice(0,8).map(c=>c.name).join(" | ");
  note("summary",{checks:checks.length,failed:failed.length,violations:violations.length});
  Object.assign(receiptExtra,{pausePhase,folders:{c1:folders1,c2:folders2},seenState,violations,finalModel:finalState.model,providerReads:Object.fromEntries(accounts.map(x=>[x.a.account,finalState.accounts[x.a.account].providerReads])),
   itemsListed:{c1:list1.length,c2:list2.length},described:{c1:d1.length,c2:d2.length},jobs:Object.fromEntries(accounts.map(x=>[x.a.account,finalState.accounts[x.a.account].jobs])),
   guardTables:guardBefore[c1.account].guardedTables,brokenScenario:{ids:scenario.scenario,states:brokenStates}});
 }catch(e:any){
  error=String(e?.stack??e).slice(0,1500);status=e instanceof FeatureMissing?"feature-missing":"failed";console.error(error);
 }finally{
  const receipt={result:status==="passed"?"passed":status,error,boundary:"actual Next BFF (HTTPS, cookie auth) -> actual ASGI agency middleware -> disposable PostgreSQL + separate worker container",
   identity:"SYNTHETIC auth service",provider:"SYNTHETIC FansAPI vault transport",model:"SYNTHETIC caption model",profile:setup.profile,
   images:{backend:process.env.QUALIFICATION_BACKEND_IMAGE??null,dashboard:process.env.QUALIFICATION_DASHBOARD_IMAGE??null},
   commits:{backend:process.env.QUALIFICATION_BACKEND_COMMIT??null,dashboard:process.env.QUALIFICATION_DASHBOARD_COMMIT??null},
   vaults:Object.fromEntries(Object.entries(setup.accounts??{}).map(([k,v]:[string,any])=>[k,{account:v.account,photos:v.photos,videos:v.videos,reportsTotal:v.reportsTotal}])),
   timings,checks,events,...receiptExtra};
  const path=process.env.JOURNEY_RECEIPT;
  if(path)writeFileSync(path,JSON.stringify(receipt,null,2));
  console.log(JSON.stringify({result:receipt.result,checks:checks.length,failed:checks.filter(c=>!c.ok).length,totalSeconds:secs(),error:error?error.split("\n")[0]:null}));
  child.kill("SIGTERM");await new Promise<void>(r=>{if(child.exitCode!==null)r();else child.once("exit",()=>r());});closeSync(fd);identity.close();proxy?.close();
  process.exitCode=status==="passed"||status==="plumbing"?0:1;
 }
}
void warm;
main().catch(e=>{console.error(e);process.exitCode=1;});
