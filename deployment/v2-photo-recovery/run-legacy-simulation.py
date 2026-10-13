"""Separate isolated V1 simulation. No live handler, token, DB credential or data mount."""
import concurrent.futures,hashlib,json,pathlib,subprocess,time
ROOT=pathlib.Path('/home/ubuntu/twin-v2-validation/fleet-simulation-20261013-1791877888400228253')
IMAGE='sha256:f9618c70eb79abd38cce8991f47b4a6b11f19b7d28eb7d3886baa0a4e5b368ab'
REV='caa2a94ee519eb84d25b6c77023f732e8fed7b36'
def runtime():
 i=json.loads(subprocess.check_output(['docker','inspect','next-app'],text=True))[0]
 return {'image':i['Image'],'running':i['State']['Running'],'revision':next((x.split('=',1)[1] for x in i['Config']['Env'] if x.startswith('GIT_SHA=')),None)}
before=runtime();assert before['running'] and before['image']==IMAGE and before['revision']==REV
raw=(ROOT/'legacy-evidence.json').read_bytes();assert hashlib.sha256(raw).hexdigest()=='1636fd2f0e6617bb8c0cb069c51673ea27fae537173dae0e52f3901d7399872e'
fixture=json.loads(raw);replay=(ROOT/'simulate-live-legacy.mjs').read_text()
# Exactly one API credential, used only for model inference in containers with all other network calls blocked.
info=json.loads(subprocess.check_output(['docker','inspect','twin-v2-bot-1'],text=True))[0]
key=next(e for e in info['Config']['Env'] if e.startswith('OPENROUTER_API_KEY='));assert len(key)>35
env=ROOT/'legacy-model.env';env.write_text(key+'\n');env.chmod(0o600)
fixtureDir=ROOT/'legacy-fixture';fixtureDir.mkdir(mode=0o700);(fixtureDir/'legacy-evidence.json').write_bytes(raw)
cids=[]
def worker(clone,dry=False):
 slug=clone['slug'];out=ROOT/(('legacy-harness-dry' if dry else slug));out.mkdir(mode=0o700);cid=out/'container.cid';cids.append(cid)
 cmd=['docker','run','--rm','-i','--read-only','--cidfile',str(cid),'--tmpfs','/tmp:rw,size=96m','--memory','640m','--cpus','0.5','--env-file',str(env),'-e','MOCK='+('true' if dry else 'false'),'-e','SIM_DRY_RUN='+('1' if dry else '0'),'-e','TWIN_SIM_NO_WRITES=1','-e','SIM_CREATOR='+slug,'--mount','type=bind,source='+str(fixtureDir)+',target=/fixture,readonly','--mount','type=bind,source='+str(out)+',target=/out']
 if dry:cmd+=['--network','none']
 cmd += [IMAGE,'node','--import','tsx','--input-type=module']
 try:
  r=subprocess.run(cmd,input=replay,text=True,capture_output=True,timeout=600)
  (out/'runner.stdout.private.log').write_text(r.stdout);(out/'runner.stderr.private.log').write_text(r.stderr)
  if (out/'summary.json').is_file():return json.loads((out/'summary.json').read_text())
  return {'slug':slug,'fatal':'Runner did not produce summary','error':r.stderr[-800:]}
 finally:
  if cid.is_file():subprocess.run(['docker','stop','-t','1',cid.read_text().strip()],capture_output=True,timeout=10)
try:
 dry=worker(fixture['clones'][0],True)
 assert not dry.get('fatal') and dry.get('cases')==20 and not any('handler_error' in r['failed'] for r in dry.get('results',[])),'Legacy harness dry run failed; no live model calls launched'
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(worker,fixture['clones']))
 summary={'runtimeBefore':before,'runtimeAfter':runtime(),'fixtureHash':hashlib.sha256(raw).hexdigest(),'creators':results,'cases':sum(r.get('cases',0) for r in results),'modelCalls':sum(r.get('requests',0) for r in results),'cost':sum(r.get('cost',0) for r in results),'messagesSentToTelegram':0,'productionWrites':0,'purchases':0}
 (ROOT/'legacy-summary.json').write_text(json.dumps(summary));print(json.dumps({k:v for k,v in summary.items() if k!='creators'}),flush=True)
finally:
 env.unlink(missing_ok=True)
 for cid in cids:
  if cid.is_file():subprocess.run(['docker','stop','-t','1',cid.read_text().strip()],capture_output=True,timeout=10)
 for f in ROOT.rglob('*'):
  if f.is_file():f.chmod(0o600)
