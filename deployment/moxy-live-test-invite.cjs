'use strict';
const {createHash,publicEncrypt,constants}=require('node:crypto');
const assert=require('node:assert/strict');
const origin='https://dashboard.lynqai.co';
const agency='bc670215-110b-4ea0-8f5c-af3dfe21d253';
const label='Jesse live onboarding 2026-10-05 1805';
const publicKey="-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4MVSj6ZA+IEEhCOYqnVa\nwsftytv3EVGFNXnBiUjWdpMHdkjxPLBhtV9YmEkCtlLRdZft5h5dsNsEFKTlrPN9\nqZRa0HzWeXWZf+y58g35SZtfuSqZTHnwLIrWFgIUmaWFybFCfazaXly+du72d5Vz\n1FPf11UEiKxUBfBlH8if6M0/eeDQxeNqGdch+c+p9KczVY1k2L3P7rWiG8Nk5Yzl\nsHzcTySjGIUBrjxvA1nEqdL/waqjbJZyIkf3jHt7MwYgde7b4HZxx+VDSEq2jDId\nT2Orr1/6aru3DiLLk6VH40qcdmbWTDyMYudijIY7XeriY3jdXQy9szWwzFpiMO9i\nmwIDAQAB\n-----END PUBLIC KEY-----";
async function run(){
 const env=process.env;
 assert(env.SUPABASE_URL==='https://aouaenqayfltoqrmpitg.supabase.co' && env.FLIRT_BACKEND_ENABLED!=='true','Wrong backend');
 assert(env.DASHBOARD_PASSWORD && env.SUPABASE_SERVICE_KEY,'Authorized runtime credentials unavailable');
 async function request(url, options={}) {return fetch(url,{...options,redirect:'manual',signal:AbortSignal.timeout(30000)});}
 async function backend(path) {
  const r=await request(env.SUPABASE_URL+'/rest/v1/'+path,{headers:{apikey:env.SUPABASE_SERVICE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_KEY}});
  assert(r.ok,'Backend verification failed HTTP '+r.status); return r.json();
 }
 async function app(path,cookie,fields){
  return request(origin+path,{headers:{Origin:origin,...(cookie?{Cookie:cookie}:{})},...(fields?{method:'POST',body:new URLSearchParams(fields)}:{})});
 }
 const prior=await backend('creator_agency_codes?select=id&label=eq.'+encodeURIComponent(label));
 assert(prior.length===0,'Invitation already created; inspect prior encrypted result');
 const agencies=await backend('partner_agencies?select=id,name,slug,active&id=eq.'+agency);
 assert(agencies.length===1 && agencies[0].active && agencies[0].slug==='moxy' && /^moxy(?:\s+management)?$/i.test(agencies[0].name),'Moxy agency mismatch');
 const signed=await app('/admin-auth',null,{password:env.DASHBOARD_PASSWORD,next:'/agency-admin/creator-codes'});
 assert(signed.status===303,'Normal administrator login failed HTTP '+signed.status);
 const header=signed.headers.getSetCookie().find(v=>v.startsWith('allie_admin_session='));
 assert(header && /HttpOnly/i.test(header) && /Secure/i.test(header),'Authorized session unavailable');
 const cookie=header.split(';')[0]; await signed.body?.cancel();
 const page=await app('/agency-admin/creator-codes',cookie);
 assert(page.status===200,'Normal invitation interface inaccessible');
 const html=await page.text();
 assert(html.includes(agency) && /moxy/i.test(html),'Moxy agency absent from normal interface');
 const created=await app('/agency-admin/creator-codes/manage',cookie,{action:'generate',agency,label,max_uses:'2',expires_days:'7'});
 assert(created.status===303,'Normal invitation creation failed HTTP '+created.status);
 const dest=new URL(created.headers.get('location'),origin); await created.body?.cancel();
 assert(dest.origin===origin && dest.pathname==='/agency-admin/creator-codes','Unexpected redirect');
 const code=dest.searchParams.get('created');
 assert(/^[A-Z2-9]{10}$/.test(code||''),'Invitation code missing');
 const encrypted_code=publicEncrypt({key:publicKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(code)).toString('base64');
 console.log(JSON.stringify({created:true,encrypted_code}));
 const hash=createHash('sha256').update(code).digest('hex');
 const records=await backend('creator_agency_codes?select=id,agency_id,active,max_uses,uses,expires_at&code_hash=eq.'+hash);
 assert(records.length===1,'Persisted invitation missing');
 const r=records[0];
 assert(r.agency_id===agency && r.active && r.max_uses===2 && r.uses===0 && Date.parse(r.expires_at)>Date.now(),'Persisted invitation incorrect');
 const signup=await app('/creator/signup?code='+encodeURIComponent(code));
 assert(signup.status===200,'Invitation signup inaccessible HTTP '+signup.status);
 const signupHtml=await signup.text();
 assert(/moxy/i.test(signupHtml) && /type="password"/i.test(signupHtml),'Moxy signup form not rendered');
 console.log(JSON.stringify({verified:true,id:r.id,agency:'Moxy',max_uses:r.max_uses,uses:r.uses,expires_at:r.expires_at,signup_status:signup.status,serving_sha:env.GIT_SHA}));
}
run().catch(e=>{console.error('INVITE_OPERATION_FAILED: '+e.message);process.exitCode=1;});
