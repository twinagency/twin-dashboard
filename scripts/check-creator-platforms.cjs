/* Real route/server code, isolated identity and backend adapters; no live I/O. */
const assert=require('node:assert/strict');
const {build}=require('esbuild');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');const {join,resolve}=require('node:path');
const {NextRequest,NextResponse}=require('next/server');
async function main(){
 const root=process.cwd(),dir=mkdtempSync(join(root,'creator-platform-routes-'));
 const creator={accountId:'creator-account',userId:'verified-user',creatorName:'Verified creator',readOnly:false};
 const f=globalThis.__creatorPlatformsTest={token:'real-creator-cookie',creator,viewAs:false,body:{channels:['onlyfans']},queries:[],calls:[],profile:'canonical-creator',linked:null,accounts:[],list:[],detail:null};
 f.db={from(table){const q={table,filters:[]};f.queries.push(q);const b={select(value){q.select=value;return b},eq(k,v){q.filters.push([k,v]);return b},neq(k,v){q.filters.push([k,'neq',v]);return b},async maybeSingle(){return {error:null,data:table==='creator_accounts'?{id:f.creator.accountId,auth_user_id:f.creator.userId,platform_creator_id:f.profile,requested_channels:f.requested||['onlyfans']}:table==='creator_clone_links'?(f.linked?{clone_id:f.linked}:null):table==='clones'&&f.linked?{id:f.linked,status:'active',business_username:'synthetic-telegram'}:null}}};return b},async rpc(name,args){f.calls.push({name,args});f.profile??='profile-'+f.creator.accountId;f.requested=args.p_channels;return {data:f.profile,error:null}}};
 f.read={async listAccounts(scope){f.calls.push({name:'accounts',scope});return {ok:true,data:f.accounts}},async listConversations(account,cursor){f.calls.push({name:'list',account,cursor});return {ok:true,data:{items:f.list,nextCursor:null}}},async getConversation(account,id){f.calls.push({name:'detail',account,id});return {ok:true,data:f.detail}}};
 f.connection={async enroll(command){f.calls.push({name:'enroll',command});return {ok:true,data:{id:'request-1',status:'pending',accountId:null,error:null,expiresAt:new Date(Date.now()+3600000).toISOString()}}},async enrollments(){return{ok:true,data:[]}},async get(account){f.calls.push({name:'connection-get',account});return {ok:true,data:{accountId:account}}},async command(account,command){f.calls.push({name:'command',account,command});return {ok:true,ack:{ok:true}}}};
 f.SignInBackendError=class extends Error{constructor(status,message){super(message);this.status=status}};
 f.attempt={id:'a'.repeat(8)+'-aaaa-4aaa-aaaa-'+ 'a'.repeat(12),phase:'waiting',handle:null,expiresAt:new Date(Date.now()+900000).toISOString(),enrollmentId:null,width:432,height:720,keyboard:null};
 f.connection.captureContext=async(creatorId,accountId)=>{f.calls.push({name:'capture-context',creatorId,accountId});return {ok:true,data:{accountId,ownerId:accountId?123:null,proxyUrl:accountId?'http://synthetic-private-proxy.example':null,fingerprint:'a'.repeat(64)}}};
 f.signIn={async start(scope,startKey,network){f.calls.push({name:'signin-start',scope,startKey,network});return f.attempt},async status(scope,id){f.calls.push({name:'signin-status',scope,id});return f.attempt},async input(scope,id,input){f.calls.push({name:'signin-input',scope,id,input});return f.attempt},async frame(scope,id){f.calls.push({name:'signin-frame',scope,id});return new Uint8Array([255,216,255,217]).buffer},async cancel(){throw new f.SignInBackendError(410,'Your sign-in expired. Start again.')},async capture(scope,id){f.calls.push({name:'signin-capture',scope,id});return f.signInCapture},async acknowledge(scope,id,enrollmentId){f.calls.push({name:'signin-ack',scope,id,enrollmentId});if(f.ackFail)throw new Error('synthetic lost acknowledgment');return {...f.attempt,phase:'submitted',enrollmentId}}};
 f.broker={async assign(creatorId,selection,actor){f.calls.push({name:'proxy-assignment',creatorId,selection,actor});return 'http://fixture:secret@8.8.4.4:12323'}};
 const stubs={
  'server-only':'',
  'next/headers':`export async function cookies(){return {get(name){return name==='creator_session'?{value:globalThis.__creatorPlatformsTest.token}:undefined}}}`,
  '@/lib/creator-session':`export const CREATOR_SESSION_COOKIE='creator_session'`,
  '@/lib/creator-dashboard-identity':`export async function creatorDashboardIdentity(token){const f=globalThis.__creatorPlatformsTest;f.seenToken=token;return token==='real-creator-cookie'?f.creator:null} export async function creatorDashboardIdentityById(){return null}`,
  '@/lib/supabase-service':`export function serviceClient(){return globalThis.__creatorPlatformsTest.db}`,
  '@/lib/view-as':`export const VIEW_AS_EXIT_PATH='/api/view-as/exit';export async function activeViewAs(){return null}`,
  '@/lib/view-as-banner':`export async function getViewAsBannerInfo(){return globalThis.__creatorPlatformsTest.viewAs?{}:null}`,
  '@/lib/onlyfans/backend':`export function configuredOnlyFansBackend(){return globalThis.__creatorPlatformsTest.read}`,
  '@/lib/onlyfans-connections/backend':`export function configuredConnectionBackend(){return globalThis.__creatorPlatformsTest.connection}`,
  '@/lib/onlyfans-managed-proxy/backend':`export class ManagedProxyError extends Error{constructor(status,message){super(message);this.status=status}};export function configuredManagedProxyBackend(){return globalThis.__creatorPlatformsTest.broker}`,
  '@/lib/onlyfans-sign-in/backend':`export const SignInBackendError=globalThis.__creatorPlatformsTest.SignInBackendError;export function configuredSignInBackend(){return globalThis.__creatorPlatformsTest.signIn}`,
 };
 try{
  await build({stdin:{contents:`export * as server from './lib/creator-platforms/server';export * as setup from './app/creator-auth/platforms/route';export * as enroll from './app/creator-auth/platforms/onlyfans/route';export * as browser from './app/creator-auth/platforms/onlyfans/browser/route';export * as signin from './app/creator-auth/platforms/onlyfans/sign-in/route';export * as account from './app/creator-auth/platforms/onlyfans/[accountId]/route';export * as history from './app/creator-auth/onlyfans/[[...path]]/route';export * as policy from './lib/creator-dashboard-policy';export * as model from './lib/creator-platforms/model';export {middleware} from './middleware';`,resolveDir:root,loader:'ts'},outfile:join(dir,'routes.cjs'),bundle:true,platform:'node',format:'cjs',alias:{'@':root},external:['next/server'],plugins:[{name:'isolated-adapters',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(stubs,a.path)?{path:a.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'ts'}))}}]});
  const m=require(join(dir,'routes.cjs'));
  const request=(path,body,headers={})=>new NextRequest('https://dashboard.example'+path,{method:body===undefined?'GET':'POST',headers:{host:'dashboard.example',origin:'https://dashboard.example','sec-fetch-site':'same-origin','content-type':'application/json',...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
  const accountContext=id=>({params:Promise.resolve({accountId:id})}),historyContext=path=>({params:Promise.resolve({path})});
  for(const v of [[],['onlyfans','onlyfans'],['onlyfans','unknown'],'onlyfans',null])assert.equal(m.model.platformChannels(v),false);
  assert(m.model.platformChannels(['telegram','onlyfans']));
  f.token='';assert.equal((await m.server.platformIdentity()).status,401);assert.equal(f.seenToken,'');f.token='real-creator-cookie';
  f.creator={...creator,readOnly:true};assert.equal((await m.server.platformIdentity(true)).status,403);f.creator=creator;
  f.viewAs=true;assert.equal((await m.server.platformIdentity(true)).status,403);f.viewAs=false;
  for(const headers of [{origin:'https://foreign.example'},{'sec-fetch-site':'cross-site'},{'content-type':'text/plain'}])assert.equal((await m.server.platformCommand(request('/creator-auth/platforms',{channels:['onlyfans']},headers))).status,403);
  assert.equal((await m.server.platformCommand(request('/creator-auth/platforms','{"channels":[],"channels":["onlyfans"]}'))).status,400);
  assert.equal((await m.server.platformCommand(request('/creator-auth/platforms','x'.repeat(131073)))).status,400);
  await m.server.platformProfile(creator);
  assert.deepEqual(f.queries.at(-2).filters,[['id',creator.accountId],['auth_user_id',creator.userId]]);
  f.linked='different-creator';await assert.rejects(()=>m.server.platformProfile(creator));f.linked=null;
  // Exercise the real HTTP adapter with the native empty-binding refusal.
  await build({entryPoints:[join(root,'lib/onlyfans/backend.ts')],outfile:join(dir,'backend.cjs'),bundle:true,platform:'node',format:'cjs',plugins:[{name:'server-marker',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'marker',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}))}}]});
  const {createHttpOnlyFansBackend}=require(join(dir,'backend.cjs'));
  const savedRead=f.read.listAccounts;
  for(const [status,body,empty] of [
    [404,{ok:false,state:'denied',code:'unknown_creator'},true],
    [404,{ok:false,state:'denied',code:'unknown_account'},false],
    [404,{ok:false,code:'unknown_creator'},false],
    [404,'not-json',false],[401,{ok:false},false],[403,{ok:false},false],[503,{ok:false},false],
  ]){
    const backend=createHttpOnlyFansBackend({baseUrl:'https://native.example',token:'synthetic',fetchImpl:async()=>new Response(typeof body==='string'?body:JSON.stringify(body),{status})});
    f.read.listAccounts=scope=>backend.listAccounts(scope);
    if(empty){
      assert.deepEqual(await m.server.ownedPlatformAccounts(f.profile),[]);
      const snapshot=await m.server.platformSnapshot(creator);
      assert.equal(snapshot.onlyfans.status,'ready');assert.deepEqual(snapshot.onlyfans.accounts,[]);
      assert.equal((await backend.listAccounts({creatorId:null})).code,'backend_404','Operator refusals remain refusals');
    }else await assert.rejects(()=>m.server.ownedPlatformAccounts(f.profile));
  }
  f.read.listAccounts=savedRead;
  f.accounts=[{accountId:'of-123',binding:{creatorId:'foreign',channel:'onlyfans'}}];await assert.rejects(()=>m.server.ownedPlatformAccounts(f.profile));
  const own={accountId:'of-123',binding:{creatorId:f.profile,channel:'onlyfans',handle:'synthetic'},capabilities:{}};f.accounts=[own,own];await assert.rejects(()=>m.server.ownedPlatformAccounts(f.profile));f.accounts=[own];
  assert.equal((await m.setup.POST(request('/creator-auth/platforms',{channels:['onlyfans'],creatorId:'foreign'}))).status,400);
  assert.equal((await m.setup.POST(request('/creator-auth/platforms',{channels:['onlyfans']}))).status,200);
  assert.deepEqual(f.calls.find(c=>c.name==='setup_creator_platforms').args,{p_account_id:creator.accountId,p_user_id:creator.userId,p_channels:['onlyfans']});
  const capture={headers:{user_id:'123',user_agent:'Synthetic agent',x_bc:'synthetic-bc',x_of_rev:'synthetic-rev'},signing:{rules:{static_param:'synthetic-static',start:'synthetic-start',end:'synthetic-end',checksum_indexes:Array(32).fill(1),checksum_constant:1}},cookies:[{name:'sess',value:'synthetic-session',domain:'.onlyfans.com',path:'/'}]};
  const command={handle:'synthetic',session:{ownerId:123,capture,xHash:'synthetic-hash',expiresAt:new Date(Date.now()+3600000).toISOString()}};
  assert.equal((await m.enroll.POST(request('/creator-auth/platforms/onlyfans',{...command,creatorId:'foreign'}))).status,400);
  assert.equal((await m.enroll.POST(request('/creator-auth/platforms/onlyfans',{...command,session:{...command.session,proxyUrl:null}}))).status,400);
  assert.equal((await m.enroll.POST(request('/creator-auth/platforms/onlyfans',command))).status,200);
  const enrolled=f.calls.find(c=>c.name==='enroll').command;assert.equal(enrolled.creatorId,f.profile);assert.equal(enrolled.creatorName,creator.creatorName);assert.match(enrolled.actor,/^creator-session:[a-f0-9]{64}$/);assert.match(enrolled.commandKey,/^[a-f0-9]{64}$/);
  const time=String(Date.now());
  const browserSession={ownerId:123,expiresAt:new Date(Date.now()+3600000).toISOString(),browser:{schemaVersion:'of-browser.v1',headers:{user_id:'123',user_agent:'Synthetic agent',x_bc:'synthetic-bc',x_of_rev:'synthetic-rev',x_hash:null},staticParam:'synthetic-static',cookies:[{name:'auth_id',value:'123',domain:'.onlyfans.com',path:'/'},{name:'sess',value:'synthetic',domain:'.onlyfans.com',path:'/'}],samples:[{url:'https://onlyfans.com/api2/v2/users/me',sign:'s:'+ 'a'.repeat(40)+':123:e',time},{url:'https://onlyfans.com/api2/v2/chats',sign:'s:'+'b'.repeat(40)+':123:e',time}]}};
  const browserCommand={profileId:f.profile,handle:'synthetic',session:browserSession};
  assert.equal((await m.browser.POST(request('/creator-auth/platforms/onlyfans/browser',browserCommand))).status,200);
  const browserEnrolled=f.calls.at(-1).command;assert.equal(browserEnrolled.creatorId,f.profile);assert.deepEqual(browserEnrolled.session,browserSession);
  assert.equal((await m.browser.POST(request('/creator-auth/platforms/onlyfans/browser',{...browserCommand,profileId:'stale-profile'}))).status,409);
  assert.equal((await m.browser.POST(request('/creator-auth/platforms/onlyfans/browser',{...browserCommand,creatorId:'forged'}))).status,400);
  assert.equal((await m.browser.POST(request('/creator-auth/platforms/onlyfans/browser',browserCommand,{origin:'https://foreign.example'}))).status,403);
  const badBrowser=structuredClone(browserCommand);badBrowser.session.browser.samples[0].url='https://foreign.example/api2/v2/users/me';
  assert.equal((await m.browser.POST(request('/creator-auth/platforms/onlyfans/browser',badBrowser))).status,400);
  f.creator={...creator,readOnly:true};assert.equal((await m.browser.POST(request('/creator-auth/platforms/onlyfans/browser',browserCommand))).status,403);f.creator=creator;
  const signInPath='/creator-auth/platforms/onlyfans/sign-in',start={action:'start',profileId:f.profile,accountId:'of-123',startKey:f.attempt.id};
  const sendSignIn=body=>m.signin.POST(request(signInPath,body));
  for(const extra of [{creatorId:'foreign'},{actor:'foreign'},{proxyUrl:'http://foreign.example'}])assert.equal((await sendSignIn({...start,...extra})).status,400);
  assert.equal((await sendSignIn({...start,profileId:'stale'})).status,409);
  assert.equal((await sendSignIn({...start,accountId:'of-999'})).status,404);
  assert.equal((await m.signin.POST(request(signInPath,start,{origin:'https://foreign.example'}))).status,403);
  f.token='';assert.equal((await sendSignIn(start)).status,401);assert.equal((await m.signin.GET(request(signInPath+'?attempt='+f.attempt.id))).status,401);f.token='real-creator-cookie';
  for(const protectedView of ['readOnly','viewAs']){
    if(protectedView==='readOnly')f.creator={...creator,readOnly:true};else f.viewAs=true;
    assert.equal((await sendSignIn(start)).status,403);assert.equal((await m.signin.GET(request(signInPath+'?attempt='+f.attempt.id))).status,403);
    f.creator=creator;f.viewAs=false;
  }
  const startedResponse=await sendSignIn(start);assert.equal(startedResponse.status,200);assert.deepEqual(await startedResponse.json(),{ok:true,attempt:f.attempt});
  const signInStart=f.calls.find(c=>c.name==='signin-start');assert.equal(signInStart.scope.creatorId,f.profile);assert.match(signInStart.scope.actor,/^creator-session:[a-f0-9]{64}$/);assert.equal(signInStart.network.proxyUrl,'http://synthetic-private-proxy.example');
  const frameResponse=await m.signin.GET(request(signInPath+'?attempt='+f.attempt.id+'&frame=1'));assert.equal(frameResponse.status,200);assert.equal(frameResponse.headers.get('content-type'),'image/jpeg');assert.equal(frameResponse.headers.get('cache-control'),'private, no-store');assert.equal(frameResponse.headers.get('cross-origin-resource-policy'),'same-origin');
  assert.deepEqual(f.calls.at(-1).scope,signInStart.scope);
  const tap={action:'input',profileId:f.profile,attempt:f.attempt.id,input:{type:'click',x:.5,y:.5}};
  const paired=()=>m.signin.POST(request(signInPath,tap,{accept:'image/png'}));
  const queryCount=f.queries.length,callCount=f.calls.length;
  const pairedResponse=await paired();
  assert.equal(pairedResponse.status,200);assert.equal(pairedResponse.headers.get('content-type'),'image/jpeg');
  assert.equal(pairedResponse.headers.get('cache-control'),'private, no-store');
  assert.equal(pairedResponse.headers.get('cross-origin-resource-policy'),'same-origin');
  assert.match(pairedResponse.headers.get('server-timing'),/^auth;dur=[\d.]+,input;dur=[\d.]+,frame;dur=[\d.]+$/);
  assert.deepEqual(JSON.parse(decodeURIComponent(pairedResponse.headers.get('x-twin-sign-in-attempt'))),f.attempt);
  assert.deepEqual([...new Uint8Array(await pairedResponse.arrayBuffer())],[255,216,255,217]);
  assert.equal(f.queries.length-queryCount,2,'Input and frame share one current profile validation');
  assert.deepEqual(f.calls.slice(callCount).map(c=>c.name),['signin-input','signin-frame']);
  assert.deepEqual(f.calls.at(-1).scope,signInStart.scope);
  const originalFrame=f.signIn.frame;
  for(const status of [429,503]){
    f.signIn.frame=async()=>{throw new f.SignInBackendError(status,'fixture unavailable')};
    const beforeInput=f.calls.filter(c=>c.name==='signin-input').length;
    const fallback=await paired();assert.equal(fallback.status,200);assert.deepEqual(await fallback.json(),{ok:true,attempt:f.attempt});
    assert.equal(f.calls.filter(c=>c.name==='signin-input').length,beforeInput+1,'Screenshot failure never replays accepted input');
  }
  f.signIn.frame=async()=>{throw new f.SignInBackendError(410,'expired')};assert.equal((await paired()).status,410);
  f.signIn.frame=originalFrame;
  f.token='';assert.equal((await paired()).status,401);f.token='real-creator-cookie';
  assert.equal((await m.signin.POST(request(signInPath,tap,{accept:'image/png',origin:'https://foreign.example'}))).status,403);
  for(const protectedView of ['readOnly','viewAs']){
    if(protectedView==='readOnly')f.creator={...creator,readOnly:true};else f.viewAs=true;
    assert.equal((await paired()).status,403);f.creator=creator;f.viewAs=false;
  }
  assert.equal((await sendSignIn({action:'cancel',profileId:f.profile,attempt:f.attempt.id})).status,410,'Expired attempts permit a fresh start');
  f.attempt={...f.attempt,phase:'ready',handle:'synthetic'};f.signInCapture={...browserCommand,session:{...browserSession,networkFingerprint:'a'.repeat(64)}};f.ackFail=true;
  const confirm={action:'confirm',profileId:f.profile,attempt:f.attempt.id};
  const confirmed=await sendSignIn(confirm);assert.equal(confirmed.status,200);const publicConfirmation=await confirmed.json();assert.equal(publicConfirmation.attempt.phase,'submitted');assert(!JSON.stringify(publicConfirmation).includes('synthetic-session'));assert(!JSON.stringify(publicConfirmation).includes('networkFingerprint'));
  const frozen=f.calls.filter(c=>c.name==='enroll').at(-1).command;
  f.ackFail=false;assert.equal((await sendSignIn(confirm)).status,200);assert.deepEqual(f.calls.filter(c=>c.name==='enroll').at(-1).command,frozen,'Lost acknowledgment reuses the exact native enrollment command');
  assert(!f.calls.some(c=>c.name==='command'&&c.command?.action==='activate'));
  // Exercise the real broker response parser and private HTTP adapter as well.
  await build({entryPoints:[join(root,'lib/onlyfans-sign-in/backend.ts')],outfile:join(dir,'signin-backend.cjs'),bundle:true,platform:'node',format:'cjs',alias:{'@':root},plugins:[{name:'server-marker',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'marker',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}))}}]});
  const signinAdapter=require(join(dir,'signin-backend.cjs'));
  assert(signinAdapter.parseSignInAttempt(f.attempt));for(const extra of [{keyboard:'file'},{cookies:[]},{token:'secret'},{width:400}])assert.equal(signinAdapter.parseSignInAttempt({...f.attempt,...extra}),null);
  const expiredBackend=signinAdapter.createSignInBackend({baseUrl:'https://private.example',token:'synthetic-private-token',fetchImpl:async()=>new Response('{}',{status:404})});
  await assert.rejects(()=>expiredBackend.cancel(signInStart.scope,f.attempt.id),error=>error instanceof signinAdapter.SignInBackendError&&error.status===410);
  const before=f.calls.length;assert.equal((await m.account.GET(request('/'),accountContext('of-999'))).status,404);assert(!f.calls.slice(before).some(c=>c.name==='connection-get'));
  assert.equal((await m.account.POST(request('/',{action:'activate',expectedRevision:0,payload:{limitUnits:7,throttleSeconds:2,mediaEnabled:false}}),accountContext('of-123'))).status,400);
  assert.equal((await m.account.POST(request('/',{action:'session',expectedRevision:0,payload:command.session}),accountContext('of-123'))).status,200);
  assert.equal((await m.history.GET(request('/?creator=foreign'),historyContext(['accounts']))).status,404);
  assert.equal((await m.history.GET(request('/'),historyContext(['accounts','of-999','conversations']))).status,404);
  assert.equal((await m.history.GET(request('/?cursor=bad%2Fcursor'),historyContext(['accounts','of-123','conversations']))).status,400);
  f.list=[{accountId:'of-999'}];assert.equal((await m.history.GET(request('/'),historyContext(['accounts','of-123','conversations']))).status,502);
  f.list=[];assert.equal((await m.history.GET(request('/'),historyContext(['accounts','of-123','conversations']))).status,200);
  f.detail={accountId:'of-123',conversationId:'conversation-1',summary:{accountId:'of-123',conversationId:'conversation-1'},messages:[{conversationId:'foreign'}]};
  assert.equal((await m.history.GET(request('/'),historyContext(['accounts','of-123','conversations','conversation-1']))).status,502);
  f.detail.messages=[];assert.equal((await m.history.GET(request('/'),historyContext(['accounts','of-123','conversations','conversation-1']))).status,200);
  const rows=await(await m.history.GET(request('/'),historyContext(['accounts']))).json();assert.equal(rows.accounts[0].capabilities.sendManualMessage,'unavailable');
  assert.equal((await m.history.GET(request('/',undefined,{'next-action':'forged'}),historyContext(['accounts']))).status,403);
  for(const path of ['/creator-auth/platforms','/creator-auth/platforms/onlyfans/of-123','/creator-auth/onlyfans/accounts/of-123/conversations'])assert(m.policy.creatorPlatformApiAllowed(path,'GET',false));
  assert(m.policy.creatorPlatformApiAllowed('/creator-auth/platforms/onlyfans','POST',false));assert(m.policy.creatorPlatformApiAllowed('/creator-auth/platforms/onlyfans/browser','POST',false));assert(!m.policy.creatorPlatformApiAllowed('/creator-auth/platforms/onlyfans/browser','GET',false));assert(m.policy.creatorPlatformApiAllowed('/creator-auth/platforms/onlyfans/connector','GET',false));assert(!m.policy.creatorPlatformApiAllowed('/creator-auth/onlyfans/accounts/of-123/conversations','POST',false));assert(!m.policy.creatorPlatformApiAllowed('/creator-auth/platforms','GET',true));assert(!m.policy.creatorPlatformApiAllowed('/creator-auth/platforms/unknown','POST',false));assert(m.policy.isCreatorPlatformPage('/creator/platforms'));assert(!m.policy.isCreatorPlatformPage('/creator/edit'));
  for(const method of ['GET','HEAD','POST'])assert(m.policy.creatorPlatformApiAllowed(signInPath,method,false));assert(!m.policy.creatorPlatformApiAllowed(signInPath,'POST',true));assert(!m.policy.creatorPlatformApiAllowed(signInPath+'/capture','GET',false));
  f.creator={...creator,onboarded:false,cloneIds:[]};
  const authenticated=path=>request(path,undefined,{cookie:'creator_session=real-creator-cookie'});
  assert.equal((await m.middleware(authenticated('/creator/platforms'))).status,200);assert.equal((await m.middleware(authenticated('/creator/onlyfans/inbox'))).status,200);assert.equal((await m.middleware(authenticated('/creator/edit'))).status,307);
  assert.equal((await m.middleware(authenticated('/creator-auth/platforms'))).status,200);assert.equal((await m.middleware(authenticated('/creator-auth/onlyfans/accounts'))).status,200);
  // New identities receive the same optional capability, without a creator roster or provider account.
  const actors=new Set();
  for(const kind of ['new-standalone','new-agency-creator','existing-telegram']){
    f.creator={accountId:kind+'-account',userId:kind+'-user',creatorName:kind,readOnly:false,onboarded:false,cloneIds:[]};
    f.profile=kind==='existing-telegram'?'existing-telegram-profile':null;f.linked=f.profile;
    f.requested=kind==='existing-telegram'?['telegram']:[];f.accounts=[];f.calls=[];f.queries=[];
    const beforeRead=await m.server.platformSnapshot(f.creator);
    assert.deepEqual(beforeRead.requested,f.requested);assert.deepEqual(beforeRead.onlyfans.accounts,[]);
    assert.equal(beforeRead.onlyfans.status,'ready');assert.equal(f.calls.some(c=>c.name==='setup_creator_platforms'||c.name==='enroll'||c.name==='signin-start'),false,'Reading a creator page must not connect or migrate them');
    assert.equal(beforeRead.telegram.configured,kind==='existing-telegram');
    const channels=kind==='existing-telegram'?['telegram','onlyfans']:['onlyfans'];
    const chosen=await m.setup.POST(request('/creator-auth/platforms',{channels}));assert.equal(chosen.status,200);
    assert.deepEqual(f.calls.find(c=>c.name==='setup_creator_platforms').args,{p_account_id:f.creator.accountId,p_user_id:f.creator.userId,p_channels:channels});
    const chosenSnapshot=await chosen.json();assert.deepEqual(chosenSnapshot.onlyfans.accounts,[]);assert.deepEqual(chosenSnapshot.requested,channels);
    assert.equal(chosenSnapshot.telegram.configured,kind==='existing-telegram');
    for(const q of f.queries.filter(q=>q.table==='creator_accounts'))assert.deepEqual(q.filters,[['id',f.creator.accountId],['auth_user_id',f.creator.userId]]);
    f.attempt={...f.attempt,phase:'waiting',enrollmentId:null,handle:null};
    const nextStart=await sendSignIn({action:'start',profileId:f.profile,accountId:null,startKey:f.attempt.id});assert.equal(nextStart.status,200);
    assert(!JSON.stringify(await nextStart.json()).includes('secret'),'First-connect credentials stay server-side');
    const assignment=f.calls.find(c=>c.name==='proxy-assignment');
    assert.equal(assignment.creatorId,f.profile);assert.equal(assignment.selection.countryCode,'auto');
    assert.equal(assignment.selection.handle,'pending_'+require('node:crypto').createHash('sha256').update(f.profile).digest('hex').slice(0,32));
    assert.match(assignment.actor,/^creator-session:[a-f0-9]{64}$/);
    assert.equal(f.calls.find(c=>c.name==='signin-start').network.proxyUrl,'http://fixture:secret@8.8.4.4:12323');
    const broker=f.broker;f.broker=null;
    const count=f.calls.filter(c=>c.name==='signin-start').length;
    assert.equal((await sendSignIn({action:'start',profileId:f.profile,accountId:null,startKey:f.attempt.id})).status,503);
    assert.equal(f.calls.filter(c=>c.name==='signin-start').length,count,'No broker means no direct browser fallback');
    f.broker=broker;
    actors.add('creator-session:'+require('node:crypto').createHash('sha256').update(f.creator.accountId).digest('hex'));
    assert.equal(f.calls.some(c=>c.name==='enroll'||c.name==='command'),false,'Starting login is not account enrollment or delivery activation');
    assert.equal((await m.account.GET(request('/'),accountContext('someone-elses-account'))).status,404);
  }
  assert.equal(actors.size,3,'Each creator has their own private sign-in actor');
  console.log('PASS creator platforms: current/future and agency creator identities, opt-in without migration, Telegram preservation, owner-isolated reconnect and server-prepared standalone first connection, authenticated frame/confirmation, expired restart, exact lost-ack retry, cookie identity, view-as/origin/body guards, no creator activation, read-only owned history and middleware routes.');
 }finally{delete globalThis.__creatorPlatformsTest;rmSync(dir,{recursive:true,force:true})}
}
main().catch(e=>{console.error(e);process.exitCode=1});
