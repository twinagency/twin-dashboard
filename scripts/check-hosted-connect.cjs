/* Real hosted routes with synthetic identity/provider adapters; no external I/O. */
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {build}=require('esbuild'),fs=require('node:fs'),path=require('node:path');
const {NextRequest}=require('next/server');
async function main(){
 const root=process.cwd(),dir=fs.mkdtempSync(path.join(root,'hosted-routes-'));
 const creator={accountId:'11111111-1111-4111-8111-111111111111',userId:'22222222-2222-4222-8222-222222222222',agencyId:null,creatorName:'Synthetic creator',readOnly:false};
 const f=globalThis.__hostedTest={creator,token:true,viewAs:false,profile:'33333333-3333-4333-8333-333333333333',agency:null,active:true,accountStatus:'active',source:'self',calls:[],enrollments:[],accounts:[],provider:'acct_fixture',owner:123,result:{state:'pending'}};
 process.env.ONLYFANS_HOSTED_CONNECT_ENABLED='1';process.env.OFAPI_API_KEY='synthetic-provider-key-private';process.env.OFAPI_WEBHOOK_SECRET='synthetic-signing-secret-0123456789';
 f.db={from(table){const filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},async maybeSingle(){if(table==='creator_accounts')return{error:null,data:{id:creator.accountId,auth_user_id:creator.userId,display_name:'Synthetic creator',account_status:f.accountStatus,source:f.source,platform_creator_id:f.profile,requested_channels:['onlyfans']}};if(table==='creator_agency_assignments')return{error:null,data:f.agency?{agency_id:f.agency,partner_agencies:{active:f.active}}:null};return{error:null,data:null};}};return q;}};
 const stubs={
  'server-only':'',
  'next/headers':`export async function cookies(){return{get(){return globalThis.__hostedTest.token?{value:'synthetic-cookie'}:undefined}}}`,
  '@/lib/creator-session':`export const CREATOR_SESSION_COOKIE='creator_session'`,
  '@/lib/creator-dashboard-identity':`export const creatorAccountStatusAllowsAccess=s=>s==='active';export async function creatorDashboardIdentity(token){return token?globalThis.__hostedTest.creator:null}`,
  '@/lib/view-as-banner':`export async function getViewAsBannerInfo(){return globalThis.__hostedTest.viewAs?{}:null}`,
  '@/lib/supabase-service':`export function serviceClient(){return globalThis.__hostedTest.db}`,
  '@/lib/onlyfans/backend':`export function configuredOnlyFansBackend(){return{listAccounts:async()=>({ok:true,data:globalThis.__hostedTest.accounts})}}`,
  '@/lib/onlyfans-connections/backend':`export function configuredConnectionBackend(){return{enroll:async command=>{globalThis.__hostedTest.enrollments.push(command);return{ok:true,data:{id:'synthetic-request'}}}}}`,
  '@/lib/onlyfans/backend-transport':`export function configuredBackendPurpose(){return{baseUrl:'https://native.example',token:'synthetic-internal-secret'}};export function createBackendTransport(){return async()=>new Response(JSON.stringify({schemaVersion:'of-connections.v1',ok:true,account:{accountId:'of-123',providerAccountId:globalThis.__hostedTest.provider,ownerId:String(globalThis.__hostedTest.owner)}}),{headers:{'Content-Type':'application/json'}})}`,
 };
 const savedFetch=global.fetch;
 global.fetch=async(url,options)=>{assert(new URL(url).origin==='https://app.onlyfansapi.com');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.headers.Authorization,'Bearer '+process.env.OFAPI_API_KEY);f.calls.push({url,options});if(f.alreadyAuthenticated&&url.endsWith('/reauthenticate'))return new Response(JSON.stringify({message:"Can't re-authenticate account at this time.",reason:'Account is already successfully authenticated'}),{status:400,headers:{'Content-Type':'application/json'}});const result=url.endsWith('/client-sessions')?{data:{token:'ofapi_cs_synthetic0123456789'}}:url.endsWith('/reauthenticate')?{polling_url:'https://app.onlyfansapi.com/api/authenticate/auth_fixture'}:f.result;return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});};
 try{
  await build({stdin:{contents:`export * as reference from './lib/creator-platforms/hosted-reference';export * as server from './lib/creator-platforms/hosted-server';export * as hosted from './app/creator-auth/platforms/onlyfans/hosted/route';export * as events from './app/creator-auth/platforms/onlyfans/events/route';export * as policy from './lib/creator-dashboard-policy';`,resolveDir:root,loader:'ts'},outfile:path.join(dir,'routes.cjs'),bundle:true,platform:'node',format:'cjs',alias:{'@':root},external:['next/server'],plugins:[{name:'isolated-adapters',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(stubs,a.path)?{path:a.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'ts'}))}}]});
  const m=require(path.join(dir,'routes.cjs'));
  const req=(body,headers={})=>new NextRequest('https://dashboard.example/creator-auth/platforms/onlyfans/hosted',{method:'POST',headers:{host:'dashboard.example',origin:'https://dashboard.example','sec-fetch-site':'same-origin','content-type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
  const proof=m.reference.issueHostedReference(creator,f.profile);assert(proof.length<=255);assert.equal(m.reference.verifyHostedReference(proof).profileId,f.profile);
  for(const bad of [proof+'x',proof.slice(1),proof.replace(/^./,proof[0]==='a'?'b':'a'),null])assert.equal(m.reference.verifyHostedReference(bad),null);
  const now=Date.now;Date.now=()=>now()+3601000;assert.equal(m.reference.verifyHostedReference(proof),null);Date.now=now;
  const cookie=m.reference.sealHostedResume({reference:proof});assert.equal(m.reference.openHostedResume(cookie).reference,proof);assert.equal(m.reference.openHostedResume(cookie+'x'),null);assert.equal(m.reference.openHostedResume(proof),null);
  f.token=false;assert.equal((await m.hosted.POST(req({action:'start'}))).status,401);f.token=true;
  f.viewAs=true;assert.equal((await m.hosted.POST(req({action:'start'}))).status,403);f.viewAs=false;
  for(const h of [{origin:'https://foreign.example'},{'sec-fetch-site':'cross-site'},{'content-type':'text/plain'}])assert.equal((await m.hosted.POST(req({action:'start'},h))).status,403);
  assert.equal((await m.hosted.POST(req('{"action":"start","action":"start"}'))).status,400);
  process.env.ONLYFANS_HOSTED_CONNECT_ENABLED='0';assert.equal((await m.hosted.POST(req({action:'start'}))).status,503);process.env.ONLYFANS_HOSTED_CONNECT_ENABLED='1';
  const start=await m.hosted.POST(req({action:'start'}));assert.equal(start.status,200);const startText=await start.text();assert(!startText.includes(process.env.OFAPI_API_KEY));assert(startText.includes('ofapi_cs_'));assert.equal(f.enrollments.length,0);
  const providerBody=JSON.parse(f.calls.at(-1).options.body),reference=providerBody.client_reference_id;assert.equal(m.reference.verifyHostedReference(reference).accountId,creator.accountId);
  assert.equal((await m.hosted.POST(req({action:'finish',accountId:'acct_forged',ownerId:999}))).status,400);assert.equal(f.enrollments.length,0);
  const event={event:'accounts.connected',account_id:'acct_fixture',payload:{client_reference_id:reference,onlyfans_id:123,onlyfans_username:'synthetic'}};
  const webhook=async(raw,signature)=>m.events.POST(req(raw,{signature:signature||crypto.createHmac('sha256',process.env.OFAPI_WEBHOOK_SECRET).update(raw).digest('hex')}));
  assert.equal((await webhook(JSON.stringify(event),'0'.repeat(64))).status,403);assert.equal(f.enrollments.length,0);
  assert.equal((await webhook(JSON.stringify(event))).status,200);assert.equal((await webhook(JSON.stringify(event))).status,200);
  assert.equal(f.enrollments.length,2);assert.equal(f.enrollments[0].commandKey,f.enrollments[1].commandKey);assert.deepEqual(f.enrollments[0].session.hosted,{schemaVersion:'ofapi.v1',accountId:'acct_fixture'});assert.equal(f.enrollments[0].creatorId,f.profile);
  f.accountStatus='disabled';assert.equal((await webhook(JSON.stringify(event))).status,409);f.accountStatus='active';
  f.agency='44444444-4444-4444-8444-444444444444';assert.equal((await webhook(JSON.stringify(event))).status,409);f.agency=null;
  f.source='agency_invite';assert.equal((await webhook(JSON.stringify(event))).status,409);f.source='self';
  const n=f.enrollments.length;assert.equal((await webhook('{"event":"accounts.connected","event":"other"}')).status,400);assert.equal(f.enrollments.length,n);
  assert.equal((await m.hosted.POST(req({action:'reconnect',accountId:'of-999'}))).status,404);
  f.accounts=[{accountId:'of-123',binding:{creatorId:f.profile,channel:'onlyfans',handle:'synthetic'}}];
  const reconnect=await m.hosted.POST(req({action:'reconnect',accountId:'of-123'}));assert.equal(reconnect.status,200);const resume=reconnect.cookies.get('twin_onlyfans_resume').value;const h={cookie:'twin_onlyfans_resume='+resume};
  assert.equal((await m.hosted.POST(req({action:'status'}))).status,409);assert.equal((await m.hosted.POST(req({action:'status'},{cookie:'twin_onlyfans_resume='+resume+'x'}))).status,409);
  f.provider='acct_changed';assert.equal((await m.hosted.POST(req({action:'status'},h))).status,409);f.provider='acct_fixture';
  f.result={lastAttempt:{needs_otp:true}};assert.equal((await(await m.hosted.POST(req({action:'status'},h))).json()).phase,'code');
  f.result={twoFactorPending:true};assert.equal((await(await m.hosted.POST(req({action:'status'},h))).json()).phase,'code');
  assert.equal((await m.hosted.POST(req({action:'code',code:'invalid'},h))).status,400);
  f.result={lastAttempt:{needs_face_otp:true,face_otp_verification_url:'https://foreign.example/'}};assert.equal((await m.hosted.POST(req({action:'status'},h))).status,409);
  f.result={lastAttempt:{success:true},account:{id:'acct_foreign'}};assert.equal((await m.hosted.POST(req({action:'status'},h))).status,409);assert.equal(f.enrollments.length,n);
  f.result={lastAttempt:{success:true},account:{id:'acct_fixture'}};const success=await m.hosted.POST(req({action:'status'},h));assert.equal(success.status,200);assert.equal((await success.json()).phase,'checking');assert.equal(f.enrollments.at(-1).session.ownerId,123);
  f.alreadyAuthenticated=true;const healthy=await m.hosted.POST(req({action:'reconnect',accountId:'of-123'}));assert.equal(healthy.status,200);assert.equal((await healthy.json()).phase,'checking');assert.equal(f.enrollments.at(-1).session.hosted.accountId,'acct_fixture');
  for(const endpoint of ['hosted','events']){assert(m.policy.creatorPlatformApiAllowed('/creator-auth/platforms/onlyfans/'+endpoint,'POST',false));assert(!m.policy.creatorPlatformApiAllowed('/creator-auth/platforms/onlyfans/'+endpoint,'GET',false));assert(!m.policy.creatorPlatformApiAllowed('/creator-auth/platforms/onlyfans/'+endpoint,'POST',true));}
  console.log('PASS hosted connection: feature gate, creator/origin guards, signed reference expiry/tampering, raw signed events, current ownership, durable dedupe key, no browser binding, private provider key, owned reconnection and verification.');
 }finally{global.fetch=savedFetch;fs.rmSync(dir,{recursive:true,force:true});delete globalThis.__hostedTest;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
