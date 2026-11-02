const assert=require('node:assert/strict'),{build}=require('esbuild'),{mkdtempSync,rmSync}=require('node:fs'),{join}=require('node:path');
const {NextRequest,NextResponse}=require('next/server');
async function main(){
 const root=process.cwd(),dir=mkdtempSync(join(root,'creator-connect-check-'));
 const f=globalThis.__creatorConnect={agency:null,actor:'op-session:'+'a'.repeat(64),allowed:[],manage:true,denial:0,reads:0,writes:0,assignmentError:false,rows:new Map(),assignments:new Set()};
 function query(table){
  let id,ids,insert,upsert;
  const q={select(){return q},eq(k,v){if(k==='id')id=v;return q},in(k,v){ids=v;return q},order(){return q},limit(){return q},
   insert(v){insert=v;return q},upsert(v){upsert=v;return q},maybeSingle(){return result()},single(){return result()},then(a,b){return result().then(a,b)}};
  async function result(){
   if(table==='agency_creators'){assert(upsert);f.writes++;if(f.assignmentError)return {error:{code:'fixture'}};f.assignments.add(upsert.agency_id+':'+upsert.clone_id);return {data:null,error:null};}
   assert.equal(table,'clones');f.reads++;
   if(insert){f.writes++;if(f.rows.has(insert.id))return {error:{code:'23505'}};f.rows.set(insert.id,structuredClone(insert));return {data:structuredClone(insert),error:null};}
   return {data:id?f.rows.get(id)??null:[...f.rows.values()].filter(r=>!ids||ids.includes(r.id)),error:null};
  }return q;
 }
 f.db={from:query};
 const stubs={
  'server-only':'',
  '@/lib/supabase-service':'export const serviceClient=()=>globalThis.__creatorConnect.db;',
  '@/lib/dashboard-access':'export const getDashboardAccess=async()=>globalThis.__creatorConnect.agency;',
  '@/lib/onlyfans/route':`import{NextResponse}from'next/server';export const PRIVATE_HEADERS={'Cache-Control':'private, no-store'};export async function requireOnlyFansRead(){const f=globalThis.__creatorConnect;if(f.denial)return NextResponse.json({ok:false},{status:f.denial});return {actor:f.actor,canManage:f.manage,auth:{agencyGrant:f.agency?{creatorIds:f.allowed}:undefined}}}`,
  // Only unused master-command imports are stubbed; connectionAccess,
  // command parsing/origin, scoped DB queries and creation code below are real.
  'next/headers':'export async function cookies(){return {get(){return undefined}}}',
  '@/lib/session':'export const SESSION_COOKIE="master_session";export async function verifySessionToken(){return false}',
 };
 stubs['./route']=stubs['@/lib/onlyfans/route'];
 try{
  await build({entryPoints:[join(root,'lib/onlyfans/connection-creators.ts')],outfile:join(dir,'module.cjs'),bundle:true,platform:'node',format:'cjs',alias:{'@':root},external:['next/server'],plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(stubs,a.path)?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'ts'}))}}]});
  const m=require(join(dir,'module.cjs'));
  const request=(body,headers={})=>new NextRequest('https://dashboard.example/api/onlyfans-connections/creators',{method:'POST',headers:{host:'dashboard.example',origin:'https://dashboard.example','sec-fetch-site':'same-origin','content-type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
  const create=async(body,headers={})=>{const ctx=await m.connectionSignInCommand(request(body,headers));return ctx instanceof NextResponse?ctx:m.createConnectionCreator(ctx,ctx.body)};
  for(const status of [401,403,503]){f.denial=status;assert.equal((await create({name:'Test',handle:'test'})).status,status);assert.deepEqual(await m.listConnectionCreators(),[]);assert.equal(await m.resolveConnectionCreator('foreign'),null);}
  f.denial=0;f.manage=false;assert.equal((await create({name:'Test',handle:'test'})).status,403);f.manage=true;
  for(const headers of [{origin:'https://evil.example'},{'sec-fetch-site':'cross-site'},{'content-type':'text/plain'}])assert.equal((await create({name:'Test',handle:'test'},headers)).status,403);
  assert.equal(f.writes,0);
  for(const body of [{name:'',handle:'ok'},{name:'Test',handle:'https://onlyfans.com/test'},{name:'Test',handle:'ok',agencyId:'forged'},{name:'Test',handle:'ok',actor:'forged'},'{"name":"One","name":"Two","handle":"ok"}'])assert.equal((await create(body)).status,400);
  const one=await create({name:'Fixture One',handle:'@FiXtUrE_one'});assert(one.id);assert.equal(one.expectedHandle,'fixture_one');
  const retry=await create({name:'Fixture One',handle:'fixture_one'});assert.equal(retry.id,one.id);assert.equal(f.rows.size,1);
  const row=f.rows.get(one.id);assert.equal(row.status,'paused');assert.equal(row.bot_token,'');assert.equal(row.charge_messages,false);assert.equal(row.drip_enabled,false);
  const agencyA='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',agencyB='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  f.agency={id:agencyA,cloneIds:[],canManage:true,userId:'cccccccc-cccc-4ccc-accc-cccccccccccc'};f.actor='agency-user:'+agencyA+':'+f.agency.userId;
  assert.deepEqual(await m.listConnectionCreators(),[]);const reads=f.reads;assert.equal(await m.resolveConnectionCreator(one.id),null);assert.equal(f.reads,reads,'Foreign IDs refused before database access');
  f.agency.creatorScope='selected';assert.equal((await create({name:'Agency Creator',handle:'agency_creator'})).status,403);delete f.agency.creatorScope;
  f.assignmentError=true;const failed=await create({name:'Agency Creator',handle:'agency_creator'});assert.equal(failed.status,503);assert.equal(f.rows.size,2);assert.equal(f.assignments.size,0);
  f.assignmentError=false;const a=await create({name:'Agency Creator',handle:'agency_creator'});assert(a.id);assert.equal(f.rows.size,2);assert(f.assignments.has(agencyA+':'+a.id));
  f.allowed=[a.id];assert.deepEqual((await m.listConnectionCreators()).map(r=>r.id),[a.id]);assert.equal((await m.resolveConnectionCreator(a.id)).id,a.id);
  const actorA=(await m.connectionAccess()).actor;assert.match(actorA,/^op-session:[a-f0-9]{64}$/);
  f.agency={...f.agency,id:agencyB};f.actor='agency-user:'+agencyB+':'+f.agency.userId;f.allowed=[];
  assert.notEqual((await m.connectionAccess()).actor,actorA);assert.equal(await m.resolveConnectionCreator(a.id),null);
  const b=await create({name:'Another Agency Creator',handle:'agency_creator'});assert.notEqual(b.id,a.id);assert(f.assignments.has(agencyB+':'+b.id));
  const ctx=await m.connectionSignInCommand(request({name:'Name',handle:'handle'}));assert.equal(ctx.identity('enroll',{a:1}).commandKey,ctx.identity('enroll',{a:1}).commandKey);
  assert(!JSON.stringify(one).includes('owner'));
  console.log('PASS creator connection: origin/session/manager gates, agency scoping, no foreign DB reads, deterministic retries, partial assignment recovery, paused defaults, separate agency actor and no secret output.');
 }finally{delete globalThis.__creatorConnect;rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1});
