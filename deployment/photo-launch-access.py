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

encoded=pathlib.Path('deployment/v2-photo-recovery/delta-final.b64').read_text().strip()
ssm('rm -f /tmp/photo-recovery-delta.b64',30)
for n in range(0,len(encoded),10000):
 ssm("printf '%s' '"+encoded[n:n+10000]+"' >> /tmp/photo-recovery-delta.b64",30)
unpack="""import pathlib,base64,zlib,json,hashlib
p=pathlib.Path('/tmp/photo-recovery-payload.json');raw=p.read_bytes()
d=json.loads(zlib.decompress(base64.b64decode(pathlib.Path('/tmp/photo-recovery-delta.b64').read_bytes())))
assert hashlib.sha256(raw).hexdigest()==d['expectedPayloadSha256']
v=json.loads(raw);v['manifest']=d['manifest'];v['changed'].update(d['changed']);p.write_text(json.dumps(v))
assert hashlib.sha256(p.read_bytes()).hexdigest()=='0fe176a6b4882bd6d0788ad99578c87a78999b8e1cc11a3e2ab50d22b2efc7c6'
"""
ssm('python3 -c '+shlex.quote(unpack),30)
for dst,src in {'/tmp/photo-recovery-prepare.py':'deployment/v2-photo-recovery/prepare.py','/tmp/photo-recovery-snapshot.mjs':'deployment/v2-photo-recovery/snapshot.mjs'}.items():
 data=base64.b64encode(pathlib.Path(src).read_bytes()).decode()
 ssm("printf '%s' '"+data+"' | base64 -d > "+dst,30)
ssm('python3 -u /tmp/photo-recovery-prepare.py',1440)

for dst,src in {'/tmp/photo-boundary-check.mjs':'deployment/v2-photo-recovery/boundary-check.mjs','/tmp/photo-boundary-check.py':'deployment/v2-photo-recovery/boundary-check.py'}.items():
 encoded=base64.b64encode(pathlib.Path(src).read_bytes()).decode()
 ssm("printf '%s' '"+encoded+"' | base64 -d > "+dst,30)
ssm('python3 -u /tmp/photo-boundary-check.py',150)
