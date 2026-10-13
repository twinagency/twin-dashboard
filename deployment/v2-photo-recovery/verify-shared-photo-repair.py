"""Isolated shared repair verification. Never replaces a live container or writes production data."""
import base64,datetime,hashlib,json,os,pathlib,subprocess,tempfile,time
SHA="5e789f1d23bf63f91643760537600c077b646356"
IMAGE='sha256:9649329a00bd20fe06499f8238e1e51713381521af00d4cdc67505e1064f724a'
REVISION='86b0ad199ea33fd7855f1c0dd54cc355f706e7f5'
stage=pathlib.Path(__file__).parent
payload=json.loads((stage/'shared-source-payload.json').read_text());manifest=payload['manifest']
EXTRACT=(stage/'extract-shared-repair-evidence.mjs').read_text()
REPLAY=(stage/'replay-shared-photo-repair.mjs').read_text()
def inspect_live():
 result=[]
 for name in ['twin-v2-bot-1','twin-v2-dash-1']:
  info=json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]
  rev=next((x.split('=',1)[1] for x in info['Config']['Env'] if x.startswith('GIT_SHA=')),None)
  assert info['State']['Running'] and info['Image']==IMAGE and rev==REVISION,'Live runtime changed; inspect new baseline'
  result.append({'container':name,'revision':rev,'image':info['Image'],'running':True})
 return result
before=inspect_live()
root=pathlib.Path('/home/ubuntu/twin-v2-validation')/('shared-'+SHA[:12]+'-'+str(time.time_ns()))
root.mkdir(parents=True,mode=0o700);source=root/'source';source.mkdir()
for row in payload['entries']:
 p=pathlib.PurePosixPath(row['path']);assert not p.is_absolute() and '..' not in p.parts
 target=source/str(p);target.parent.mkdir(parents=True,exist_ok=True);target.write_text(row['content'])
 assert hashlib.sha256(target.read_bytes()).hexdigest()==manifest[str(p)],'Candidate byte mismatch'
saved=pathlib.Path('/home/ubuntu/twin-v2-validation/shared-261425d4992f-1791870512342035655/fixture/evidence.json')
raw=saved.read_bytes()
assert hashlib.sha256(raw).hexdigest()=='8cdfa9759e9643a0668d9f289579b8158948bf0bae988e0b2d2939fe47064361','Frozen evidence changed'
fixture=root/'fixture';fixture.mkdir();evidence=json.loads(raw)
(fixture/'evidence.json').write_bytes(raw);(fixture/'evidence.json').chmod(0o600)
output=root/'output';output.mkdir(mode=0o700)
mounts=[]
for row in payload['entries']:
 mounts+=['--mount','type=bind,source='+str(source/row['path'])+',target=/app/'+row['path']+',readonly']
tests=['check-safety','check-media','check-photo-flow','check-media-facts','check-media-correction','check-media-toy-menu','check-reply-grounding','check-turn','check-structured-reply','check-structured-turn','check-shared-photo-repair','check-payments','check-bundles','check-delivery','check-photo-reference','check-photo-reference-data','check-credits','check-tips','check-tips-wiring','check-archive','check-memory','check-memory-wiring','check-dashboard-history']
offline=[]
for test in tests:
 r=subprocess.run(['docker','run','--rm','--network','none','--memory','768m','--cpus','1',*mounts,IMAGE,'node','--import','tsx','scripts/'+test+'.ts'],text=True,capture_output=True,timeout=180)
 (output/(test+'.private.log')).write_text(r.stdout+r.stderr)
 offline.append({'suite':test,'exit':r.returncode,'summary':r.stdout.strip().splitlines()[-1:]})
 if r.returncode:
  print('SHARED_REPAIR_OFFLINE_JSON '+json.dumps({'candidate':SHA,'passed':False,'results':offline,'privateArtifactDirectory':str(root),'modelCalls':0,'productionWrites':0}),flush=True)
  raise RuntimeError('Candidate packaged test failed: '+test)
r=subprocess.run(['docker','run','--rm','--network','none','--memory','768m',*mounts,IMAGE,'node','node_modules/typescript/bin/tsc','--noEmit'],text=True,capture_output=True,timeout=150)
(output/'typecheck.private.log').write_text(r.stdout+r.stderr);assert r.returncode==0,'Packaged typecheck failed'
print('SHARED_REPAIR_OFFLINE_JSON '+json.dumps({'candidate':SHA,'passed':True,'suites':len(offline),'typecheck':True,'results':offline,'privateArtifactDirectory':str(root),'modelCalls':0,'productionWrites':0}),flush=True)
runtime=json.loads(subprocess.check_output(['docker','inspect','twin-v2-bot-1'],text=True))[0]
secret=[x for x in runtime['Config']['Env'] if x.startswith('OPENROUTER_API_KEY=')];assert len(secret)==1 and len(secret[0])>35
fd,envfile=tempfile.mkstemp(prefix='shared-repair-',suffix='.env');cidfile=pathlib.Path(envfile+'.cid')
try:
 with os.fdopen(fd,'w') as f:f.write(secret[0]+'\n')
 os.chmod(envfile,0o600)
 command=['docker','run','--rm','-i','--read-only','--cidfile',str(cidfile),'--tmpfs','/tmp:rw,size=96m','--memory','768m','--cpus','1','--env-file',envfile,'-e','CANDIDATE_SHA='+SHA,'-e','CANDIDATE_HASHES='+json.dumps(manifest),'-e','STAR_PRICE=real','-e','PROBE_OUTPUT_DIR=/out','--mount','type=bind,source='+str(fixture)+',target=/fixture,readonly','--mount','type=bind,source='+str(output)+',target=/out',*mounts,IMAGE,'node','--import','tsx','--input-type=module']
 r=subprocess.run(command,input=REPLAY,text=True,capture_output=True,timeout=1000)
 (output/'model-runner.stdout.private.log').write_text(r.stdout);(output/'model-runner.stderr.private.log').write_text(r.stderr)
 if (output/'model.summary.json').is_file():
  summary=json.loads((output/'model.summary.json').read_text())
  compact={k:v for k,v in summary.items() if k!='results'}
  compact['results']=[{k:row[k] for k in ['case','passed','selection','selected','provider','failedChecks','photoAlternative']} for row in summary['results']]
  compact['privateArtifactDirectory']=str(root);compact['runtimeBefore']=before;compact['runtimeAfter']=inspect_live()
  (output/'model.compact.json').write_text(json.dumps(compact))
  print('SHARED_REPAIR_MODEL_JSON '+json.dumps(compact),flush=True)
 else:
  progress=json.loads((output/'progress.json').read_text()) if (output/'progress.json').is_file() else {}
  print('SHARED_REPAIR_MODEL_JSON '+json.dumps({'candidate':SHA,'passed':False,'error':'No completed model summary','progress':progress,'privateArtifactDirectory':str(root),'messagesSent':0,'productionWrites':0}),flush=True)
 assert r.returncode==0,'Isolated model verification failed; evidence retained'
finally:
 if cidfile.is_file():
  cid=cidfile.read_text().strip()
  if cid:subprocess.run(['docker','stop','-t','2',cid],capture_output=True,timeout=15)
 for f in [pathlib.Path(envfile),cidfile]:
  if f.exists():f.unlink()
 for f in root.rglob('*'):
  if f.is_file():f.chmod(0o600)
