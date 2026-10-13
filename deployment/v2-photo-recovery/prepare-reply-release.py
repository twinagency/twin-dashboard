"""Build and verify the full remote candidate; preserve live runtime and create code-only rollback evidence."""
import datetime,hashlib,json,pathlib,shutil,subprocess,sys,tarfile,time
SHA='9138db6f956ed383d18fe33bce6577b2f5d74d4a'
OLD_SHA='2f24f023c0cf46bea1c3b3b334458cf1a5df265e'
# Explicit existing-image pin, never a moving tag.
OLD_IMAGE='sha256:dff48242b35b94e7b0e757ee4b7778a11958ef85b231b5fdb369542902e325f9'
ROOT=pathlib.Path('/home/ubuntu/twin-v2')
RELEASE=pathlib.Path('/home/ubuntu/twin-v2-reply-releases')/SHA
BACKUP=pathlib.Path('/home/ubuntu/twin-v2-backups')/('reply-baseline-'+SHA[:7]+'-'+sys.argv[2])
payload=json.loads(pathlib.Path(sys.argv[1]).read_text());assert payload['candidate']==SHA
sha=lambda b:hashlib.sha256(b).hexdigest()
blob=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def cmd(*args):return subprocess.check_output(args,text=True).strip()
def runtime():
 rows=[]
 for name in ['twin-v2-bot-1','twin-v2-dash-1']:
  info=json.loads(cmd('docker','inspect',name))[0]
  rows.append({'name':name,'image':info['Image'],'running':info['State']['Running'],'revision':next((e.split('=',1)[1] for e in info['Config']['Env'] if e.startswith('GIT_SHA=')),None)})
 return rows
models=[json.loads(p.read_text()) for p in pathlib.Path('/home/ubuntu/twin-v2-validation').glob('reply-outcomes-candidate-*/summary.json')]
model=next((x for x in models if x.get('candidate')==SHA),None)
assert model and model['cases']==model['requests']==464 and model['failed']==0 and model['promptDisplayConsistent'] and not any(x.get('fatal') for x in model['creators']),'Current isolated model gate is not complete/passing'
before=runtime();assert all(r['running'] and r['image']==OLD_IMAGE and r['revision']==OLD_SHA for r in before),'Live runtime changed'
assert shutil.disk_usage(ROOT).free>2*1024**3,'Insufficient free space'
assert not BACKUP.exists() and not RELEASE.exists(),'Preparation already exists; inspect it instead of overwriting'
BACKUP.mkdir(parents=True,mode=0o700);RELEASE.mkdir(parents=True,mode=0o755)
manifest=payload['manifest'];assert len(manifest)==289
bases=[pathlib.Path('/home/ubuntu/twin-v2-shared-releases')/OLD_SHA,ROOT]
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
changes=[
 ['Never state the item’s price','Never quote or estimate the item’s price'],
 ['A previous offer does not prevent a relevant new one.','A previous offer does not prevent a relevant new one; acceptance or questions about that card alone select none.'],
 ['In that message describe only what that item actually shows.','Describe only what that item actually shows; use a brief introduction when no visual detail is recorded.'],
 ['If no previous photo is verified, say so briefly and ask one specific question if needed.',"If its verification fails, say you can't send that one right now without guessing why. If no prior card is recorded, ask which one."],
 ['right there with Apple Pay, Google Pay or a card, it takes a few seconds.','right there with Apple Pay, Google Pay or a card.'],
 ['It unlocks the second he pays and stays in your chat forever.','A confirmed payment unlocks the card in the chat; do not infer that he paid or can see it.']]
probe=probe.replace('__SOURCE__',json.dumps(new_template)).replace('__CHANGES__',json.dumps(changes)).replace('__FILES__',json.dumps(payload['runtimeFiles']))
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
subprocess.run(['docker','image','save','-o',str(BACKUP/'images.tar'),OLD_IMAGE],check=True,capture_output=True,timeout=120)
changes=[]
for item in manifest:
 p=item['path']
 if not (p.startswith(('src/','scripts/')) or p=='package.json'):continue
 old=(ROOT/p).read_bytes() if (ROOT/p).is_file() else None;new=(RELEASE/p).read_bytes()
 if old==new:continue
 # Only intentional changes from the candidate may alter host source.
 assert p in payload['provided'],'Unreviewed host source divergence: '+p
 changes.append({'path':p,'existed':old is not None,'oldSha256':sha(old) if old is not None else None,'newSha256':sha(new)})
 if old is not None:
  target=BACKUP/'host-before'/p;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(old)
tag='twin-v2-reply:'+SHA
r=subprocess.run(['docker','build','--label','org.opencontainers.image.revision='+SHA,'-t',tag,str(RELEASE)],capture_output=True,text=True,timeout=600);(BACKUP/'build.log').write_text(r.stdout+r.stderr);assert r.returncode==0,'Build failed'
image=cmd('docker','image','inspect','-f','{{.Id}}',tag)
commands=json.loads((RELEASE/'package.json').read_text())['scripts']['test'].split(' && ')
suites=[c.split()[1] for c in commands]+['scripts/check-dashboard-history.ts'];results=[]
for script in suites:
 r=subprocess.run(['docker','run','--rm','--network','none','--memory','768m','--cpus','1',image,'node','--import','tsx',script],capture_output=True,text=True,timeout=180)
 (BACKUP/('gate-'+pathlib.Path(script).stem+'.log')).write_text(r.stdout+r.stderr);results.append({'suite':script,'exit':r.returncode})
 assert r.returncode==0,'Packaged gate failed: '+script
r=subprocess.run(['docker','run','--rm','--network','none','--memory','768m','--cpus','1',image,'node','node_modules/typescript/bin/tsc','--noEmit'],capture_output=True,text=True,timeout=180);(BACKUP/'typecheck.log').write_text(r.stdout+r.stderr);assert r.returncode==0,'Packaged typecheck failed'
assert runtime()==before and settings()['settingsHash']==preflight['settingsHash'],'Live baseline changed while preparing'
for p,h in hashes.items():assert sha((ROOT/p).read_bytes())==h,'Host source changed while preparing: '+p
prepared={'sha':SHA,'testedSource':SHA,'image':image,'oldSha':OLD_SHA,'oldImage':OLD_IMAGE,'release':str(RELEASE),'backup':str(BACKUP),'offline':results,'typecheck':True,'sourceManifestFiles':len(manifest),'hostChanges':changes,'settingsHash':preflight['settingsHash'],'expectedSlugs':sorted(x['slug'] for x in preflight['checks']),'preparedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'liveRuntimeReplaced':False,'modelCalls':0,'realModelCases':model['cases'],'modelEvidencePath':model['evidencePath']}
records={'reply-prepared.json':prepared,'release-preflight.json':preflight,'runtime-source-hashes.json':hashes,'release-manifest.json':manifest,'host-changes.json':changes,'rollback-plan.json':{'baselineRevision':OLD_SHA,'image':OLD_IMAGE,'codeArchiveSha':sha((BACKUP/'runtime-code.tgz').read_bytes()),'imageArchiveBytes':(BACKUP/'images.tar').stat().st_size,'dataIncluded':False,'runtimeReplaced':False}}
for name,data in records.items():(BACKUP/name).write_text(json.dumps(data,indent=2))
for p in BACKUP.rglob('*'):
 if p.is_file():p.chmod(0o600)
print('REPLY_RELEASE_PREPARED_JSON '+json.dumps(prepared),flush=True)
