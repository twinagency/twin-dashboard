"""Read-only saved shared V2 repair results. No deployment."""
import base64,gzip,json,pathlib,shlex,subprocess,time
source=pathlib.Path('deployment/v2-photo-recovery/read-shared-repair-failures.py').read_text()
packed=base64.b64encode(gzip.compress(source.encode())).decode()
host="import base64,gzip;exec(compile(gzip.decompress(base64.b64decode("+repr(packed)+")),'riley-incident-readonly','exec'))"
params={'commands':['python3 -c '+shlex.quote(host)],'executionTimeout':['180']}
p=pathlib.Path('/tmp/riley-incident-readonly.json');p.write_text(json.dumps(params))
cid=subprocess.check_output(['aws','ssm','send-command','--instance-ids','i-0584d283506f3f6be','--document-name','AWS-RunShellScript','--parameters','file://'+str(p),'--comment','Read-only current shared V2 repair baseline','--query','Command.CommandId','--output','text'],text=True).strip()
print(json.dumps({'commandId':cid}),flush=True)
for _ in range(65):
 try:r=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id','i-0584d283506f3f6be','--output','json'],text=True,stderr=subprocess.DEVNULL))
 except subprocess.CalledProcessError:time.sleep(3);continue
 if r['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
 time.sleep(3)
else:raise RuntimeError('Read-only diagnosis incomplete')
print(r.get('StandardOutputContent',''),flush=True)
if r['Status']!='Success':
 print(r.get('StandardErrorContent','')[-1200:],flush=True)
 raise RuntimeError('Read-only diagnosis failed')
