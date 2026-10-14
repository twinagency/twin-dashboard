"""Run isolated factual identity tests through the existing production model. Sends no fan messages and changes no live settings."""
import base64,gzip,json,pathlib,shlex,subprocess,time
outdir=pathlib.Path('identity-evidence');outdir.mkdir(exist_ok=True)
node=pathlib.Path('deployment/identity-check.mjs').read_text()
candidate=pathlib.Path('deployment/identity-candidate-template.ts').read_text()
node=node.replace('__CANDIDATE_SOURCE__',json.dumps(candidate)).replace('__GUARD_SOURCE__',json.dumps(pathlib.Path('deployment/identity-candidate-guard.ts').read_text()))
packed=base64.b64encode(gzip.compress(node.encode())).decode()
remote="""import base64,gzip,json,subprocess
info=json.loads(subprocess.check_output(['docker','inspect','twin-v2-bot-1'],text=True))[0]
env=dict(x.split('=',1) for x in info['Config']['Env'] if '=' in x)
assert info['State']['Running'],'Bot is not running'
print('IDENTITY_RUNTIME '+json.dumps({'revision':env.get('GIT_SHA'),'image':info['Image']}),flush=True)
source=gzip.decompress(base64.b64decode(PACKED)).decode()
r=subprocess.run(['docker','exec','-i','twin-v2-bot-1','node','--import','tsx','--input-type=module'],input=source,text=True,capture_output=True,timeout=270)
if r.returncode:raise RuntimeError('Identity validation failed: '+r.stderr[-600:])
line=next(x.split(' ',1)[1] for x in r.stdout.splitlines() if x.startswith('IDENTITY_JSON '))
print('IDENTITY_GZIP '+base64.b64encode(gzip.compress(line.encode())).decode())
""".replace('PACKED',repr(packed))
parameters=outdir/'ssm-parameters.json'
parameters.write_text(json.dumps({'commands':['python3 -c '+shlex.quote(remote)],'executionTimeout':['300']}))
instance='i-0584d283506f3f6be'
command=subprocess.check_output(['aws','ssm','send-command','--instance-ids',instance,'--document-name','AWS-RunShellScript','--parameters','file://'+str(parameters),'--comment','Olivia factual identity validation, no fan messages or database changes','--query','Command.CommandId','--output','text'],text=True).strip()
print('Identity validation command '+command,flush=True)
for attempt in range(110):
 time.sleep(3)
 p=subprocess.run(['aws','ssm','get-command-invocation','--command-id',command,'--instance-id',instance,'--output','json'],text=True,capture_output=True)
 if p.returncode:continue
 r=json.loads(p.stdout)
 if r['Status'] not in ['Success','Failed','Cancelled','TimedOut']:continue
 if r['Status']!='Success':raise RuntimeError(r['Status']+': '+r.get('StandardOutputContent','')[:500]+' '+r.get('StandardErrorContent','')[-1200:])
 encoded=next(x.split(' ',1)[1] for x in r.get('StandardOutputContent','').splitlines() if x.startswith('IDENTITY_GZIP '))
 report=json.loads(gzip.decompress(base64.b64decode(encoded)))
 report['runtime']=json.loads(next(x.split(' ',1)[1] for x in r.get('StandardOutputContent','').splitlines() if x.startswith('IDENTITY_RUNTIME ')))
 (outdir/'result.json').write_text(json.dumps(report,indent=2)+'\n')
 print('IDENTITY_RESULT '+json.dumps(report),flush=True)
 break
else:raise TimeoutError('Identity validation did not finish')
