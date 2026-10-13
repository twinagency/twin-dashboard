"""Read-only post-release verification; no deployment or fan sends."""
import base64,json,pathlib,shlex,subprocess,time
INSTANCE='i-0584d283506f3f6be'
def ssm(command,timeout=120):
 p=pathlib.Path('/tmp')/('recovery-'+str(time.time_ns())+'.json')
 p.write_text(json.dumps({'commands':[command],'executionTimeout':[str(timeout)]}))
 cid=subprocess.check_output(['aws','ssm','send-command','--instance-ids',INSTANCE,'--document-name','AWS-RunShellScript','--parameters','file://'+str(p),'--comment','Read-only V2 photo recovery post-release verification','--query','Command.CommandId','--output','text'],text=True).strip()
 if timeout>120: print(json.dumps({'commandId':cid,'phase':'read-only six-creator runtime verification'}),flush=True)
 for _ in range(timeout//3+20):
  try:r=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id',INSTANCE,'--output','json'],text=True,stderr=subprocess.DEVNULL))
  except subprocess.CalledProcessError:time.sleep(3);continue
  if r['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
  time.sleep(3)
 else:raise RuntimeError('SSM command did not complete')
 print(r.get('StandardOutputContent',''),flush=True)
 if r['Status']!='Success': print(r.get('StandardErrorContent','')[-1800:],flush=True);raise RuntimeError('Candidate gate '+r['Status'])
 return cid

host=pathlib.Path('deployment/v2-photo-recovery/rollback-verify.py').read_text()
ssm('python3 -c '+shlex.quote(host),300)
