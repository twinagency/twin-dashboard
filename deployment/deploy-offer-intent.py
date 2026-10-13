"""Deploy the approved, packaged reply repair; preserve current fleet, data and prices."""
import datetime,hashlib,json,pathlib,subprocess,sys,time,urllib.request,uuid
SHA='e8eed505d5a1c5ef53938b2dee90a09bce26ea38'
TESTED='e8eed505d5a1c5ef53938b2dee90a09bce26ea38'
OLD_SHA='e668afb2936f25106b5ba0772096f7dfac029224'
OLD_IMAGE='sha256:7924fdc85e91ca2c3d4b4cf9363cf71ba99a6d1a163fd5b6834d4aad37e8f084'
EXPECTED_IMAGE='sha256:93045f957470052893cc1a8e0ecd2819b9b8069397c4b84b55f34e8de9aac879'
EXPECTED_RELEASE='/home/ubuntu/twin-v2-offer-releases/e8eed505d5a1c5ef53938b2dee90a09bce26ea38'
ROOT=pathlib.Path('/home/ubuntu/twin-v2')
BACKUP=pathlib.Path('/home/ubuntu/twin-v2-backups/offer-baseline-e8eed50-1791928294895468670')
PREP=json.loads((BACKUP/'reply-prepared.json').read_text())
BASE=json.loads((BACKUP/'release-preflight.json').read_text())
IMAGE=PREP['image'];assert IMAGE==EXPECTED_IMAGE,'Prepared image changed';RELEASE=pathlib.Path(PREP['release']);assert str(RELEASE)==EXPECTED_RELEASE,'Prepared release path changed'
MANIFEST=json.loads((BACKUP/'release-manifest.json').read_text())
CHANGES=json.loads((BACKUP/'host-changes.json').read_text())
EXPECTED=PREP['expectedSlugs'];OVERRIDE=ROOT/'photo-release.override.json'
EXPECTED_CHANGES=['scripts/check-existing-card-discussion.ts', 'src/tips/policy.ts']
CONTAINERS=['twin-v2-bot-1','twin-v2-dash-1']
def stamp():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def digest(b):return hashlib.sha256(b).hexdigest()
def out(*a):return subprocess.check_output(a,text=True).strip()
def save(name,value):
 p=BACKUP/name;p.write_text(json.dumps(value,indent=2));p.chmod(0o600)
def node(source,label,container='twin-v2-bot-1',timeout=210):
 r=subprocess.run(['docker','exec','-i',container,'node','--import','tsx','--input-type=module'],input=source,text=True,capture_output=True,timeout=timeout)
 p=BACKUP/('reply-'+label+'.log');p.write_text(r.stdout+r.stderr);p.chmod(0o600)
 if r.returncode:raise RuntimeError(label+' failed; private log retained')
 lines=[x[len('RELEASE_JSON '):] for x in r.stdout.splitlines() if x.startswith('RELEASE_JSON ')]
 assert len(lines)==1,label+' missing result'
 return json.loads(lines[0])
def runtime(image,revision):
 for name in CONTAINERS:
  info=json.loads(out('docker','inspect',name))[0]
  assert info['State']['Running'] and info['Image']==image and 'GIT_SHA='+revision in info['Config']['Env'],'Runtime changed: '+name
def running(name='twin-v2-bot-1'):
 try:
  state=json.loads(out('docker','inspect',name))[0]['State'];return state['Running'] is True and state.get('Restarting') is not True and state.get('Status')=='running'
 except Exception:return False
def stop_bot():
 # A restarting container is not equivalent to a stopped process. Stop it explicitly before an unheld baseline restore.
 stopped=subprocess.run(['docker','stop','--time','20','twin-v2-bot-1'],text=True,capture_output=True,timeout=35)
 assert stopped.returncode==0 or 'No such container' in stopped.stderr,'Bot container could not be stopped'
 inspected=subprocess.run(['docker','inspect','twin-v2-bot-1'],text=True,capture_output=True,timeout=10)
 if inspected.returncode==0:
  state=json.loads(inspected.stdout)[0]['State'];assert state['Running'] is False and state.get('Restarting') is not True,'Bot container did not stop'
 else:assert 'No such object' in inspected.stderr or 'No such container' in inspected.stderr,'Bot container stop could not be verified'
def compose():
 r=subprocess.run(['docker','compose','-p','twin-v2','-f',str(ROOT/'docker-compose.yml'),'-f',str(OVERRIDE),'up','-d','--no-build'],text=True,capture_output=True,timeout=90)
 (BACKUP/('compose-'+str(time.time_ns())+'.log')).write_text(r.stdout+r.stderr)
 assert r.returncode==0,'Compose failed; private log retained'
def atomic(p,b,mode=None):
 p.parent.mkdir(parents=True,exist_ok=True)
 temp=p.with_name(p.name+'.reply-release-tmp');temp.write_bytes(b)
 temp.chmod(mode if mode is not None else (p.stat().st_mode&0o777 if p.exists() else 0o644));temp.replace(p)
def settings():
 result=node(r"""
import {createHash} from 'node:crypto';import {config} from './src/config.ts';
const r=await fetch(config.supabaseUrl+'/rest/v1/clones?select=id,slug,name,engine,status,v2_vars,v2_credits_enabled,tips_enabled,v2_memory_enabled&order=slug',{headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey},signal:AbortSignal.timeout(15000)});
if(!r.ok)throw Error('Current settings unreadable');const rows=await r.json();
console.log('RELEASE_JSON '+JSON.stringify({settingsHash:createHash('sha256').update(JSON.stringify(rows)).digest('hex'),active:rows.filter(x=>x.engine==='v2'&&x.status==='active').map(x=>x.slug).sort(),model:config.model,providerOrder:config.providerOrder,bundles:process.env.V2_BUNDLES}));
""",'settings-'+str(time.time_ns()),timeout=60)
 assert result['settingsHash']==PREP['settingsHash'] and result['active']==EXPECTED,'Creator settings changed since reviewed preflight'
 for p in ['model','providerOrder','bundles']:assert result.get(p)==BASE.get(p),'Runtime setting changed: '+p
 return result
def clear_requests(receipt):
 for r in receipt['results']:
  folder=ROOT/'data/_handover';req=folder/(r['slug']+'.request.json');res=folder/(r['slug']+'.result.json')
  if req.exists() and json.loads(req.read_text()).get('id')==r['id']:
   req.unlink()
   if res.exists() and json.loads(res.read_text()).get('id')==r['id']:res.unlink()
NO_RUNNER='no runner is running for this creator, nothing to drain'
def held(detail,allow_no_runner=False):
 return (detail.get('drained') is True and detail.get('owed')==0) or (allow_no_runner and detail.get('note')==NO_RUNNER)
def check_holds(receipt,allow_no_runner=False):
 for r in receipt['results']:
  folder=ROOT/'data/_handover';req=json.loads((folder/(r['slug']+'.request.json')).read_text());res=json.loads((folder/(r['slug']+'.result.json')).read_text())
  at=datetime.datetime.fromisoformat(req['at'].replace('Z','+00:00')).timestamp()
  detail=res.get('detail') or {}
  assert req['id']==res['id']==r['id'] and res['ok'] is True and held(detail,allow_no_runner) and time.time()-at<180,'Handover expired or changed'
def renew_holds(receipt):
 check_holds(receipt);now=stamp()
 for r in receipt['results']:
  p=ROOT/'data/_handover'/(r['slug']+'.request.json');req=json.loads(p.read_text());assert req['id']==r['id'];atomic(p,json.dumps({'id':r['id'],'at':now}).encode())
 check_holds(receipt)
def drain(require_running=True):
 source=r"""
import fs from 'node:fs';import path from 'node:path';import {config} from './src/config.ts';
import {pendingSlugs,runHandover,clearHandover,activeRequest,readResult} from './src/handover.ts';
if(pendingSlugs(config.dataDir).some(s=>activeRequest(config.dataDir,s)))throw Error('Another handover is in progress');
const r=await fetch(config.supabaseUrl+'/rest/v1/clones?engine=eq.v2&status=eq.active&select=id,slug',{headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey},signal:AbortSignal.timeout(15000)});
if(!r.ok)throw Error('Current fleet unreadable');const rows=await r.json(),expected=__EXPECTED__,requireRunning=__REQUIRE_RUNNING__;
if(JSON.stringify(rows.map(x=>x.slug).sort())!==JSON.stringify(expected))throw Error('Fleet scope changed');
if(requireRunning){const state=JSON.parse(fs.readFileSync(path.join(config.dataDir,'_fleet.json'),'utf8'));if(Date.now()-Date.parse(state.at)>90000||JSON.stringify(Object.keys(state.girls).sort())!==JSON.stringify(expected)||expected.some(s=>state.girls[s]?.status!=='running'))throw Error('Fresh running fleet required');}
const begun=Date.now(),results=await Promise.all(rows.map(async row=>({slug:row.slug,...await runHandover(config.dataDir,row.slug)})));
let ok=results.every(x=>x.ok);
for(const x of results){const req=activeRequest(config.dataDir,x.slug),res=readResult(config.dataDir,x.slug,x.id),d=res?.detail??{},stopped=(d.drained===true&&d.owed===0)||(!requireRunning&&d.note==='no runner is running for this creator, nothing to drain');if(!req||!res||req.id!==x.id||Date.parse(res.at)<begun||Date.parse(res.at)<Date.parse(req.at)||!stopped)ok=false;}
const open=[];
try{if(ok)for(const row of rows)for(const fn of ['v2credit_open_work','v2tip_open_work']){
 const res=await fetch(config.supabaseUrl+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey,'Content-Type':'application/json'},body:JSON.stringify({p_clone_id:row.id}),signal:AbortSignal.timeout(8000)});
 const w=await res.json();open.push({slug:row.slug,kind:fn,...w});
 if(!res.ok||w.ok!==true||(fn==='v2credit_open_work'&&w.reserved_turns!==0)||Number(w.open_exceptions??0)!==0||Number(w.awaiting_receipt_refunds??0)!==0)ok=false;
}}catch(e){ok=false;open.push({error:String(e?.message??e).slice(0,160)});}
if(!ok&&requireRunning)for(const x of results)if(activeRequest(config.dataDir,x.slug)?.id===x.id)clearHandover(config.dataDir,x.slug);
console.log('RELEASE_JSON '+JSON.stringify({ok,at:new Date().toISOString(),results,open}));
""".replace('__EXPECTED__',json.dumps(EXPECTED)).replace('__REQUIRE_RUNNING__','true' if require_running else 'false')
 label=('drain-' if require_running else 'recovery-drain-')+str(time.time_ns())
 receipt=node(source,label);save(label+'.json',receipt)
 assert receipt['ok'],'Drain or financial verification failed; live image unchanged'
 assert sorted(r['slug'] for r in receipt['results'])==EXPECTED
 try:check_holds(receipt,not require_running)
 except Exception:
  if require_running:clear_requests(receipt)
  raise
 print('REPLY_RELEASE_PHASE '+json.dumps({'phase':'drained','creators':len(EXPECTED),'at':stamp()}),flush=True)
 return receipt
def financial_gate(receipt):
 assert len(receipt['results'])==len(EXPECTED) and len(receipt['open'])==len(EXPECTED)*2,'Incomplete drain/financial scope'
 owed=sum(int((x.get('detail') or {}).get('owed',-1)) for x in receipt['results'])
 credits=[x for x in receipt['open'] if x.get('kind')=='v2credit_open_work'];tips=[x for x in receipt['open'] if x.get('kind')=='v2tip_open_work']
 assert len(credits)==len(tips)==len(EXPECTED),'Incomplete financial RPC scope'
 reserved=sum(int(x.get('reserved_turns',-1)) for x in credits)
 exceptions=sum(int(x.get('open_exceptions',-1)) for x in receipt['open'])
 refunds=sum(int(x.get('awaiting_receipt_refunds',-1)) for x in receipt['open'])
 assert owed==reserved==exceptions==refunds==0,'Financial gate changed after drain'
 return {'creators':len(EXPECTED),'drained':len(receipt['results']),'owed':owed,'reservedTurns':reserved,'openExceptions':exceptions,'awaitingReceiptRefunds':refunds,'rpcChecks':len(receipt['open'])}
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
def finish_rollback(receipt):
 # Restore first: this path must work even when a partial compose left the candidate bot unavailable.
 restore_code();since=time.time();compose();runtime(OLD_IMAGE,OLD_SHA)
 clear_requests(receipt);fleet=observe(since);current=settings()
 result={'rolledBackTo':OLD_SHA,'image':OLD_IMAGE,'fleet':fleet,'settings':current,'at':stamp(),'dataRestored':False}
 save('reply-rollback-result.json',result);print('REPLY_RELEASE_ROLLBACK_JSON '+json.dumps(result),flush=True)
 return result
def rollback_held(receipt):
 # The original verified requests stay present while host code and the saved baseline image are restored.
 try:check_holds(receipt)
 except Exception:
  if running():
   clear_requests(receipt);return finish_rollback(drain(False))
  stop_bot();return finish_rollback(receipt)
 return finish_rollback(receipt)
def rollback_stopped():
 # With the bot process positively stopped, no in-memory runner can accept new work during restoration.
 restore_code();since=time.time();compose();runtime(OLD_IMAGE,OLD_SHA);fleet=observe(since);current=settings()
 result={'rolledBackTo':OLD_SHA,'image':OLD_IMAGE,'fleet':fleet,'settings':current,'at':stamp(),'dataRestored':False,'candidateBotWasStopped':True}
 save('reply-rollback-result.json',result);print('REPLY_RELEASE_ROLLBACK_JSON '+json.dumps(result),flush=True)
 return result
def rollback_released():
 # Once the original requests were released, reacquire a verified drain without requiring every runner to be healthy.
 if running():return finish_rollback(drain(False))
 stop_bot();return rollback_stopped()
def rollback():
 runtime(IMAGE,SHA);settings();return finish_rollback(drain())
def prompt_check():
 result=node(r"""
import fs from 'node:fs';import {createHash} from 'node:crypto';import {config} from './src/config.ts';import {render,renderParts,previewParts} from './src/girls/template.ts';import {priceFor} from './src/payments.ts';
const r=await fetch(config.supabaseUrl+'/rest/v1/clones?select=id,slug,name,engine,status,v2_vars,v2_credits_enabled,tips_enabled,v2_memory_enabled&order=slug',{headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey},signal:AbortSignal.timeout(15000)});
if(!r.ok)throw Error('Prompt settings unreadable');const rows=await r.json(),checks=[],health=[];
const sha=b=>createHash('sha256').update(b).digest('hex'),now=new Date();
for(const endpoint of ['/','/api/girls/details?girl=riley-mae-lewis']){const begun=Date.now(),r=await fetch('http://127.0.0.1:'+Number(process.env.DASH_PORT??4300)+endpoint,{signal:AbortSignal.timeout(10000)});await r.text();if(!r.ok)throw Error('Dashboard not healthy');health.push({endpoint,status:r.status,ms:Date.now()-begun});}
for(const row of rows.filter(r=>r.engine==='v2'&&r.status==='active')){
 const r=await fetch('http://127.0.0.1:'+Number(process.env.DASH_PORT??4300)+'/api/girls/details?girl='+encodeURIComponent(row.slug),{signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('Displayed prompt unreadable');const d=await r.json();
 checks.push({slug:row.slug,settingsHash:sha(JSON.stringify(row)),emojiPolicy:sha(row.v2_vars.EMOJIS??''),displayMatches:Array.isArray(d.parts)&&Array.isArray(d.errors)&&!d.errors.length&&d.parts.filter(p=>!p.optional).map(p=>p.text).join('')===render(row.v2_vars,now),previewMatches:JSON.stringify(previewParts(row.v2_vars,now))===JSON.stringify(renderParts(row.v2_vars,now)),testerPrice:priceFor(2700,{cloneId:row.id,telegramId:6814483810,kind:'photo'}),normalPrice:priceFor(2700,{cloneId:row.id,telegramId:6814483811,kind:'photo'})});
}
console.log('RELEASE_JSON '+JSON.stringify({at:new Date().toISOString(),health,settingsHash:sha(JSON.stringify(rows)),checks,modelCalls:0,messagesSent:0,databaseWrites:0}));
""",'deployed-prompts','twin-v2-dash-1',170)
 assert result['settingsHash']==PREP['settingsHash'] and sorted(c['slug'] for c in result['checks'])==EXPECTED
 old={c['slug']:c for c in BASE['checks']}
 for c in result['checks']:
  assert c['displayMatches'] and c['previewMatches'],'Prompt display mismatch: '+c['slug']
  for p in ['settingsHash','emojiPolicy','testerPrice','normalPrice']:assert c[p]==old[c['slug']][p],'Approved setting changed: '+c['slug']+'/'+p
 return result
def dashboard_readiness():
 # If the monitor is not ready after compose, restart only that same candidate container
 # once during the held/drained window, then require the actual HTTP prompt gate.
 def healthy():
  try:
   with urllib.request.urlopen('http://127.0.0.1:4300/',timeout=4) as r:return r.status==200
  except Exception:return False
 before=healthy();restarted=False
 if not before:
  subprocess.run(['docker','restart','--time','15','twin-v2-dash-1'],check=True,capture_output=True,timeout=45);restarted=True
 deadline=time.monotonic()+35
 while time.monotonic()<deadline:
  if healthy():return {'beforeHealthy':before,'sameCandidateImageRestarted':restarted,'afterHealthy':True,'at':stamp()}
  time.sleep(1)
 raise RuntimeError('Dashboard readiness remains unavailable; prompt gate not bypassed')
def deploy():
 deployed=BACKUP/'reply-deployed.json'
 if deployed.exists():
  prior=json.loads(deployed.read_text());assert prior.get('deployed')==SHA and prior.get('testedSource')==TESTED and prior.get('image')==IMAGE,'Different deployment receipt already exists'
  runtime(IMAGE,SHA);current=settings();assert current['settingsHash']==prior['settings']['settingsHash'],'Deployed settings changed'
  print('REPLY_RELEASE_ALREADY_DEPLOYED '+json.dumps({'deployed':SHA,'image':IMAGE,'at':stamp()}),flush=True);return prior
 assert PREP['sha']==SHA and PREP['testedSource']==TESTED and PREP['oldSha']==OLD_SHA and PREP['oldImage']==OLD_IMAGE
 assert PREP.get('rollbackReady') is True and PREP['rollback']['baselineRevision']==OLD_SHA and PREP['rollback']['image']==OLD_IMAGE
 assert len(PREP['offline'])==25 and all(x['exit']==0 for x in PREP['offline']) and PREP['typecheck'] is True and PREP['focusedAssertions']==1260
 assert len(MANIFEST)==291 and out('docker','image','inspect','-f','{{.Id}}','twin-v2-offer:'+SHA)==IMAGE
 assert sorted(x['path'] for x in CHANGES)==EXPECTED_CHANGES and len(CHANGES)==2,'Prepared host change scope changed'
 assert (BACKUP/'images.tar').stat().st_size>0 and (BACKUP/'runtime-code.tgz').stat().st_size>0
 runtime(OLD_IMAGE,OLD_SHA);settings();host_before()
 receipt=drain();financial=financial_gate(receipt);released=False;switched=False;touched=False;phase='drained'
 try:
  phase='final-preflight'
  check_holds(receipt);settings();host_before()
  touched=True
  modes={x['path']:int(x['mode'],8)&0o777 for x in MANIFEST}
  for c in CHANGES:
   b=(RELEASE/c['path']).read_bytes();assert digest(b)==c['newSha256'];atomic(ROOT/c['path'],b,modes[c['path']])
  override=json.loads((BACKUP/'photo-release.override.json').read_text())
  for service in ['bot','dash']:
   s=override.setdefault('services',{}).setdefault(service,{})
   s['image']=IMAGE;s.setdefault('environment',{})['GIT_SHA']=SHA
  atomic(OVERRIDE,json.dumps(override,indent=2).encode());renew_holds(receipt)
  phase='candidate-compose';since=time.time();switched=True;compose();runtime(IMAGE,SHA);renew_holds(receipt)
  packaged=[x for x in MANIFEST if not x['path'].startswith('archive/')]
  check="import fs from 'node:fs';import crypto from 'node:crypto';const items="+json.dumps(packaged)+";for(const x of items){const b=fs.readFileSync(x.path);if(crypto.createHash('sha1').update('blob '+b.length).update(Buffer.from([0])).update(b).digest('hex')!==x.sha)throw Error(x.path)}console.log('RELEASE_JSON '+JSON.stringify({verified:items.length}));"
  verified=node(check,'deployed-source',timeout=90);renew_holds(receipt)
  dash=node(check,'deployed-dashboard-source','twin-v2-dash-1',90);assert verified==dash;renew_holds(receipt)
  phase='candidate-verification';readiness=dashboard_readiness();renew_holds(receipt)
  prompts=prompt_check();renew_holds(receipt);current=settings();runtime(IMAGE,SHA);renew_holds(receipt)
  phase='handover-release'
  clear_requests(receipt);released=True
  phase='fleet-restart';fleet=observe(since);current=settings();runtime(IMAGE,SHA)
  result={'deployed':SHA,'testedSource':TESTED,'image':IMAGE,'at':stamp(),'cutover':{'baselineRevision':OLD_SHA,'baselineImage':OLD_IMAGE,'candidateRevision':SHA,'candidateImage':IMAGE,'release':str(RELEASE),'hostChanges':EXPECTED_CHANGES,'holdsMaintainedUntilVerification':True,'holdsReleased':True},'financialGate':financial,'fleet':fleet,'verifiedSourceFilesPerContainer':verified['verified'],'settings':current,'promptVerification':prompts,'dashboardReadiness':readiness,'offlineSuites':25,'typecheck':True,'realModelCases':0,'focusedAssertions':1260,'modelTransport':'mocked','backup':str(BACKUP),'rollbackCommand':'python3 '+str(BACKUP/'deploy-offer-intent.py')+' --rollback','rollbackTriggered':False,'newDatabaseSchema':False,'newOptionalChatField':None,'proactiveFanMessages':0,'purchasesMade':0,'financialDataRestored':False,'actualTelegramVisibilityVerified':False}
  save('reply-deployed.json',result);print('REPLY_RELEASE_DEPLOYED_JSON '+json.dumps(result),flush=True)
 except Exception as e:
  failure={'at':stamp(),'phase':phase,'error':str(e),'switched':switched,'released':released,'rollback':'not-started'}
  failed_name='reply-deploy-failed-'+str(time.time_ns())+'.json';save(failed_name,failure)
  try:
   if switched:
    failure['rollback']='started';rollback_released() if released else rollback_held(receipt);failure['rollback']='complete'
   else:
    if touched:restore_code()
    clear_requests(receipt);failure['rollback']='not-required'
  except Exception as recovery:
   failure['rollback']='failed';failure['rollbackError']=str(recovery);save(failed_name,failure)
   raise RuntimeError('Deployment failed during '+phase+' and rollback failed; inspect retained private receipt') from recovery
  save(failed_name,failure);raise
if __name__=='__main__':
 if sys.argv[1:]==['--rollback']:runtime(IMAGE,SHA);rollback()
 elif not sys.argv[1:]:deploy()
 else:raise SystemExit('Unsupported action')

