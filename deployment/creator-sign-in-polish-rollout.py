"""Replace only the tested private verification browser; keep dashboard and account data intact."""
import json,os,pathlib,subprocess,sys,time,shutil
BASE=pathlib.Path('/etc/twin-onlyfans')
OVERLAY=BASE/'creator-sign-in-release-compose.json'
COMPOSE=pathlib.Path('/opt/twin-onlyfans/releases/0525e51aa690b44d1c9f1dc0bc2b9aed6baa627a/deploy/onlyfans-compose.yml')
BACKUP=pathlib.Path('/var/backups/twin-verification-polish-1aee00e')
SOURCE='1aee00e056492653a2a8963366949ae7c48fce6a'
OLD='323149985112.dkr.ecr.ap-southeast-2.amazonaws.com/twin-dashboard@sha256:a1877e26d7901128cd514268987bd243afd0dff435b5e108a85f707ccb8d5e53'
NAMES=['next-app','twin-onlyfans-api-1','twin-onlyfans-worker-1','twin-onlyfans-database-1','flirt-bot','flirt-dashboard']
mode,manifest,expected=sys.argv[1],json.loads(sys.argv[2]),sys.argv[3]
assert manifest['source']==SOURCE
IMAGE=manifest['browserImage']
assert IMAGE.startswith('323149985112.dkr.ecr.ap-southeast-2.amazonaws.com/twin-dashboard@sha256:') and len(IMAGE.rsplit(':',1)[1])==64
def run(args,data=None,timeout=180):
    r=subprocess.run(args,input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
    if r.returncode:raise RuntimeError(' '.join(args[:2])+' failed with exit '+str(r.returncode)+((': '+r.stderr.decode()[:240]) if args[:2] in (['docker','inspect'],['docker','top']) else ''))
    return r.stdout
def records(names):return json.loads(run(['docker','inspect',*names]))
def env(v):return dict(x.split('=',1) for x in v['Config']['Env'] if '=' in x)
def compose(*args):return run(['docker','compose','--project-name','twin-onlyfans','--project-directory',str(COMPOSE.parent),'--env-file',str(BASE/'compose.env'),'-f',str(COMPOSE),'-f',str(OVERLAY),*args],timeout=240)
def browser():return records(compose('ps','-q','creator-sign-in').decode().split())[0]
def private(p,s):
    fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
    with os.fdopen(fd,'w') as f:f.write(s)
def idle():
    names=run(['docker','top',browser()['Id'],'-eo','pid,comm']).decode().lower().splitlines()[1:]
    assert not any('chrome' in x or 'chromium' in x for x in names),'A creator is still signing in; retry after that browser closes'
def preflight():
    print('Running container names: '+run(['docker','ps','--format','{{.Names}}']).decode().strip().replace('\n',', '),flush=True)
    r=records(NAMES);assert all(x['State']['Running'] for x in r)
    assert env(r[0]).get('GIT_SHA')==expected,'Dashboard changed; inspect before rollout'
    b=browser();assert b['Config']['Image']==OLD and b['State'].get('Health',{}).get('Status')=='healthy'
    assert shutil.disk_usage('/').free>1024**3
    idle();BACKUP.mkdir(mode=0o700,exist_ok=True)
    assert not (BACKUP/'before.json').exists(),'This rollout already has recovery metadata; inspect before retry'
    private(BACKUP/'before.json',json.dumps({'browserImage':OLD,'ids':{x['Name']:x['Id'] for x in r}}))
    private(BACKUP/'overlay.json',OVERLAY.read_text())
    print('PASS expected dashboard, idle private browser and existing services; recovery saved',flush=True)
def pull():
    assert (BACKUP/'before.json').exists()
    password=run(['aws','ecr','get-login-password','--region','ap-southeast-2'])
    run(['docker','login','--username','AWS','--password-stdin','323149985112.dkr.ecr.ap-southeast-2.amazonaws.com'],password);password=None
    run(['docker','pull',IMAGE],timeout=900)
    i=json.loads(run(['docker','image','inspect',IMAGE]))[0]
    assert IMAGE in i['RepoDigests'] and i['Config']['Labels'].get('org.opencontainers.image.revision')==SOURCE
    print('PASS tested browser image and source label',flush=True)
def health():
    b=browser();assert b['Config']['Image']==IMAGE and b['State'].get('Health',{}).get('Status')=='healthy'
    h=b['HostConfig'];assert b['Config']['User']=='pwuser' and h['ReadonlyRootfs'] and h['CapDrop']==['ALL'] and not h['PortBindings'] and h['Memory']==1536*1024**2
    before=json.loads((BACKUP/'before.json').read_text());r=records(NAMES)
    assert all(x['State']['Running'] and x['Id']==before['ids'][x['Name']] for x in r)
    assert env(r[0]).get('GIT_SHA')==expected
    run(['curl','--fail','--silent','--output','/dev/null','--max-time','8','https://dashboard.tgaiclone.xyz/'])
    print('PASS browser health and sandbox; dashboard, native services and bot containers unchanged; HTTPS healthy',flush=True)
def deploy():
    idle();assert env(records(['next-app'])[0]).get('GIT_SHA')==expected
    overlay=json.loads(OVERLAY.read_text());overlay['services']['creator-sign-in']['image']=IMAGE
    private(OVERLAY,json.dumps(overlay));compose('up','--no-build','--no-deps','-d','creator-sign-in')
    for n in range(40):
        try:health();return
        except (AssertionError,RuntimeError):time.sleep(2)
    raise RuntimeError('Browser health check failed')
def probe():
    code=r"""
const assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto'),sharp=require('sharp');
(async()=>{const root=process.env.ONLYFANS_SIGNIN_BASE_URL,headers={Authorization:'Bearer '+process.env.ONLYFANS_SIGNIN_TOKEN,'X-Twin-Creator':'verification-polish-display-probe','X-Twin-Actor':'creator-session:'+'e'.repeat(64),'Content-Type':'application/json'};let id;
const call=async(path,body)=>{const r=await fetch(root+path,{method:body===undefined?'GET':'POST',headers,...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(12000)});assert(r.ok,'Private screen check failed '+r.status);return r};
try{let a=(await(await call('/v1/attempts',{startKey:randomUUID(),network:{accountId:null,ownerId:null,proxyUrl:null,fingerprint:createHash('sha256').update('twin-capture-network.v1\0').digest('hex')}})).json()).attempt;id=a.id;for(let n=0;n<35&&a.phase==='opening';n++){await new Promise(r=>setTimeout(r,1000));a=(await(await call('/v1/attempts/'+id)).json()).attempt}assert.equal(a.phase,'waiting');const r=await call('/v1/attempts/'+id+'/frame?format=png');assert.equal(r.headers.get('content-type'),'image/png');const b=Buffer.from(await r.arrayBuffer()),m=await sharp(b).metadata();assert.equal(m.format,'png');assert.equal(m.width,864);assert.equal(m.height,1440);assert(b.length<2*1024*1024);console.log(JSON.stringify({privateLosslessFrame:true,width:m.width,height:m.height,frameBytes:b.length}));}finally{if(id)await call('/v1/attempts/'+id+'/cancel',{})}})().catch(()=>{console.error('Private lossless display check failed');process.exitCode=1});
"""
    print(run(['docker','exec','-i','next-app','node','-'],code.encode(),timeout=100).decode().strip(),flush=True)
def rollback():
    idle();private(OVERLAY,(BACKUP/'overlay.json').read_text());compose('up','--no-build','--no-deps','-d','creator-sign-in')
    print('Previous browser image restored; dashboard untouched',flush=True)
try:{'preflight':preflight,'pull':pull,'browser':deploy,'health':health,'probe':probe,'rollback':rollback}[mode]()
except Exception as e:print(str(e) if isinstance(e,(RuntimeError,AssertionError)) else type(e).__name__,file=sys.stderr);sys.exit(1)
