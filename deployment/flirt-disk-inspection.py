import json, subprocess, time
def aws(args):
 r=subprocess.run(['aws','--region','ap-southeast-2',*args,'--output','json'],capture_output=True,text=True)
 if r.returncode:
  if 'InvocationDoesNotExist' in r.stderr:return {'Status':'Pending'}
  raise RuntimeError('AWS inspection failed')
 return json.loads(r.stdout)
assert aws(['sts','get-caller-identity'])['Account']=='323149985112'
commands=["python3 -c 'import json,subprocess,shutil\ndef run(a):return subprocess.check_output(a,text=True)\nids=run(['\\''docker'\\'','\\''ps'\\'','\\''-aq'\\'']).split()\ncs=json.loads(run(['\\''docker'\\'','\\''inspect'\\'',*ids])) if ids else []\nprint(json.dumps({'\\''free_bytes'\\'':shutil.disk_usage('\\''/'\\'').free,'\\''containers'\\'':[{'\\''name'\\'':c['\\''Name'\\''],'\\''id'\\'':c['\\''Id'\\''],'\\''image'\\'':c['\\''Image'\\''],'\\''status'\\'':c['\\''State'\\'']['\\''Status'\\''],'\\''created'\\'':c['\\''Created'\\''],'\\''mounts'\\'':len(c['\\''Mounts'\\''])} for c in cs]}))'"]
request={'InstanceIds':['i-09a9dd3bd749643a5'],'DocumentName':'AWS-RunShellScript','Comment':'Inspect disk and container metadata without private settings','Parameters':{'commands':commands,'executionTimeout':['240']}}
id=aws(['ssm','send-command','--cli-input-json',json.dumps(request)])['Command']['CommandId']
for _ in range(80):
 time.sleep(3)
 s=aws(['ssm','get-command-invocation','--command-id',id,'--instance-id','i-09a9dd3bd749643a5'])
 if s['Status'] in ('Pending','InProgress','Delayed'):continue
 print(s.get('StandardOutputContent',''))
 assert s['Status']=='Success',s['Status']
 break
else:raise RuntimeError('Inspection timed out')
