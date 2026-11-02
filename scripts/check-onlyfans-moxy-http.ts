/** Real Next configuration routes with loopback session and backend fixtures. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdirSync,openSync,closeSync } from 'node:fs';
async function main(){
 const agency='bc670215-110b-4ea0-8f5c-af3dfe21d253',creator='11111111-1111-4111-8111-111111111111',manager='22222222-2222-4222-8222-222222222222',reader='33333333-3333-4333-8333-333333333333';
 let active=true,stale=false,malformed=false,conflict=false,writes=0;
 const fixture=createServer(async(req,res)=>{
  const url=new URL(req.url!,'http://127.0.0.1');
  const json=(v:unknown,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(v))};
  if(url.pathname==='/auth/v1/user'){
   const id=req.headers.authorization==='Bearer fixture-manager'?manager:req.headers.authorization==='Bearer fixture-reader'?reader:null;
   return id?json({id,aud:'authenticated',email:'fixture@example.invalid',app_metadata:{},user_metadata:{}}):json({},401);
  }
  if(url.pathname.startsWith('/rest/v1/')){
   const table=url.pathname.split('/').at(-1);
   if(table==='agency_memberships')return json(active?[{creator_scope:'all',creator_ids:[],creator_access_revision:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',agency_id:agency,can_manage:url.searchParams.get('user_id')===`eq.${manager}`}]:[]);
   if(table==='partner_agencies')return json([{id:agency,name:'Fixture agency'}]);
   if(table==='agency_creators')return json([{clone_id:creator}]);
   return json([]);
  }
  if(url.pathname.startsWith('/onlyfans/')){
   assert(url.pathname.startsWith('/onlyfans/agency/v1/'));
   const scope=JSON.parse(String(req.headers['x-onlyfans-agency-scope']));assert.deepEqual(scope.creatorIds,[creator]);
   assert.equal(scope.canChat,false);
   if(!stale)res.setHeader('X-OnlyFans-Access-Version','of-agency.v2');
   if(url.pathname.endsWith('/status'))return json({ok:true});
   if(url.pathname.includes('fixture-b'))return json({ok:false,error:'Unavailable'},404);
   assert(url.pathname.endsWith('/configuration/v1/accounts/fixture-a/moxy'));
   assert.equal(req.headers.authorization,'Bearer fixture-config');
   if(req.method==='PUT'){
    writes++;const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const body=JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(body.actor,`agency-user:${agency}:${manager}`);assert.equal(scope.canManage,true);
    if(conflict)return json({ok:false,error:'moxy_revision_conflict'},409);
    return json({ok:true,schemaVersion:'of-configuration.v3',accountId:malformed?'fixture-b':'fixture-a',moxy:{mode:body.mode,revision:body.expectedRevision+1,readiness:{ready:false,blockers:['fixture_missing_inventory']}}});
   }
   return json({ok:true,schemaVersion:'of-configuration.v3',accountId:'fixture-a',moxy:{engine:'moxy',moxySelected:true,mode:'off',revision:1,
    settings:{creator_key:'fixture'},readiness:{ready:false,blockers:['fixture_missing_inventory']},decisions:[]}});
  }
  json({},404);
 });
 await new Promise<void>(r=>fixture.listen(0,'127.0.0.1',r));
 const port=(fixture.address() as {port:number}).port,base='http://127.0.0.1:3197';
 mkdirSync('artifacts/moxy-http',{recursive:true});const log=openSync('artifacts/moxy-http/next.log','w');
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3197'],{env:{...process.env,
  NEXT_TELEMETRY_DISABLED:'1',DASHBOARD_PUBLIC_ORIGIN:base,SUPABASE_URL:`http://127.0.0.1:${port}`,SUPABASE_SERVICE_KEY:'fixture-service-key',
  ONLYFANS_API_BASE_URL:`http://127.0.0.1:${port}`,ONLYFANS_API_TOKEN:'fixture-read',ONLYFANS_CONTROL_TOKEN:'fixture-control',ONLYFANS_CONTENT_TOKEN:'fixture-content',ONLYFANS_CONFIGURATION_TOKEN:'fixture-config'},stdio:['ignore',log,log]});
 try{
  const endpoint='/api/onlyfans-configuration/accounts/fixture-a/moxy';
  for(let i=0;i<120;i++){try{if((await fetch(base+endpoint)).status===401)break}catch{}await new Promise(r=>setTimeout(r,500))}
  const req=(token='fixture-manager',init:RequestInit={},url=endpoint)=>fetch(base+url,{...init,redirect:'manual',headers:{Cookie:`twin_agency_access=${token}`,...init.headers}});
  const post={method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:1,mode:'preview',settings:{creator_key:'fixture'}})};
  const read=await req();assert.equal(read.status,200,await read.clone().text());assert.equal((await read.json()).canManage,true);
  assert.equal(read.headers.get('cache-control')?.includes('no-store'),true);
  assert.equal((await req('fixture-reader')).status,200);
  assert.equal((await req('fixture-reader',post)).status,403);assert.equal(writes,0);
  assert.equal((await req('fixture-manager',{...post,headers:{...post.headers,Origin:'https://untrusted.invalid'}})).status,403);
  assert.equal((await req('fixture-manager',{...post,body:JSON.stringify({...JSON.parse(post.body),actor:'forged'})})).status,400);
  assert.equal((await req('fixture-manager',{...post,body:'{'})).status,400);
  assert.equal((await req('fixture-manager',{...post,body:' '.repeat(130001)})).status,413);
  assert.equal((await req('fixture-manager',{},endpoint.replace('fixture-a','fixture-b'))).status,404);
  assert.equal(writes,0);assert.equal((await req('fixture-manager',post)).status,200);assert.equal(writes,1);
  malformed=true;assert.equal((await req('fixture-manager',post)).status,502);assert.equal(writes,2);malformed=false;
  conflict=true;assert.equal((await req('fixture-manager',post)).status,409);assert.equal(writes,3);conflict=false;
  stale=true;assert.equal((await req('fixture-manager',post)).status,502);assert.equal(writes,3);stale=false;
  active=false;assert.notEqual((await req('fixture-manager',post)).status,200);assert.equal(writes,3);
  console.log('PASS real Next Moxy routes: server actor, manager/read-only, CSRF, bounded body, tenant scope, revision conflict, malformed acknowledgement and rollout fence');
 }finally{child.kill();fixture.closeAllConnections();await new Promise<void>(r=>fixture.close(()=>r()));closeSync(log)}
}
main().catch(e=>{console.error(e);process.exitCode=1});
