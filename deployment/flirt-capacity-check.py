"""Read-only diagnosis of the disk guard blocking the authorised FLIRT release."""
import json,subprocess,shlex,time

def aws(*args):
 r=subprocess.run(['aws','--region','ap-southeast-2',*args,'--output','json'],capture_output=True,text=True,timeout=45)
 if r.returncode:
  if 'InvocationDoesNotExist' in r.stderr:return {'Status':'Pending'}
  raise RuntimeError('Capacity read failed; details suppressed')
 return json.loads(r.stdout)
if aws('sts','get-caller-identity')['Account']!='323149985112':raise RuntimeError('Unexpected AWS account')
code=r'''
import json,subprocess,shutil

def run(args):
 r=subprocess.run(args,capture_output=True,text=True,timeout=60)
 if r.returncode:raise RuntimeError('Read-only disk check failed')
 return r.stdout
state=run(['docker','ps','-a','--format','{{json .}}'])
containers=[{k:r.get(k) for k in ('ID','Names','Image','State','Status')} for r in map(json.loads,state.splitlines())]
usage=shutil.disk_usage('/')
print(json.dumps({'disk_gib':{'total':round(usage.total/1024**3,2),'free':round(usage.free/1024**3,2)},'docker_disk':run(['docker','system','df']),'dangling_images':run(['docker','images','--filter','dangling=true','--format','{{json .}}']),'containers':containers,'read_only':True}))
'''
job=aws('ssm','send-command','--cli-input-json',json.dumps({'InstanceIds':['i-09a9dd3bd749643a5'],'DocumentName':'AWS-RunShellScript','Comment':'Read-only capacity diagnosis for FLIRT deployment','Parameters':{'commands':['sudo python3 -c '+shlex.quote(code)],'executionTimeout':['180']}}))['Command']['CommandId']
for _ in range(90):
 state=aws('ssm','get-command-invocation','--command-id',job,'--instance-id','i-09a9dd3bd749643a5')
 if state['Status'] not in ('Pending','InProgress','Delayed'):break
 time.sleep(2)
if state['Status']!='Success':raise RuntimeError('Capacity diagnosis failed')
print(state.get('StandardOutputContent',''))
