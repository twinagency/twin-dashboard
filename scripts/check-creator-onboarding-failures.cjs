const assert=require('node:assert/strict');const {createRequire}=require('node:module');const {resolve,basename}=require('node:path');const {rmSync}=require('node:fs');
const app=createRequire(resolve('package.json'));const {build}=app('esbuild');
const account='11111111-1111-4111-8111-111111111111';let failedTable='',writes=[],writeFailure=null,applicationExists=true;
global.__flowIdentity={accountId:account,name:'Moxy',readOnly:false};global.__flowCookieWrites=[];
global.__flowDatabase={from(table){let mutation=null;const q={select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},insert(values){mutation=values;writes.push(table);return q;},update(values){mutation=values;writes.push(table);return q;},upsert(){writes.push(table);return q;},maybeSingle(){return Promise.resolve(result());},single(){return Promise.resolve(result());},then(resolve){return Promise.resolve(result()).then(resolve);}};
 function result(){if(table==='creator_applications'&&mutation?.status==='submitted'&&writeFailure)return{data:null,error:writeFailure};if(table===failedTable)return{data:null,error:{code:'TEST_UNAVAILABLE'}};return{data:table==='creator_applications'?(applicationExists||mutation?{id:account,status:'draft',answers:{},updated_at:'2026-10-04T00:00:00Z'}:null):table==='creator_files'?[]:table==='creator_consents'?{id:account}:null,error:null};}return q;}};
(async()=>{
 const outdir=resolve('node_modules/.cache/creator-flow-handlers-'+basename(process.cwd()));
 await build({entryPoints:{Onboarding:'app/creator-auth/onboarding/route.ts',Logout:'app/creator-auth/logout/route.ts'},outdir,bundle:true,platform:'node',format:'cjs',packages:'external',plugins:[{name:'fixtures',setup(b){
  b.onResolve({filter:/^(?:@\/lib\/supabase|@\/lib\/creator-dashboard-identity|@\/lib\/creator-session|@\/lib\/creator-origin|@\/lib\/flirt-onboarding|next\/headers)$/},args=>({path:args.path,namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path.endsWith('/supabase')?'export const supabaseAdmin=globalThis.__flowDatabase;':args.path.endsWith('/creator-dashboard-identity')?'export const creatorDashboardIdentity=async()=>globalThis.__flowIdentity;':args.path.endsWith('/creator-session')?'export const CREATOR_SESSION_COOKIE="fixture-creator";':args.path.endsWith('/creator-origin')?'export const creatorRequestUrl=(req,path)=>new URL(path,new URL(req.url).origin);':args.path.endsWith('/flirt-onboarding')?'export const flirtOnboardingOptional=()=>true;export const creatorOnboardingEditable=(status)=>!status||status==="draft";':'export const cookies=async()=>({get:()=>({value:"twin"}),set:(...args)=>globalThis.__flowCookieWrites.push(args)});'}));
 }}]});
 const {NextRequest}=app('next/server');const {POST}=require(outdir+'/Onboarding.js');
 const request=action=>new NextRequest('https://creator.example/creator-auth/onboarding',{method:'POST',body:new URLSearchParams({action,legal_name:'Synthetic Creator',agreed:'on'}),headers:{origin:'https://creator.example'}});
 failedTable='creator_consents';writes=[];let response=await POST(request('consent'));assert.equal(new URL(response.headers.get('location')).searchParams.get('status'),'error');assert.equal(writes.length,0,'cannot invent missing consent after lookup error');
 for(const table of ['creator_onboarding_progress','creator_consents','creator_files','creator_applications']){failedTable=table;writes=[];response=await POST(request('submit'));assert.equal(new URL(response.headers.get('location')).searchParams.get('status'),'error',table);assert.equal(writes.length,0,'cannot submit using unavailable '+table);}
 failedTable='';writes=[];response=await POST(request('submit'));assert.equal(new URL(response.headers.get('location')).pathname,'/creator');assert.deepEqual(writes,['creator_applications'],'explicit optional submission still works');
 // A removal reservation can reject either the first submission insert or a draft update.
 for(const exists of [true,false]){
  applicationExists=exists;writeFailure={code:'P0001',message:'creator_file_removal_pending'};writes=[];
  response=await POST(request('submit'));const target=new URL(response.headers.get('location'));
  assert.equal(target.pathname,'/creator/onboarding');assert.equal(target.searchParams.get('step'),'consent');assert.equal(target.searchParams.get('status'),'file_removal_pending');
  assert.ok(writes.includes('creator_applications'),'the database rejection is exercised at the submit write');
 }
 writeFailure={code:'OTHER',message:'unrelated safe fixture'};response=await POST(request('submit'));assert.equal(new URL(response.headers.get('location')).searchParams.get('status'),'error','unrelated failures retain generic feedback');
 applicationExists=true;writeFailure=null;
 const logout=require(outdir+'/Logout.js');global.__flowIdentity=null;
 for(const method of ['GET','POST'])for(const next of ['/creator/onboarding?step=content','https://evil.example','/creator-management']){
  global.__flowCookieWrites=[];response=await logout[method](new Request('https://creator.example/creator-auth/logout?next='+encodeURIComponent(next),{method}));const location=new URL(response.headers.get('location'));assert.equal(location.origin,'https://creator.example');assert.equal(location.pathname,'/creator/login');assert.equal(location.searchParams.get('next'),next.startsWith('/creator/onboarding')?next:'/creator');assert.equal(global.__flowCookieWrites[0][2].maxAge,0);assert.equal(global.__flowCookieWrites[0][2].httpOnly,true);
 }
 if (basename(process.cwd()) === 'moxy') {
  process.env.NODE_ENV='production';
  for (const [origin,identity,expected] of [
   ['https://dashboard.lynqai.co',null,'/creator/moxy/login'],
   ['https://creator.example',{name:'Moxy'},'/creator/moxy/login'],
   ['https://dashboard.lynqai.co',{name:'Tether'},'/creator/tether/login'],
   ['https://dashboard.lynqai.co',{name:'LYNQ'},'/creator/link/login'],
  ]) {
   global.__flowIdentity=identity;
   for (const method of ['GET','POST']) {
    response=await logout[method](new Request(origin+'/creator-auth/logout?next=%2Fcreator%2Fonboarding%3Fstep%3Dcontent',{method,headers:{host:new URL(origin).host}}));
    const destination=new URL(response.headers.get('location'));
    assert.equal(destination.pathname,expected,'logout preserves current trusted brand');
    assert.equal(destination.searchParams.get('next'),'/creator/onboarding?step=content');
   }
  }
 }
 rmSync(outdir,{recursive:true,force:true});console.log('Onboarding action failure checks passed: consent lookup fails closed, each submit-read outage prevents writes, explicit optional submission still works, reset/logout clears HttpOnly cookie and safely preserves destination.');
})().catch(e=>{console.error(e);process.exitCode=1;});
