#!/usr/bin/env python3
"""One-time, exact-account setup requested by Jesse on 2026-10-14.

Uses existing AWS and FLIRT service credentials. Never logs plaintext credentials.
The newly generated password is returned only as RSA-OAEP encrypted ciphertext.
"""
import base64, hashlib, json, os, secrets, shlex, subprocess, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parent
PROJECT = 'lkmfwpqegjluirfusnaw'
ORIGIN = 'https://' + PROJECT + '.supabase.co'
ACCOUNT = '22952fd9-0a82-4da2-a172-f1a0d1aa2c6d'
AUTH_USER = 'e91e758b-6661-4610-90f6-826ddc66b48c'
AGENCY = '66263f7f-77c6-4d9b-a828-e7c9d1ce3597'
CLONE = '7c2e9452-1d4e-475c-86ef-07a797f52ce5'
EMAIL = 'theoliviajade@protonmail.com'
INSTANCE = 'i-09a9dd3bd749643a5'
REGION = 'ap-southeast-2'

def require(ok, label):
    if not ok: raise RuntimeError(label)

def api(path, method='GET', body=None, headers=None):
    key = os.environ['FLIRT_SUPABASE_SERVICE_KEY']
    h = {'apikey':key, 'Authorization':'Bearer '+key, **(headers or {})}
    if body is not None and not isinstance(body, bytes):
        body = json.dumps(body).encode()
        h.setdefault('Content-Type', 'application/json')
    try:
        with urlopen(Request(ORIGIN+path, data=body, headers=h, method=method), timeout=45) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except HTTPError as e:
        raise RuntimeError('FLIRT API operation failed with status '+str(e.code)) from None

def aws(args):
    p = subprocess.run(['aws','--region',REGION,*args,'--output','json'],capture_output=True,text=True)
    if p.returncode and args[:2] == ['ssm','get-command-invocation'] and 'InvocationDoesNotExist' in p.stderr:
        return {'Status':'Pending'}
    require(p.returncode == 0, 'AWS '+args[0]+' operation failed')
    return json.loads(p.stdout)

def update_live_photo(source_path, digest):
    # This code executes inside the existing FLIRT container. Both database keys
    # remain on the approved server; only a result summary leaves it.
    node = r'''
const crypto = require('node:crypto');
const C = __CONFIG__;
function ok(value, message) { if (!value) throw new Error(message); }
async function request(url,key,path,options={}) {
  return fetch(url+path,{...options,headers:{apikey:key,Authorization:'Bearer '+key,...options.headers},signal:AbortSignal.timeout(45000)});
}
async function jsonRequest(url,key,path,options={}) {
  const r=await request(url,key,path,options);
  ok(r.ok,'Profile API returned '+r.status);
  return r.json();
}
async function main() {
  ok(process.env.SUPABASE_URL === 'https://lkmfwpqegjluirfusnaw.supabase.co' && process.env.FLIRT_BACKEND_ENABLED === 'true', 'Wrong FLIRT runtime');
  ok(process.env.FLIRT_LIVE_TWIN_ENABLED === 'true' && process.env.FLIRT_LIVE_TWIN_URL === 'https://aouaenqayfltoqrmpitg.supabase.co', 'Wrong live backend');
  const liveUrl=process.env.FLIRT_LIVE_TWIN_URL,liveKey=process.env.FLIRT_LIVE_TWIN_SERVICE_KEY;
  const rows=await jsonRequest(liveUrl,liveKey,'/rest/v1/clones?id=eq.'+C.clone+'&select=id,slug,name,status,intake,updated_at');
  const before=rows[0];
  ok(rows.length===1 && before.slug === 'olivia-jade' && before.name === 'Olivia Jade' && before.status === 'active', 'Olivia live clone validation failed');
  const source=await request(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_KEY,'/storage/v1/object/authenticated/onboarding-content/'+C.source);
  ok(source.ok, 'Profile source unavailable');
  const bytes = Buffer.from(await source.arrayBuffer());
  ok(crypto.createHash('sha256').update(bytes).digest('hex') === C.digest && bytes[0] === 255 && bytes[1] === 216, 'Profile source validation failed');
  const target = C.clone+'/profile/olivia-jade-20261014-'+C.digest.slice(0,12)+'.jpeg';
  const existing=await request(liveUrl,liveKey,'/storage/v1/object/authenticated/media/'+target);
  if (existing.ok) {
    ok(crypto.createHash('sha256').update(Buffer.from(await existing.arrayBuffer())).digest('hex') === C.digest, 'Existing profile object differs');
  } else {
    const up=await request(liveUrl,liveKey,'/storage/v1/object/media/'+target,{method:'POST',body:bytes,headers:{'Content-Type':'image/jpeg','x-upsert':'false'}});
    ok(up.ok, 'Profile storage upload failed');
  }
  const priorIntake = before.intake || {};
  const intake = {...priorIntake,appearance:{...(priorIntake.appearance||{}),profile_image_path:target}};
  const change=await jsonRequest(liveUrl,liveKey,'/rest/v1/clones?id=eq.'+C.clone+'&updated_at=eq.'+encodeURIComponent(before.updated_at)+'&select=id',{method:'PATCH',body:JSON.stringify({intake,updated_at:new Date().toISOString()}),headers:{'Content-Type':'application/json',Prefer:'return=representation'}});
  ok(change.length === 1, 'Concurrent clone update; profile was not changed');
  const after=(await jsonRequest(liveUrl,liveKey,'/rest/v1/clones?id=eq.'+C.clone+'&select=id,intake,status'))[0];
  ok(after.intake?.appearance?.profile_image_path === target && after.status === 'active', 'Profile readback failed');
  const withoutPhoto = value => {const v=structuredClone(value);delete v.appearance?.profile_image_path;if(v.appearance && !Object.keys(v.appearance).length) delete v.appearance;return JSON.stringify(v);};
  ok(withoutPhoto(priorIntake) === withoutPhoto(after.intake), 'Unrelated intake changed');
  const downloaded=await request(liveUrl,liveKey,'/storage/v1/object/authenticated/media/'+target);
  ok(downloaded.ok && crypto.createHash('sha256').update(Buffer.from(await downloaded.arrayBuffer())).digest('hex')===C.digest,'Saved profile photo hash failed');
  console.log(JSON.stringify({ok:true,profile_path:target,original_photo_verified:true,bot_status:'active'}));
}
main().catch(e=>{console.log(JSON.stringify({ok:false,error:e.message}));process.exitCode=1});
'''.replace('__CONFIG__',json.dumps({'clone':CLONE,'source':source_path,'digest':digest}))
    host = '''import base64,json,subprocess
source=base64.b64decode(SOURCE)
p=subprocess.run(['docker','exec','-i','flirt-dashboard','node','-'],input=source,capture_output=True,timeout=240)
try: report=json.loads(p.stdout)
except Exception: report={'ok':False,'error':'Profile operation returned no structured result'}
print(json.dumps(report))
raise SystemExit(0 if p.returncode==0 and report.get('ok') else 1)
'''.replace('SOURCE',repr(base64.b64encode(node.encode()).decode()))
    req={'InstanceIds':[INSTANCE],'DocumentName':'AWS-RunShellScript','Comment':'Set requested Olivia Jade dashboard photo only','TimeoutSeconds':60,'Parameters':{'commands':['python3 -c '+shlex.quote(host)],'executionTimeout':['300']}}
    cid=aws(['ssm','send-command','--cli-input-json',json.dumps(req)])['Command']['CommandId']
    for _ in range(110):
        time.sleep(3)
        state=aws(['ssm','get-command-invocation','--command-id',cid,'--instance-id',INSTANCE])
        if state['Status'] in ['Pending','InProgress','Delayed']: continue
        report=json.loads(state['StandardOutputContent'])
        require(state['Status']=='Success' and report.get('ok'),'Photo host operation failed: '+str(report.get('error','unverified')))
        return report
    raise RuntimeError('Photo host operation timed out')

def main():
    require(aws(['sts','get-caller-identity'])['Account']=='323149985112','Unexpected AWS account')
    account=api('/rest/v1/creator_accounts?id=eq.'+ACCOUNT+'&select=id,auth_user_id,email,display_name,source,account_status')
    require(len(account)==1 and account[0]['auth_user_id']==AUTH_USER and account[0]['email']==EMAIL and account[0]['display_name']=='Olivia Jade' and account[0]['source']=='twin','Olivia account identity mismatch')
    assignment=api('/rest/v1/creator_agency_assignments?creator_account_id=eq.'+ACCOUNT+'&select=agency_id')
    require(len(assignment)==1 and assignment[0]['agency_id']==AGENCY,'Olivia FLIRT assignment mismatch')
    auth=api('/auth/v1/admin/users/'+AUTH_USER)
    require(auth.get('id')==AUTH_USER and auth.get('email')==EMAIL and auth.get('email_confirmed_at'),'Olivia Auth identity mismatch')
    links=api('/rest/v1/creator_clone_links?creator_account_id=eq.'+ACCOUNT+'&select=clone_id,twin_slug')
    require(not links or (len(links)==1 and links[0]['clone_id'] is None and links[0]['twin_slug']=='olivia-jade'),'Olivia already has a different clone link')
    conflicts=api('/rest/v1/creator_clone_links?twin_slug=eq.olivia-jade&creator_account_id=neq.'+ACCOUNT+'&select=creator_account_id')
    require(not conflicts,'Olivia clone is linked to another creator')
    photo=(ROOT/'olivia-jade-profile.jpeg').read_bytes()
    require(len(photo)==129417,'Unexpected attached photo size')
    digest=hashlib.sha256(photo).hexdigest()
    source_path='creators/'+ACCOUNT+'/profile-setup/'+digest+'.jpeg'
    api('/storage/v1/object/onboarding-content/'+source_path,'POST',photo,{'Content-Type':'image/jpeg','x-upsert':'true'})
    report=update_live_photo(source_path,digest)
    # Slug-only link is the established cross-project format: no duplicate bot.
    api('/rest/v1/creator_clone_links?on_conflict=creator_account_id','POST',{'creator_account_id':ACCOUNT,'clone_id':None,'twin_slug':'olivia-jade'},{'Prefer':'resolution=merge-duplicates,return=minimal'})
    api('/rest/v1/creator_accounts?id=eq.'+ACCOUNT+'&auth_user_id=eq.'+AUTH_USER,'PATCH',{'account_status':'active'},{'Prefer':'return=minimal'})
    # Password only: retain confirmed email, MFA settings and account identity.
    password=secrets.token_urlsafe(15)+'!7A'
    encrypted=subprocess.run(['openssl','pkeyutl','-encrypt','-pubin','-inkey',str(ROOT/'olivia-credential-return-public.pem'),'-pkeyopt','rsa_padding_mode:oaep','-pkeyopt','rsa_oaep_md:sha256','-pkeyopt','rsa_mgf1_md:sha256'],input=password.encode(),capture_output=True)
    require(encrypted.returncode==0,'Credential encryption failed')
    changed=api('/auth/v1/admin/users/'+AUTH_USER,'PUT',{'password':password})
    require(changed.get('id')==AUTH_USER and changed.get('email')==EMAIL,'Password update failed')
    verified=api('/auth/v1/token?grant_type=password','POST',{'email':EMAIL,'password':password})
    require(verified.get('user',{}).get('id')==AUTH_USER and verified.get('access_token'),'New credential verification failed')
    # The temporary source was created by this run and is not a vault file.
    api('/storage/v1/object/onboarding-content','DELETE',{'prefixes':[source_path]})
    report.update({'account_id':ACCOUNT,'login':EMAIL,'credential_verified':True,'password_ciphertext':base64.b64encode(encrypted.stdout).decode(),'plaintext_credentials_logged':False})
    (ROOT/'olivia-setup-result.json').write_text(json.dumps(report))
    print(json.dumps(report),flush=True)

if __name__=='__main__':
    try: main()
    except Exception as e:
        print(json.dumps({'ok':False,'error':str(e) if isinstance(e,RuntimeError) else type(e).__name__,'plaintext_credentials_logged':False}),flush=True)
        sys.exit(1)
