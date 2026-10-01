/* Disposable FLIRT-only invitation journey. Never log credentials or customer data. */
const {randomBytes,createHash}=require('node:crypto');
const {CLONES,ID}=require('./deployment/flirt-live-twin.cjs');
const ORIGIN='https://dashboard.flirtaiagency.com';
const API='https://lkmfwpqegjluirfusnaw.supabase.co';
const checks=[],fixtures=[],codes=[];
const stamp='flirt-invite-check-'+Date.now()+'-'+randomBytes(6).toString('hex');
function assert(ok,label){if(!ok)throw new Error(label);}
async function request(url,options={}){return fetch(url,{redirect:'manual',signal:AbortSignal.timeout(120000),...options});}
async function api(path,options={}){
  const response=await request(API+path,{...options,headers:{apikey:process.env.SUPABASE_SERVICE_KEY,...options.headers}});
  assert(response.ok,`FLIRT fixture API returned ${response.status}`);
  const body=await response.text();return body?JSON.parse(body):null;
}
function page(path,cookie,options={}){return request(ORIGIN+path,{...options,headers:{Origin:ORIGIN,...(cookie?{Cookie:cookie}:{}),...options.headers}});}
const location=response=>new URL(response.headers.get('location'),ORIGIN);
const post=(path,cookie,fields,headers={})=>page(path,cookie,{method:'POST',headers,body:new URLSearchParams(fields)});
async function signup(suffix,code,shouldWork=true){
  const fixture={email:stamp+'-'+suffix+'@example.com',password:randomBytes(24).toString('hex'),name:'FLIRT invite verification '+suffix};
  fixtures.push(fixture);
  assert((await api('/rest/v1/creator_accounts?select=id&email=eq.'+encodeURIComponent(fixture.email))).length===0,'Fixture email collision');
  const response=await post('/creator-auth/signup',null,{email:fixture.email,password:fixture.password,display_name:fixture.name,...(code?{agency_code:code}:{})});
  const saved=await api('/rest/v1/creator_accounts?select=id,auth_user_id,updated_at&email=eq.'+encodeURIComponent(fixture.email));
  if(saved.length===1)Object.assign(fixture,saved[0]);
  if(!shouldWork){assert(!fixture.id&&location(response).searchParams.get('error')==='agency_code','Invalid code accepted');return fixture;}
  const cookie=response.headers.getSetCookie().find(value=>value.startsWith('twin_creator_session='));
  assert(response.status===303&&fixture.id&&cookie,'Invited creator signup failed');
  fixture.cookie=cookie.split(';')[0];return fixture;
}
async function makeInvite(cookie,suffix){
  const label=stamp+'-'+suffix;
  // Register the unique label before posting so cleanup can recover a code even
  // if the HTTP response is interrupted after the database write.
  const fixture={label};codes.push(fixture);
  const response=await post('/agency/creator-invites/manage',cookie,{action:'generate',label,max_uses:'1',expires_days:'1'});
  const code=location(response).searchParams.get('created');
  assert(response.status===303&&/^[A-Z2-9]{10}$/.test(code||''),'Invite generation failed');
  const hash=createHash('sha256').update(code).digest('hex');
  const saved=await api('/rest/v1/creator_agency_codes?select=id,agency_id,uses,max_uses&code_hash=eq.'+hash);
  assert(saved.length===1&&saved[0].agency_id===ID&&saved[0].max_uses===1,'Invite must be stored under FLIRT agency');
  Object.assign(fixture,saved[0],{code});return fixture;
}
async function main(){
  assert(process.env.FLIRT_BACKEND_ENABLED==='true'&&process.env.FLIRT_SUPABASE_PROJECT_REF==='lkmfwpqegjluirfusnaw'&&process.env.SUPABASE_URL===API&&process.env.DASHBOARD_PUBLIC_ORIGIN===ORIGIN,'Refusing non-FLIRT runtime');
  const signed=await post('/admin-auth',null,{password:process.env.DASHBOARD_PASSWORD,next:'/agency/creator-invites'});
  const cookie=signed.headers.getSetCookie().find(value=>value.startsWith('allie_admin_session='))?.split(';')[0];
  assert(signed.status===303&&cookie,'Operator sign-in failed');
  const invitations=await page('/agency/creator-invites',cookie);
  assert(invitations.status===200&&(await invitations.text()).includes('Generate invite link'),'Invite page unavailable');
  const legacy=await page('/agency-admin/creator-codes',cookie);
  assert(legacy.status===307&&location(legacy).pathname==='/agency/creator-invites','Legacy invitation entry must redirect');
  assert((await post('/agency/creator-invites/manage',null,{action:'generate'})).status===401,'Anonymous invite generation allowed');
  assert((await post('/agency/creator-invites/manage',cookie,{action:'generate'},{Origin:'https://invalid.example'})).status===403,'Cross-origin invite generation allowed');
  checks.push('Both invitation entry points work; unauthenticated and cross-origin generation denied');
  const invite=await makeInvite(cookie,'redeem');
  const landing=await page('/creator/signup?code='+invite.code,null);
  assert(landing.status===200&&(await landing.text()).includes(invite.code),'Invite signup link lost its code');
  const retired=await request('https://dashboard.lynqai.co/creator/signup?code='+invite.code);
  assert(retired.status===308&&retired.headers.get('location')===ORIGIN+'/creator/signup?code='+invite.code,'Old FLIRT invite must preserve its code on the new hostname');
  assert((await post('/agency/creator-invites/manage',cookie,{action:'generate'},{Origin:'https://dashboard.lynqai.co'})).status===403,'Retired FLIRT origin allowed a write');
  checks.push('Old invitation URLs preserve their code; retired-origin writes remain denied');
  const creator=await signup('invited',invite.code);
  // Generate an unsent recovery link only for this disposable test account.
  // Report the URL configuration without exposing the token or sending email.
  const recovery=await api('/auth/v1/admin/generate_link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'recovery',email:creator.email,redirect_to:ORIGIN+'/creator/reset-password'})});
  const recoveryTarget=recovery.redirect_to||new URL(recovery.action_link).searchParams.get('redirect_to');
  checks.push(recoveryTarget===ORIGIN+'/creator/reset-password'?'Password recovery accepts the new dashboard return address':'Password recovery redirect still needs FLIRT Supabase URL Configuration');

  const assignment=await api('/rest/v1/creator_agency_assignments?select=agency_id&creator_account_id=eq.'+creator.id);
  assert(assignment.length===1&&assignment[0].agency_id===ID,'Invited account not assigned to FLIRT');
  const used=await api('/rest/v1/creator_agency_codes?select=uses&id=eq.'+invite.id);
  assert(used[0]?.uses===1,'Invite claim not recorded');
  await signup('exhausted',invite.code,false);
  checks.push('Generated invite creates a FLIRT account and assignment; one-use limit enforced');
  const onboarding=await page('/creator/onboarding',creator.cookie);
  assert(onboarding.status===200,'Invited creator cannot load onboarding');
  const submitted=await post('/creator-auth/onboarding',creator.cookie,{action:'submit'});
  assert(submitted.status===303&&location(submitted).pathname==='/creator','Invited creator cannot finish onboarding');
  assert((await page('/creator',creator.cookie)).status===200,'Invited creator workspace failed');
  const listing=await page('/clones',cookie);const html=await listing.text();
  assert(listing.status===200&&html.includes(creator.name)&&CLONES.every(id=>html.includes(id)),'New account must appear alongside the four Twin creators');
  const accounts=await page('/agency/creators',cookie);
  assert(accounts.status===200&&(await accounts.text()).includes(creator.name),'New account missing from onboarding review');
  const detail=await page('/agency/creators/'+creator.id,cookie);
  assert(detail.status===200&&(await detail.text()).includes('submitted'),'Submitted account cannot be opened');
  const current=await api('/rest/v1/creator_accounts?select=updated_at&id=eq.'+creator.id);
  const edited=await post('/agency/creators/manage',cookie,{creator_account_id:creator.id,display_name:creator.name+' edited',revision:current[0].updated_at});
  assert(edited.status===303&&location(edited).searchParams.get('result')==='saved','Profile edit failed');
  const saved=await api('/rest/v1/creator_accounts?select=display_name&id=eq.'+creator.id);
  assert(saved[0]?.display_name===creator.name+' edited','Profile edit did not persist in FLIRT');
  checks.push('Invited creator finishes onboarding, appears beside four Twin creators, opens and saves profile in FLIRT');
  const outside=await signup('unassigned');
  assert((await page('/agency/creators/'+outside.id,cookie)).status===404,'Unassigned account detail exposed');
  assert((await post('/agency/creators/manage',cookie,{creator_account_id:outside.id,display_name:'Forbidden',revision:outside.updated_at})).status===403,'Unassigned account edit allowed');
  assert((await page('/agency/creators/'+creator.id,outside.cookie)).status!==200,'Creator session reached operator review');
  const revocable=await makeInvite(cookie,'revoke');
  assert((await post('/agency/creator-invites/manage',cookie,{action:'revoke',id:revocable.id})).status===303,'Invite revoke failed');
  await signup('revoked',revocable.code,false);
  checks.push('Unassigned account reads/writes and creator-as-operator access denied; revoked invite rejected');
}
async function cleanup(){
  let failed=false;
  for(const fixture of fixtures){try{
    const accounts=await api('/rest/v1/creator_accounts?select=id,auth_user_id&email=eq.'+encodeURIComponent(fixture.email));
    for(const account of accounts){
      await api('/rest/v1/creator_accounts?id=eq.'+account.id+'&email=eq.'+encodeURIComponent(fixture.email),{method:'DELETE'});
      if(account.auth_user_id)await api('/auth/v1/admin/users/'+account.auth_user_id,{method:'DELETE'});
    }
    assert((await api('/rest/v1/creator_accounts?select=id&email=eq.'+encodeURIComponent(fixture.email))).length===0,'Fixture account remains');
  }catch{failed=true;}}
  for(const fixture of codes){try{
    const filter='agency_id=eq.'+ID+'&label=eq.'+encodeURIComponent(fixture.label);
    await api('/rest/v1/creator_agency_codes?'+filter,{method:'DELETE'});
    assert((await api('/rest/v1/creator_agency_codes?select=id&'+filter)).length===0,'Fixture invite remains');
  }catch{failed=true;}}
  assert(!failed,'Synthetic invitation fixture cleanup failed');
}
(async()=>{
  let failure;
  try{await main();}catch(error){failure=error.message;}
  try{await cleanup();}catch(error){failure=(failure?failure+'; ':'')+error.message;}
  console.log(JSON.stringify({passed:!failure,checks,...(failure?{error:failure}:{synthetic_fixtures_removed:true}),credentials_logged:false}));
  if(failure)process.exitCode=1;
})();

