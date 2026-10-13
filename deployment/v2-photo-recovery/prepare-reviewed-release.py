"""Prepare Jesse's approved 86b0ad1 release, without replacing live containers."""
import datetime,hashlib,json,os,pathlib,shutil,subprocess,time
SHA='86b0ad199ea33fd7855f1c0dd54cc355f706e7f5'
SOURCE_SHA='5228ff383628382ee1366d319c39e3f27b052c02'
ROOT=pathlib.Path('/home/ubuntu/twin-v2')
BASE=pathlib.Path('/home/ubuntu/twin-v2-test-price-releases/45931b6f56db9f97cc8406154e35a0d216f5de65')
RELEASE=pathlib.Path('/home/ubuntu/twin-v2-photo-reference-releases')/SHA
BACKUP=pathlib.Path('/home/ubuntu/twin-v2-backups/photo-reference-86b0ad1-20261013')
STAGE=pathlib.Path('/tmp/twin-photo-reference-86b0ad1')
OLD_SHA='45931b6f56db9f97cc8406154e35a0d216f5de65'
EXPECTED={'twin-v2-bot-1':'sha256:2f076bf6fbc17b4de58a31887e9328a56e0275d90edda39ea789efbd13517d2e','twin-v2-dash-1':'sha256:051ec69b650fc06025d19c8d92e790dfc11185bdf435906840a13d6df823bb61'}
def out(*a):return subprocess.check_output(a,text=True).strip()
def unchanged():
 for name,img in EXPECTED.items():
  info=json.loads(out('docker','inspect',name))[0]
  assert info['State']['Running'] and info['Image']==img and 'GIT_SHA='+OLD_SHA in info['Config']['Env'],'Reviewed runtime changed: '+name
unchanged()
assert shutil.disk_usage(ROOT).free>3*1024**3,'Insufficient preparation disk space'
assert not BACKUP.exists(),'Preparation already attempted; inspect saved evidence rather than overwrite it'
BACKUP.mkdir(mode=0o700)
# Re-evaluate the original immutable replay and its explicitly separate correction.
ns={}
try:exec(compile((STAGE/'final-stage-readonly.py').read_text(),'final-stage-readonly.py','exec'),ns)
except SystemExit:pass
fresh=ns['result']
assert fresh['errors']==['candidate-model-replay-not-accepted'],fresh['errors']
assert fresh['candidate']['candidate']==SOURCE_SHA and fresh['candidate']['sourceHashesMatchReviewedManifest']
review={};exec(compile((STAGE/'review-named-history.py').read_text(),'review-named-history.py','exec'),review)
assert review['out']['correctedDeclaredBehaviorCases']==42 and not review['out']['unresolvedOriginalGates']
assert review['out']['originalSummarySha256']=='b5b66489b777218154151b27634198e87337db032fd8b21c1cdde9f0a77404ab'
(BACKUP/'before-live-check.json').write_text(json.dumps(fresh))
(BACKUP/'saved-record-review.json').write_text(json.dumps(review['out']))
for name in ['docker-compose.yml','photo-release.override.json']:
 shutil.copy2(ROOT/name,BACKUP/name);(BACKUP/name).chmod(0o600)
shutil.copy2(ROOT/'data/_operator_backups/photo-incident-20261013-morning/current-settings.json',BACKUP/'fleet-settings.json')
(BACKUP/'fleet-settings.json').chmod(0o600)
(BACKUP/'images.json').write_text(json.dumps(EXPECTED))
subprocess.run(['docker','save','-o',str(BACKUP/'images.tar'),*sorted(set(EXPECTED.values()))],check=True,timeout=180)
(BACKUP/'images.tar').chmod(0o600)
subprocess.run(['tar','czf',str(BACKUP/'code.tgz'),'--exclude=./data','--exclude=./logs','--exclude=./node_modules','--exclude=./.git','--exclude=./.env','-C',str(ROOT),'.'],check=True,timeout=120)
(BACKUP/'code.tgz').chmod(0o600)
payload=json.loads((STAGE/'release-source-payload.json').read_text())
assert payload['candidate']==SHA
manifest=payload['manifest'];assert len(manifest)==128
assert not RELEASE.exists(),'Release directory already exists'
RELEASE.mkdir(parents=True,mode=0o755)
for item in manifest:
 p=item['path'];assert not p.startswith('/') and '..' not in pathlib.PurePosixPath(p).parts
 b=payload['changed'][p].encode() if p in payload['changed'] else (BASE/p).read_bytes()
 assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==item['sha'],'Source mismatch: '+p
 target=RELEASE/p;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b);target.chmod(int(item['mode'],8)&0o777)
for p,h in fresh['candidate'].get('sourceHashes',ns['SOURCE_HASHES']).items():
 assert hashlib.sha256((RELEASE/p).read_bytes()).hexdigest()==h
(BACKUP/'source-manifest.json').write_text(json.dumps(manifest))
tag='twin-v2-photo-reference:'+SHA
r=subprocess.run(['docker','build','--label','org.opencontainers.image.revision='+SHA,'-t',tag,str(RELEASE)],capture_output=True,text=True,timeout=600)
(BACKUP/'build.log').write_text(r.stdout+r.stderr)
assert r.returncode==0,'Build failed; inspect private build.log'
image=out('docker','image','inspect','-f','{{.Id}}',tag)
print(json.dumps({'phase':'image built','sha':SHA,'image':image,'manifestFiles':len(manifest)}),flush=True)
tests=['check-safety','check-media','check-photo-flow','check-media-facts','check-media-correction','check-media-toy-menu','check-reply-grounding','check-turn','check-structured-reply','check-structured-turn','check-payments','check-bundles','check-delivery','check-photo-reference','check-photo-reference-data','check-credits','check-tips','check-tips-wiring','check-archive','check-memory','check-memory-wiring','check-dashboard-history']
results=[]
for test in tests:
 r=subprocess.run(['docker','run','--rm','--network','none','--memory','512m','--cpus','1',tag,'node','--import','tsx','scripts/'+test+'.ts'],capture_output=True,text=True,timeout=150)
 (BACKUP/(test+'.log')).write_text(r.stdout+r.stderr)
 results.append({'suite':test,'exit':r.returncode})
 assert r.returncode==0,'Packaged test failed: '+test
r=subprocess.run(['docker','run','--rm','--network','none','--memory','512m',tag,'node','node_modules/typescript/bin/tsc','--noEmit'],capture_output=True,text=True,timeout=120)
(BACKUP/'typecheck.log').write_text(r.stdout+r.stderr);assert r.returncode==0,'Packaged typecheck failed'
unchanged()
prepared={'sha':SHA,'testedPhotoSource':SOURCE_SHA,'image':image,'oldSha':OLD_SHA,'oldImages':EXPECTED,'release':str(RELEASE),'backup':str(BACKUP),'offline':results,'typecheck':True,'declaredBehaviorCases':42,'observationalCases':8,'originalModelResult':'49/50 preserved; one receipt-proven diagnostic correction','sourceManifestFiles':128,'modelCalls':0,'liveRuntimeReplaced':False,'preparedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
(BACKUP/'prepared.json').write_text(json.dumps(prepared,indent=2))
print('RELEASE_PREPARED_JSON '+json.dumps(prepared),flush=True)
