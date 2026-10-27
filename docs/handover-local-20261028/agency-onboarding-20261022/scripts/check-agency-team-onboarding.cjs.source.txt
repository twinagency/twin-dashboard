const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'lib/agency-team-command.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,FormData,Set});
const parse=mod.exports.parseTeamCommand;
const form=(extra={})=>{const f=new FormData();for(const[k,v]of Object.entries({operation:'invite',email:'NEW@example.test',access:'read',creator_scope:'selected',...extra}))f.append(k,v);return f;};
assert.equal(parse(form(),true).email,'new@example.test');
assert.equal(parse(form({access:'manage'}),false),null);
assert.equal(parse(form({agency:'other'}),true),null);
assert.equal(parse(form({creator_scope:'invalid'}),true),null);
const dup=form();dup.append('email','another@example.test');assert.equal(parse(dup,true),null);
const all=form({creator_scope:'all'});all.append('creator_ids','30000000-0000-4000-8000-000000000001');assert.equal(parse(all,true),null);
const accept=fs.readFileSync(path.join(root,'app/agency/join/accept/route.ts'),'utf8');
assert(accept.indexOf('auth.auth.getUser')<accept.indexOf('rpc("agency_team_accept"'));
assert(accept.includes('email_confirmed_at')&&accept.includes('existing.error||existing.data'));
console.log('Agency team command validation and acceptance boundary checks passed');

function loadRoute(file,mocks) {
  const module={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {module,exports:module.exports,require:id=>{if(id in mocks)return mocks[id];if(id==='node:crypto')return require(id);throw Error('Unexpected import '+id)},FormData,URL,Date,process:{env:{SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_KEY:'fixture'}}});
  return module.exports;
}
class ResponseMock {
  constructor(body,init={}){this.status=init.status??200;this.headers=new Headers();this.cookies={set(){},delete(){}};}
  static redirect(url,status){const r=new ResponseMock(null,{status});r.headers.set('location',url);return r;}
}
const request=(fd,origin='https://fixture.invalid')=>({headers:new Headers({origin,'sec-fetch-site':'same-origin'}),formData:async()=>fd});
(async()=>{
  let owner=null,calls=[];
  const db={rpc:async(name,args)=>{calls.push({name,args});return {data:'ok',error:null};}};
  const common={'next/server':{NextResponse:ResponseMock},'@/lib/form-origin':{dashboardOrigin:()=> 'https://fixture.invalid',trustedFormOrigin:req=>req.headers.get('origin')==='https://fixture.invalid'},'@/lib/supabase-service':{serviceClient:()=>db}};
  const route=loadRoute('app/agency/team/manage/route.ts',{...common,'@/lib/agency-team':{agencyTeamOwner:async()=>owner,teamTokenHash:s=>'hash-'+s},'@/lib/agency-team-command':{parseTeamCommand:parse},'@/lib/agency-management-policy':{agencyCanManage:()=>true}});
  assert.equal((await route.POST(request(form()))).status,403);assert.equal(calls.length,0);
  owner={id:'agency-from-session',userId:'actor-from-session'};
  assert.equal((await route.POST(request(form(),'https://evil.invalid'))).status,403);assert.equal(calls.length,0);
  assert.equal((await route.POST(request(form()))).status,303);
  assert.equal(calls[0].args.p_actor,'actor-from-session');assert.equal(calls[0].args.p_agency,'agency-from-session');
  calls=[];
  let verifiedEmail='wrong@example.test',confirmed=true,existing=false;
  const auth={auth:{signInWithPassword:async()=>({data:{session:{access_token:'verified',refresh_token:'refresh',user:{id:'recipient'}}}}),getUser:async()=>({data:{user:{id:'recipient',email:verifiedEmail,email_confirmed_at:confirmed?'now':null}}})}};
  const query={select(){return this},eq(){return this},maybeSingle:async()=>({data:existing?{user_id:'recipient'}:null,error:null})};db.from=()=>query;
  const accept=loadRoute('app/agency/join/accept/route.ts',{...common,'@supabase/supabase-js':{createClient:()=>auth},'@/lib/agency-team':{pendingTeamInvite:async()=>({email:'new@example.test',agencyName:'Twin'}),teamTokenHash:s=>'hash'},'@/lib/agency-session':{setAgencySessionCookies:async()=>{}},'@/lib/session':{SESSION_COOKIE:'admin'},'@/lib/clone-scope':{CLONE_SCOPE_COOKIE:'clone'},'@/lib/agency-brand':{AGENCY_PORTAL_COOKIE:'portal',isMoxy:()=>false,isLynq:()=>false}});
  const join=()=>{const f=new FormData();f.set('code','a'.repeat(64));f.set('email','new@example.test');f.set('password','synthetic-password');return f;};
  await accept.POST(request(join()));assert.equal(calls.length,0,'Wrong email must not accept');
  verifiedEmail='new@example.test';confirmed=false;await accept.POST(request(join()));assert.equal(calls.length,0,'Unconfirmed email must not accept');
  confirmed=true;existing=true;await accept.POST(request(join()));assert.equal(calls.length,0,'Existing membership must not be overwritten');
  existing=false;const accepted=await accept.POST(request(join()));assert.equal(calls.length,1);assert.equal(calls[0].args.p_user,'recipient');assert.equal(calls[0].args.p_verified_email,'new@example.test');assert(accepted.headers.get('location').endsWith('/agency/setup'));
  console.log('Owner authorization, origin, verified email and existing-membership HTTP tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
