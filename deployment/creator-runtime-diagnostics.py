import importlib.util,json,time,shlex
from pathlib import Path
root=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('release',root/'flirt-release.py');release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)
assert release.aws(['sts','get-caller-identity'])['Account']==release.ACCOUNT
source=r'''
import subprocess,json,re
target='flirt-dashboard'
def run(args):
 r=subprocess.run(args,capture_output=True,text=True,timeout=45);assert r.returncode==0;return r.stdout
assert run(['docker','exec',target,'printenv','GIT_SHA']).strip()=='e528eb6066477d33a50b68d58d4fea1de5cff681'
result=subprocess.run(['docker','logs','--since','2026-10-04T05:50:07Z','--until','2026-10-04T05:51:05Z',target],capture_output=True,text=True,timeout=45)
rows=[]
for line in (result.stdout+'\n'+result.stderr).splitlines():
 m=re.match(r'^creator_upload(?:_stage)? (\{.*\})$',line)
 if not m:continue
 try:d=json.loads(m.group(1))
 except:continue
 rows.append({k:d[k] for k in ['requestId','stage','elapsedMs','httpStatus','durationsMs','code','rssBytes','peakRssBytes','tempFreeBytes'] if k in d})
print(json.dumps({'scoped_upload_diagnostics':rows,'customer_details_copied':False}))
'''
request={'InstanceIds':[release.INSTANCE],'DocumentName':'AWS-RunShellScript','Comment':'Read-only creator upload capacity diagnostics','TimeoutSeconds':60,'Parameters':{'commands':['python3 -c '+shlex.quote(source)],'executionTimeout':['180']}}
id=release.aws(['ssm','send-command','--cli-input-json',json.dumps(request)])['Command']['CommandId']
for _ in range(65):
 time.sleep(3);r=release.aws(['ssm','get-command-invocation','--command-id',id,'--instance-id',release.INSTANCE])
 if r['Status'] in ['Pending','InProgress','Delayed']:continue
 print(r.get('StandardOutputContent',''));assert r['Status']=='Success';break
else:raise RuntimeError('Read-only diagnostics timed out')
