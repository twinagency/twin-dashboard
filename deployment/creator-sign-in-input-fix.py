"""Deploy the tested sign-in input/clarity update; private settings stay on host."""
import json, os, pathlib, subprocess, sys, time, shutil
BASE=pathlib.Path('/etc/twin-onlyfans')
OVERLAY=BASE/'creator-sign-in-release-compose.json'
COMPOSE=pathlib.Path('/opt/twin-onlyfans/releases/0525e51aa690b44d1c9f1dc0bc2b9aed6baa627a/deploy/onlyfans-compose.yml')
BACKUP=pathlib.Path('/var/backups/twin-signin-input-34d2cb2')
EXPECTED='aaffe90fddb1631862edc34a89c40e9965b1e180'
FIX='34d2cb271b807909c9d3d02dee9bfde3c148e7a5'
NAMES=['next-app','twin-onlyfans-api-1','twin-onlyfans-worker-1','twin-onlyfans-database-1','flirt-bot','flirt-dashboard']
manifest=json.loads(sys.argv[2])
assert manifest.get('dashboardCommit')==FIX
for key in ([] if sys.argv[1]=='preflight' else ['browserImage','dashboardImage']):
    value=manifest[key]
    assert value.startswith('323149985112.dkr.ecr.ap-southeast-2.amazonaws.com/twin-dashboard@sha256:') and len(value.rsplit(':',1)[1])==64
def run(args,data=None,timeout=180):
    r=subprocess.run(args,input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
    if r.returncode: raise RuntimeError(args[0]+' failed with exit '+str(r.returncode))
    return r.stdout
def records(names):return json.loads(run(['docker','inspect',*names]))
def env(v):return dict(x.split('=',1) for x in v['Config']['Env'] if '=' in x)
def compose(*args):
    return run(['docker','compose','--project-name','twin-onlyfans','--project-directory',str(COMPOSE.parent),'--env-file',str(BASE/'compose.env'),'-f',str(COMPOSE),'-f',str(OVERLAY),*args],timeout=240)
def browser():return records(compose('ps','-q','creator-sign-in').decode().split())[0]
def private(p,s):
    fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
    with os.fdopen(fd,'w') as h:h.write(s)
def gate():
    assert subprocess.run(['pgrep','-f',r'^(/usr/bin/|/bin/)?(bash |sudo )?/usr/local/bin/twin-pull.sh( |$)'],stdout=subprocess.DEVNULL).returncode==1,'Another dashboard deployment is active'
    run(['docker','exec','next-app','node','-e',"const fs=require('fs');process.exit(fs.readdirSync('/tmp').some(x=>x.startsWith('creator-upload-'))?1:0)"])
def healthy():
    r=records(NAMES)
    assert all(x['State']['Running'] for x in r),'An existing service is not running'
    assert env(r[0]).get('GIT_SHA')==FIX and r[0]['Config']['Image']==manifest['dashboardImage'],'Dashboard version differs'
    b=browser();assert b['Config']['Image']==manifest['browserImage'] and b['State'].get('Health',{}).get('Status')=='healthy'
    run(['curl','--fail','--silent','--output','/dev/null','--max-time','8','https://dashboard.tgaiclone.xyz/'])
    before=json.loads((BACKUP/'before.json').read_text())
    assert all(x['Id']==before['ids'][x['Name']] for x in r[1:]),'An unrelated service was recreated'
    print('PASS expected dashboard and browser, all existing services, unchanged native/bot/database containers, public HTTPS',flush=True)
def preflight():
    gate();r=records(NAMES)
    assert all(x['State']['Running'] for x in r)
    assert env(r[0]).get('GIT_SHA')==EXPECTED,'Production changed; inspect before deploying'
    assert shutil.disk_usage('/').free>1024**3,'Need1GiB free disk'
    BACKUP.mkdir(mode=0o700,exist_ok=True)
    if not (BACKUP/'before.json').exists():
        private(BACKUP/'before.json',json.dumps({'dashboardImage':r[0]['Config']['Image'],'browserImage':browser()['Config']['Image'],'ids':{x['Name']:x['Id'] for x in r}}))
        private(BACKUP/'overlay-before.json',OVERLAY.read_text())
    print(json.dumps({'preflight':'passed','freeDiskMiB':shutil.disk_usage('/').free//1024**2}),flush=True)
def pull():
    assert (BACKUP/'before.json').exists()
    password=run(['aws','ecr','get-login-password','--region','ap-southeast-2'])
    run(['docker','login','--username','AWS','--password-stdin','323149985112.dkr.ecr.ap-southeast-2.amazonaws.com'],password)
    password=None
    for key in ['browserImage','dashboardImage']:
        run(['docker','pull',manifest[key]],timeout=900)
        assert manifest[key] in json.loads(run(['docker','image','inspect',manifest[key]]))[0]['RepoDigests']
    print('PASS both immutable images pulled',flush=True)
def browser_deploy():
    gate()
    before=json.loads((BACKUP/'before.json').read_text());b=browser()
    assert b['Config']['Image'] in [before['browserImage'],manifest['browserImage']]
    config=json.loads(OVERLAY.read_text());config['services']['creator-sign-in']['image']=manifest['browserImage']
    private(OVERLAY,json.dumps(config))
    compose('up','--no-build','--no-deps','-d','creator-sign-in')
    for _ in range(35):
        b=browser()
        if b['State'].get('Health',{}).get('Status')=='healthy':break
        time.sleep(2)
    else:raise RuntimeError('Browser health failed')
    h=b['HostConfig']
    assert b['Config']['Image']==manifest['browserImage'] and b['Config']['User']=='pwuser' and h['ReadonlyRootfs'] and h['CapDrop']==['ALL'] and not h['PortBindings'] and h['Memory']==1536*1024**2
    result=run(['docker','exec','-e','TWIN_SIGNIN_TEST_HEADED=1','-e','TWIN_SIGNIN_TEST_SANDBOX=1',b['Id'],'xvfb-run','-a','node','creator-sign-in/check.mjs'],timeout=180)
    assert b'PASS self-hosted sign-in' in result
    private(BACKUP/'browser-verified.json',json.dumps({'image':manifest['browserImage']}))
    print('PASS target-host headed browser fixture, private isolation and health',flush=True)
def dashboard():
    gate();assert json.loads((BACKUP/'browser-verified.json').read_text())['image']==manifest['browserImage']
    run(['/usr/local/bin/twin-pull.sh',manifest['dashboardImage'],'next-app','/home/ubuntu/allieai2-dashboard','-p','127.0.0.1:3001:3001','-e','PORT=3001','--network','twin-onlyfans_default'],timeout=300)
    for _ in range(40):
        try:healthy();return
        except Exception:time.sleep(2)
    raise RuntimeError('Updated dashboard health failed')
def rollback():
    gate();before=json.loads((BACKUP/'before.json').read_text())
    private(OVERLAY,(BACKUP/'overlay-before.json').read_text());compose('up','--no-build','--no-deps','-d','creator-sign-in')
    run(['/usr/local/bin/twin-pull.sh',before['dashboardImage'],'next-app','/home/ubuntu/allieai2-dashboard','-p','127.0.0.1:3001:3001','-e','PORT=3001','--network','twin-onlyfans_default'],timeout=300)
    print('PASS previous images restored',flush=True)
def display():
    code = r"""
const assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto'),sharp=require('sharp');
(async()=>{
 const root=process.env.ONLYFANS_SIGNIN_BASE_URL,headers={Authorization:'Bearer '+process.env.ONLYFANS_SIGNIN_TOKEN,'X-Twin-Creator':'signin-input-display-probe','X-Twin-Actor':'creator-session:'+'d'.repeat(64),'Content-Type':'application/json'};
 let id;
 const call=async(path,body)=>{const r=await fetch(root+path,{method:body===undefined?'GET':'POST',headers,...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(12000)});assert(r.ok,'Private display request failed '+r.status);return r};
 try {
  let a=(await(await call('/v1/attempts',{startKey:randomUUID(),network:{accountId:null,ownerId:null,proxyUrl:null,fingerprint:createHash('sha256').update('twin-capture-network.v1\0').digest('hex')}})).json()).attempt;id=a.id;
  for(let n=0;n<35&&a.phase==='opening';n++){await new Promise(r=>setTimeout(r,1000));a=(await(await call('/v1/attempts/'+id)).json()).attempt}
  assert.equal(a.phase,'waiting');await new Promise(r=>setTimeout(r,4000));
  const frame=Buffer.from(await(await call('/v1/attempts/'+id+'/frame')).arrayBuffer()),meta=await sharp(frame).metadata();
  assert.equal(meta.width,864);assert.equal(meta.height,1440);assert(frame.length<2*1024*1024);
  console.log(JSON.stringify({anonymousScreen:true,width:meta.width,height:meta.height,frameBytes:frame.length}));
 }finally{if(id)await call('/v1/attempts/'+id+'/cancel',{})}
})().catch(()=>{console.error('Private display probe failed');process.exitCode=1});
"""
    print(run(['docker','exec','-i','next-app','node','-'],code.encode(),timeout=100).decode().strip(),flush=True)

try:
    {'preflight':preflight,'pull':pull,'browser':browser_deploy,'dashboard':dashboard,'health':healthy,'display':display,'rollback':rollback}[sys.argv[1]]()
except Exception as e:
    print('Sign-in fix phase failed: '+str(e) if isinstance(e,(RuntimeError,AssertionError)) else type(e).__name__,file=sys.stderr);sys.exit(1)
