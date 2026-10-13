"""Transfer the reviewed candidate patch and run the frozen fleet in isolated containers."""
import base64,gzip,hashlib,json,pathlib,shlex,subprocess,time
INSTANCE='i-0584d283506f3f6be'
ROOT=pathlib.Path('deployment/v2-photo-recovery')
def ssm(command,timeout):
  params=pathlib.Path('/tmp')/('card-probe-'+str(time.time_ns())+'.json')
  params.write_text(json.dumps({'commands':[command],'executionTimeout':[str(timeout)]}))
  cid=subprocess.check_output(['aws','ssm','send-command','--instance-ids',INSTANCE,'--document-name','AWS-RunShellScript',
    '--parameters','file://'+str(params),'--comment','Isolated V2 existing-card real-model replay; no fan or production writes',
    '--query','Command.CommandId','--output','text'],text=True).strip()
  print(json.dumps({'commandId':cid}),flush=True)
  for _ in range(timeout//5+25):
    try:r=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id',INSTANCE,'--output','json'],text=True,stderr=subprocess.DEVNULL))
    except subprocess.CalledProcessError:time.sleep(5);continue
    if r['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
    time.sleep(5)
  else:raise RuntimeError('Candidate SSM command incomplete')
  print(r.get('StandardOutputContent','')[-22000:],flush=True)
  if r['Status']!='Success':
    print(r.get('StandardErrorContent','')[-1200:],flush=True)
    raise RuntimeError('Candidate replay '+r['Status'])

nonce=str(time.time_ns())
paths=[]
for filename in ['existing-card-candidate.patch','run-existing-card-candidate.py']:
  source=ROOT/filename;raw=source.read_bytes();remote='/tmp/twin-card-'+nonce+'-'+filename
  encoded=base64.b64encode(gzip.compress(raw,mtime=0)).decode()
  program="import base64,gzip,hashlib,pathlib;raw=gzip.decompress(base64.b64decode("+repr(encoded)+"));assert hashlib.sha256(raw).hexdigest()=="+repr(hashlib.sha256(raw).hexdigest())+";pathlib.Path("+repr(remote)+").write_bytes(raw)"
  ssm('python3 -c '+shlex.quote(program),90)
  paths.append(remote)
ssm('python3 '+shlex.quote(paths[1])+' '+shlex.quote(paths[0])+' '+shlex.quote(nonce),1400)
