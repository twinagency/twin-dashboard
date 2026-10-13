"""Transfer and deploy the approved, fully tested shared release."""
import base64,gzip,hashlib,json,pathlib,shlex,subprocess,time
INSTANCE='i-0584d283506f3f6be'
def ssm(command,timeout=120):
 p=pathlib.Path('/tmp')/('shared-repair-'+str(time.time_ns())+'.json')
 p.write_text(json.dumps({'commands':[command],'executionTimeout':[str(timeout)]}))
 cid=subprocess.check_output(['aws','ssm','send-command','--instance-ids',INSTANCE,'--document-name','AWS-RunShellScript','--parameters','file://'+str(p),'--comment','Deploy approved shared V2 release with fleet drain and rollback','--query','Command.CommandId','--output','text'],text=True).strip()
 if timeout>120:print(json.dumps({'commandId':cid,'phase':'authorised shared release deployment'}),flush=True)
 for _ in range(timeout//3+20):
  try:r=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id',INSTANCE,'--output','json'],text=True,stderr=subprocess.DEVNULL))
  except subprocess.CalledProcessError:time.sleep(3);continue
  if r['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
  time.sleep(3)
 else:raise RuntimeError('Deployment SSM command incomplete')
 print(r.get('StandardOutputContent',''),flush=True)
 if r['Status']!='Success':
  print(r.get('StandardErrorContent','')[-600:],flush=True)
  raise RuntimeError('Deployment '+r['Status'])
 return cid
stage='/tmp/twin-shared-photo-'+"2f24f023c0cf"+'-'+str(time.time_ns())
files=['deploy-shared-release.py']
bundle={name:pathlib.Path('deployment/v2-photo-recovery/'+name).read_text() for name in files}
raw=json.dumps(bundle).encode();packed=base64.b64encode(gzip.compress(raw)).decode();digest=hashlib.sha256(raw).hexdigest()
ssm('mkdir -p '+stage+' && chmod 700 '+stage,30)
for n in range(0,len(packed),10000):ssm("printf '%s' '"+packed[n:n+10000]+"' >> "+stage+'/bundle.b64',30)
unpack="import pathlib,base64,gzip,json,hashlib;root=pathlib.Path("+repr(stage)+");raw=gzip.decompress(base64.b64decode((root/'bundle.b64').read_bytes()));assert hashlib.sha256(raw).hexdigest()=="+repr(digest)+";bundle=json.loads(raw);[(root/k).write_text(v) for k,v in bundle.items()]"
ssm('python3 -c '+shlex.quote(unpack),30)
backup="/home/ubuntu/twin-v2-backups/shared-photo-baseline-5e789f1-1791872165074291746"
install="import pathlib;src=pathlib.Path("+repr(stage+"/deploy-shared-release.py")+");dst=pathlib.Path("+repr(backup+"/deploy-shared-release.py")+");assert not dst.exists() or dst.read_bytes()==src.read_bytes(),'Reviewed deployment script changed';dst.write_bytes(src.read_bytes());dst.chmod(0o600)"
ssm('python3 -c '+shlex.quote(install),30)
ssm('python3 -u '+shlex.quote(backup+'/deploy-shared-release.py'),850)
