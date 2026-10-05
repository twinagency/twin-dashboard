// Exercises real Moxy autosave and onboarding handlers with isolated records.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{build}=require('esbuild');
const account='11111111-1111-4111-8111-111111111111';
const agency='bc670215-110b-4ea0-8f5c-af3dfe21d253';
const revision='2026-10-05T00:00:00.000Z',submittedAt='2026-10-04T00:00:00.000Z';
let state,identity,writes,race;
function reset(status='submitted'){
 identity={accountId:account,name:'Moxy',agencyId:agency,readOnly:false};
 state={application:{id:account,creator_account_id:account,status,answers:{preferred_name:'Before'},updated_at:revision,submitted_at:submittedAt},consents:[],progress:null};
 writes=[];race=false;
 global.__editIdentity=()=>identity;
}
global.__editDb={from(table){
 let operation='select',body,filters=[];
 const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},limit(){return q;},
 update(v){operation='update';body=v;return q;},insert(v){operation='insert';body=v;return q;},upsert(v){operation='upsert';body=v;return q;},
 maybeSingle(){return Promise.resolve(execute(true));},single(){return Promise.resolve(execute(true));},
 then(resolve,reject){return Promise.resolve(execute(false)).then(resolve,reject);}};
 function execute(single){
  if(operation==='select'){
   const rows=table==='creator_applications'?[state.application]:table==='creator_consents'?state.consents:table==='creator_files'?[]:state.progress?[state.progress]:[];
   const matched=rows.filter(row=>row&&filters.every(([k,v])=>row[k]===v));return{data:single?matched[0]||null:matched,error:null};
  }
  if(table==='creator_applications'&&operation==='update'){
   if(race)state.application.status='withdrawn';
   if(!filters.every(([k,v])=>state.application[k]===v))return{data:null,error:null};
   assert.ok(filters.some(([k,v])=>k==='creator_account_id'&&v===account));
   writes.push({table,body:{...body}});Object.assign(state.application,body);return{data:state.application,error:null};
  }
  assert.equal(body.creator_account_id,account,'Write is owned by current creator');
  writes.push({table,body:{...body}});
  if(table==='creator_consents')state.consents.push({id:'fixture-consent',...body});
  if(table==='creator_onboarding_progress')state.progress={...state.progress,...body};
  return{data:body,error:null};
 }
 return q;
}};
const request=(body,json=false)=>({headers:new Headers({'content-type':json?'application/json':'application/x-www-form-urlencoded'}),cookies:{get:()=>({value:'fixture'})},url:'https://dashboard.lynqai.co/creator-auth/onboarding',json:async()=>body,formData:async()=>new URLSearchParams(body)});
(async()=>{
 const out=path.resolve('node_modules/.cache/moxy-post-submit-edit');fs.mkdirSync(out,{recursive:true});
 await build({entryPoints:{draft:'app/creator-auth/onboarding/draft/route.ts',onboarding:'app/creator-auth/onboarding/route.ts',policy:'lib/creator-onboarding-policy.ts'},outdir:out,bundle:true,platform:'node',format:'cjs',alias:{'@':process.cwd()},plugins:[{name:'private-fixture',setup(b){
 b.onResolve({filter:/^(next\/server|@\/lib\/(?:supabase|creator-session|creator-dashboard-identity|creator-origin|creator-routing|form-origin|agency-brand))$|(?:^|\/)agency-brand$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:
 a.path==='next/server'?'export const NextResponse={json:(body,init)=>new Response(JSON.stringify(body),init),redirect:(url,status)=>new Response(null,{status,headers:{Location:String(url)}})};'
 :a.path.endsWith('supabase')?'export const supabaseAdmin=globalThis.__editDb;'
 :a.path.endsWith('creator-session')?'export const CREATOR_SESSION_COOKIE="fixture";'
 :a.path.endsWith('creator-dashboard-identity')?'export const creatorDashboardIdentity=async()=>globalThis.__editIdentity();'
 :a.path.endsWith('creator-origin')?'export const creatorRequestUrl=(_req,path)=>new URL(path,"https://dashboard.lynqai.co");'
 :a.path.endsWith('creator-routing')?'export const CREATOR_PORTAL_COOKIE="fixture";export const creatorLoginPath=()=>"/creator/moxy/login";'
 :a.path.endsWith('form-origin')?'export const trustedFormOrigin=()=>true;'
 :'export const isMoxy=name=>name==="Moxy";'}));
 }}]});
 const draft=require(path.join(out,'draft.js')).POST,save=require(path.join(out,'onboarding.js')).POST,editable=require(path.join(out,'policy.js')).creatorOnboardingEditable;
 reset();
 for(const status of ['draft','submitted','reviewing','approved'])assert.equal(editable(status,identity),true);
 for(const status of ['rejected','withdrawn','unexpected'])assert.equal(editable(status,identity),false);
 assert.equal(editable('submitted',{...identity,agencyId:'other'}),false);
 assert.equal(editable('submitted',{...identity,name:'Twin'}),false);
 assert.equal(editable('draft',{...identity,readOnly:true}),false);
 for(const status of ['submitted','reviewing','approved']){
  reset(status);
  const response=await draft(request({section:'personal-contact',revision,answers:{preferred_name:'Updated'}},true));
  assert.equal(response.status,200);assert.equal(state.application.answers.preferred_name,'Updated');
  assert.equal(state.application.status,status);assert.equal(state.application.submitted_at,submittedAt);
  assert.equal(state.consents.length,0);
  const finish=await save(request({action:'questionnaire',revision:state.application.updated_at}));
  assert.equal(new URL(finish.headers.get('location')).searchParams.get('status'),'questionnaire_saved');
  assert.equal(state.progress.questionnaire_completed,true);assert.equal(state.application.status,status);
 }
 reset();const stale=await draft(request({section:'personal-contact',revision:'old',answers:{preferred_name:'Lost'}},true));assert.equal(stale.status,409);assert.equal(writes.length,0);
 reset();race=true;const racing=await draft(request({section:'personal-contact',revision,answers:{preferred_name:'Lost'}},true));assert.equal(racing.status,409);assert.equal(writes.length,0);
 reset();identity={...identity,agencyId:'different'};
 assert.equal((await draft(request({section:'personal-contact',revision,answers:{preferred_name:'Denied'}},true))).status,409);assert.equal(writes.length,0);
 reset();identity={...identity,readOnly:true};
 assert.equal((await draft(request({section:'personal-contact',revision,answers:{preferred_name:'Denied'}},true))).status,403);assert.equal(writes.length,0);
 reset();
 const missing=await save(request({action:'consent',legal_name:'Fixture'}));
 assert.equal(new URL(missing.headers.get('location')).searchParams.get('status'),'consent_missing');assert.equal(state.consents.length,0);
 const consent=await save(request({action:'consent',legal_name:'Fixture',agreed:'on'}));
 assert.equal(new URL(consent.headers.get('location')).searchParams.get('status'),'consent_saved');assert.equal(state.consents.length,1);
 await save(request({action:'consent',legal_name:'Changed',agreed:'on'}));
 assert.equal(state.consents.length,1);assert.equal(state.consents[0].legal_name,'Fixture','Existing signed consent is not replaced');
 await save(request({action:'skip_voice'}));assert.equal(state.progress.voice_completed,true);
 const before=JSON.stringify(state.application);
 const repeat=await save(request({action:'submit'}));
 assert.equal(new URL(repeat.headers.get('location')).pathname,'/creator');assert.equal(JSON.stringify(state.application),before);
 console.log('Moxy post-submission editing passed: persisted answers and completion, status/timestamp preservation, stale/racing updates denied, agency/read-only isolation, explicit consent only and no duplicate consent or resubmission.');
 fs.rmSync(out,{recursive:true,force:true});
})().catch(e=>{console.error(e);process.exitCode=1;});
