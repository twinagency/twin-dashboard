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
 if r.returncode:raise RuntimeError('Archive read failed')
 return r.stdout
names=['flirt-dashboard-archive-08e25649e2d0','flirt-dashboard-archive-c1ae46e04a96','flirt-dashboard-archive-2a350a1c0687','flirt-dashboard-archive-c5797c987106']
result=[]
for name in names:
 c=json.loads(run(['docker','inspect','--size',name]))[0]
 im=json.loads(run(['docker','image','inspect',c['Image']]))[0]
 result.append({'name':name,'id':c['Id'],'state':c['State']['Status'],'finished':c['State']['FinishedAt'],'mounts':c['Mounts'],'image':c['Image'],'image_ref':c['Config']['Image'],'labels':c['Config'].get('Labels'),'image_bytes':im['Size'],'writable_bytes':c.get('SizeRw'),'repo_digests':im.get('RepoDigests'),'changes':run(['docker','diff',name])})
print(json.dumps({'archives':result,'free_gib':shutil.disk_usage('/').free/1024**3,'read_only':True}))
'''
job=aws('ssm','send-command','--cli-input-json',json.dumps({'InstanceIds':['i-09a9dd3bd749643a5'],'DocumentName':'AWS-RunShellScript','Comment':'Read-only capacity diagnosis for FLIRT deployment','Parameters':{'commands':['sudo python3 -c '+shlex.quote(code)],'executionTimeout':['180']}}))['Command']['CommandId']
for _ in range(90):
 state=aws('ssm','get-command-invocation','--command-id',job,'--instance-id','i-09a9dd3bd749643a5')
 if state['Status'] not in ('Pending','InProgress','Delayed'):break
 time.sleep(2)
if state['Status']!='Success':raise RuntimeError('Capacity diagnosis failed')
print(state.get('StandardOutputContent',''))
