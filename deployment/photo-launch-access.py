"""Transfer and run only the isolated shared repair tests; no production replacement."""
import base64,gzip,hashlib,json,pathlib,shlex,subprocess,time
INSTANCE='i-0584d283506f3f6be'
def ssm(command,timeout=120):
 p=pathlib.Path('/tmp')/('shared-repair-'+str(time.time_ns())+'.json')
 p.write_text(json.dumps({'commands':[command],'executionTimeout':[str(timeout)]}))
 cid=subprocess.check_output(['aws','ssm','send-command','--instance-ids',INSTANCE,'--document-name','AWS-RunShellScript','--parameters','file://'+str(p),'--comment','Isolated shared V2 photo repair verification; no real fan sends or deployment','--query','Command.CommandId','--output','text'],text=True).strip()
 if timeout>120:print(json.dumps({'commandId':cid,'phase':'isolated shared repair verification'}),flush=True)
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
stage='/tmp/twin-shared-photo-'+"5e789f1d23bf"+'-'+str(time.time_ns())
files=['shared-source-payload.json','extract-shared-repair-evidence.mjs','replay-shared-photo-repair.mjs','verify-shared-photo-repair.py']
bundle={name:pathlib.Path('deployment/v2-photo-recovery/'+name).read_text() for name in files}
raw=json.dumps(bundle).encode();packed=base64.b64encode(gzip.compress(raw)).decode();digest=hashlib.sha256(raw).hexdigest()
ssm('mkdir -p '+stage+' && chmod 700 '+stage,30)
for n in range(0,len(packed),10000):ssm("printf '%s' '"+packed[n:n+10000]+"' >> "+stage+'/bundle.b64',30)
unpack="import pathlib,base64,gzip,json,hashlib;root=pathlib.Path("+repr(stage)+");raw=gzip.decompress(base64.b64decode((root/'bundle.b64').read_bytes()));assert hashlib.sha256(raw).hexdigest()=="+repr(digest)+";bundle=json.loads(raw);[(root/k).write_text(v) for k,v in bundle.items()]"
ssm('python3 -c '+shlex.quote(unpack),30)
ssm('python3 -u '+stage+'/verify-shared-photo-repair.py',1300)
