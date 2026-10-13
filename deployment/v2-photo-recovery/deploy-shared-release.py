"""Deploy the approved, packaged shared repair; preserve current fleet, data and prices."""
import datetime,hashlib,json,pathlib,subprocess,sys,time
SHA='2f24f023c0cf46bea1c3b3b334458cf1a5df265e'
TESTED='5e789f1d23bf63f91643760537600c077b646356'
OLD_SHA='86b0ad199ea33fd7855f1c0dd54cc355f706e7f5'
OLD_IMAGE='sha256:9649329a00bd20fe06499f8238e1e51713381521af00d4cdc67505e1064f724a'
ROOT=pathlib.Path('/home/ubuntu/twin-v2')
BACKUP=pathlib.Path('/home/ubuntu/twin-v2-backups/shared-photo-baseline-5e789f1-1791872165074291746')
PREP=json.loads((BACKUP/'shared-prepared.json').read_text())
BASE=json.loads((BACKUP/'release-preflight.json').read_text())
IMAGE=PREP['image'];RELEASE=pathlib.Path(PREP['release'])
MANIFEST=json.loads((BACKUP/'release-manifest.json').read_text())
CHANGES=json.loads((BACKUP/'host-changes.json').read_text())
EXPECTED=PREP['expectedSlugs'];OVERRIDE=ROOT/'photo-release.override.json'
CONTAINERS=['twin-v2-bot-1','twin-v2-dash-1']
def stamp():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def digest(b):return hashlib.sha256(b).hexdigest()
def out(*a):return subprocess.check_output(a,text=True).strip()
def save(name,value):
 p=BACKUP/name;p.write_text(json.dumps(value,indent=2));p.chmod(0o600)
def node(source,label,container='twin-v2-bot-1'):
 r=subprocess.run(['docker','exec','-i',container,'node','--import','tsx','--input-type=module'],input=source,text=True,capture_output=True,timeout=210)
 p=BACKUP/(label+'.log');p.write_text(r.stdout+r.stderr);p.chmod(0o600)
 if r.returncode:raise RuntimeError(label+' failed; private log retained')
 lines=[x[len('RELEASE_JSON '):] for x in r.stdout.splitlines() if x.startswith('RELEASE_JSON ')]
 assert len(lines)==1,label+' missing result'
 return json.loads(lines[0])
def runtime(image,revision):
 for name in CONTAINERS:
  info=json.loads(out('docker','inspect',name))[0]
  assert info['State']['Running'] and info['Image']==image and 'GIT_SHA='+revision in info['Config']['Env'],'Runtime changed: '+name
def compose():
 r=subprocess.run(['docker','compose','-p','twin-v2','-f',str(ROOT/'docker-compose.yml'),'-f',str(OVERRIDE),'up','-d','--no-build'],text=True,capture_output=True,timeout=90)
 (BACKUP/('compose-'+str(time.time_ns())+'.log')).write_text(r.stdout+r.stderr)
 assert r.returncode==0,'Compose failed; private log retained'
def atomic(p,b,mode=None):
 p.parent.mkdir(parents=True,exist_ok=True)
 temp=p.with_name(p.name+'.shared-release-tmp');temp.write_bytes(b)
 temp.chmod(mode if mode is not None else (p.stat().st_mode&0o777 if p.exists() else 0o644));temp.replace(p)
def settings():
 result=node(r"""
import {createHash} from 'node:crypto';import {config} from './src/config.ts';
const r=await fetch(config.supabaseUrl+'/rest/v1/clones?select=id,slug,name,engine,status,v2_vars,v2_credits_enabled,tips_enabled,v2_memory_enabled&order=slug',{headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey},signal:AbortSignal.timeout(15000)});
if(!r.ok)throw Error('Current settings unreadable');const rows=await r.json();
console.log('RELEASE_JSON '+JSON.stringify({settingsHash:createHash('sha256').update(JSON.stringify(rows)).digest('hex'),active:rows.filter(x=>x.engine==='v2'&&x.status==='active').map(x=>x.slug).sort(),model:config.model,providerOrder:config.providerOrder,bundles:process.env.V2_BUNDLES}));
""",'settings-'+str(time.time_ns()))
 assert result['settingsHash']==PREP['settingsHash'] and result['active']==EXPECTED,'Creator settings changed since reviewed preflight'
 for p in ['model','providerOrder','bundles']:assert result.get(p)==BASE.get(p),'Runtime setting changed: '+p
 return result
def clear_requests(receipt):
 for r in receipt['results']:
  folder=ROOT/'data/_handover';req=folder/(r['slug']+'.request.json');res=folder/(r['slug']+'.result.json')
  if req.exists() and json.loads(req.read_text()).get('id')==r['id']:
   req.unlink()
   if res.exists() and json.loads(res.read_text()).get('id')==r['id']:res.unlink()
def check_holds(receipt):
 for r in receipt['results']:
  folder=ROOT/'data/_handover';req=json.loads((folder/(r['slug']+'.request.json')).read_text());res=json.loads((folder/(r['slug']+'.result.json')).read_text())
  at=datetime.datetime.fromisoformat(req['at'].replace('Z','+00:00')).timestamp()
  assert req['id']==res['id']==r['id'] and res['ok'] is True and time.time()-at<180,'Handover expired or changed'
def drain():
 source=r"""
import fs from 'node:fs';import path from 'node:path';import {config} from './src/config.ts';
import {pendingSlugs,runHandover,clearHandover,activeRequest,readResult} from './src/handover.ts';
if(pendingSlugs(config.dataDir).some(s=>activeRequest(config.dataDir,s)))throw Error('Another handover is in progress');
const r=await fetch(config.supabaseUrl+'/rest/v1/clones?engine=eq.v2&status=eq.active&select=id,slug',{headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey},signal:AbortSignal.timeout(15000)});
if(!r.ok)throw Error('Current fleet unreadable');const rows=await r.json();const expected=__EXPECTED__;
if(JSON.stringify(rows.map(x=>x.slug).sort())!==JSON.stringify(expected))throw Error('Fleet scope changed');
const state=JSON.parse(fs.readFileSync(path.join(config.dataDir,'_fleet.json'),'utf8'));
if(Date.now()-Date.parse(state.at)>90000||JSON.stringify(Object.keys(state.girls).sort())!==JSON.stringify(expected)||expected.some(s=>state.girls[s]?.status!=='running'))throw Error('Fresh running fleet required');
const begun=Date.now(),results=await Promise.all(rows.map(async row=>({slug:row.slug,...await runHandover(config.dataDir,row.slug)})));
let ok=results.every(x=>x.ok);
for(const x of results){const req=activeRequest(config.dataDir,x.slug),res=readResult(config.dataDir,x.slug,x.id);if(!req||!res||req.id!==x.id||Date.parse(res.at)<begun||Date.parse(res.at)<Date.parse(req.at)||res.detail?.drained!==true||res.detail?.owed!==0)ok=false;}
const open=[];
try{if(ok)for(const row of rows)for(const fn of ['v2credit_open_work','v2tip_open_work']){
 const res=await fetch(config.supabaseUrl+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey,'Content-Type':'application/json'},body:JSON.stringify({p_clone_id:row.id}),signal:AbortSignal.timeout(8000)});
 if(fn==='v2tip_open_work'&&res.status===404){open.push({slug:row.slug,kind:fn,notInstalled:true});continue;}
 const w=await res.json();open.push({slug:row.slug,kind:fn,...w});
 if(!res.ok||w.ok!==true||(fn==='v2credit_open_work'&&w.reserved_turns!==0)||Number(w.open_exceptions??0)!==0||Number(w.awaiting_receipt_refunds??0)!==0)ok=false;
}}catch(e){ok=false;open.push({error:String(e?.message??e).slice(0,160)});}
if(!ok)for(const x of results)if(activeRequest(config.dataDir,x.slug)?.id===x.id)clearHandover(config.dataDir,x.slug);
console.log('RELEASE_JSON '+JSON.stringify({ok,at:new Date().toISOString(),results,open}));
""".replace('__EXPECTED__',json.dumps(EXPECTED))
 receipt=node(source,'drain-'+str(time.time_ns()));save('drain-'+str(time.time_ns())+'.json',receipt)
 assert receipt['ok'],'Drain or financial verification failed; live image unchanged'
 assert sorted(r['slug'] for r in receipt['results'])==EXPECTED
 try:check_holds(receipt)
 except Exception:clear_requests(receipt);raise
 print('SHARED_RELEASE_PHASE '+json.dumps({'phase':'drained','creators':len(EXPECTED),'at':stamp()}),flush=True)
 return receipt
def observe(since):
 deadline=time.monotonic()+100
 while time.monotonic()<deadline:
  try:
   s=json.loads((ROOT/'data/_fleet.json').read_text());g=s.get('girls',{})
   if datetime.datetime.fromisoformat(s['at'].replace('Z','+00:00')).timestamp()>=since and sorted(g)==EXPECTED and all(g[k].get('status')=='running' and datetime.datetime.fromisoformat(g[k]['startedAt'].replace('Z','+00:00')).timestamp()>=since for k in EXPECTED):
    return {'at':s['at'],'girls':{k:{'status':g[k]['status'],'botUsername':g[k].get('botUsername'),'startedAt':g[k]['startedAt']} for k in EXPECTED}}
  except (FileNotFoundError,json.JSONDecodeError):pass
  time.sleep(2)
 raise RuntimeError('Fresh running fleet not observed')
def host_before():
 for p,h in json.loads((BACKUP/'runtime-source-hashes.json').read_text()).items():assert digest((ROOT/p).read_bytes())==h,'Pending host edit: '+p
 for c in CHANGES:
  p=ROOT/c['path'];assert (digest(p.read_bytes()) if p.is_file() else None)==c['oldSha256'],'Changed host file: '+c['path']
 for p in ['docker-compose.yml','photo-release.override.json']:assert (ROOT/p).read_bytes()==(BACKUP/p).read_bytes(),'Deployment config changed: '+p
def restore_code():
 for c in CHANGES:
  p=ROOT/c['path'];h=digest(p.read_bytes()) if p.is_file() else None
  assert h in [c['oldSha256'],c['newSha256']],'Concurrent host edit during rollback: '+c['path']
  if c['existed']:
   b=(BACKUP/'host-before'/c['path']).read_bytes();assert digest(b)==c['oldSha256'];atomic(p,b)
  elif p.exists():p.unlink()
 atomic(OVERRIDE,(BACKUP/'photo-release.override.json').read_bytes())
def rollback(receipt=None):
 settings();receipt=receipt or drain();check_holds(receipt)
 restore_code();since=time.time();compose();runtime(OLD_IMAGE,OLD_SHA);clear_requests(receipt)
 fleet=observe(since);settings()
 result={'rolledBackTo':OLD_SHA,'image':OLD_IMAGE,'fleet':fleet,'at':stamp(),'dataRestored':False}
 save('shared-rollback-result.json',result);print('SHARED_RELEASE_ROLLBACK_JSON '+json.dumps(result),flush=True)
def prompt_check():
 result=node(r"""
import fs from 'node:fs';import {createHash} from 'node:crypto';import {config} from './src/config.ts';import {render,renderParts,previewParts} from './src/girls/template.ts';import {priceFor} from './src/payments.ts';
const r=await fetch(config.supabaseUrl+'/rest/v1/clones?select=id,slug,name,engine,status,v2_vars,v2_credits_enabled,tips_enabled,v2_memory_enabled&order=slug',{headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey},signal:AbortSignal.timeout(15000)});
if(!r.ok)throw Error('Prompt settings unreadable');const rows=await r.json(),checks=[],health=[];
const sha=b=>createHash('sha256').update(b).digest('hex'),now=new Date(),sec=t=>t.slice(t.indexOf('PHOTOS AND VIDEOS'),t.indexOf('HARD LIMITS, NEVER CROSSED'));
for(const endpoint of ['/','/api/girls/details?girl=riley-mae-lewis']){const begun=Date.now(),r=await fetch('http://127.0.0.1:'+Number(process.env.DASH_PORT??4300)+endpoint,{signal:AbortSignal.timeout(10000)});await r.text();if(!r.ok)throw Error('Dashboard not healthy');health.push({endpoint,status:r.status,ms:Date.now()-begun});}
for(const row of rows.filter(r=>r.engine==='v2'&&r.status==='active')){
 const r=await fetch('http://127.0.0.1:'+Number(process.env.DASH_PORT??4300)+'/api/girls/details?girl='+encodeURIComponent(row.slug),{signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('Displayed prompt unreadable');const d=await r.json();
 checks.push({slug:row.slug,settingsHash:sha(JSON.stringify(row)),emojiPolicy:sha(row.v2_vars.EMOJIS??''),displayMatches:Array.isArray(d.parts)&&Array.isArray(d.errors)&&!d.errors.length&&sec(d.parts.filter(p=>!p.optional).map(p=>p.text).join(''))===sec(render(row.v2_vars,now)),previewMatches:JSON.stringify(previewParts(row.v2_vars,now))===JSON.stringify(renderParts(row.v2_vars,now)),testerPrice:priceFor(2700,{cloneId:row.id,telegramId:6814483810,kind:'photo'}),normalPrice:priceFor(2700,{cloneId:row.id,telegramId:6814483811,kind:'photo'})});
}
console.log('RELEASE_JSON '+JSON.stringify({at:new Date().toISOString(),health,settingsHash:sha(JSON.stringify(rows)),checks,modelCalls:0,messagesSent:0,databaseWrites:0}));
""",'deployed-prompts','twin-v2-dash-1')
 assert result['settingsHash']==PREP['settingsHash'] and sorted(c['slug'] for c in result['checks'])==EXPECTED
 old={c['slug']:c for c in BASE['checks']}
 for c in result['checks']:
  assert c['displayMatches'] and c['previewMatches'],'Prompt display mismatch: '+c['slug']
  for p in ['settingsHash','emojiPolicy','testerPrice','normalPrice']:assert c[p]==old[c['slug']][p],'Approved setting changed: '+c['slug']+'/'+p
 return result
def deploy():
 assert not (BACKUP/'shared-deployed.json').exists(),'Already deployed; inspect saved receipt'
 assert PREP['sha']==SHA and PREP['testedSource']==TESTED and PREP['oldSha']==OLD_SHA and PREP['oldImage']==OLD_IMAGE
 assert len(PREP['offline'])==23 and all(x['exit']==0 for x in PREP['offline']) and PREP['typecheck'] is True and PREP['modelCases']==39
 assert len(MANIFEST)==255 and out('docker','image','inspect','-f','{{.Id}}','twin-v2-shared:'+SHA)==IMAGE
 assert (BACKUP/'images.tar').stat().st_size>0 and (BACKUP/'runtime-code.tgz').stat().st_size>0
 runtime(OLD_IMAGE,OLD_SHA);settings();host_before()
 receipt=drain();released=False;switched=False;touched=False
 try:
  check_holds(receipt);settings();host_before()
  touched=True
  modes={x['path']:int(x['mode'],8)&0o777 for x in MANIFEST}
  for c in CHANGES:
   b=(RELEASE/c['path']).read_bytes();assert digest(b)==c['newSha256'];atomic(ROOT/c['path'],b,modes[c['path']])
  override=json.loads((BACKUP/'photo-release.override.json').read_text())
  for service in ['bot','dash']:
   s=override.setdefault('services',{}).setdefault(service,{})
   s['image']=IMAGE;s.setdefault('environment',{})['GIT_SHA']=SHA
  atomic(OVERRIDE,json.dumps(override,indent=2).encode());check_holds(receipt)
  since=time.time();switched=True;compose();runtime(IMAGE,SHA)
  packaged=[x for x in MANIFEST if not x['path'].startswith('archive/')]
  check="import fs from 'node:fs';import crypto from 'node:crypto';const items="+json.dumps(packaged)+";for(const x of items){const b=fs.readFileSync(x.path);if(crypto.createHash('sha1').update('blob '+b.length).update(Buffer.from([0])).update(b).digest('hex')!==x.sha)throw Error(x.path)}console.log('RELEASE_JSON '+JSON.stringify({verified:items.length}));"
  verified=node(check,'deployed-source');dash=node(check,'deployed-dashboard-source','twin-v2-dash-1');assert verified==dash
  check_holds(receipt);clear_requests(receipt);released=True
  fleet=observe(since);current=settings();prompts=prompt_check();runtime(IMAGE,SHA)
  result={'deployed':SHA,'testedSource':TESTED,'image':IMAGE,'at':stamp(),'fleet':fleet,'verifiedSourceFilesPerContainer':verified['verified'],'settings':current,'promptVerification':prompts,'offlineSuites':23,'typecheck':True,'realModelCases':39,'backup':str(BACKUP),'rollbackCommand':'python3 '+str(BACKUP/'deploy-shared-release.py')+' --rollback','newStateOrSchema':False,'proactiveFanMessages':0,'purchasesMade':0,'financialDataRestored':False,'actualTelegramVisibilityVerified':False}
  save('shared-deployed.json',result);print('SHARED_RELEASE_DEPLOYED_JSON '+json.dumps(result),flush=True)
 except Exception as e:
  save('shared-deploy-failed-'+str(time.time_ns())+'.json',{'at':stamp(),'error':str(e),'switched':switched,'released':released})
  if switched:rollback(None if released else receipt)
  else:
   if touched:restore_code()
   clear_requests(receipt)
  raise
if __name__=='__main__':
 if sys.argv[1:]==['--rollback']:runtime(IMAGE,SHA);rollback()
 elif not sys.argv[1:]:deploy()
 else:raise SystemExit('Unsupported action')
