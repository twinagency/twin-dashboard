"""Read isolated evidence only; freeze actual legacy profile mappings without writes."""
import base64,datetime,gzip,hashlib,json,pathlib,subprocess,time
ROOT=pathlib.Path('/home/ubuntu/twin-v2-validation/fleet-simulation-20261013-1791877888400228253')
rows=[];progress=[]
for d in ROOT.iterdir():
 if not d.is_dir() or d.name.startswith('legacy-harness-dry'):continue
 for name,dest in [('summary.json',rows),('progress.json',progress)]:
  p=d/name
  if p.is_file():
   try:dest.append(json.loads(p.read_text()))
   except ValueError:pass
aggregate=json.loads((ROOT/'fleet-summary.json').read_text()) if (ROOT/'fleet-summary.json').is_file() else None
result=aggregate or {'complete':False,'creators':rows,'progress':progress}
if not aggregate:result['orchestratorTail']=(ROOT/'orchestrator.private.log').read_text()[-1200:]
result['legacy']=json.loads((ROOT/'legacy-summary.json').read_text()) if (ROOT/'legacy-summary.json').is_file() else {'complete':False,'creators':[r for r in rows if r.get('engine')=='live'],'progress':[r for r in progress if r['slug'] in ['autumn-renae','dan-dangler','hazey-haley']],'orchestratorTail':(ROOT/'legacy-orchestrator-v2.private.log').read_text()[-1600:] if (ROOT/'legacy-orchestrator-v2.private.log').exists() else None}
result['legacyDryRuns']=[]
for name in ['legacy-harness-dry','legacy-harness-dry-v2']:
 p=ROOT/name/'summary.json';e=ROOT/name/'runner.stderr.private.log'
 if p.exists():
  r=json.loads(p.read_text());result['legacyDryRuns'].append({'attempt':name,'cases':r.get('cases'),'requests':r.get('requests'),'fatal':r.get('fatal'),'errors':[(x['case'],x['error']) for x in r.get('results',[]) if x.get('error')]})
 elif e.exists():result['legacyDryRuns'].append({'attempt':name,'error':e.read_text()[-1400:]})
details=[]
for c in result['creators']:
 if c.get('engine')!='v2':continue
 wanted={r['case'] for r in c.get('results',[]) if r.get('failed') or r.get('flags')}
 f=ROOT/c['slug']/'turns.private.json'
 if not f.exists():continue
 for t in json.loads(f.read_text()):
  if t['case'] not in wanted:continue
  r=t['row'];selected=r.get('selectedMedia') or {};prior=t['before'].get('photo') or {}
  details.append({'slug':c['slug'],'case':t['case'],'raw':r.get('raw'),'generated':r.get('generated'),'grounding':r.get('grounding'),'reference':r.get('photoReference'),'delivery':r.get('delivery'),'selectedDescription':next((m['desc'] for m in r.get('menu',[]) if m['key']==selected.get('key')),None),'priorKey':prior.get('key'),'historyTail':t['before'].get('history',[])[-2:]})
result['failureDetails']=details
settings_source=r'''
import {config} from './src/config.ts';import {TIP_SETTING_COLUMNS} from './src/tips/settings.ts';
const cols='id,slug,name,engine,status,v2_vars,v2_memory_enabled,v2_credits_enabled,v2_credits_pack_quantity,v2_credits_pack_stars,v2_credits_revision,'+TIP_SETTING_COLUMNS;
const r=await fetch(config.supabaseUrl+'/rest/v1/clones?select='+cols+'&status=eq.active&order=slug',{headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey},signal:AbortSignal.timeout(15000)});
if(!r.ok)throw Error('post-simulation settings read failed');console.log('POST_PROFILES_JSON '+JSON.stringify(await r.json()));
'''
r=subprocess.run(['docker','exec','-i','twin-v2-bot-1','node','--import','tsx','--input-type=module'],input=settings_source,text=True,capture_output=True,timeout=30)
if r.returncode==0:
 fresh=json.loads(next(l[len('POST_PROFILES_JSON '):] for l in r.stdout.splitlines() if l.startswith('POST_PROFILES_JSON ')));old=json.loads((ROOT/'evidence.json').read_text())['profiles'];oldmap={p['slug']:p for p in old};newmap={p['slug']:p for p in fresh}
 result['postSettings']={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'changed':[s for s in sorted(set(oldmap)|set(newmap)) if oldmap.get(s)!=newmap.get(s)],'profiles':[{'slug':p['slug'],'engine':p['engine'],'status':p['status']} for p in fresh]}
else:result['postSettings']={'error':'Read failed; not proven unchanged'}
runtime=[]
for name in ['twin-v2-bot-1','twin-v2-dash-1','next-app']:
 info=json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0];env=dict(e.split('=',1) for e in info['Config']['Env'])
 runtime.append({'name':name,'image':info['Image'],'revision':env.get('GIT_SHA'),'running':info['State']['Running'],'bundlesSetting':env.get('V2_BUNDLES') if name=='twin-v2-bot-1' else None})
result['runtimeAtRead']=runtime
result['legacyPartialHttp']=[]
for slug in ['autumn-renae','dan-dangler','hazey-haley']:
 p=ROOT/slug/'exchanges.private.json'
 if p.exists():
  es=json.loads(p.read_text());result['legacyPartialHttp'].append({'slug':slug,'count':len(es),'lastCase':es[-1]['case'] if es else None,'attempts':[{'case':e['case'],'status':e.get('status'),'model':e['request'].get('model')} for e in es]})
packed=gzip.compress(json.dumps(result).encode(),mtime=0)
p=ROOT/('readback-'+str(time.time_ns())+'.json.gz');p.write_bytes(packed);p.chmod(0o600)
print('SIM_RESULT_MANIFEST '+json.dumps({'path':str(p),'bytes':len(packed),'base64Chunks':(len(base64.b64encode(packed))+19999)//20000,'sha256':hashlib.sha256(packed).hexdigest(),'complete':bool(aggregate),'creators':[{k:r.get(k) for k in ['slug','cases','requests','failedCases','flaggedCases','fatal']} for r in rows],'progress':[{k:r.get(k) for k in ['slug','completed','requests']} for r in progress]}),flush=True)
legacy=ROOT/'legacy-evidence.json'
if not legacy.exists():
 source=r'''
import fs from 'node:fs';import crypto from 'node:crypto';
import {SupabaseStore} from './src/data/supabase-store.ts';
if(process.env.GIT_SHA!=='caa2a94ee519eb84d25b6c77023f732e8fed7b36')throw Error('V1 runtime changed');
const store=new SupabaseStore(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_KEY),clones=[],catalogues={},bundles={},onboarding={};
for(const slug of ['autumn-renae','dan-dangler','hazey-haley']){
 const c=await store.getCloneBySlug(slug);if(!c||c.engine!=='live'||c.status!=='active')throw Error('Legacy assignment changed');
 c.botToken='ISOLATED-'+slug;clones.push(c);
 catalogues[c.id]={photos:await store.listPhotos(c.id),videos:await store.listVideos(c.id)};
 bundles[c.id]=await store.listSendableBundles(c.id);onboarding[c.id]=await store.getOnboardingBundle(c.id);
}
const templates=[...await store.getPromptTemplates()];
const sourceHashes=Object.fromEntries(['src/handler.ts','src/config.ts','src/data/memory-store.ts','src/services/llm.ts'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
console.log('LEGACY_FIXTURE_JSON '+JSON.stringify({at:new Date().toISOString(),runtime:process.env.GIT_SHA,clones,catalogues,bundles,onboarding,templates,sourceHashes}));
'''
 r=subprocess.run(['docker','exec','-i','next-app','node','--import','tsx','--input-type=module'],input=source,text=True,capture_output=True,timeout=120)
 if r.returncode==0:
  raw=next(l[len('LEGACY_FIXTURE_JSON '):] for l in r.stdout.splitlines() if l.startswith('LEGACY_FIXTURE_JSON '));legacy.write_text(raw);legacy.chmod(0o600)
  data=json.loads(raw);print('LEGACY_SNAPSHOT_JSON '+json.dumps({'at':data['at'],'runtime':data['runtime'],'sha256':hashlib.sha256(legacy.read_bytes()).hexdigest(),'creators':[{'slug':c['slug'],'mode':c.get('aiMode'),'model':c.get('textModel'),'photos':len(data['catalogues'][c['id']]['photos']),'chargeMessages':c.get('chargeMessages')} for c in data['clones']]}),flush=True)
 else:print('LEGACY_SNAPSHOT_FAILED '+r.stderr[-600:],flush=True)
