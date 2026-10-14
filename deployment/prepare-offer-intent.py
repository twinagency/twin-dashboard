"""Build and verify the full remote candidate; preserve live runtime and create code-only rollback evidence."""
import base64,datetime,hashlib,json,pathlib,shutil,subprocess,sys,tarfile,time
SHA='1294e734580ed620369a8c16e3cb88a6da6261a8'
OLD_SHA='b68c8d43d1b476afc034969fcc2015e1e2c33d3d'
# Explicit existing-image pin, never a moving tag.
OLD_IMAGE='sha256:f4ac46651a767de65504783f9e4f1f1a0ecedec96529ebb1fda61f6050cad84d'
ROOT=pathlib.Path('/home/ubuntu/twin-v2')
RELEASE=pathlib.Path('/home/ubuntu/twin-v2-offer-releases')/(SHA+'-'+sys.argv[2])
BACKUP=pathlib.Path('/home/ubuntu/twin-v2-backups')/('offer-baseline-'+SHA[:7]+'-'+sys.argv[2])
payload=json.loads(pathlib.Path(sys.argv[1]).read_text());assert payload['candidate']==SHA
HOST_PATCH=['src/girls/template.ts', 'src/body-facts.ts', 'src/turn.ts', 'scripts/check-body-facts.ts', 'scripts/check-media.ts', 'package.json']
PROVIDED=HOST_PATCH+['src/runner.ts', 'src/flirt-claim.ts', 'scripts/check-flirt-claim.ts']
RUNTIME=['src/turn.ts', 'src/media.ts', 'src/girls/template.ts', 'src/tips/policy.ts', 'src/grounding.ts', 'src/memory.ts', 'src/deliver.ts', 'src/runner.ts', 'src/flirt-claim.ts']
assert list(payload['provided'])==PROVIDED and payload['runtimeFiles']==RUNTIME,'Candidate payload scope changed'
sha=lambda b:hashlib.sha256(b).hexdigest()
blob=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def cmd(*args):return subprocess.check_output(args,text=True).strip()
def runtime():
 rows=[]
 for name in ['twin-v2-bot-1','twin-v2-dash-1']:
  info=json.loads(cmd('docker','inspect',name))[0]
  rows.append({'name':name,'image':info['Image'],'running':info['State']['Running'],'revision':next((e.split('=',1)[1] for e in info['Config']['Env'] if e.startswith('GIT_SHA=')),None)})
 return rows
before=runtime();assert before==[{'name': 'twin-v2-bot-1', 'image': 'sha256:f4ac46651a767de65504783f9e4f1f1a0ecedec96529ebb1fda61f6050cad84d', 'running': True, 'revision': 'b68c8d43d1b476afc034969fcc2015e1e2c33d3d'}, {'name': 'twin-v2-dash-1', 'image': 'sha256:93045f957470052893cc1a8e0ecd2819b9b8069397c4b84b55f34e8de9aac879', 'running': True, 'revision': 'e8eed505d5a1c5ef53938b2dee90a09bce26ea38'}],'Live runtime changed: '+json.dumps(before)
assert shutil.disk_usage(ROOT).free>2*1024**3,'Insufficient free space'
assert not BACKUP.exists() and not RELEASE.exists(),'Preparation already exists; inspect it instead of overwriting'
BACKUP.mkdir(parents=True,mode=0o700);RELEASE.mkdir(parents=True,mode=0o755)
manifest=payload['manifest'];assert len(manifest)==295
bases=[pathlib.Path('/home/ubuntu/twin-v2-offer-releases')/OLD_SHA,ROOT,pathlib.Path('/home/ubuntu/twin-v2-offer-releases/e8eed505d5a1c5ef53938b2dee90a09bce26ea38')]
for item in manifest:
 p=item['path'];assert not p.startswith('/') and '..' not in pathlib.PurePosixPath(p).parts
 if p in payload['provided']:b=payload['provided'][p].encode()
 else:
  matches=[(base/p) for base in bases if (base/p).is_file() and blob((base/p).read_bytes())==item['sha']]
  assert matches,'Remote source file unavailable: '+p
  b=matches[0].read_bytes()
 assert blob(b)==item['sha'],'Remote blob mismatch: '+p
 target=RELEASE/p;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b);target.chmod(int(item['mode'],8)&0o777)
# Read settings and render both templates without installing or changing them.
new_template=(RELEASE/'src/girls/template.ts').read_text()
probe="""import fs from 'node:fs';import crypto from 'node:crypto';import ts from 'typescript';
import {config} from './src/config.ts';import {render,renderParts,previewParts} from './src/girls/template.ts';import {priceFor} from './src/payments.ts';
const src=__SOURCE__;const code=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;const next=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const r=await fetch(config.supabaseUrl+'/rest/v1/clones?select=id,slug,name,engine,status,v2_vars,v2_credits_enabled,tips_enabled,v2_memory_enabled&order=slug',{headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('settings read');const rows=await r.json();
const hash=s=>crypto.createHash('sha256').update(s).digest('hex'),now=new Date();
const changes=__CHANGES__;
const checks=rows.filter(p=>p.engine==='v2'&&p.status==='active').map(p=>({slug:p.slug,settingsHash:hash(JSON.stringify(p)),emojiPolicy:hash(p.v2_vars.EMOJIS??''),testerPrice:priceFor(2700,{cloneId:p.id,telegramId:6814483810,kind:'photo'}),normalPrice:priceFor(2700,{cloneId:p.id,telegramId:6814483811,kind:'photo'}),candidateDisplayMatches:JSON.stringify(next.previewParts(p.v2_vars,now))===JSON.stringify(next.renderParts(p.v2_vars,now)),candidateChangesOnlyReviewedParagraphs:next.render(p.v2_vars,now)===changes.reduce((s,[a,b])=>s.replace(a,b),render(p.v2_vars,now))}));
console.log('PREP_JSON '+JSON.stringify({checkedAt:new Date().toISOString(),settingsHash:hash(JSON.stringify(rows)),checks,model:config.model,providerOrder:config.providerOrder,bundles:process.env.V2_BUNDLES,sourceHashes:Object.fromEntries(__FILES__.map(p=>[p,hash(fs.readFileSync(p))]))}));
"""
prompt_changes=[]
probe=probe.replace('__SOURCE__',json.dumps(new_template)).replace('__CHANGES__',json.dumps(prompt_changes)).replace('__FILES__',json.dumps(payload['runtimeFiles']))
def settings():
 r=subprocess.run(['docker','exec','-i','twin-v2-bot-1','node','--import','tsx','--input-type=module'],input=probe,text=True,capture_output=True,timeout=45)
 assert r.returncode==0,'Settings/render check failed'
 return json.loads(next(x[10:] for x in r.stdout.splitlines() if x.startswith('PREP_JSON ')))
preflight=settings();assert len(preflight['checks'])==17 and all(x['candidateDisplayMatches'] and x['candidateChangesOnlyReviewedParagraphs'] for x in preflight['checks']),'Creator prompt mismatch'
# Archive only code/configuration; data, logs, environment secrets and financial records are excluded.
paths=[]
for prefix in ['src','dashboard','scripts']:
 paths += [p for p in (ROOT/prefix).rglob('*') if p.is_file()]
paths += [ROOT/p for p in ['Dockerfile','package.json','package-lock.json','tsconfig.json','docker-compose.yml','photo-release.override.json'] if (ROOT/p).is_file()]
hashes={str(p.relative_to(ROOT)):sha(p.read_bytes()) for p in paths}
with tarfile.open(BACKUP/'runtime-code.tgz','w:gz') as tar:
 for p in paths:tar.add(p,arcname=str(p.relative_to(ROOT)),recursive=False)
for p in ['docker-compose.yml','photo-release.override.json']:shutil.copyfile(ROOT/p,BACKUP/p)
subprocess.run(['docker','image','save','-o',str(BACKUP/'images.tar'),OLD_IMAGE,'sha256:93045f957470052893cc1a8e0ecd2819b9b8069397c4b84b55f34e8de9aac879'],check=True,capture_output=True,timeout=120)
changes=[]
for item in manifest:
 p=item['path']
 if p not in HOST_PATCH:continue # Other host source stays as found; the image preserves all pinned Git blobs.
 old=(ROOT/p).read_bytes() if (ROOT/p).is_file() else None;new=(RELEASE/p).read_bytes()
 if old==new:continue
 # Only intentional changes from the candidate may alter host source.
 assert p in payload['provided'],'Unreviewed host source divergence: '+p
 changes.append({'path':p,'existed':old is not None,'oldSha256':sha(old) if old is not None else None,'newSha256':sha(new)})
 if old is not None:
  target=BACKUP/'host-before'/p;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(old)
assert sorted(c['path'] for c in changes)==sorted(HOST_PATCH),'Prepared host changes differ from reviewed scope'
# Dependencies are byte-identical; reuse the installed dependencies from the pinned current image.
# Only the test script in package.json changed, so an offline build must not fetch npm again.
old_lock=subprocess.check_output(['docker','exec','twin-v2-bot-1','cat','package-lock.json'])
assert old_lock==(RELEASE/'package-lock.json').read_bytes(),'Dependency lock changed'
old_package=json.loads(subprocess.check_output(['docker','exec','twin-v2-bot-1','cat','package.json']))
new_package=json.loads((RELEASE/'package.json').read_text())
new_package['scripts']['test']=old_package['scripts']['test']
assert new_package==old_package,'Changes beyond the reviewed test script require a fresh dependency build'
baseline_tag='twin-v2-olivia-baseline:'+OLD_SHA
subprocess.run(['docker','tag',OLD_IMAGE,baseline_tag],check=True,capture_output=True)
recipe=BACKUP/'pinned-dependencies.Dockerfile'
metadata=base64.b64encode((RELEASE/'.dockerignore').read_bytes()).decode()
recipe.write_text('FROM '+baseline_tag+'\nWORKDIR /app\nCOPY . .\nRUN '+json.dumps(['node','-e',"require('node:fs').writeFileSync('.dockerignore',Buffer.from('"+metadata+"','base64'))"])+ '\n')
tag='twin-v2-offer:'+SHA
r=subprocess.run(['docker','build','--network','none','--pull=false','--file',str(recipe),'--label','org.opencontainers.image.revision='+SHA,'-t',tag,str(RELEASE)],capture_output=True,text=True,timeout=600);(BACKUP/'build.log').write_text(r.stdout+r.stderr);assert r.returncode==0,'Build failed'
image=cmd('docker','image','inspect','-f','{{.Id}}',tag)
# Docker treats its ignore file as build metadata, so verify it explicitly along with every packaged source blob.
packaged=[x for x in manifest if not x['path'].startswith('archive/')]
verify="import fs from 'node:fs';import crypto from 'node:crypto';const bad=[];for(const x of "+json.dumps(packaged)+"){try{const b=fs.readFileSync(x.path);if(crypto.createHash('sha1').update('blob '+b.length).update(Buffer.from([0])).update(b).digest('hex')!==x.sha)bad.push(x.path);}catch{bad.push(x.path);}}console.log(JSON.stringify(bad));if(bad.length)process.exit(1);"
v=subprocess.run(['docker','run','--rm','--network','none',image,'node','--input-type=module','-e',verify],capture_output=True,text=True,timeout=60)
assert v.returncode==0,'Packaged source mismatch: '+v.stdout[-1500:]
commands=json.loads((RELEASE/'package.json').read_text())['scripts']['test'].split(' && ')
suites=[c.split()[1] for c in commands]+['scripts/check-dashboard-history.ts','scripts/check-flirt-claim.ts'];results=[]
for script in suites:
 r=subprocess.run(['docker','run','--rm','--network','none','--memory','768m','--cpus','1',image,'node','--import','tsx',script],capture_output=True,text=True,timeout=180)
 (BACKUP/('gate-'+pathlib.Path(script).stem+'.log')).write_text(r.stdout+r.stderr);results.append({'suite':script,'exit':r.returncode})
 assert r.returncode==0,'Packaged gate failed: '+script
r=subprocess.run(['docker','run','--rm','--network','none','--memory','768m','--cpus','1',image,'node','node_modules/typescript/bin/tsc','--noEmit'],capture_output=True,text=True,timeout=180);(BACKUP/'typecheck.log').write_text(r.stdout+r.stderr);assert r.returncode==0,'Packaged typecheck failed'
after=runtime();assert after==before and settings()['settingsHash']==preflight['settingsHash'],'Live baseline changed while preparing'
for p,h in hashes.items():assert sha((ROOT/p).read_bytes())==h,'Host source changed while preparing: '+p
rollback={'baselineRevision':OLD_SHA,'image':OLD_IMAGE,'codeArchiveSha':sha((BACKUP/'runtime-code.tgz').read_bytes()),'imageArchiveBytes':(BACKUP/'images.tar').stat().st_size,'dataIncluded':False,'runtimeReplaced':False}
prepared={'sha':SHA,'testedSource':SHA,'image':image,'oldSha':OLD_SHA,'oldImage':OLD_IMAGE,'release':str(RELEASE),'backup':str(BACKUP),'offline':results,'typecheck':True,'sourceManifestFiles':len(manifest),'providedSourceFiles':len(payload['provided']),'promptChanges':len(prompt_changes),'hostChanges':changes,'settingsHash':preflight['settingsHash'],'expectedSlugs':sorted(x['slug'] for x in preflight['checks']),'runtimeBefore':before,'runtimeAfter':after,'preparedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'rollbackReady':True,'rollback':rollback,'liveRuntimeReplaced':False,'modelCalls':0,'fanMessages':0,'purchases':0,'productionWrites':0,'realModelCases':0,'modelTransport':'mocked','dependencyLockUnchanged':True}
records={'reply-prepared.json':prepared,'release-preflight.json':preflight,'runtime-source-hashes.json':hashes,'release-manifest.json':manifest,'host-changes.json':changes,'rollback-plan.json':rollback}
for name,data in records.items():(BACKUP/name).write_text(json.dumps(data,indent=2))
for p in BACKUP.rglob('*'):
 if p.is_file():p.chmod(0o600)
print('REPLY_RELEASE_PREPARED_JSON '+json.dumps(prepared),flush=True)

