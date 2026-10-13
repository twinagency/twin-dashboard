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
program="""
import pathlib,json,subprocess
root=pathlib.Path('/home/ubuntu/twin-v2-validation/fleet-simulation-20261013-1791877888400228253')
d=root/'legacy-harness-dry'
for name in ['summary.json','runner.stderr.private.log']:
 p=d/name
 if p.exists():
  if name=='summary.json':
   r=json.loads(p.read_text());print('LEGACY_DRY_JSON '+json.dumps({'cases':r.get('cases'),'requests':r.get('requests'),'fatal':r.get('fatal'),'errors':[(x['case'],x['error']) for x in r.get('results',[]) if x.get('error')]}))
  else:print('LEGACY_DRY_STDERR '+p.read_text()[-1600:])
i=json.loads(subprocess.check_output(['docker','image','inspect','sha256:f9618c70eb79abd38cce8991f47b4a6b11f19b7d28eb7d3886baa0a4e5b368ab'],text=True))[0]
print('LEGACY_IMAGE_ENV_NAMES '+json.dumps([x.split('=',1)[0] for x in i['Config'].get('Env',[])]))
"""
ssm('python3 -c '+shlex.quote(program),45)
