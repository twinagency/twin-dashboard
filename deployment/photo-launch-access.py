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
import json,pathlib,collections
root=pathlib.Path('/home/ubuntu/twin-v2-validation/fleet-simulation-20261013-1791877888400228253')
for slug in ['autumn-renae','dan-dangler','hazey-haley']:
 d=root/slug
 if (d/'summary.json').exists():
  r=json.loads((d/'summary.json').read_text());print('LEGACY_PROGRESS_JSON '+json.dumps({k:r.get(k) for k in ['slug','cases','requests','failedCases','fatal']}))
 elif (d/'progress.json').exists():print('LEGACY_PROGRESS_JSON '+(d/'progress.json').read_text())
 if (d/'exchanges.private.json').exists():
  es=json.loads((d/'exchanges.private.json').read_text());print('LEGACY_HTTP_JSON '+json.dumps({'slug':slug,'statuses':dict(collections.Counter(e.get('status') for e in es)),'models':dict(collections.Counter(e['request'].get('model') for e in es)),'callsByCase':dict(collections.Counter(e['case'] for e in es)),'errors':[{'status':e.get('status'),'error':e.get('response',{}).get('error')} for e in es if e.get('status')!=200][:2]}))
"""
ssm('python3 -c '+shlex.quote(program),45)
