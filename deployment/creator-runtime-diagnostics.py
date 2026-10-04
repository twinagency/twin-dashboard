import importlib.util,json,time,shlex
from pathlib import Path
root=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('release',root/'flirt-release.py');release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)
assert release.aws(['sts','get-caller-identity'])['Account']==release.ACCOUNT
source=r'''
import subprocess,json
r=subprocess.run(['docker','exec','flirt-dashboard','node','-e',"const fs=require('node:fs'),path=require('node:path'); const out=[];for(const n of fs.readdirSync('/tmp')){if(!/^creator-flow-flirt-[A-Za-z0-9]+$/.test(n))continue;const p=path.join('/tmp',n,'cleanup-manifest.json');if(!fs.existsSync(p))continue;const m=JSON.parse(fs.readFileSync(p,'utf8'));out.push({manifest:p,brand:m.brand,expected_sha:m.expected_sha,stamp:m.stamp,fixtures:m.fixtures.length,invitations:m.invitations.length});} console.log(JSON.stringify({commit:process.env.GIT_SHA,manifests:out,memory_events:fs.readFileSync('/sys/fs/cgroup/memory.events','utf8'),memory_current:fs.readFileSync('/sys/fs/cgroup/memory.current','utf8')}));"],capture_output=True,text=True,timeout=30)
assert r.returncode==0
print(r.stdout)
'''
request={'InstanceIds':[release.INSTANCE],'DocumentName':'AWS-RunShellScript','Comment':'Read-only creator upload capacity diagnostics','TimeoutSeconds':60,'Parameters':{'commands':['python3 -c '+shlex.quote(source)],'executionTimeout':['180']}}
id=release.aws(['ssm','send-command','--cli-input-json',json.dumps(request)])['Command']['CommandId']
for _ in range(65):
 time.sleep(3);r=release.aws(['ssm','get-command-invocation','--command-id',id,'--instance-id',release.INSTANCE])
 if r['Status'] in ['Pending','InProgress','Delayed']:continue
 print(r.get('StandardOutputContent',''));assert r['Status']=='Success';break
else:raise RuntimeError('Read-only diagnostics timed out')
