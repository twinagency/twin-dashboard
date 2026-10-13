"""Build/test only, using the established bounded SSM transfer; no runtime replacement."""
import base64,gzip,hashlib,json,pathlib,shlex,subprocess,time
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

stage='/tmp/twin-photo-reference-86b0ad1'
files=['release-source-payload.json','final-stage-readonly.py','review-named-history.py','prepare-reviewed-release.py']
bundle={name:pathlib.Path('deployment/v2-photo-recovery/'+name).read_text() for name in files}
raw=json.dumps(bundle).encode();packed=base64.b64encode(gzip.compress(raw)).decode();digest=hashlib.sha256(raw).hexdigest()
ssm('mkdir -p '+stage+' && chmod 700 '+stage+' && rm -f '+stage+'/bundle.b64',30)
for n in range(0,len(packed),10000):
 ssm("printf '%s' '"+packed[n:n+10000]+"' >> "+stage+'/bundle.b64',30)
unpack="import pathlib,base64,gzip,json,hashlib;root=pathlib.Path("+repr(stage)+");raw=gzip.decompress(base64.b64decode((root/'bundle.b64').read_bytes()));assert hashlib.sha256(raw).hexdigest()=="+repr(digest)+";bundle=json.loads(raw);[(root/k).write_text(v) for k,v in bundle.items()]"
ssm('python3 -c '+shlex.quote(unpack),30)
ssm('python3 -u '+stage+'/prepare-reviewed-release.py',1000)
