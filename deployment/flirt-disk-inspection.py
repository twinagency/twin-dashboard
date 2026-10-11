import json, subprocess, time
def aws(args):
 r=subprocess.run(['aws','--region','ap-southeast-2',*args,'--output','json'],capture_output=True,text=True)
 if r.returncode:
  if 'InvocationDoesNotExist' in r.stderr:return {'Status':'Pending'}
  raise RuntimeError('AWS inspection failed')
 return json.loads(r.stdout)
assert aws(['sts','get-caller-identity'])['Account']=='323149985112'
commands=['du -xhd1 /var/log /var/cache /tmp /var/tmp /root/.cache 2>/dev/null || true','journalctl --disk-usage','docker system df -v']
request={'InstanceIds':['i-09a9dd3bd749643a5'],'DocumentName':'AWS-RunShellScript','Comment':'Read-only disk inspection for FLIRT deployment','Parameters':{'commands':commands,'executionTimeout':['120']}}
id=aws(['ssm','send-command','--cli-input-json',json.dumps(request)])['Command']['CommandId']
for _ in range(40):
 time.sleep(3)
 s=aws(['ssm','get-command-invocation','--command-id',id,'--instance-id','i-09a9dd3bd749643a5'])
 if s['Status'] in ('Pending','InProgress','Delayed'):continue
 print(s.get('StandardOutputContent',''))
 assert s['Status']=='Success',s['Status']
 break
else:raise RuntimeError('Inspection timed out')
