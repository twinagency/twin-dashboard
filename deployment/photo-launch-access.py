"""Read-only closure of the isolated selection stage; no model call or deployment."""
import base64, gzip, json, pathlib, shlex, subprocess, time
INSTANCE = 'i-0584d283506f3f6be'
script = pathlib.Path('deployment/v2-photo-recovery/final-stage-readonly.py').read_text()
packed = base64.b64encode(gzip.compress(script.encode())).decode()
host = "import base64,gzip;exec(compile(gzip.decompress(base64.b64decode(" + repr(packed) + ")), '<readonly-stage-check>', 'exec'))"
command = 'python3 -c ' + shlex.quote(host)
parameters = pathlib.Path('/tmp') / ('selection-readonly-' + str(time.time_ns()) + '.json')
parameters.write_text(json.dumps({'commands':[command], 'executionTimeout':['240']}))
cid = subprocess.check_output(['aws','ssm','send-command','--instance-ids',INSTANCE,'--document-name','AWS-RunShellScript','--parameters','file://'+str(parameters),'--comment','Read-only V2 rollback and isolated replay verification','--query','Command.CommandId','--output','text'],text=True).strip()
print(json.dumps({'commandId':cid,'phase':'read-only final verification; no model calls or deployment'}),flush=True)
result = None
for _ in range(90):
 try:
  result=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id',INSTANCE,'--output','json'],text=True,stderr=subprocess.DEVNULL))
 except subprocess.CalledProcessError:
  time.sleep(3);continue
 if result['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
 time.sleep(3)
else:raise RuntimeError('Read-only verification still running; inspect this SSM command')
print(result.get('StandardOutputContent',''),flush=True)
if result['Status']!='Success':
 print(result.get('StandardErrorContent','')[-1200:],flush=True)
 raise RuntimeError('Read-only verification '+result['Status']+'; no deployment performed')
