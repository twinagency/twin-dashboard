"""Deploy the verified candidate using fresh six-creator drains and prepared rollback."""
import base64,json,pathlib,shlex,subprocess,time
INSTANCE='i-0584d283506f3f6be'
def ssm(command,timeout=120):
 p=pathlib.Path('/tmp')/('recovery-'+str(time.time_ns())+'.json')
 p.write_text(json.dumps({'commands':[command],'executionTimeout':[str(timeout)]}))
 cid=subprocess.check_output(['aws','ssm','send-command','--instance-ids',INSTANCE,'--document-name','AWS-RunShellScript','--parameters','file://'+str(p),'--comment','Authorized V2 photo recovery release with verified drain','--query','Command.CommandId','--output','text'],text=True).strip()
 if timeout>120: print(json.dumps({'commandId':cid,'phase':'verified six-creator V2 deployment'}),flush=True)
 for _ in range(timeout//3+20):
  try:r=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id',INSTANCE,'--output','json'],text=True,stderr=subprocess.DEVNULL))
  except subprocess.CalledProcessError:time.sleep(3);continue
  if r['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
  time.sleep(3)
 else:raise RuntimeError('SSM command did not complete')
 print(r.get('StandardOutputContent',''),flush=True)
 if r['Status']!='Success': print(r.get('StandardErrorContent','')[-1800:],flush=True);raise RuntimeError('Candidate gate '+r['Status'])
 return cid

encoded=base64.b64encode(pathlib.Path('deployment/v2-photo-recovery/deploy.py').read_bytes()).decode()
ssm('rm -f /tmp/photo-recovery-deploy.b64',30)
for n in range(0,len(encoded),10000):
 ssm("printf '%s' '"+encoded[n:n+10000]+"' >> /tmp/photo-recovery-deploy.b64",30)
unpack="""import pathlib,base64,os,py_compile
p=pathlib.Path('/home/ubuntu/twin-v2-backups/photo-recovery-20261013/deploy.py')
p.write_bytes(base64.b64decode(pathlib.Path('/tmp/photo-recovery-deploy.b64').read_bytes()));p.chmod(0o700);py_compile.compile(str(p),doraise=True)
"""
ssm('python3 -c '+shlex.quote(unpack),30)
ssm('python3 -u /home/ubuntu/twin-v2-backups/photo-recovery-20261013/deploy.py',600)
