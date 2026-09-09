// One-time owner-authorized provisioning. Not part of the deployed application.
// Only encrypted new credentials and non-sensitive verification are printed.
const assert=require('node:assert/strict');
const {randomBytes,publicEncrypt,constants}=require('node:crypto');
const agencyId='40563447-698f-4ec2-b175-c816f877a1f6',cloneId='02a49e27-606d-4f20-9472-fab39255753f';
const email='jess-and-kate-ai@dashboard.tgaiclone.xyz',origin='https://dashboard.tgaiclone.xyz',path='/jess-and-kate-ai';
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
 assert.equal(process.env.GIT_SHA,process.argv[2]);
 const base=process.env.SUPABASE_URL.replace(/\/$/,'');
 assert.equal(new URL(base).hostname,'aouaenqayfltoqrmpitg.supabase.co');
 const key=process.env.SUPABASE_SERVICE_KEY;assert.ok(key);
 async function api(route,method='GET',data){
  const r=await fetch(base+route,{method,headers:{apikey:key,authorization:'Bearer '+key,'content-type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw new Error('API request rejected');
  const text=await r.text();return text?JSON.parse(text):null;
 }
 const a=await api('/rest/v1/partner_agencies?select=id,name,slug,active&id=eq.'+agencyId);
 assert.equal(a.length,1);assert.equal(a[0].slug,'jess-and-kate-ai');assert.equal(a[0].active,true);
 assert.deepEqual(await api('/rest/v1/agency_creators?select=clone_id&agency_id=eq.'+agencyId),[{clone_id:cloneId}]);
 assert.equal((await api('/rest/v1/agency_memberships?select=user_id&agency_id=eq.'+agencyId)).length,0,'Already provisioned; do not reset');
 const creatorPath='/rest/v1/clones?select=slug,status,intent_classic_promotion_version&id=eq.'+cloneId;
 const creator=await api(creatorPath);assert.equal(creator[0].slug,'tru-kait');
 const request=(route,init={})=>fetch(origin+route,{redirect:'manual',signal:AbortSignal.timeout(60000),...init});
 for(const [route,action] of [[path,path+'/auth'],['/','/admin-auth'],['/twin','/admin-auth'],['/moxy','/moxy/auth'],['/link','/link/auth']]){
  stage='public-login:'+route;
  const r=await request(route,{headers:{cookie:'twin_agency_portal=moxy; twin_agency_access=stale'}});assert.equal(r.status,200);assert.ok((await r.text()).includes('action="'+action+'"'));
 }
 stage='create-login';
 const password=randomBytes(24).toString('base64url');
 const created=await api('/auth/v1/admin/users','POST',{email,password,email_confirm:true});
 const uid=created.id;assert.ok(/^[0-9a-f-]{36}$/.test(uid));
 try{await api('/rest/v1/agency_memberships','POST',{agency_id:agencyId,user_id:uid,email,active:true});}
 catch(e){await api('/auth/v1/admin/users/'+uid,'DELETE');throw e;}
 const encrypted=publicEncrypt({key:publicKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(JSON.stringify({url:origin+path,password,email,user_id:uid}))).toString('base64');
 console.log('JESS_KATE_ENCRYPTED_RECEIPT='+encrypted);
 stage='authenticate';
 const auth=await request(path+'/auth',{method:'POST',headers:{origin,accept:'application/json'},body:new URLSearchParams({password})});assert.equal(auth.status,200);assert.deepEqual(await auth.json(),{ok:true});
 const cookie=auth.headers.getSetCookie().filter(x=>!x.includes('Max-Age=0')).map(x=>x.split(';')[0]).join('; ');
 assert.ok(cookie.includes('clone_scope='+cloneId));assert.ok(cookie.includes('twin_agency_portal=jess-and-kate-ai'));
 const checks=[];
 for(const route of ['/clones','/clones/'+cloneId,'/revenue','/users','/media','/flows']){
  stage='scoped-page:'+route;
  const r=await request(route,{headers:{cookie}});assert.equal(r.status,200);const html=await r.text();
  assert.ok(html.includes('Jess and Kate AI'));assert.ok(!html.includes('2e5eb05f-cc88-4ba6-870a-924948d4b09a'));assert.ok(!html.includes('faf84489-b556-40ff-81d6-6fb6c6fe3bac'));assert.ok(!html.includes('An error occurred in the Server Components render'));
  checks.push(route+':200');
 }
 for(const route of ['/settings','/agency-admin','/api-access','/clones/2e5eb05f-cc88-4ba6-870a-924948d4b09a','/revenue?clone=2e5eb05f-cc88-4ba6-870a-924948d4b09a']){
  stage='denied-page:'+route;assert.equal((await request(route,{headers:{cookie}})).status,403);checks.push(route+':403');
 }
 stage='logout';const exit=await request('/agency/logout',{method:'POST',headers:{cookie,origin}});assert.equal(exit.status,303);assert.equal(exit.headers.get('location'),origin+path);
 assert.deepEqual(await api(creatorPath),creator);
 console.log('JESS_KATE_VERIFIED='+JSON.stringify({agency_id:agencyId,name:a[0].name,user_id:uid,creator_count:1,creator:'Tru Kait',version_unchanged:creator[0].intent_classic_promotion_version,login:'success',logout:'success',pages:checks}));
}
main().catch(()=>{console.error('Jess Kate provisioning/check failed at stage: '+stage);process.exitCode=1;});
