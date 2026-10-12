"""Build/test only, using the established bounded SSM transfer; no runtime replacement."""
import base64,json,pathlib,shlex,subprocess,time
INSTANCE='i-0584d283506f3f6be'
def ssm(command,timeout=120):
 p=pathlib.Path('/tmp')/('recovery-'+str(time.time_ns())+'.json')
 p.write_text(json.dumps({'commands':[command],'executionTimeout':[str(timeout)]}))
 cid=subprocess.check_output(['aws','ssm','send-command','--instance-ids',INSTANCE,'--document-name','AWS-RunShellScript','--parameters','file://'+str(p),'--comment','Approved V2 recovery verification; no fan sends or runtime replacement','--query','Command.CommandId','--output','text'],text=True).strip()
 if timeout>120: print(json.dumps({'commandId':cid,'phase':'candidate build and approved model checks'}),flush=True)
 for _ in range(timeout//3+20):
  try:r=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id',INSTANCE,'--output','json'],text=True,stderr=subprocess.DEVNULL))
  except subprocess.CalledProcessError:time.sleep(3);continue
  if r['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
  time.sleep(3)
 else:raise RuntimeError('SSM command did not complete')
 print(r.get('StandardOutputContent',''),flush=True)
 if r['Status']!='Success': print(r.get('StandardErrorContent','')[-1800:],flush=True);raise RuntimeError('Candidate gate '+r['Status'])
 return cid

for dst,src in {'/tmp/photo-boundary-check.mjs':'deployment/v2-photo-recovery/boundary-check.mjs','/tmp/photo-boundary-check.py':'deployment/v2-photo-recovery/boundary-check.py'}.items():
 encoded=base64.b64encode(pathlib.Path(src).read_bytes()).decode()
 ssm("printf '%s' '"+encoded+"' | base64 -d > "+dst,30)
ssm('python3 -u /tmp/photo-boundary-check.py',150)
