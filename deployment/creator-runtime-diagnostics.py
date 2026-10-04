import importlib.util,json,time,shlex
from pathlib import Path
root=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('release',root/'flirt-release.py');release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)
assert release.aws(['sts','get-caller-identity'])['Account']==release.ACCOUNT
source=r'''
import subprocess,json,tarfile,io
def run(args,data=None):
 r=subprocess.run(args,input=data,capture_output=True,timeout=30)
 assert r.returncode==0, 'Scoped manifest operation failed'
 return r.stdout
source='flirt-dashboard-rollback'
meta=json.loads(run(['docker','inspect','--format','{{json .Config.Labels}}',source]))
assert meta.get('io.flirt.project')=='lkmfwpqegjluirfusnaw' and meta.get('io.flirt.commit')=='ae3fab46068cd9c7ecefb6014d82c3be2342e867'
assert run(['docker','exec','flirt-dashboard','printenv','GIT_SHA']).decode().strip()=='263055e8aa0c706df653743ba66459f145c01588'
payload=run(['docker','cp',source+':/tmp/creator-flow-flirt-gKoiGn/cleanup-manifest.json','-'])
assert len(payload)<120000
with tarfile.open(fileobj=io.BytesIO(payload)) as archive:
 members=[m for m in archive.getmembers() if m.isfile() and m.name.endswith('cleanup-manifest.json') and m.size<100000]
 assert len(members)==1
 data=archive.extractfile(members[0]).read()
 m=json.loads(data);assert m['stamp']=='1791087671256-a92ae7932802' and m['brand']=='flirt' and len(m['fixtures'])==2 and len(m['invitations'])==1
 print(run(['docker','exec','-i','flirt-dashboard','node','-e',"const fs=require('node:fs');const p='/tmp/creator-flow-flirt-gKoiGn/cleanup-manifest.json';const dir='/tmp/creator-flow-flirt-gKoiGn';let data='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>data+=c);process.stdin.on('end',()=>{const m=JSON.parse(data);if(m.brand!=='flirt'||m.stamp!=='1791087671256-a92ae7932802'||m.expected_sha!=='ae3fab46068cd9c7ecefb6014d82c3be2342e867')throw Error('Manifest mismatch');if(fs.existsSync(p)){if(fs.readFileSync(p,'utf8')!==data)throw Error('Existing manifest differs');}else{fs.mkdirSync(dir,{mode:0o700});fs.writeFileSync(p,data,{mode:0o600,flag:'wx'});}console.log(JSON.stringify({copied_exact_disposable_manifest:true,credentials_copied:false}));});"],data).decode())
'''
request={'InstanceIds':[release.INSTANCE],'DocumentName':'AWS-RunShellScript','Comment':'Read-only creator upload capacity diagnostics','TimeoutSeconds':60,'Parameters':{'commands':['python3 -c '+shlex.quote(source)],'executionTimeout':['180']}}
id=release.aws(['ssm','send-command','--cli-input-json',json.dumps(request)])['Command']['CommandId']
for _ in range(65):
 time.sleep(3);r=release.aws(['ssm','get-command-invocation','--command-id',id,'--instance-id',release.INSTANCE])
 if r['Status'] in ['Pending','InProgress','Delayed']:continue
 print(r.get('StandardOutputContent',''));assert r['Status']=='Success';break
else:raise RuntimeError('Read-only diagnostics timed out')
