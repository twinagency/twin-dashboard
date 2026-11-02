/* Actual agency delegation, creator scope, sign-in route and public proxy projection. */
const assert=require('node:assert/strict'),{build}=require('esbuild'),{mkdtempSync,rmSync}=require('node:fs'),{join}=require('node:path');
const {NextRequest,NextResponse}=require('next/server');
async function main(){
 const root=process.cwd(),dir=mkdtempSync(join(root,'agency-proxy-test-'));
 const creator='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',agency='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',user='cccccccc-cccc-4ccc-accc-cccccccccccc',attempt='dddddddd-dddd-4ddd-addd-dddddddddddd';
 const f=globalThis.__agencyProxy={allowed:[creator],manage:true,denial:0,calls:[],agency:{id:agency,userId:user,canManage:true},actor:`agency-user:${agency}:${user}`};
 f.db={from(){return{select(){return this},eq(k,id){this.id=id;return this},async maybeSingle(){return{data:{id:this.id,name:'Agency-owned fixture',intake:{onlyfans_connection:{handle:'fixture_creator'}}},error:null}}}}};
 const stubs={
  'server-only':'',
  '@/lib/supabase-service':'export const serviceClient=()=>globalThis.__agencyProxy.db;',
  '@/lib/dashboard-access':'export const getDashboardAccess=async()=>globalThis.__agencyProxy.agency;',
  '@/lib/onlyfans/route':`import{NextResponse}from'next/server';export const PRIVATE_HEADERS={'Cache-Control':'private, no-store'};export async function requireOnlyFansRead(options){const f=globalThis.__agencyProxy;if(!options?.agency)throw new Error('Agency route must request scoped access');if(f.denial)return NextResponse.json({ok:false},{status:f.denial});return{actor:f.actor,canManage:f.manage,auth:{agencyGrant:{creatorIds:f.allowed}}}}`,
  'next/headers':'export async function cookies(){return{get(){return undefined}}}',
  '@/lib/session':'export const SESSION_COOKIE="master_session";export async function verifySessionToken(){return false}',
  '@/lib/onlyfans-connections/backend':'export const configuredConnectionBackend=()=>globalThis.__agencyProxy.native;',
  '@/lib/onlyfans-managed-proxy/backend':'export class ManagedProxyError extends Error{};export const configuredManagedProxyBackend=()=>globalThis.__agencyProxy.broker;',
  '@/lib/onlyfans-sign-in/backend':'export class SignInBackendError extends Error{};export const configuredSignInBackend=()=>globalThis.__agencyProxy.signin;',
 };
 stubs['./route']=stubs['@/lib/onlyfans/route'];
 f.native={async captureContext(id,account){f.calls.push(['context',id,account]);return account&&account!=='of-fixture'?{ok:false,status:404}:{ok:true,data:{accountId:account,ownerId:null,proxyUrl:account?'http://user:private-password@203.0.113.25:12323':null,fingerprint:'a'.repeat(64)}}},async get(){f.calls.push(['status']);return{ok:true,data:{status:'verified',verifiedAt:'2026-10-25T12:00:00Z'}}}};
 f.broker={async assign(id,selection,actor){f.calls.push(['assign',id,selection,actor]);return 'http://user:private-password@203.0.113.25:12323'}};
 f.signin={async start(scope,key,network){f.calls.push(['start',scope,key,network]);return{id:attempt,phase:'waiting',handle:null,enrollmentId:null,expiresAt:new Date(Date.now()+60000).toISOString(),width:432,height:720,keyboard:null}}};
 const env=process.env.ONLYFANS_MANAGED_PROXY_DEFAULT_COUNTRY;process.env.ONLYFANS_MANAGED_PROXY_DEFAULT_COUNTRY='PT';
 try{
  await build({entryPoints:[join(root,'app/api/onlyfans-connections/creators/[creatorId]/sign-in/route.ts')],outfile:join(dir,'route.cjs'),bundle:true,platform:'node',format:'cjs',alias:{'@':root},external:['next/server'],plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(stubs,a.path)?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'ts'}))}}]});
  const route=require(join(dir,'route.cjs')),ctx={params:Promise.resolve({creatorId:creator})};
  const path=`https://dashboard.example/api/onlyfans-connections/creators/${creator}/sign-in`;
  const body={action:'start',profileId:creator,accountId:null,startKey:attempt,connection:{accountId:null,proxyUrl:null,managedProxy:{countryCode:'auto',handle:'fixture_creator'}}};
  const post=()=>route.POST(new NextRequest(path,{method:'POST',headers:{host:'dashboard.example',origin:'https://dashboard.example','sec-fetch-site':'same-origin','content-type':'application/json'},body:JSON.stringify(body)}),ctx);
  const get=id=>route.GET(new NextRequest(path+'?proxy=1&accountId='+id),ctx);
  for(const denial of [401,403,503]){f.denial=denial;assert.equal((await post()).status,denial);assert.equal((await get('of-fixture')).status,denial);}f.denial=0;
  f.manage=false;assert.equal((await post()).status,403);assert.equal((await get('of-fixture')).status,403);f.manage=true;
  f.allowed=[];assert.equal((await post()).status,404);assert.equal((await get('of-fixture')).status,404);assert.equal(f.calls.length,0);f.allowed=[creator];
  const response=await post();assert.equal(response.status,200);const result=await response.json();assert.deepEqual(result.proxy,{host:'203.0.113.25',countryCode:'PT',status:'assigned',verifiedAt:null});assert(!JSON.stringify(result).includes('private-password'));
  const allocation=f.calls.find(r=>r[0]==='assign');assert.match(allocation[3],/^op-session:[a-f0-9]{64}$/);assert.notEqual(allocation[3],f.actor);assert.equal(allocation[1],creator);
  const start=f.calls.find(r=>r[0]==='start');assert.equal(start[1].actor,allocation[3]);assert.equal(start[3].proxyUrl,'http://user:private-password@203.0.113.25:12323');
  const saved=await get('of-fixture');assert.equal(saved.status,200);assert.equal((await saved.json()).proxy.status,'verified');
  const count=f.calls.filter(r=>r[0]==='status').length;assert.equal((await get('foreign')).status,404);assert.equal(f.calls.filter(r=>r[0]==='status').length,count);
  f.allowed=[];f.agency={...f.agency,id:'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee'};assert.equal((await get('of-fixture')).status,404);
  console.log('PASS agency manager automatic proxy path: actual delegation and scope, matching private login network, safe visible IP/country, saved verification, denied staff and cross-agency/account access.');
 }finally{if(env===undefined)delete process.env.ONLYFANS_MANAGED_PROXY_DEFAULT_COUNTRY;else process.env.ONLYFANS_MANAGED_PROXY_DEFAULT_COUNTRY=env;delete globalThis.__agencyProxy;rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1});
