"""Read retained simulation results and freeze V1 config; never rerun the model."""
import base64,gzip,json,pathlib,shlex,subprocess,time
INSTANCE='i-0584d283506f3f6be'
def ssm(command,timeout=300):
 p=pathlib.Path('/tmp')/('fleet-sim-'+str(time.time_ns())+'.json')
 p.write_text(json.dumps({'commands':[command],'executionTimeout':[str(timeout)]}))
 cid=subprocess.check_output(['aws','ssm','send-command','--instance-ids',INSTANCE,'--document-name','AWS-RunShellScript','--parameters','file://'+str(p),'--comment','Read isolated simulation evidence; no Telegram or production writes','--query','Command.CommandId','--output','text'],text=True).strip()
 print(json.dumps({'commandId':cid}),flush=True)
 for _ in range(timeout//3+20):
  try:r=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id',INSTANCE,'--output','json'],text=True,stderr=subprocess.DEVNULL))
  except subprocess.CalledProcessError:time.sleep(3);continue
  if r['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
  time.sleep(3)
 else:raise RuntimeError('SSM incomplete')
 print(r.get('StandardOutputContent',''),flush=True)
 if r['Status']!='Success':
  print(r.get('StandardErrorContent','')[-600:],flush=True)
  raise RuntimeError('Read '+r['Status'])
 return r.get('StandardOutputContent','')
stage=pathlib.Path('deployment/v2-photo-recovery')
raw=(stage/'read-fleet-simulation.py').read_bytes()
packed=base64.b64encode(gzip.compress(raw)).decode()
program="import gzip,base64;exec(compile(gzip.decompress(base64.b64decode("+repr(packed)+")),'<fleet-results-readonly>','exec'))"
output=ssm('python3 -c '+shlex.quote(program),180)
line=next(l for l in output.splitlines() if l.startswith('SIM_RESULT_MANIFEST '))
manifest=json.loads(line[len('SIM_RESULT_MANIFEST '):])
for index in range(manifest['base64Chunks']):
 program="import pathlib,base64;raw=base64.b64encode(pathlib.Path("+repr(manifest['path'])+").read_bytes()).decode();print('SIM_RESULT_CHUNK "+str(index)+" '+raw["+str(index*20000)+":"+str((index+1)*20000)+"])"
 ssm('python3 -c '+shlex.quote(program),30)
