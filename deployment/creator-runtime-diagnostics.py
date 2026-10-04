import importlib.util,json,time,shlex
from pathlib import Path
root=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('release',root/'flirt-release.py');release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)
assert release.aws(['sts','get-caller-identity'])['Account']==release.ACCOUNT
source=r'''
import subprocess,json,tarfile,io,re
def run(args,data=None):
 r=subprocess.run(args,input=data,capture_output=True,timeout=45)
 assert r.returncode==0, 'Scoped manifest operation failed'
 return r.stdout
expected='30989771efd5fac85ca387fbe739c1552594c166'
assert run(['docker','exec','flirt-dashboard','printenv','GIT_SHA']).decode().strip()==expected
names=run(['docker','ps','-a','--filter','label=io.flirt.project=lkmfwpqegjluirfusnaw','--format','{{.Names}}']).decode().splitlines()
targets=[('/tmp/creator-flow-flirt-gKoiGn/cleanup-manifest.json','ae3fab46068cd9c7ecefb6014d82c3be2342e867'),('/tmp/creator-flow-flirt-IGAmiF/cleanup-manifest.json','263055e8aa0c706df653743ba66459f145c01588')]
for p,original in targets:
 candidates=[]
 for name in names:
  if not re.fullmatch(r'flirt-dashboard(?:-rollback|-archive-[a-z0-9-]+)?',name):continue
  labels=json.loads(run(['docker','inspect','--format','{{json .Config.Labels}}',name]))
  if labels.get('io.flirt.commit')!=original:continue
  changes=run(['docker','diff',name]).decode().splitlines()
  if not any(line[2:]==p and line[:1] in ('A','C') for line in changes):continue
  payload=run(['docker','cp',name+':'+p,'-']);assert len(payload)<120000
  with tarfile.open(fileobj=io.BytesIO(payload)) as archive:
   members=[m for m in archive.getmembers() if m.isfile() and m.name.endswith('cleanup-manifest.json') and m.size<100000]
   assert len(members)==1
   data=archive.extractfile(members[0]).read();m=json.loads(data)
   assert m['brand']=='flirt' and m['expected_sha']==original and len(m['fixtures'])==2 and len(m['invitations'])==1
   assert re.fullmatch(r'\d{13}-[a-f0-9]{12}',m['stamp'])
   assert all('password' not in f for f in m['fixtures'])
   candidates.append((name,data))
 assert candidates,'Exact interrupted fixture manifest was not found'
 assert all(data==candidates[0][1] for _,data in candidates),'Ambiguous manifest versions require review'
 code="const fs=require('node:fs');const path=require('node:path');const p=process.argv[1];let data='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>data+=c);process.stdin.on('end',()=>{if(fs.existsSync(p)){if(fs.readFileSync(p,'utf8')!==data)throw Error('Existing manifest differs');}else{fs.mkdirSync(path.dirname(p),{mode:0o700});fs.writeFileSync(p,data,{mode:0o600,flag:'wx'});}console.log(JSON.stringify({copied_exact_disposable_manifest:true,credentials_copied:false,path:p}));});"
 print(run(['docker','exec','-i','flirt-dashboard','node','-e',code,p],candidates[0][1]).decode())
'''
request={'InstanceIds':[release.INSTANCE],'DocumentName':'AWS-RunShellScript','Comment':'Read-only creator upload capacity diagnostics','TimeoutSeconds':60,'Parameters':{'commands':['python3 -c '+shlex.quote(source)],'executionTimeout':['180']}}
id=release.aws(['ssm','send-command','--cli-input-json',json.dumps(request)])['Command']['CommandId']
for _ in range(65):
 time.sleep(3);r=release.aws(['ssm','get-command-invocation','--command-id',id,'--instance-id',release.INSTANCE])
 if r['Status'] in ['Pending','InProgress','Delayed']:continue
 print(r.get('StandardOutputContent',''));assert r['Status']=='Success';break
else:raise RuntimeError('Read-only diagnostics timed out')
