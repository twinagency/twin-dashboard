"""Read current V2 runtime/configuration through SSM. Never deploys or sends fan messages."""
import base64,json,pathlib,shlex,subprocess,time

INSTANCE='i-0584d283506f3f6be'
outdir=pathlib.Path('stage0-evidence');outdir.mkdir(exist_ok=True)
node=pathlib.Path('deployment/v2-sales-stage0-readonly.mjs').read_text()
remote='''import base64,json,subprocess
result={'containers':[]}
for name in ['twin-v2-bot-1','twin-v2-dash-1']:
 info=json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]
 env=dict(x.split('=',1) for x in info['Config']['Env'] if '=' in x)
 result['containers'].append({'name':name,'running':info['State']['Running'],'image':info['Image'],'revision':env.get('GIT_SHA')})
source=base64.b64decode(NODE_SOURCE).decode()
run=subprocess.run(['docker','exec','-i','twin-v2-bot-1','node','--import','tsx','--input-type=module'],input=source,text=True,capture_output=True,timeout=240)
if run.returncode: raise RuntimeError('read-only container audit failed: '+run.stderr[-500:])
line=next(x[len('SALES_STAGE0 '):] for x in run.stdout.splitlines() if x.startswith('SALES_STAGE0 '))
result['snapshot']=json.loads(line)
check="""const port=Number(process.env.DASH_PORT??4300);const r=await fetch('http://127.0.0.1:'+port+'/api/girls/details?girl=riley-mae-lewis',{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('dashboard status '+r.status);const j=await r.json();const p=(j.parts??[]).filter(x=>!x.optional).map(x=>x.text??'').join('');console.log(JSON.stringify({status:r.status,errors:j.errors??[],optionalSections:(j.parts??[]).filter(x=>x.optional).map(x=>({condition:x.optional,text:x.text})),commercialPrompt:p.slice(p.indexOf('PHOTOS AND VIDEOS'),p.indexOf('HARD LIMITS'))}));"""
ui=subprocess.run(['docker','exec','-i','twin-v2-dash-1','node','--input-type=module'],input=check,text=True,capture_output=True,timeout=30)
result['dashboardPrompt']=json.loads(ui.stdout) if ui.returncode==0 else {'error':'read failed'}
import gzip
print('STAGE0_GZIP '+base64.b64encode(gzip.compress(json.dumps(result).encode())).decode())
'''.replace('NODE_SOURCE',repr(base64.b64encode(node.encode()).decode()))
parameters=outdir/'ssm-parameters.json'
parameters.write_text(json.dumps({'commands':['python3 -c '+shlex.quote(remote)],'executionTimeout':['300']}))
command=subprocess.check_output(['aws','ssm','send-command','--instance-ids',INSTANCE,'--document-name','AWS-RunShellScript','--parameters','file://'+str(parameters),'--comment','Twin V2 Stage 0 read-only sales compatibility audit','--query','Command.CommandId','--output','text'],text=True).strip()
print('Read-only SSM command '+command,flush=True)
for attempt in range(100):
 time.sleep(3)
 p=subprocess.run(['aws','ssm','get-command-invocation','--command-id',command,'--instance-id',INSTANCE,'--output','json'],text=True,capture_output=True)
 if p.returncode: continue
 r=json.loads(p.stdout)
 if r['Status'] not in ['Success','Failed','Cancelled','TimedOut']:continue
 if r['Status']!='Success':raise RuntimeError(r['Status']+': '+r.get('StandardErrorContent','')[-600:])
 import gzip
 encoded=next(x.split(' ',1)[1] for x in r.get('StandardOutputContent','').splitlines() if x.startswith('STAGE0_GZIP '))
 result=json.loads(gzip.decompress(base64.b64decode(encoded)))
 (outdir/'live-snapshot.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({'at':result['snapshot']['at'],'revision':result['snapshot']['revision'],'creators':len(result['snapshot']['creators']),'readOnly':result['snapshot']['readOnly']}),flush=True)
 break
else:raise TimeoutError('read-only audit did not finish')
