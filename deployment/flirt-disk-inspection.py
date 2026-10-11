import json, subprocess, time
def aws(args):
 r=subprocess.run(['aws','--region','ap-southeast-2',*args,'--output','json'],capture_output=True,text=True)
 if r.returncode:
  if 'InvocationDoesNotExist' in r.stderr:return {'Status':'Pending'}
  raise RuntimeError('AWS inspection failed')
 return json.loads(r.stdout)
assert aws(['sts','get-caller-identity'])['Account']=='323149985112'
commands=["python3 -c 'import json,subprocess,shutil,re\ndef run(args):return subprocess.check_output(args,text=True)\ntarget='\\''c5ce4e708376'\\''\nimage=json.loads(run(['\\''docker'\\'','\\''image'\\'','\\''inspect'\\'',target]))[0]\nids=run(['\\''docker'\\'','\\''ps'\\'','\\''-aq'\\'']).split()\ncontainers=json.loads(run(['\\''docker'\\'','\\''inspect'\\'',*ids])) if ids else []\nassert all(c['\\''Image'\\'']!=image['\\''Id'\\''] for c in containers),'\\''Image is attached to a container'\\''\ndigests=image.get('\\''RepoDigests'\\'') or []\nprefix='\\''323149985112.dkr.ecr.ap-southeast-2.amazonaws.com/twin-dashboard@'\\''\ndigest=next(d[len(prefix):] for d in digests if d.startswith(prefix))\nassert re.fullmatch(r'\\''sha256:[a-f0-9]{64}'\\'',digest)\nresult=json.loads(run(['\\''aws'\\'','\\''--region'\\'','\\''ap-southeast-2'\\'','\\''ecr'\\'','\\''batch-get-image'\\'','\\''--registry-id'\\'','\\''323149985112'\\'','\\''--repository-name'\\'','\\''twin-dashboard'\\'','\\''--image-ids'\\'','\\''imageDigest='\\''+digest,'\\''--output'\\'','\\''json'\\'']))\nassert len(result.get('\\''images'\\'',[]))==1 and not result.get('\\''failures'\\''),'\\''Registry recovery copy is missing'\\''\nprint(json.dumps({'\\''verified_unused_image'\\'':image['\\''Id'\\''],'\\''recoverable_registry_digest'\\'':digest,'\\''free_before'\\'':shutil.disk_usage('\\''/'\\'').free}))\nsubprocess.run(['\\''docker'\\'','\\''image'\\'','\\''rm'\\'',image['\\''Id'\\'']],check=True,stdout=subprocess.DEVNULL)\nprint(json.dumps({'\\''free_after'\\'':shutil.disk_usage('\\''/'\\'').free,'\\''required'\\'':5*1024**3}))\n'"]
request={'InstanceIds':['i-09a9dd3bd749643a5'],'DocumentName':'AWS-RunShellScript','Comment':'Remove one verified recoverable unused local image','Parameters':{'commands':commands,'executionTimeout':['120']}}
id=aws(['ssm','send-command','--cli-input-json',json.dumps(request)])['Command']['CommandId']
for _ in range(40):
 time.sleep(3)
 s=aws(['ssm','get-command-invocation','--command-id',id,'--instance-id','i-09a9dd3bd749643a5'])
 if s['Status'] in ('Pending','InProgress','Delayed'):continue
 print(s.get('StandardOutputContent',''))
 assert s['Status']=='Success',s['Status']
 break
else:raise RuntimeError('Inspection timed out')
