"""Replay frozen V2 fleet conversations with the reviewed four-file overlay, in disposable containers only."""
import concurrent.futures, datetime, hashlib, json, os, pathlib, signal, subprocess, sys, time

PATCH = pathlib.Path(sys.argv[1]); RUN = sys.argv[2]
EXPECTED_PATCH = '28804047039bf0f54703047e34dca3b4b85d8d58c592f50f4d52a1295d9cb721'
IMAGE = 'sha256:dff48242b35b94e7b0e757ee4b7778a11958ef85b231b5fdb369542902e325f9'
REV = '2f24f023c0cf46bea1c3b3b334458cf1a5df265e'
ROOT = pathlib.Path('/home/ubuntu/twin-v2-validation/fleet-simulation-20261013-1791877888400228253')
SOURCE = ROOT / 'simulation-fixture' / 'evidence.json'
EXPECTED_FIXTURE = 'b90b9a4b0f5d37b4c9e858ea4be478152653609eccff04366a777d89c3707f02'
OLD = dict(zip(['src/turn.ts','src/media.ts','src/grounding.ts','src/girls/template.ts'],[
  'a8a24648db16f069db8a19e0afe8f79ef6c048c12a56c444c3045570a1a8daca',
  'f6c0da74d4c97f39a1d1694137afa8d11fe36bcc53c954f0b9c22ad65cfde52f',
  '9417b6ca1a400e1de6e171ea9750955eda0148170dfba2e590686a09ee38cf54',
  'cb4c6c215f9ed1de03b0f2a078a34723560e0e219539ffb8e1e26a3006846c8e']))
NEW = dict(zip(OLD,['630d167e0876b90caf10eeba72982a854eb8e69e2b028178a8e29e3fd6b42cec', '526d5de0b1c556d37e3d0a0e94b4572bb937385276c79b6ae3be52629cfb4e89', 'f6740c931e4ab4507d37d47b9851837c911529a173852d857b6a564bf3a61b53', '8f90b14f3f199741eda4c713d9c99de1039ddd759c921e8b073cdced614571c8']))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
def runtime():
  out=[]
  for name in ['twin-v2-bot-1','twin-v2-dash-1']:
    info=json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]
    revision=next((x.split('=',1)[1] for x in info['Config']['Env'] if x.startswith('GIT_SHA=')),None)
    out.append({'name':name,'image':info['Image'],'revision':revision,'running':info['State']['Running']})
  return out

assert sha(PATCH)==EXPECTED_PATCH, 'Candidate patch hash mismatch'
assert sha(SOURCE)==EXPECTED_FIXTURE, 'Frozen fleet fixture changed'
before=runtime();assert all(x['running'] and x['image']==IMAGE and x['revision']==REV for x in before), 'Live runtime changed'
evidence=json.loads(SOURCE.read_text())
assert len([p for p in evidence['profiles'] if p['engine']=='v2'])==17 and not evidence['errors']

# A read-only active-settings check prevents replaying a stale creator assignment/prompt as current.
probe="""import {config} from './src/config.ts';
const r=await fetch(config.supabaseUrl+'/rest/v1/clones?select=id,slug,engine,status,v2_vars&status=eq.active&order=slug',{headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey},signal:AbortSignal.timeout(15000)});
if(!r.ok)throw Error('settings read '+r.status);console.log('PROFILES '+JSON.stringify(await r.json()));"""
response=subprocess.run(['docker','exec','-i','twin-v2-bot-1','node','--import','tsx','--input-type=module'],input=probe,text=True,capture_output=True,timeout=30)
assert response.returncode==0, 'Active settings read failed'
fresh=json.loads(next(line[9:] for line in response.stdout.splitlines() if line.startswith('PROFILES ')))
frozen={p['slug']:{k:p[k] for k in ['id','slug','engine','status','v2_vars']} for p in evidence['profiles']}
assert {p['slug']:{k:p[k] for k in ['id','slug','engine','status','v2_vars']} for p in fresh}==frozen, 'Creator assignments or prompts changed since the fixture'

work=pathlib.Path('/home/ubuntu/twin-v2-validation')/('reply-outcomes-candidate-'+RUN)
assert not work.exists(), 'Candidate run already exists'
work.mkdir(mode=0o700)
overlay=work/'overlay';overlay.mkdir()
for relative,expected in OLD.items():
  target=overlay/relative;target.parent.mkdir(parents=True,exist_ok=True)
  subprocess.run(['docker','cp','twin-v2-bot-1:/app/'+relative,str(target)],check=True,capture_output=True,timeout=30)
  assert sha(target)==expected, 'Deployed source mismatch: '+relative
subprocess.run(['git','apply',str(PATCH)],cwd=overlay,check=True,capture_output=True,text=True,timeout=30)
for relative,expected in NEW.items(): assert sha(overlay/relative)==expected, 'Patched source mismatch: '+relative
fixture=work/'fixture';fixture.mkdir()
for relative,expected in NEW.items():evidence['sourceHashes'][relative]=expected
(fixture/'evidence.json').write_text(json.dumps(evidence));(fixture/'evidence.json').chmod(0o600)
live=json.loads(subprocess.check_output(['docker','inspect','twin-v2-bot-1'],text=True))[0]
key=[e for e in live['Config']['Env'] if e.startswith('OPENROUTER_API_KEY=')]
assert len(key)==1 and len(key[0])>35, 'Model key unavailable'
envfile=work/'model.env';envfile.write_text(key[0]+'\n');envfile.chmod(0o600)
replay_path=pathlib.Path(sys.argv[3]); assert sha(replay_path)=='0412d9bd012cc0ed0678f98c862ee29fe569a491a8ed538f3607fb5b495551b7', 'Replay script mismatch'
replay=replay_path.read_text()
v2=[p for p in evidence['profiles'] if p['engine']=='v2'];completed=[];running=[]
def worker(profile):
  slug=profile['slug'];out=work/slug;out.mkdir(mode=0o700);cid=out/'container.cid';running.append(cid)
  cmd=['docker','run','--rm','-i','--read-only','--cidfile',str(cid),'--tmpfs','/tmp:rw,size=96m','--memory','512m','--cpus','0.5','--env-file',str(envfile),'-e','STAR_PRICE=real','-e','SIM_CREATOR='+slug,
       '--mount','type=bind,source='+str(fixture)+',target=/fixture,readonly','--mount','type=bind,source='+str(out)+',target=/out']
  for relative in NEW:cmd+=['--mount','type=bind,source='+str(overlay/relative)+',target=/app/'+relative+',readonly']
  cmd += [IMAGE,'node','--import','tsx','--input-type=module']
  try:
    r=subprocess.run(cmd,input=replay,text=True,capture_output=True,timeout=600)
    (out/'stdout.private.log').write_text(r.stdout);(out/'stderr.private.log').write_text(r.stderr)
    result=json.loads((out/'summary.json').read_text()) if (out/'summary.json').is_file() else {'slug':slug,'fatal':'No summary','exit':r.returncode,'errorTail':r.stderr[-400:]}
  except subprocess.TimeoutExpired:result={'slug':slug,'fatal':'Isolated container timed out'}
  finally:
    if cid.is_file():subprocess.run(['docker','stop','-t','1',cid.read_text().strip()],capture_output=True,timeout=10)
  completed.append({k:result.get(k) for k in ['slug','cases','requests','failedCases','flaggedCases','fatal']})
  (work/'progress.json').write_text(json.dumps(completed))
  return result
def stop(*_):raise TimeoutError('Global 20-minute model budget reached')
signal.signal(signal.SIGALRM,stop);signal.alarm(1200)
try:
  with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(worker,v2))
  summary={'candidate':'8d7425373564a23e68bd947b940098f3b1cf1d50','patchSha':EXPECTED_PATCH,'fixtureSha':EXPECTED_FIXTURE,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
           'runtimeBefore':before,'runtimeAfter':runtime(),'settingsUnchanged':True,'cases':sum(r.get('cases',0) for r in results),'requests':sum(r.get('requests',0) for r in results),
           'failed':sum(r.get('failedCases',0) for r in results),'modelCost':sum(r.get('cost',0) for r in results),'creators':completed,'failedTurns':[{'slug':r['slug'],'case':x['case'],'checks':x['failed']} for r in results for x in r.get('results',[]) if x.get('failed')],
           'flaggedTurns':[{'slug':r['slug'],'case':x['case'],'flags':x['flags']} for r in results for x in r.get('results',[]) if x.get('flags')],
           'promptDisplayConsistent':all(r.get('promptDisplayConsistent') for r in results),
           'replyReview':[{'slug':r['slug'],**x} for r in results for x in r.get('results',[]) if x.get('flags') or x.get('failed') or 'card-price' in x['case'] or 'ownership-failure' in x['case']],
           'fanMessages':0,'purchases':0,'productionWrites':0,'syntheticTelegram':True,'evidencePath':str(work)}
  (work/'summary.json').write_text(json.dumps(summary));(work/'summary.json').chmod(0o600)
  assert runtime()==before,'Live runtime changed during replay'
  print('CARD_CANDIDATE_SUMMARY '+json.dumps(summary),flush=True)
finally:
  signal.alarm(0);envfile.unlink(missing_ok=True)
  for cid in running:
    if cid.is_file():subprocess.run(['docker','stop','-t','1',cid.read_text().strip()],capture_output=True,timeout=10)
  for p in work.rglob('*'):
    if p.is_file():p.chmod(0o600)
