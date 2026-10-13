"""Inspect the completed candidate replay without model calls or state changes."""
import base64,gzip,json,pathlib,shlex,subprocess,time
INSTANCE='i-0584d283506f3f6be'
script=pathlib.Path('deployment/v2-photo-recovery/inspect-reference-failures.py').read_text()
packed=base64.b64encode(gzip.compress(script.encode())).decode()
host="import base64,gzip;exec(compile(gzip.decompress(base64.b64decode("+repr(packed)+")), '<readonly-reference-facts>', 'exec'))"
parameters=pathlib.Path('/tmp')/('reference-facts-'+str(time.time_ns())+'.json')
parameters.write_text(json.dumps({'commands':['python3 -c '+shlex.quote(host)],'executionTimeout':['90']}))
cid=subprocess.check_output(['aws','ssm','send-command','--instance-ids',INSTANCE,'--document-name','AWS-RunShellScript','--parameters','file://'+str(parameters),'--comment','Read-only recorded reference failure facts','--query','Command.CommandId','--output','text'],text=True).strip()
print(json.dumps({'commandId':cid,'phase':'read-only saved failure facts; no model calls'}),flush=True)
for _ in range(40):
 try:result=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id',INSTANCE,'--output','json'],text=True,stderr=subprocess.DEVNULL))
 except subprocess.CalledProcessError:time.sleep(3);continue
 if result['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
 time.sleep(3)
else:raise RuntimeError('Read-only inspection still running')
print(result.get('StandardOutputContent',''),flush=True)
if result['Status']!='Success':
 print(result.get('StandardErrorContent','')[-1000:],flush=True)
 raise RuntimeError('Read-only inspection failed; no production change')
