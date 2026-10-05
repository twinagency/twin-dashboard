import base64,json,shlex,subprocess,time
from pathlib import Path

def aws(*args):
    result=subprocess.run(['aws','--region','ap-southeast-2',*args,'--output','json'],capture_output=True,text=True,timeout=45)
    if result.returncode:
        if 'InvocationDoesNotExist' in result.stderr: return {'Status':'Pending'}
        raise RuntimeError('Authorized AWS call failed; private response suppressed')
    return json.loads(result.stdout)

assert aws('sts','get-caller-identity')['Account']=='323149985112'
source=base64.b64encode(Path('deployment/clear-flirt-test-20261005.cjs').read_bytes()).decode()
host='''import base64,subprocess
source=base64.b64decode(SOURCE)
for brand,container in [('flirt','flirt-dashboard'),('moxy','next-app')]:
    r=subprocess.run(['docker','exec','-i',container,'node','-',brand],input=source,capture_output=True,timeout=240)
    print(r.stdout.decode(),end='',flush=True)
    print(r.stderr.decode(),end='',flush=True)
    if r.returncode: raise SystemExit(r.returncode)
'''.replace('SOURCE',repr(source))
command={'InstanceIds':['i-09a9dd3bd749643a5'],'DocumentName':'AWS-RunShellScript','Comment':'Authorized exact old creator test and agency identities reset; no deployment','Parameters':{'commands':['python3 -c '+shlex.quote(host)],'executionTimeout':['300']}}
job=aws('ssm','send-command','--cli-input-json',json.dumps(command))['Command']['CommandId']
for attempt in range(60):
    time.sleep(3)
    result=aws('ssm','get-command-invocation','--command-id',job,'--instance-id','i-09a9dd3bd749643a5')
    if result['Status'] in ('Pending','InProgress','Delayed'): continue
    print(result.get('StandardOutputContent',''))
    print(result.get('StandardErrorContent',''))
    assert result['Status']=='Success', 'Exact test reset did not finish; see safe output'
    break
else: raise RuntimeError('Exact test reset timed out; verify old IDs before retry')
