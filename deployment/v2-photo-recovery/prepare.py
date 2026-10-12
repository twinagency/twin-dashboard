"""Build and verify the pinned photo-recovery candidate; no live runtime replacement."""
import hashlib,json,os,pathlib,shutil,subprocess,time
SHA="38cc7119aacf19057db1bc0774185a593f5ae159"
ROOT=pathlib.Path('/home/ubuntu/twin-v2')
BASE=pathlib.Path('/home/ubuntu/twin-v2-test-price-releases/45931b6f56db9f97cc8406154e35a0d216f5de65')
RELEASE=pathlib.Path('/home/ubuntu/twin-v2-photo-recovery-releases')/SHA
BACKUP=pathlib.Path('/home/ubuntu/twin-v2-backups/photo-recovery-20261013')
PRIVATE=ROOT/'data/_operator_backups/photo-recovery-20261013'
OLD_SHA='45931b6f56db9f97cc8406154e35a0d216f5de65'
OLD_IMAGE='sha256:2f076bf6fbc17b4de58a31887e9328a56e0275d90edda39ea789efbd13517d2e'
EXPECTED={name:OLD_IMAGE for name in ['twin-v2-bot-1','twin-v2-dash-1']}
def out(*a): return subprocess.check_output(a,text=True).strip()
def unchanged():
 for name,img in EXPECTED.items():
  assert out('docker','inspect','-f','{{.Image}}',name)==img,'V2 image changed'
  assert out('docker','exec',name,'printenv','GIT_SHA')==OLD_SHA,'V2 revision changed'
  assert out('docker','inspect','-f','{{.State.Running}}',name)=='true'
unchanged()
assert shutil.disk_usage(ROOT).free>3*1024**3,'Less than 3GiB free'
BACKUP.mkdir(parents=True,exist_ok=True,mode=0o700)
if not (BACKUP/'images.tar').exists():
 subprocess.run(['docker','save','-o',str(BACKUP/'images.tar'),OLD_IMAGE],check=True,timeout=180);(BACKUP/'images.tar').chmod(0o600)
if not (BACKUP/'code.tgz').exists():
 subprocess.run(['tar','czf',str(BACKUP/'code.tgz'),'--exclude=./data','--exclude=./logs','--exclude=./node_modules','--exclude=./.git','-C',str(ROOT),'.'],check=True,timeout=120);(BACKUP/'code.tgz').chmod(0o600)
(BACKUP/'images.json').write_text(json.dumps(EXPECTED))
for name in ['docker-compose.yml','photo-release.override.json']:
 if not (BACKUP/name).exists(): shutil.copy2(ROOT/name,BACKUP/name);(BACKUP/name).chmod(0o600)
payload=json.loads(pathlib.Path('/tmp/photo-recovery-payload.json').read_text())
manifest=[x for x in payload['manifest'] if x['path'].startswith(('src/','dashboard/','scripts/','migrations/')) or x['path'] in ['package.json','package-lock.json','Dockerfile','docker-compose.yml','tsconfig.json','.dockerignore']]
RELEASE.mkdir(parents=True,exist_ok=True)
for item in manifest:
 p=item['path'];assert not p.startswith('/') and '..' not in pathlib.PurePosixPath(p).parts
 b=payload['changed'][p].encode() if p in payload['changed'] else (BASE/p).read_bytes()
 assert hashlib.sha1(b'blob '+str(len(b)).encode()+bytes([0])+b).hexdigest()==item['sha'],'Source mismatch: '+p
 target=RELEASE/p;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b)
(BACKUP/(SHA+'-source-manifest.json')).write_text(json.dumps(manifest))
# The image includes only Git-manifest files. Private incident evidence is mounted afterwards.
tag='twin-v2-photo-recovery:'+SHA
r=subprocess.run(['docker','build','--label','org.opencontainers.image.revision='+SHA,'-t',tag,str(RELEASE)],capture_output=True,text=True,timeout=600)
(BACKUP/(SHA+'-build.log')).write_text(r.stdout+r.stderr)
assert r.returncode==0,'Image build failed; private build log retained'
image=out('docker','image','inspect','-f','{{.Id}}',tag)
print(json.dumps({'built':SHA,'image':image,'files':len(manifest),'backup':str(BACKUP)}),flush=True)
# Reconstruct the exact frozen fixture from existing host logs and saved factual evidence, without publishing it.
source=pathlib.Path('/tmp/photo-recovery-snapshot.mjs').read_text()
r=subprocess.run(['docker','exec','-i','twin-v2-bot-1','node','--import','tsx','--input-type=module'],input=source,text=True,capture_output=True,timeout=90)
(BACKUP/'snapshot.log').write_text(r.stdout+r.stderr)
assert r.returncode==0,'Read-only snapshot failed: '+r.stderr[-700:]
print(r.stdout.strip(),flush=True)
shutil.copy2(PRIVATE/'input/fleet-settings.json',BACKUP/'fleet-settings.json');(BACKUP/'fleet-settings.json').chmod(0o600)
tests=['check-safety','check-media','check-photo-flow','check-media-facts','check-media-correction','check-media-toy-menu','check-reply-grounding','check-photo-recovery','check-turn','check-payments','check-bundles','check-delivery','check-credits','check-tips','check-tips-wiring','check-archive','check-memory','check-memory-wiring','check-dashboard-history']
results=[]
for test in tests:
 r=subprocess.run(['docker','run','--rm','--network','none','--memory','512m','--cpus','1','-v',str(PRIVATE/'input')+':/private:ro','-e','PHOTO_INCIDENT_FIXTURE=/private/incident.json',tag,'node','--import','tsx','scripts/'+test+'.ts'],capture_output=True,text=True,timeout=150)
 (BACKUP/(SHA+'-'+test+'.log')).write_text(r.stdout+r.stderr)
 results.append({'suite':test,'exit':r.returncode})
 assert r.returncode==0,test+' failed; full evidence retained'
 print('PASS '+test,flush=True)
r=subprocess.run(['docker','run','--rm','--network','none','--memory','512m',tag,'npm','run','typecheck'],capture_output=True,text=True,timeout=120)
(BACKUP/(SHA+'-typecheck.log')).write_text(r.stdout+r.stderr)
assert r.returncode==0,'Image typecheck failed'
print('PASS image typecheck',flush=True)
# Jesse explicitly approved transmitting the retained Riley test messages and creator prompt to the existing OpenRouter route.
modelMarker=BACKUP/(SHA+'-model-started.json')
assert not modelMarker.exists(),'This pinned candidate model check was already attempted; review retained results instead of resampling'
modelMarker.write_text(json.dumps({'startedAt':time.time(),'approval':'Jesse 2026-10-13 00:28 Brisbane','model':'existing configured conversation route'}))
envfile=BACKUP/(SHA+'-model.env')
ev=json.loads(out('docker','inspect','twin-v2-bot-1'))[0]['Config']['Env']
env=dict(s.split('=',1) for s in ev if '=' in s)
key=env.get('OPENROUTER_API_KEY')
if not key:
 key=out('docker','exec','twin-v2-bot-1','node','--import','tsx','--input-type=module','-e',"import {config} from './src/config.ts';process.stdout.write(config.openrouterKey)")
assert key and '\n' not in key,'Configured model credential missing'
fd=os.open(envfile,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:f.write('OPENROUTER_API_KEY='+key+'\n')
evidence=PRIVATE/SHA;evidence.mkdir(parents=True,exist_ok=True,mode=0o700)
try:
 r=subprocess.run(['docker','run','--rm','--memory','512m','--cpus','1','--env-file',str(envfile),'-v',str(PRIVATE/'input')+':/private:ro','-v',str(evidence)+':/evidence','-e','PHOTO_INCIDENT_FIXTURE=/private/incident.json','-e','PHOTO_CREATOR_PROFILE=/private/riley-profile.json','-e','PHOTO_EVIDENCE_DIR=/evidence',tag,'node','--import','tsx','scripts/check-photo-recovery-model.ts'],capture_output=True,text=True,timeout=1000)
 (evidence/'model-output.log').write_text(r.stdout+r.stderr)
 print(r.stdout,flush=True)
 resultFiles=list(evidence.glob('photo-real-model-*/results.json'))
 assert len(resultFiles)==1,'No complete model result file'
 real=json.loads(resultFiles[0].read_text());(BACKUP/(SHA+'-real-model-results.json')).write_text(json.dumps(real,indent=2))
 print(json.dumps({'realModel':real}),flush=True)
 assert r.returncode==0 and len(real['results'])==13 and all(x['pass'] for x in real['results']),'Bounded real-model gate failed; retained result must be reviewed'
finally:
 envfile.unlink(missing_ok=True)
unchanged()
prepared={'sha':SHA,'image':image,'oldSha':OLD_SHA,'oldImage':OLD_IMAGE,'backup':str(BACKUP),'release':str(RELEASE),'offline':results,'realModelResults':str(BACKUP/(SHA+'-real-model-results.json')),'runtimeUnchanged':True}
(BACKUP/(SHA+'-prepared.json')).write_text(json.dumps(prepared,indent=2))
print(json.dumps(prepared),flush=True)

