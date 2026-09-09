// One-time owner-authorized provisioning. Never merged into the application.
// Service credentials stay inside the existing server environment. Only an
// RSA-encrypted new password may be printed; no real messages or settings change.
const assert = require('node:assert/strict');
const {randomBytes, publicEncrypt, constants} = require('node:crypto');
const {createClient} = require('@supabase/supabase-js');
const agencyId='40563447-698f-4ec2-b175-c816f877a1f6';
const cloneId='02a49e27-606d-4f20-9472-fab39255753f';
const email='jess-and-kate-ai@dashboard.tgaiclone.xyz';
const origin='https://dashboard.tgaiclone.xyz';
const path='/jess-and-kate-ai';
const publicKey=`-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAx30wYGhUkAe3h0L9Ixmu
YpfvN/fToR7FZhRI0csCZxdgSZXaSm2vGzK7+0Pyeuhe7RtiqGbUyCzAg4Bu4P6f
isqvxWt7oW4AWoCu2amZ9z+4eYXUjtcL1nF2Lf7QboCooNix9002tu6MRY5Z+9xV
Sk9oOjJHH6yf8BBpRUtJGPgmmWX3YPrz62Ll8Aq4GU3gfOc3mngM62/+JRaZohzY
lyJJcW6K7fFvPRlyFJHO2zq2YMeKfTuIOQw+V2Uep/ylhLN3U8UXSJTOqkakiSJZ
q2se+0KynWcRpE8JNC8rz9/can3kSTPkJjY4FpEFXOWucCEYQlsHOsExKIlVSmPX
Xg/pc5yjH6mUbMQdhrtE1OHsd6g+/1H3XCd/viZFyOQvwsLuBC1fy9yQlUm+AMO5
N/yyG+tld9H89bVPTrFdq80bpDBfgjoVY6RzJydkPj5Ly2sM4CAaY596/s+bWTq3
fUxB1Wo+M/IV52h91QMgcyic2Pz1ygi5ANTTi1BzoHhLAgMBAAE=
-----END PUBLIC KEY-----`;
let stage='preflight';
async function main(){
  assert.equal(process.env.GIT_SHA,process.argv[2],'Unexpected running deployment');
  assert.equal(new URL(process.env.SUPABASE_URL).hostname,'aouaenqayfltoqrmpitg.supabase.co');
  const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const a=await db.from('partner_agencies').select('id,name,slug,active').eq('id',agencyId).single();
  assert.ok(!a.error);assert.equal(a.data.slug,'jess-and-kate-ai');assert.equal(a.data.active,true);
  const assigned=await db.from('agency_creators').select('clone_id').eq('agency_id',agencyId);
  assert.ok(!assigned.error);assert.deepEqual(assigned.data,[{clone_id:cloneId}]);
  const existing=await db.from('agency_memberships').select('user_id').eq('agency_id',agencyId);
  assert.ok(!existing.error);assert.equal(existing.data.length,0,'Already provisioned; do not reset');
  const creator=await db.from('clones').select('slug,status,intent_classic_promotion_version').eq('id',cloneId).single();
  assert.ok(!creator.error);assert.equal(creator.data.slug,'tru-kait');
  const request=(route,init={})=>fetch(origin+route,{redirect:'manual',signal:AbortSignal.timeout(60000),...init});
  for(const [route,action] of [[path,path+'/auth'],['/','/admin-auth'],['/twin','/admin-auth'],['/moxy','/moxy/auth'],['/link','/link/auth']]){
    const r=await request(route,{headers:{cookie:'twin_agency_portal=moxy; twin_agency_access=stale'}});
    assert.equal(r.status,200,'Login route '+route);assert.ok((await r.text()).includes('action="'+action+'"'));
  }
  stage='create-login';
  const password=randomBytes(24).toString('base64url');
  const created=await db.auth.admin.createUser({email,password,email_confirm:true});
  assert.ok(!created.error && created.data.user,'Auth account creation failed');
  const uid=created.data.user.id;
  const member=await db.from('agency_memberships').insert({agency_id:agencyId,user_id:uid,email,active:true});
  if(member.error){await db.auth.admin.deleteUser(uid);throw new Error('Membership creation failed; new auth user removed');}
  const encrypted=publicEncrypt({key:publicKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(JSON.stringify({url:origin+path,password,email,user_id:uid}))).toString('base64');
  console.log('JESS_KATE_ENCRYPTED_RECEIPT='+encrypted);
  stage='authenticated-checks';
  const auth=await request(path+'/auth',{method:'POST',headers:{origin,accept:'application/json'},body:new URLSearchParams({password})});
  assert.equal(auth.status,200);assert.deepEqual(await auth.json(),{ok:true});
  const cookie=auth.headers.getSetCookie().filter(x=>!x.includes('Max-Age=0')).map(x=>x.split(';')[0]).join('; ');
  assert.ok(cookie.includes('clone_scope='+cloneId));assert.ok(cookie.includes('twin_agency_portal=jess-and-kate-ai'));
  const checks=[];
  for(const route of ['/clones','/clones/'+cloneId,'/revenue','/users','/media','/flows']){
    const r=await request(route,{headers:{cookie}});assert.equal(r.status,200,'Scoped page '+route);
    const html=await r.text();assert.ok(html.includes('Jess and Kate AI'),'Missing business branding '+route);
    assert.ok(!html.includes('2e5eb05f-cc88-4ba6-870a-924948d4b09a'),'Another creator leaked');
    assert.ok(!html.includes('faf84489-b556-40ff-81d6-6fb6c6fe3bac'),'Another creator leaked');
    assert.ok(!html.includes('An error occurred in the Server Components render'),'Server render error');
    checks.push(route+':200');
  }
  for(const route of ['/settings','/agency-admin','/api-access','/clones/2e5eb05f-cc88-4ba6-870a-924948d4b09a','/revenue?clone=2e5eb05f-cc88-4ba6-870a-924948d4b09a']){
    assert.equal((await request(route,{headers:{cookie}})).status,403,'Other access '+route);checks.push(route+':403');
  }
  const exit=await request('/agency/logout',{method:'POST',headers:{cookie,origin}});
  assert.equal(exit.status,303);assert.equal(exit.headers.get('location'),origin+path);
  const after=await db.from('clones').select('slug,status,intent_classic_promotion_version').eq('id',cloneId).single();
  assert.deepEqual(after.data,creator.data);
  console.log('JESS_KATE_VERIFIED='+JSON.stringify({agency_id:agencyId,name:a.data.name,user_id:uid,creator_count:1,creator:'Tru Kait',version_unchanged:after.data.intent_classic_promotion_version,login:'success',logout:'success',pages:checks}));
}
main().catch(()=>{console.error('Jess Kate provisioning/check failed at stage: '+stage);process.exitCode=1;});
