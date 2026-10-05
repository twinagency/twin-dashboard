import base64,json,shlex,subprocess,time
from pathlib import Path
def aws(*args):
    r=subprocess.run(['aws','--region','ap-southeast-2',*args,'--output','json'],capture_output=True,text=True,timeout=45)
    if r.returncode:
        if 'InvocationDoesNotExist' in r.stderr: return {'Status':'Pending'}
        raise RuntimeError('AWS operation failed; private response suppressed')
    return json.loads(r.stdout)
assert aws('sts','get-caller-identity')['Account']=='323149985112'
source=base64.b64encode(Path('deployment/moxy-live-test-invite.cjs').read_bytes()).decode()
host="""import base64,subprocess
r=subprocess.run(['docker','exec','-i','next-app','node','-'],input=base64.b64decode(SOURCE),capture_output=True,timeout=180)
print(r.stdout.decode(),end='',flush=True)
print(r.stderr.decode(),end='',flush=True)
raise SystemExit(r.returncode)
""".replace('SOURCE',repr(source))
command={'InstanceIds':['i-09a9dd3bd749643a5'],'DocumentName':'AWS-RunShellScript','Comment':'Create user-requested Moxy test invite through normal authorized interface','Parameters':{'commands':['python3 -c '+shlex.quote(host)],'executionTimeout':['210']}}
job=aws('ssm','send-command','--cli-input-json',json.dumps(command))['Command']['CommandId']
for attempt in range(65):
    time.sleep(3)
    r=aws('ssm','get-command-invocation','--command-id',job,'--instance-id','i-09a9dd3bd749643a5')
    if r['Status'] in ('Pending','InProgress','Delayed'): continue
    print(r.get('StandardOutputContent',''))
    print(r.get('StandardErrorContent',''))
    assert r['Status']=='Success','Invite operation incomplete; review encrypted output before retry'
    break
else: raise RuntimeError('Invite operation timeout; inspect persisted invitation before retry')
