const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),ts=require('typescript');
const {NextRequest,NextResponse}=require('next/server');
const file='app/creator-testing/[key]/route.ts',source=fs.readFileSync(file,'utf8');
const deadline=Number(source.match(/const EXPIRES_AT = (\d+)/)[1]),digest=source.match(/const KEY_SHA256 = "([a-f0-9]{64})"/)[1];
const accountId='f80d1add-d10c-4039-90f3-99e6cfc04b91',userId='5d886965-4c7a-41fc-9d90-bebd1ba22c7b',fixtureKey='a'.repeat(64);
let clock=deadline-3600000,identity,identityCalls=0,signed=0;
class Clock extends Date {static now(){return clock}}
function load(path,mocks){
 const exports={};const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,require:k=>{if(k in mocks)return mocks[k];throw Error('Unexpected dependency: '+k)},process:{env:{CREATOR_SESSION_SECRET:'isolated-session-fixture-secret',NODE_ENV:'production'}},crypto:crypto.webcrypto,btoa,atob,TextEncoder,TextDecoder,Uint8Array,Buffer,URL,Date:Clock,console,Set},{filename:path});return exports;
}
const sessions=load('lib/creator-session.ts',{});
const route=load(file,{
 'node:crypto':{...crypto,createHash:alg=>({update:key=>({digest:()=>key===fixtureKey?Buffer.from(digest,'hex'):crypto.createHash(alg).update(key).digest()})})},
 'next/server':{NextResponse},
 '@/lib/creator-dashboard-identity':{creatorDashboardIdentity:async token=>{identityCalls++;assert(await sessions.verifyCreatorSession(token));return identity}},
 '@/lib/creator-session':{...sessions,signCreatorSession:async(...args)=>{signed++;return sessions.signCreatorSession(...args)}},
 '@/lib/creator-routing':{CREATOR_PORTAL_COOKIE:'portal',creatorPortalCookieOptions:()=>({httpOnly:true,path:'/'})},
 '@/lib/form-origin':{dashboardOrigin:()=> 'https://dashboard.tgaiclone.xyz'},
 '@/lib/agency-policy':{AGENCY_COOKIE:'agency'},'@/lib/agency-brand':{AGENCY_PORTAL_COOKIE:'agency_portal'},
 '@/lib/session':{SESSION_COOKIE:'admin'},'@/lib/clone-scope':{CLONE_SCOPE_COOKIE:'clone'}
});
function get(key=fixtureKey,query='',headers={}){return route.GET(new NextRequest('https://dashboard.tgaiclone.xyz/creator-testing/'+key+query,{headers}),{params:Promise.resolve({key})})}
(async()=>{
 identity={accountId,userId,readOnly:false};
 assert.equal((await get('b'.repeat(64))).status,404);assert.equal((await get('bad')).status,404);assert.equal((await get(fixtureKey,'',{'next-action':'forged'})).status,404);assert.equal((await route.HEAD()).status,404);assert.equal(identityCalls,0);assert.equal(signed,0);
 let r=await get(fixtureKey,'?next=https://evil.invalid&accountId=other');
 assert.equal(r.status,303);assert.equal(r.headers.get('location'),'https://dashboard.tgaiclone.xyz/creator/platforms');
 assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.equal(r.headers.get('x-robots-tag'),'noindex, nofollow');
 const cookie=r.cookies.get(sessions.CREATOR_SESSION_COOKIE);assert(cookie);
 const session=await sessions.verifyCreatorSession(cookie.value);assert.equal(session.accountId,accountId);assert.equal(session.userId,userId);assert.equal(session.exp,deadline);
 assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match(r.headers.get('set-cookie'),/Secure/);assert.match(r.headers.get('set-cookie'),/Max-Age=3600/);
 for(const name of ['agency','agency_portal','admin','clone'])assert.equal(r.cookies.get(name).value,'');
 for(const invalid of [null,{accountId:'other',userId,readOnly:false},{accountId,userId:'other',readOnly:false},{accountId,userId,readOnly:true}]){
 identity=invalid;assert.equal((await get()).status,404);
 }
 const signedBefore=signed;clock=deadline+1;assert.equal((await get()).status,404);assert.equal(signed,signedBefore);assert.equal(await sessions.verifyCreatorSession(cookie.value),null);
 clock=deadline-3600000;const normal=await sessions.verifyCreatorSession(await sessions.signCreatorSession(accountId,userId));assert.equal(normal.exp,clock+30*24*60*60*1000);
 await assert.rejects(sessions.signCreatorSession(accountId,userId,Infinity));await assert.rejects(sessions.signCreatorSession(accountId,userId,clock-1));await assert.rejects(sessions.signCreatorSession(accountId,userId,clock+31*24*60*60*1000));
 console.log('PASS scoped test link, invalid/expired key refusal, fixed destination, existing identity checks, short session expiry and unchanged normal session duration');
})().catch(e=>{console.error(e);process.exitCode=1});
