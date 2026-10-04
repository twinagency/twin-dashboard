import json, shlex, subprocess, time

REGION='ap-southeast-2'
INSTANCE='i-09a9dd3bd749643a5'
def aws(args):
    r=subprocess.run(['aws','--region',REGION,*args,'--output','json'],capture_output=True,text=True,timeout=60)
    if r.returncode and 'InvocationDoesNotExist' in r.stderr: return {'Status':'Pending'}
    if r.returncode: raise RuntimeError('Authorized diagnostic operation failed; raw response suppressed')
    return json.loads(r.stdout)

host=r'''
import json,subprocess
for name in ['next-app','flirt-dashboard']:
    version=subprocess.run(['docker','exec',name,'printenv','GIT_SHA'],capture_output=True,text=True,timeout=15)
    binding=subprocess.run(['docker','exec',name,'node','-e','const u=process.env.SUPABASE_URL; console.log(u ? new URL(u).hostname : "unavailable")'],capture_output=True,text=True,timeout=15)
    log=subprocess.run(['docker','logs','--since','2026-10-04T10:00:00Z',name],capture_output=True,text=True,timeout=30)
    records=[]
    for line in (log.stdout+'\n'+log.stderr).splitlines():
        if not line.startswith('creator_upload '): continue
        try: row=json.loads(line.split(' ',1)[1])
        except Exception: continue
        records.append({k:row.get(k) for k in ['requestId','httpStatus','elapsedMs','durationsMs','safeCode','peakRssBytes']})
    print(json.dumps({'container':name,'serving_commit':version.stdout.strip() if version.returncode==0 else 'unavailable','backend_host':binding.stdout.strip() if binding.returncode==0 else 'unavailable','uploads':records[-100:]}))
'''
assert aws(['sts','get-caller-identity'])['Account']=='323149985112'
command={'InstanceIds':[INSTANCE],'DocumentName':'AWS-RunShellScript','Comment':'Read-only creator feedback timing diagnostics','Parameters':{'commands':['python3 -c '+shlex.quote(host)]}}
cid=aws(['ssm','send-command','--cli-input-json',json.dumps(command)])['Command']['CommandId']
for _ in range(40):
    r=aws(['ssm','get-command-invocation','--command-id',cid,'--instance-id',INSTANCE])
    if r['Status'] in ['Pending','InProgress','Delayed']: time.sleep(2); continue
    if r['Status']!='Success': raise RuntimeError('Read-only diagnostic did not complete; raw output suppressed')
    for line in r.get('StandardOutputContent','').splitlines():
        try: row=json.loads(line)
        except Exception: continue
        if row.get('container') in ['next-app','flirt-dashboard']: print(json.dumps(row))
    break
else: raise RuntimeError('Read-only diagnostic timed out')
