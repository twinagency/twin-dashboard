"""Read-only post-release observation; no deployment, restart, model call or fan send."""
import base64,gzip,hashlib,json,pathlib,shlex,subprocess,time
INSTANCE='i-0584d283506f3f6be'
def ssm(command,timeout=120):
 p=pathlib.Path('/tmp')/('shared-repair-'+str(time.time_ns())+'.json')
 p.write_text(json.dumps({'commands':[command],'executionTimeout':[str(timeout)]}))
 cid=subprocess.check_output(['aws','ssm','send-command','--instance-ids',INSTANCE,'--document-name','AWS-RunShellScript','--parameters','file://'+str(p),'--comment','Read-only deployed shared V2 verification; no model calls or messages','--query','Command.CommandId','--output','text'],text=True).strip()
 if timeout>120:print(json.dumps({'commandId':cid,'phase':'read-only shared release observation'}),flush=True)
 for _ in range(timeout//3+20):
  try:r=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id',INSTANCE,'--output','json'],text=True,stderr=subprocess.DEVNULL))
  except subprocess.CalledProcessError:time.sleep(3);continue
  if r['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
  time.sleep(3)
 else:raise RuntimeError('Isolated SSM command incomplete')
 print(r.get('StandardOutputContent',''),flush=True)
 if r['Status']!='Success':
  print(r.get('StandardErrorContent','')[-600:],flush=True)
  raise RuntimeError('Isolated verification '+r['Status'])
 return cid

raw=pathlib.Path('deployment/v2-photo-recovery/verify-shared-release.py').read_bytes()
packed=base64.b64encode(gzip.compress(raw)).decode()
program="import gzip,base64;exec(compile(gzip.decompress(base64.b64decode("+repr(packed)+")),'<shared-release-readonly>','exec'))"
ssm('python3 -c '+shlex.quote(program),100)
