"""Isolated diagnostic; no deployment or real model/Telegram sends."""
import base64,json,pathlib,shlex,subprocess,time
INSTANCE='i-0584d283506f3f6be'
def ssm(command,timeout=120):
 p=pathlib.Path('/tmp')/('recovery-'+str(time.time_ns())+'.json')
 p.write_text(json.dumps({'commands':[command],'executionTimeout':[str(timeout)]}))
 cid=subprocess.check_output(['aws','ssm','send-command','--instance-ids',INSTANCE,'--document-name','AWS-RunShellScript','--parameters','file://'+str(p),'--comment','Isolated frozen-output V2 incident replay','--query','Command.CommandId','--output','text'],text=True).strip()
 if timeout>120: print(json.dumps({'commandId':cid,'phase':'isolated seven-turn diagnostic'}),flush=True)
 for _ in range(timeout//3+20):
  try:r=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id',INSTANCE,'--output','json'],text=True,stderr=subprocess.DEVNULL))
  except subprocess.CalledProcessError:time.sleep(3);continue
  if r['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
  time.sleep(3)
 else:raise RuntimeError('SSM command did not complete')
 print(r.get('StandardOutputContent',''),flush=True)
 if r['Status']!='Success': print(r.get('StandardErrorContent','')[-1800:],flush=True);raise RuntimeError('Candidate gate '+r['Status'])
 return cid

source=pathlib.Path('deployment/v2-photo-recovery/replay-live-incident.mjs').read_bytes()
host=pathlib.Path('deployment/v2-photo-recovery/replay-live-incident.py').read_text()
payload="import base64,pathlib;pathlib.Path('/tmp/v2-live-incident-replay.mjs').write_bytes(base64.b64decode("+repr(base64.b64encode(source).decode())+"))\n"+host
ssm('python3 -c '+shlex.quote(payload),240)
