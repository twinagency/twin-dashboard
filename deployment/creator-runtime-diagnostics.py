import importlib.util,json,time,shlex
from pathlib import Path
root=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('release',root/'flirt-release.py');release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)
assert release.aws(['sts','get-caller-identity'])['Account']==release.ACCOUNT
source=r'''
import subprocess,json,re,tarfile,io
def run(args):
 r=subprocess.run(args,capture_output=True,timeout=30)
 if r.returncode: return None
 return r.stdout
names=run(['docker','ps','-a','--filter','label=io.flirt.project=lkmfwpqegjluirfusnaw','--format','{{.Names}}'])
assert names is not None
report=[]
for name in names.decode().splitlines():
 if not re.fullmatch(r'flirt-dashboard(?:-rollback|-archive-[a-z0-9-]+)?',name): continue
 diff=run(['docker','diff',name])
 if diff is None: continue
 for line in diff.decode().splitlines():
  match=re.fullmatch(r'[AC] (/tmp/creator-flow-flirt-[A-Za-z0-9]+/cleanup-manifest[.]json)',line)
  if not match: continue
  path=match.group(1); payload=run(['docker','cp',name+':'+path,'-'])
  if payload is None or len(payload)>120000: continue
  with tarfile.open(fileobj=io.BytesIO(payload)) as archive:
   members=[m for m in archive.getmembers() if m.isfile() and m.name.endswith('cleanup-manifest.json') and m.size<100000]
   if len(members)!=1: continue
   m=json.load(archive.extractfile(members[0]))
   report.append({'container':name,'manifest':path,'brand':m.get('brand'),'original_commit':m.get('expected_sha'),'stamp':m.get('stamp'),'fixture_count':len(m.get('fixtures',[])),'invitation_count':len(m.get('invitations',[]))})
print(json.dumps({'read_only':True,'manifests':report}))
'''
request={'InstanceIds':[release.INSTANCE],'DocumentName':'AWS-RunShellScript','Comment':'Read-only creator upload capacity diagnostics','TimeoutSeconds':60,'Parameters':{'commands':['python3 -c '+shlex.quote(source)],'executionTimeout':['180']}}
id=release.aws(['ssm','send-command','--cli-input-json',json.dumps(request)])['Command']['CommandId']
for _ in range(65):
 time.sleep(3);r=release.aws(['ssm','get-command-invocation','--command-id',id,'--instance-id',release.INSTANCE])
 if r['Status'] in ['Pending','InProgress','Delayed']:continue
 print(r.get('StandardOutputContent',''));assert r['Status']=='Success';break
else:raise RuntimeError('Read-only diagnostics timed out')
