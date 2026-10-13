"""Prepare the authorised shared V2 release from the full remote tree. No live image replacement."""
import datetime,hashlib,json,pathlib,shutil,subprocess,time
SHA="2f24f023c0cf46bea1c3b3b334458cf1a5df265e"
OLD_SHA='86b0ad199ea33fd7855f1c0dd54cc355f706e7f5'
OLD_IMAGE='sha256:9649329a00bd20fe06499f8238e1e51713381521af00d4cdc67505e1064f724a'
ROOT=pathlib.Path('/home/ubuntu/twin-v2')
RELEASE=pathlib.Path('/home/ubuntu/twin-v2-shared-releases')/SHA
BACKUP=pathlib.Path("/home/ubuntu/twin-v2-backups/shared-photo-baseline-5e789f1-1791872165074291746")
STAGE=pathlib.Path(__file__).parent
def out(*a):return subprocess.check_output(a,text=True).strip()
def unchanged():
 for name in ['twin-v2-bot-1','twin-v2-dash-1']:
  info=json.loads(out('docker','inspect',name))[0]
  assert info['State']['Running'] and info['Image']==OLD_IMAGE and 'GIT_SHA='+OLD_SHA in info['Config']['Env'],'Live baseline changed: '+name
unchanged()
assert shutil.disk_usage(ROOT).free>2*1024**3,'Insufficient release build space'
payload=json.loads((STAGE/'shared-release-source.json').read_text())
assert payload['candidate']==SHA
preflight_dir=max(pathlib.Path('/home/ubuntu/twin-v2-validation').glob('shared-release-preflight-*'),key=lambda p:p.name)
preflight=json.loads((preflight_dir/'preflight.json').read_text())
assert preflight['candidate']==payload['testedSource'] and all(x.get('displayMatches') and x['candidateChangesOnlyReviewedParagraphs'] and x['candidateDisplayMatches'] for x in preflight['checks'])
assert time.time()-datetime.datetime.fromisoformat(preflight['checkedAt'].replace('Z','+00:00')).timestamp()<1800,'Preflight too old'
available=json.loads((preflight_dir/'available-source.json').read_text())
model=json.loads(pathlib.Path("/home/ubuntu/twin-v2-validation/shared-5e789f1d23bf-1791871648047664202/output/model.summary.json").read_text())
assert model['candidate']==payload['testedSource'] and model['passed'] and model['passedCases']==model['cases']==model['requests']==39
assert model['sourceHashes']==payload['testedHashes']
rollback=json.loads((BACKUP/'rollback-plan.json').read_text())
assert rollback['baselineRevision']==OLD_SHA and set(rollback['images'].values())=={OLD_IMAGE}
assert hashlib.sha256((BACKUP/'runtime-code.tgz').read_bytes()).hexdigest()==rollback['sourceHash']
assert (BACKUP/'images.tar').stat().st_size==rollback['imageArchiveBytes']
for name in ['docker-compose.yml','photo-release.override.json']:assert (ROOT/name).read_bytes()==(BACKUP/name).read_bytes(),'Compose baseline changed'
baseline_hashes=json.loads((BACKUP/'runtime-source-hashes.json').read_text())
for p,h in baseline_hashes.items():assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h,'Pending host source change: '+p
for p,h in payload['testedHashes'].items():
 if p not in baseline_hashes and (ROOT/p).exists():assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h,'Conflicting new host file: '+p
assert not RELEASE.exists(),'Release preparation already attempted; inspect its evidence rather than overwrite'
RELEASE.mkdir(parents=True,mode=0o755)
manifest=payload['manifest'];assert len(manifest)==255
for item in manifest:
 p=item['path'];assert not p.startswith('/') and '..' not in pathlib.PurePosixPath(p).parts
 b=payload['provided'][p].encode() if p in payload['provided'] else pathlib.Path(available[p]).read_bytes()
 assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==item['sha'],'Remote file mismatch: '+p
 target=RELEASE/p;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b);target.chmod(int(item['mode'],8)&0o777)
for p,h in payload['testedHashes'].items():assert hashlib.sha256((RELEASE/p).read_bytes()).hexdigest()==h,'Tested source differs: '+p
(BACKUP/'release-manifest.json').write_text(json.dumps(manifest))
(BACKUP/'release-preflight.json').write_text(json.dumps(preflight))
(BACKUP/'model-passed.json').write_text(json.dumps(model))
host_changes=[]
for p in payload['testedHashes']:
 target=ROOT/p
 old=target.read_bytes() if target.is_file() else None
 new=(RELEASE/p).read_bytes()
 if old==new:continue
 host_changes.append({'path':p,'existed':old is not None,'oldSha256':hashlib.sha256(old).hexdigest() if old is not None else None,'newSha256':hashlib.sha256(new).hexdigest()})
 if old is not None:
  b=BACKUP/'host-before'/p;b.parent.mkdir(parents=True,exist_ok=True);b.write_bytes(old)
(BACKUP/'host-changes.json').write_text(json.dumps(host_changes))
tag='twin-v2-shared:'+SHA
r=subprocess.run(['docker','build','--label','org.opencontainers.image.revision='+SHA,'-t',tag,str(RELEASE)],capture_output=True,text=True,timeout=600)
(BACKUP/'shared-build.log').write_text(r.stdout+r.stderr)
assert r.returncode==0,'Release build failed; private build log retained'
image=out('docker','image','inspect','-f','{{.Id}}',tag)
tests=['check-safety','check-media','check-photo-flow','check-media-facts','check-media-correction','check-media-toy-menu','check-reply-grounding','check-turn','check-structured-reply','check-structured-turn','check-shared-photo-repair','check-payments','check-bundles','check-delivery','check-photo-reference','check-photo-reference-data','check-credits','check-tips','check-tips-wiring','check-archive','check-memory','check-memory-wiring','check-dashboard-history']
results=[]
for test in tests:
 r=subprocess.run(['docker','run','--rm','--network','none','--memory','768m','--cpus','1',image,'node','--import','tsx','scripts/'+test+'.ts'],text=True,capture_output=True,timeout=180)
 (BACKUP/('packaged-'+test+'.log')).write_text(r.stdout+r.stderr)
 results.append({'suite':test,'exit':r.returncode})
 assert r.returncode==0,'Packaged release gate failed: '+test
r=subprocess.run(['docker','run','--rm','--network','none','--memory','768m','--cpus','1',image,'node','node_modules/typescript/bin/tsc','--noEmit'],text=True,capture_output=True,timeout=180)
(BACKUP/'packaged-typecheck.log').write_text(r.stdout+r.stderr);assert r.returncode==0,'Packaged typecheck failed'
unchanged()
prepared={'sha':SHA,'testedSource':payload['testedSource'],'image':image,'oldSha':OLD_SHA,'oldImage':OLD_IMAGE,'release':str(RELEASE),'backup':str(BACKUP),'offline':results,'typecheck':True,'modelCases':39,'sourceManifestFiles':len(manifest),'hostChanges':host_changes,'settingsHash':preflight['settingsHash'],'expectedSlugs':sorted(x['slug'] for x in preflight['checks']),'preparedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'liveRuntimeReplaced':False,'modelCalls':0}
(BACKUP/'shared-prepared.json').write_text(json.dumps(prepared,indent=2))
for p in BACKUP.rglob('*'):
 if p.is_file():p.chmod(0o600)
print('SHARED_RELEASE_PREPARED_JSON '+json.dumps(prepared),flush=True)
