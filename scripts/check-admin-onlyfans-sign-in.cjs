/* Real admin route and command authentication. Private services use fixtures. */
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {build}=require('esbuild');
const {mkdtempSync,rmSync}=require('node:fs');
const {join}=require('node:path');
const {NextRequest,NextResponse}=require('next/server');
async function main(){
 const root=process.cwd(),dir=mkdtempSync(join(root,'admin-sign-in-routes-'));
 const fingerprint=p=>createHash('sha256').update('twin-capture-network.v1\0'+(p??'')).digest('hex');
 const id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',enrollment='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
 const f=globalThis.__adminSignInTest={authed:true,denied:false,token:'verified-master-session',calls:[],actor:null,phase:'ready',frameError:null,ackLost:false};
 f.attempt=()=>({id,phase:f.phase,handle:'fixture_creator',enrollmentId:f.phase==='submitted'?enrollment:null,expiresAt:new Date(Date.now()+900000).toISOString(),width:432,height:720,keyboard:null});
 f.network={accountId:'of-123',ownerId:123,proxyUrl:'http://saved:proxy@proxy.example:8080',fingerprint:fingerprint('http://saved:proxy@proxy.example:8080')};
 f.capture={profileId:'creator-a',handle:'fixture_creator',session:{ownerId:123,networkFingerprint:fingerprint('http://fixture:secret@proxy.example:8080')}};
 f.scope=scope=>{if(f.actor&&f.actor!==scope.actor)throw new f.Error(404,'Your sign-in expired. Start again.');f.calls.push({kind:'scope',scope})};
 f.Error=class extends Error{constructor(status,message){super(message);this.status=status}};
 f.signin={async start(scope,key,network){f.scope(scope);f.calls.push({kind:'start',key,network});return f.attempt()},async status(scope){f.scope(scope);return f.attempt()},async frame(scope){f.scope(scope);if(f.frameError)throw new f.Error(f.frameError,'Frame unavailable');return new Uint8Array([255,216,255,217]).buffer},async input(scope,attempt,input){f.scope(scope);f.calls.push({kind:'input',input});return f.attempt()},async cancel(scope){f.scope(scope);return {...f.attempt(),phase:'cancelled'}},async capture(scope){f.scope(scope);f.calls.push({kind:'capture'});return f.capture},async acknowledge(scope){f.scope(scope);if(f.ackLost)throw new Error('Fixture lost acknowledgment');return {...f.attempt(),phase:'submitted',enrollmentId:enrollment}}};
 f.native={async captureContext(creator,account){f.calls.push({kind:'network',creator,account});return account&&account!=='of-123'?{ok:false,status:404}:{ok:true,data:account?f.network:{accountId:null,ownerId:null,proxyUrl:null,fingerprint:fingerprint(null)}}},async enroll(command){f.calls.push({kind:'enroll',command});return {ok:true,data:{id:enrollment}}},async enrollments(creator){f.calls.push({kind:'enrollments',creator});return {ok:true,data:[]}}};
 const stubs={
  'next/headers':`export async function cookies(){return {get(){return {value:globalThis.__adminSignInTest.token}}}}`,
  '@/lib/session':`export const SESSION_COOKIE='master_session';export async function verifySessionToken(token){return globalThis.__adminSignInTest.authed&&token==='verified-master-session'}`,
  '@/lib/onlyfans/route':`import {NextResponse} from 'next/server';import{createHash}from'node:crypto';export const PRIVATE_HEADERS={'Cache-Control':'private, no-store'};export async function requireOnlyFansRead(){const f=globalThis.__adminSignInTest;if(!f.authed)return NextResponse.json({ok:false},{status:401});if(f.denied)return NextResponse.json({ok:false},{status:403});return {actor:'op-session:'+createHash('sha256').update(f.token).digest('hex'),canManage:true}}`,
  '@/lib/onlyfans/connection-creators':`import {requireOnlyFansRead} from '@/lib/onlyfans/route';import {connectionCommandContext} from '@/lib/onlyfans-connections/route';export const connectionAccess=requireOnlyFansRead;export const connectionSignInCommand=connectionCommandContext;export async function resolveConnectionCreator(id){return id==='creator-a'?{id,name:'Verified creator',expectedHandle:globalThis.__adminSignInTest.expectedHandle}:null}`,
  '@/lib/onlyfans-managed-proxy/backend':"export class ManagedProxyError extends Error {constructor(status,message){super(message);this.status=status;}};export function configuredManagedProxyBackend(){return globalThis.__adminSignInTest.broker??null;}",
  '@/lib/onlyfans-sign-in/backend':`export const SignInBackendError=globalThis.__adminSignInTest.Error;export function configuredSignInBackend(){return globalThis.__adminSignInTest.signin}`,
  '@/lib/onlyfans-connections/backend':`export function configuredConnectionBackend(){return globalThis.__adminSignInTest.native}`,
 };
 try{
  await build({entryPoints:[join(root,'app/api/onlyfans-connections/creators/[creatorId]/sign-in/route.ts')],outfile:join(dir,'route.cjs'),bundle:true,platform:'node',format:'cjs',alias:{'@':root},external:['next/server'],plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(stubs,a.path)?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'ts'}))}}]});
  const route=require(join(dir,'route.cjs')),ctx={params:Promise.resolve({creatorId:'creator-a'})};
  const path='/api/onlyfans-connections/creators/creator-a/sign-in';
  const request=(body,headers={},suffix='')=>new NextRequest('https://dashboard.example'+path+suffix,{method:body===undefined?'GET':'POST',headers:{host:'dashboard.example',origin:'https://dashboard.example','sec-fetch-site':'same-origin','content-type':'application/json',...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
  const post=(body,headers={})=>route.POST(request(body,headers),ctx),get=suffix=>route.GET(request(undefined,{},suffix),ctx);
  const connection={accountId:null,proxyUrl:'http://fixture:secret@proxy.example:8080'};
  const start={action:'start',profileId:'creator-a',accountId:null,startKey:id,connection};
  f.authed=false;assert.equal((await post(start)).status,401);assert.equal((await get('?attempt='+id)).status,401);f.authed=true;
  f.denied=true;assert.equal((await post(start)).status,403);assert.equal((await get('?attempt='+id)).status,403);f.denied=false;
  assert.equal(f.calls.length,0,'Denied requests cannot reach a private service');
  for(const headers of [{origin:'https://foreign.example'},{'sec-fetch-site':'cross-site'},{'content-type':'text/plain'}])assert.equal((await post(start,headers)).status,403);
  assert.equal((await post('{"action":"start","action":"confirm"}')).status,400);
  for(const extra of [{actor:'op-session:forged'},{creatorName:'Forged'},{profileId:'foreign'}])assert.equal((await post({...start,...extra})).status,400);
  assert.equal((await post({...start,connection:{...connection,proxyUrl:null}})).status,400);
  assert.equal((await post({...start,connection:{...connection,proxyUrl:'http://proxy.example:8080/private'}})).status,400);
  assert.equal((await post({...start,accountId:'of-999',connection:{accountId:'of-999',proxyUrl:null}})).status,404);
  const started=await post(start);assert.equal(started.status,200);
  const startedJob=f.calls.find(x=>x.kind==='start');assert.equal(startedJob.network.proxyUrl,connection.proxyUrl);assert.equal(startedJob.network.fingerprint,fingerprint(connection.proxyUrl));
  const scope=f.calls.find(x=>x.kind==='scope').scope;assert.match(scope.actor,/^op-session:[a-f0-9]{64}$/);assert.equal(scope.creatorId,'creator-a');
  assert(!JSON.stringify(await started.json()).includes('secret'),'Public start status never contains the proxy credential');
  const frame=await get('?attempt='+id+'&frame=1');assert.equal(frame.status,200);assert.equal(frame.headers.get('cache-control'),'private, no-store');assert.equal(frame.headers.get('content-type'),'image/jpeg');
  assert.equal((await get('?attempt=bad')).status,400);
  const confirm={action:'confirm',attempt:id,profileId:'creator-a',connection};
  assert.equal((await post({...confirm,connection:{...connection,proxyUrl:'http://other:secret@proxy.example:8080'}})).status,409);
  assert.equal(f.calls.filter(x=>x.kind==='enroll').length,0);
  f.expectedHandle='wrong_handle';assert.equal((await post(confirm)).status,409);assert.equal(f.calls.filter(x=>x.kind==='enroll').length,0);f.expectedHandle='fixture_creator';
  f.ackLost=true;const confirmed=await post(confirm);assert.equal(confirmed.status,200);const ack=await confirmed.json();assert.equal(ack.attempt.enrollmentId,enrollment);
  const first=f.calls.find(x=>x.kind==='enroll').command;assert.equal(first.creatorId,'creator-a');assert.equal(first.creatorName,'Verified creator');assert.equal(first.initialProxyUrl,connection.proxyUrl);assert.equal(first.actor,scope.actor);assert.match(first.commandKey,/^[a-f0-9]{64}$/);
  await post(confirm);assert.deepEqual(f.calls.filter(x=>x.kind==='enroll').at(-1).command,first,'Lost acknowledgments retry exactly the same enrollment');
  f.phase='submitted';const before=f.calls.filter(x=>x.kind==='enroll').length;assert.equal((await post(confirm)).status,200);assert.equal(f.calls.filter(x=>x.kind==='enroll').length,before);f.phase='waiting';
  const input={action:'input',profileId:'creator-a',attempt:id,input:{type:'key',key:'Enter'}};
  for(const status of [429,503]){f.frameError=status;const n=f.calls.filter(x=>x.kind==='input').length;assert.equal((await post(input,{accept:'image/png'})).status,200);assert.equal(f.calls.filter(x=>x.kind==='input').length,n+1);}
  f.frameError=null;const paired=await post(input,{accept:'image/png'});assert.equal(paired.headers.get('content-type'),'image/jpeg');
  f.phase='ready';const privateProxy='http://managed:private-managed-secret@8.8.4.4:12323';
  f.broker={async assign(creatorId,selection,actor){f.calls.push({kind:'proxy-assignment',creatorId,selection,actor});return privateProxy;}};
  const managed={accountId:null,proxyUrl:null,managedProxy:{countryCode:'US',handle:'fixture_creator'}};
  const managedStart={...start,connection:managed};
  const previousFingerprint=f.capture.session.networkFingerprint;f.capture.session.networkFingerprint=fingerprint(privateProxy);
  const managedResponse=await post(managedStart);assert.equal(managedResponse.status,200);
  assert(!JSON.stringify(await managedResponse.json()).includes('private-managed-secret'),'Managed credentials never enter public responses');
  assert.equal(f.calls.filter(x=>x.kind==='start').at(-1).network.proxyUrl,privateProxy);
  assert.equal((await post({...confirm,connection:managed})).status,200);
  assert.equal(f.calls.filter(x=>x.kind==='enroll').at(-1).command.initialProxyUrl,privateProxy);
  f.expectedHandle='different_handle';assert.equal((await post(managedStart)).status,409);f.expectedHandle=undefined;
  for(const connection of [{...managed,proxyUrl:privateProxy},{...managed,accountId:'of-123'},{...managed,managedProxy:{countryCode:'US',handle:'bad handle'}}])assert.equal((await post({...managedStart,connection})).status,400);
  f.broker=null;assert.equal((await post(managedStart)).status,503);
  f.capture.session.networkFingerprint=previousFingerprint;
  f.actor='op-session:'+'f'.repeat(64);assert.equal((await get('?attempt='+id)).status,404);f.actor=null;
  f.phase='ready';f.capture.session.networkFingerprint=f.network.fingerprint;
  const reconnect={...confirm,connection:{accountId:'of-123',proxyUrl:null}};assert.equal((await post(reconnect)).status,200);
  assert.equal(Object.hasOwn(f.calls.filter(x=>x.kind==='enroll').at(-1).command,'initialProxyUrl'),false,'Reconnect preserves the existing network and model');
  f.capture.session.ownerId=999;assert.equal((await post(reconnect)).status,409);
  assert.equal((await get('?enrollments=1')).status,200);
  console.log('PASS admin sign-in: authenticated operator, origin and creator scope, proxy-bound first login, wrong-account refusal, private frames, single input, frozen retries, and saved-network reconnect.');
 }finally{delete globalThis.__adminSignInTest;rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1});
