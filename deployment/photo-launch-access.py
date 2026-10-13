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
bundle={name:(stage/name).read_text() for name in ['run-legacy-simulation.py','simulate-live-legacy.mjs']}
program="""
import json,pathlib,subprocess
root=pathlib.Path('/home/ubuntu/twin-v2-validation/fleet-simulation-20261013-1791877888400228253')
assert (root/'legacy-evidence.json').exists() and not (root/'legacy-launched.json').exists(),'Never rerun unchanged model cases'
for name,body in BUNDLE.items():
 assert name in ['run-legacy-simulation.py','simulate-live-legacy.mjs']
 p=root/name;p.write_text(body);p.chmod(0o600)
with (root/'legacy-orchestrator.private.log').open('x') as log:
 p=subprocess.Popen(['python3',str(root/'run-legacy-simulation.py')],stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True,cwd=root)
receipt={'pid':p.pid,'root':str(root),'scope':'3 V1 creators, actual legacy engine; no real sends or DB writes'}
(root/'legacy-launched.json').write_text(json.dumps(receipt));print('LEGACY_LAUNCHED_JSON '+json.dumps(receipt),flush=True)
"""
raw=('BUNDLE='+repr(bundle)+'\n'+program).encode();packed=base64.b64encode(gzip.compress(raw)).decode()
program="import gzip,base64;exec(compile(gzip.decompress(base64.b64decode("+repr(packed)+")),'<legacy-isolated-launch>','exec'))"
ssm('python3 -c '+shlex.quote(program),60)
