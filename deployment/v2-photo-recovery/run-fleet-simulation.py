"""Bounded isolated model test, no deployment, fan sends, DB writes or production-data mounts."""
import concurrent.futures,datetime,hashlib,json,os,pathlib,signal,subprocess,time
ROOT=pathlib.Path('/home/ubuntu/twin-v2-validation/fleet-simulation-20261013-1791877888400228253')
EXPECTED_FIXTURE='c896a887cdc659a218459af178d7940af269995f96cc8733365dbe8189a5147b'
IMAGE='sha256:dff48242b35b94e7b0e757ee4b7778a11958ef85b231b5fdb369542902e325f9'
REV='2f24f023c0cf46bea1c3b3b334458cf1a5df265e'
def runtime():
 out=[]
 for name in ['twin-v2-bot-1','twin-v2-dash-1']:
  i=json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]
  rev=next((e.split('=',1)[1] for e in i['Config']['Env'] if e.startswith('GIT_SHA=')),None)
  out.append({'name':name,'image':i['Image'],'revision':rev,'running':i['State']['Running']})
 return out
before=runtime();assert all(x['running'] and x['image']==IMAGE and x['revision']==REV for x in before),'Runtime changed'
raw=(ROOT/'evidence.json').read_bytes();assert hashlib.sha256(raw).hexdigest()==EXPECTED_FIXTURE
evidence=json.loads(raw);evidence['bundleCache']={}
for p in evidence['profiles']:
 if p['engine']!='v2':continue
 cache=pathlib.Path('/home/ubuntu/twin-v2/data')/p['slug']/'_bundle_exclusions.json'
 if cache.is_file():evidence['bundleCache'][p['slug']]=json.loads(cache.read_text())
fixture=ROOT/'simulation-fixture';fixture.mkdir(mode=0o700);(fixture/'evidence.json').write_text(json.dumps(evidence));(fixture/'evidence.json').chmod(0o600)
live=json.loads(subprocess.check_output(['docker','inspect','twin-v2-bot-1'],text=True))[0]
key=next(e for e in live['Config']['Env'] if e.startswith('OPENROUTER_API_KEY='));assert len(key)>35
envfile=ROOT/'isolated-model.env';envfile.write_text(key+'\n');envfile.chmod(0o600)
bundle_env=next((e.split('=',1)[1] for e in live['Config']['Env'] if e.startswith('V2_BUNDLES=')),None)
if bundle_env in ['0','off','false']:
 evidence['bundleCache']={};(fixture/'evidence.json').write_text(json.dumps(evidence))
v2=[p for p in evidence['profiles'] if p['engine']=='v2'];legacy=[p['slug'] for p in evidence['profiles'] if p['engine']!='v2']
assert len(v2)==17 and not evidence['errors'],'Fleet or catalogue evidence changed'
assert not any(p.get('v2_credits_enabled') or p.get('v2_memory_enabled') for p in v2),'Unsupported enabled feature in harness'
REPLAY=(ROOT/'simulate-live-fleet.mjs').read_text()
running=[];completed=[]
def worker(p):
 slug=p['slug'];out=ROOT/slug;out.mkdir(mode=0o700);cid=out/'container.cid';running.append(cid)
 cmd=['docker','run','--rm','-i','--read-only','--cidfile',str(cid),'--tmpfs','/tmp:rw,size=96m','--memory','512m','--cpus','0.5','--env-file',str(envfile),'-e','STAR_PRICE=real','-e','SIM_CREATOR='+slug,'--mount','type=bind,source='+str(fixture)+',target=/fixture,readonly','--mount','type=bind,source='+str(out)+',target=/out',IMAGE,'node','--import','tsx','--input-type=module']
 try:
  r=subprocess.run(cmd,input=REPLAY,text=True,capture_output=True,timeout=600)
  (out/'runner.stdout.private.log').write_text(r.stdout);(out/'runner.stderr.private.log').write_text(r.stderr)
  if (out/'summary.json').is_file():s=json.loads((out/'summary.json').read_text())
  else:s={'slug':slug,'cases':0,'requests':0,'fatal':'Runner exited without summary','exit':r.returncode,'errorTail':r.stderr[-600:]}
 except subprocess.TimeoutExpired:s={'slug':slug,'fatal':'Worker timed out; partial evidence retained'}
 finally:
  if cid.is_file():subprocess.run(['docker','stop','-t','1',cid.read_text().strip()],capture_output=True,timeout=10)
 completed.append({k:s.get(k) for k in ['slug','cases','requests','failedCases','flaggedCases','fatal']})
 (ROOT/'progress.json').write_text(json.dumps({'completed':completed,'at':datetime.datetime.now(datetime.timezone.utc).isoformat()}))
 return s
def limit(*_):raise TimeoutError('Global 20 minute simulation budget reached')
signal.signal(signal.SIGALRM,limit);signal.alarm(1200)
try:
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  results=list(pool.map(worker,v2))
 summary={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runtimeBefore':before,'runtimeAfter':runtime(),'frozenAt':evidence['at'],'fixtureHash':hashlib.sha256((fixture/'evidence.json').read_bytes()).hexdigest(),'legacyNotSimulated':legacy,'legacyReason':'V1 engine is not in the verified V2 image; never substitute V2 rendering for V1 coverage','creators':results,'messagesSentToTelegram':0,'purchases':0,'productionWrites':0,'privateEvidence':str(ROOT),'modelCalls':sum(s.get('requests',0) for s in results),'cases':sum(s.get('cases',0) for s in results),'cost':sum(s.get('cost',0) for s in results)}
 (ROOT/'fleet-summary.json').write_text(json.dumps(summary))
 print(json.dumps({'completed':len(results),'cases':summary['cases'],'modelCalls':summary['modelCalls'],'failed':sum(s.get('failedCases',0) for s in results),'fatal':[(s['slug'],s['fatal']) for s in results if s.get('fatal')]}),flush=True)
finally:
 signal.alarm(0)
 for cid in running:
  if cid.is_file():subprocess.run(['docker','stop','-t','1',cid.read_text().strip()],capture_output=True,timeout=10)
 envfile.unlink(missing_ok=True)
 for f in ROOT.rglob('*'):
  if f.is_file():f.chmod(0o600)
