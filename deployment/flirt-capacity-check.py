"""Retire reproducible old FLIRT archives to unblock the authorised release.
Never prune volumes, running containers, the immediate rollback, or unique data.
"""
import json,subprocess,shlex,time,re

def aws(*args):
 r=subprocess.run(['aws','--region','ap-southeast-2',*args,'--output','json'],capture_output=True,text=True,timeout=45)
 if r.returncode:
  if 'InvocationDoesNotExist' in r.stderr:return {'Status':'Pending'}
  if 'ImageNotFoundException' in r.stderr:return {'imageDetails':[]}
  raise RuntimeError('Capacity operation failed; private details suppressed')
 return json.loads(r.stdout)
if aws('sts','get-caller-identity')['Account']!='323149985112':raise RuntimeError('Unexpected AWS account')

def host(code):
 job=aws('ssm','send-command','--cli-input-json',json.dumps({'InstanceIds':['i-09a9dd3bd749643a5'],'DocumentName':'AWS-RunShellScript','Comment':'Recover capacity using backed-up historical FLIRT releases','Parameters':{'commands':['sudo python3 -c '+shlex.quote(code)],'executionTimeout':['240']}}))['Command']['CommandId']
 for _ in range(100):
  state=aws('ssm','get-command-invocation','--command-id',job,'--instance-id','i-09a9dd3bd749643a5')
  if state['Status'] not in ('Pending','InProgress','Delayed'):break
  time.sleep(2)
 if state['Status']!='Success':raise RuntimeError('Bounded capacity operation did not complete')
 return json.loads(state['StandardOutputContent'])
common=r'''
import json,subprocess,shutil,datetime,re,pathlib,os
PROJECT='lkmfwpqegjluirfusnaw'
PREFIX='323149985112.dkr.ecr.ap-southeast-2.amazonaws.com/twin-dashboard@sha256:'

def run(args):
 r=subprocess.run(args,capture_output=True,text=True,timeout=90)
 if r.returncode:raise RuntimeError('Capacity command failed: '+args[0])
 return r.stdout

def inspect(name):return json.loads(run(['docker','inspect',name]))[0]

def disposable(c):
 name=c['Name'].lstrip('/')
 if not re.fullmatch(r'flirt-dashboard-archive-[0-9a-f]{12}(?:-[0-9a-f]+)?',name):return False
 labels=c['Config'].get('Labels') or {}
 if labels.get('io.flirt.project')!=PROJECT or not re.fullmatch(r'[0-9a-f]{40}',labels.get('io.flirt.commit','')):return False
 if c['State']['Status']!='exited' or c['Mounts']:return False
 ended=datetime.datetime.fromisoformat(c['State']['FinishedAt'].replace('Z','+00:00'))
 if ended>datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(days=7):return False
 if not c['Config']['Image'].startswith(PREFIX):return False
 for line in run(['docker','diff',name]).splitlines():
  mode,path=line.split(' ',1)
  if path in ('/app','/app/.next') and mode=='C':continue
  if path=='/app/.next/cache' or path.startswith('/app/.next/cache/'):continue
  return False
 return True
'''
read=common+r'''
ids=run(['docker','ps','-aq','--filter','name=flirt-dashboard-archive-']).split()
cs=[inspect(id) for id in ids]
cs.sort(key=lambda c:c['State']['FinishedAt'])
print(json.dumps({'free_gib':shutil.disk_usage('/').free/1024**3,'candidates':[{'name':c['Name'].lstrip('/'),'id':c['Id'],'image':c['Image'],'image_ref':c['Config']['Image'],'commit':c['Config']['Labels']['io.flirt.commit']} for c in cs if disposable(c)][:12]}))
'''
inventory=host(read)
verified=[]
for c in inventory['candidates']:
 digest=c['image_ref'].split('@')[1]
 if not re.fullmatch(r'sha256:[0-9a-f]{64}',digest):raise RuntimeError('Unexpected digest')
 result=aws('ecr','describe-images','--repository-name','twin-dashboard','--image-ids','imageDigest='+digest)
 if any(x.get('imageDigest')==digest for x in result.get('imageDetails',[])):verified.append(c)
print(json.dumps({'before_free_gib':inventory['free_gib'],'cloud_backed_disposable_archives':len(verified),'limit':12}),flush=True)
if inventory['free_gib']<6 and not verified:raise RuntimeError('No reproducible archives could be verified for safe cleanup')
clean=common+'\nCANDIDATES='+repr(verified)+r'''
protected_names=['flirt-dashboard','flirt-dashboard-rollback','next-app','flirt-bot']
def snapshot():
 return {name:{'id':c['Id'],'status':c['State']['Status'],'started':c['State']['StartedAt'],'restarts':c['RestartCount'],'image':c['Image']} for name in protected_names for c in [inspect(name)]}
before=snapshot()
if any(before[n]['status']!='running' for n in ['flirt-dashboard','next-app','flirt-bot']):raise RuntimeError('Existing services must be healthy before cleanup')
retired=[]
manifest=pathlib.Path('/etc/flirt/retired-archives-20261011.json')
if manifest.exists():raise RuntimeError('Cleanup manifest already exists; inspect it before repeating')
for candidate in CANDIDATES:
 if shutil.disk_usage('/').free>=6*1024**3:break
 current=inspect(candidate['name'])
 if current['Id']!=candidate['id'] or current['Image']!=candidate['image'] or current['Config']['Image']!=candidate['image_ref'] or not disposable(current):raise RuntimeError('Archive changed since inspection')
 # Record the verified registry reference before removing its replaceable local copy.
 with open(manifest,'w') as file:json.dump({'cloud_backed':True,'archives':retired+[candidate]},file)
 os.chmod(manifest,0o600)
 run(['docker','rm',candidate['id']])
 remaining=run(['docker','ps','-aq']).split()
 used=any(inspect(id)['Image']==candidate['image'] for id in remaining)
 if not used:run(['docker','image','rm',candidate['image_ref']])
 retired.append(candidate)
 if snapshot()!=before:raise RuntimeError('Protected service state changed during cleanup')
free=shutil.disk_usage('/').free/1024**3
print(json.dumps({'retired_local_archives':[c['name'] for c in retired],'free_gib':free,'disk_guard_met':free>=5,'running_services_and_immediate_rollback_unchanged':snapshot()==before,'registry_backups_retained':True,'volumes_touched':False}))
'''
print(json.dumps(host(clean)))
