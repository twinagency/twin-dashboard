"""Read the saved completed candidate; no model calls or production changes."""
import base64,gzip,json,pathlib,shlex,subprocess,time
source=pathlib.Path('deployment/v2-photo-recovery/final-stage-readonly.py').read_text()
packed=base64.b64encode(gzip.compress(source.encode())).decode()
host="import base64,gzip;exec(compile(gzip.decompress(base64.b64decode("+repr(packed)+")),'saved-replay-review','exec'))"
params={'commands':['python3 -c '+shlex.quote(host)],'executionTimeout':['90']}
p=pathlib.Path('/tmp/reference-readonly-command.json');p.write_text(json.dumps(params))
cid=subprocess.check_output(['aws','ssm','send-command','--instance-ids','i-0584d283506f3f6be','--document-name','AWS-RunShellScript','--parameters','file://'+str(p),'--comment','Read-only V2 final rollback and candidate status','--query','Command.CommandId','--output','text'],text=True).strip()
print(json.dumps({'commandId':cid,'phase':'read-only final runtime and failed-candidate check'}),flush=True)
for _ in range(35):
 try:r=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id','i-0584d283506f3f6be','--output','json'],text=True,stderr=subprocess.DEVNULL))
 except subprocess.CalledProcessError:time.sleep(3);continue
 if r['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
 time.sleep(3)
else:raise RuntimeError('Read-only command incomplete')
print(r.get('StandardOutputContent',''),flush=True)
if r['Status']!='Success':
 print(r.get('StandardErrorContent','')[-1500:],flush=True)
 raise RuntimeError('Read-only review failed')
