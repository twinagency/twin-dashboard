"""Deploy or roll back the already verified image using the existing V2 handover."""
import datetime,hashlib,json,pathlib,shutil,subprocess,sys,time
SHA="bcc68c7e801ad65310f43f4a4ce09f05d3e3b4f7"
OLD_SHA='45931b6f56db9f97cc8406154e35a0d216f5de65'
ROOT=pathlib.Path('/home/ubuntu/twin-v2')
BACKUP=pathlib.Path('/home/ubuntu/twin-v2-backups/photo-recovery-20261013')
RELEASE=pathlib.Path('/home/ubuntu/twin-v2-photo-recovery-releases')/SHA
OLD=json.loads((BACKUP/'images.json').read_text())
PREP=json.loads((BACKUP/(SHA+'-prepared.json')).read_text())
IMAGE=PREP['image']
MANIFEST=json.loads((BACKUP/(SHA+'-source-manifest.json')).read_text())
EXPECTED_SLUGS=sorted(['sania-mallory','kyla-yesenosky','riley-mae-lewis','briana-redd','fit-sid','mrs-callace'])
OVERRIDE=ROOT/'photo-release.override.json'
def out(*args):return subprocess.check_output(args,text=True).strip()
def node(source,label):
 r=subprocess.run(['docker','exec','-i','twin-v2-bot-1','node','--import','tsx','--input-type=module'],input=source,text=True,capture_output=True,timeout=210)
 (BACKUP/(label+'.log')).write_text(r.stdout+r.stderr)
 if r.returncode:raise RuntimeError(label+' failed: '+r.stderr[-650:])
 records=[line[len('RELEASE_JSON '):] for line in r.stdout.splitlines() if line.startswith('RELEASE_JSON ')]
 assert len(records)==1,label+' missing result'
 return json.loads(records[0])
def runtime(image,revision):
 for name in OLD:
  assert out('docker','inspect','-f','{{.State.Running}}',name)=='true'
  assert out('docker','inspect','-f','{{.Image}}',name)==image,'Runtime changed: '+name
  assert out('docker','exec',name,'printenv','GIT_SHA')==revision,'Revision changed: '+name
def compose():
 subprocess.run(['docker','compose','-p','twin-v2','-f',str(ROOT/'docker-compose.yml'),'-f',str(OVERRIDE),'up','-d','--no-build'],check=True,timeout=90)
def atomic_file(p,b):
 temp=p.with_name(p.name+'.recovery-release-tmp');temp.write_bytes(b);temp.replace(p)
def clear_requests(receipt):
 for r in receipt['results']:
  folder=ROOT/'data/_handover';req=folder/(r['slug']+'.request.json')
  if req.exists() and json.loads(req.read_text()).get('id')==r['id']:
   req.unlink();(folder/(r['slug']+'.result.json')).unlink(missing_ok=True)
def check_holds(receipt):
 for r in receipt['results']:
  folder=ROOT/'data/_handover';req=json.loads((folder/(r['slug']+'.request.json')).read_text());res=json.loads((folder/(r['slug']+'.result.json')).read_text())
  at=datetime.datetime.fromisoformat(req['at'].replace('Z','+00:00')).timestamp()
  assert req['id']==res['id']==r['id'] and res['ok'] is True and time.time()-at<180,'Handover expired or changed'
def settings():
 source=r"""
import fs from 'node:fs';import {config} from './src/config.ts';
const r=await fetch(config.supabaseUrl+'/rest/v1/clones?engine=eq.v2&status=eq.active&select=id,slug,name,engine,status,v2_credits_enabled,tips_enabled,v2_memory_enabled,vision_model,photo_vision_model,sell_via_mini_app,v2_vars',{headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey},signal:AbortSignal.timeout(15000)});
if(!r.ok)throw Error('Current fleet settings unreadable');
const rows=await r.json();if(rows.some(x=>x.v2_credits_enabled||x.tips_enabled||x.v2_memory_enabled))throw Error('Optional feature switches changed');
if(process.env.V2_BUNDLES!=='off')throw Error('Bundle switch changed');
console.log('RELEASE_JSON '+JSON.stringify(rows));
"""
 rows=node(source,'settings-'+str(time.time_ns()))
 before=json.loads((BACKUP/'fleet-settings.json').read_text())
 assert sorted(x['slug'] for x in rows)==EXPECTED_SLUGS
 assert sorted(rows,key=lambda x:x['id'])==sorted(before,key=lambda x:x['id']),'Creator settings changed since release preparation'
 return rows
def drain():
 source=r"""
import fs from 'node:fs';import path from 'node:path';
import {config} from './src/config.ts';import {pendingSlugs,runHandover,clearHandover,activeRequest,readResult} from './src/handover.ts';
if(pendingSlugs(config.dataDir).length)throw Error('Another handover is in progress');
const r=await fetch(config.supabaseUrl+'/rest/v1/clones?engine=eq.v2&status=eq.active&select=id,slug',{headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey},signal:AbortSignal.timeout(15000)});
if(!r.ok)throw Error('Current fleet unreadable');
const rows=await r.json();const expected=['sania-mallory','kyla-yesenosky','riley-mae-lewis','briana-redd','fit-sid','mrs-callace'].sort();
if(JSON.stringify(rows.map(x=>x.slug).sort())!==JSON.stringify(expected))throw Error('Fleet scope changed');
const state=JSON.parse(fs.readFileSync(path.join(config.dataDir,'_fleet.json'),'utf8'));
if(Date.now()-Date.parse(state.at)>90000)throw Error('Stale fleet status');
const begun=Date.now(),results=await Promise.all(rows.map(async row=>({slug:row.slug,...await runHandover(config.dataDir,row.slug)})));
let ok=results.every(x=>x.ok);
for(const x of results){const req=activeRequest(config.dataDir,x.slug),res=readResult(config.dataDir,x.slug,x.id);if(!req||!res||req.id!==x.id||Date.parse(res.at)<begun||Date.parse(res.at)<Date.parse(req.at)||res.detail?.drained!==true||res.detail?.owed!==0)ok=false;}
const open=[];
try {
if(ok)for(const row of rows)for(const fn of ['v2credit_open_work','v2tip_open_work']){
 const res=await fetch(config.supabaseUrl+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey,'Content-Type':'application/json'},body:JSON.stringify({p_clone_id:row.id}),signal:AbortSignal.timeout(8000)});
 if(fn==='v2tip_open_work'&&res.status===404){open.push({slug:row.slug,kind:fn,notInstalled:true});continue;}
 const w=await res.json();open.push({slug:row.slug,kind:fn,...w});
 if(!res.ok||w.ok!==true||(fn==='v2credit_open_work'&&w.reserved_turns!==0)||Number(w.open_exceptions??0)!==0||Number(w.awaiting_receipt_refunds??0)!==0)ok=false;
}
} catch(e) {ok=false;open.push({error:String(e?.message??e).slice(0,160)});}
if(!ok)for(const x of results)clearHandover(config.dataDir,x.slug);
console.log('RELEASE_JSON '+JSON.stringify({ok,at:new Date().toISOString(),results,open}));
"""
 receipt=node(source,'drain-'+str(time.time_ns()))
 (BACKUP/('drain-'+str(time.time_ns())+'.json')).write_text(json.dumps(receipt,indent=2))
 assert receipt['ok'],'Drain or financial open-work verification failed; live image was not replaced'
 assert sorted(r['slug'] for r in receipt['results'])==EXPECTED_SLUGS
 check_holds(receipt)
 print(json.dumps({'verifiedDrain':True,'creators':EXPECTED_SLUGS}),flush=True)
 return receipt
def observe(since):
 deadline=time.monotonic()+100
 while time.monotonic()<deadline:
  try:
   s=json.loads((ROOT/'data/_fleet.json').read_text())
   fresh=datetime.datetime.fromisoformat(s['at'].replace('Z','+00:00')).timestamp()>=since
   g=s.get('girls',{})
   if fresh and sorted(g)==EXPECTED_SLUGS and all(g[k].get('status')=='running' and datetime.datetime.fromisoformat(g[k]['startedAt'].replace('Z','+00:00')).timestamp()>=since for k in EXPECTED_SLUGS):
    assert all(g[k].get('credits',{}).get('enabled') is not True and g[k].get('tips',{}).get('enabled') is not True and g[k].get('memory',{}).get('enabled') is not True for k in EXPECTED_SLUGS)
    return {'at':s['at'],'girls':{k:{'status':g[k]['status'],'botUsername':g[k].get('botUsername'),'startedAt':g[k]['startedAt']} for k in EXPECTED_SLUGS}}
  except (FileNotFoundError,json.JSONDecodeError):pass
  time.sleep(2)
 raise RuntimeError('Fresh running fleet not observed')
def restore_code():
 # Code/config only; financial records, data, logs and live chat history are explicitly excluded.
 subprocess.run(['tar','xzf',str(BACKUP/'code.tgz'),'--exclude=./data','--exclude=./logs','--exclude=./.env','-C',str(ROOT)],check=True,timeout=90)
 atomic_file(OVERRIDE,(BACKUP/'photo-release.override.json').read_bytes())
def rollback(receipt=None):
 runtime(IMAGE,SHA)
 receipt=receipt or drain()
 check_holds(receipt);restore_code();since=time.time();compose()
 runtime(OLD['twin-v2-bot-1'],OLD_SHA)
 clear_requests(receipt)
 observed=observe(since);settings()
 result={'rolledBackTo':OLD_SHA,'image':OLD['twin-v2-bot-1'],'fleet':observed,'dataRestored':False}
 (BACKUP/'rollback-result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
def deploy():
 runtime(OLD['twin-v2-bot-1'],OLD_SHA);settings()
 assert PREP['sha']==SHA and all(x['exit']==0 for x in PREP['offline'])
 real=json.loads(pathlib.Path(PREP['realModelResults']).read_text());assert len(real['results'])==13 and all(x['pass'] for x in real['results'])
 assert out('docker','image','inspect','-f','{{.Id}}','twin-v2-photo-recovery:'+SHA)==IMAGE
 assert (BACKUP/'images.tar').stat().st_size>0 and (BACKUP/'code.tgz').stat().st_size>0
 paths=[x['path'] for x in MANIFEST if x['path'].startswith(('src/','dashboard/')) or x['path'] in ['package.json','package-lock.json','Dockerfile','docker-compose.yml','tsconfig.json']]
 source="import fs from 'node:fs';import crypto from 'node:crypto';console.log('RELEASE_JSON '+JSON.stringify(Object.fromEntries("+json.dumps(paths)+".map(p=>[p,fs.existsSync(p)?crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null]))));"
 current=node(source,'before-source')
 for p,h in current.items():
  if h is not None:assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h,'Newer host edit: '+p
  elif (ROOT/p).exists():raise RuntimeError('Untracked host file would be overwritten: '+p)
 for p in ['docker-compose.yml','photo-release.override.json']:
  assert (ROOT/p).read_bytes()==(BACKUP/p).read_bytes(),'Deployment configuration changed: '+p
 receipt=drain();released=False;switched=False
 try:
  check_holds(receipt)
  for x in MANIFEST:
   p=x['path'];b=(RELEASE/p).read_bytes();assert hashlib.sha1(b'blob '+str(len(b)).encode()+bytes([0])+b).hexdigest()==x['sha']
   target=ROOT/p;target.parent.mkdir(parents=True,exist_ok=True);atomic_file(target,b)
  override=json.loads((BACKUP/'photo-release.override.json').read_text())
  for service in ['bot','dash']:
   s=override.setdefault('services',{}).setdefault(service,{})
   s['image']=IMAGE;s.setdefault('environment',{})['GIT_SHA']=SHA
  atomic_file(OVERRIDE,json.dumps(override,indent=2).encode())
  since=time.time();switched=True;compose();runtime(IMAGE,SHA)
  check="import fs from 'node:fs';import crypto from 'node:crypto';const items="+json.dumps(MANIFEST)+";for(const x of items){const b=fs.readFileSync(x.path);if(crypto.createHash('sha1').update('blob '+b.length).update(Buffer.from([0])).update(b).digest('hex')!==x.sha)throw Error(x.path)}console.log('RELEASE_JSON '+JSON.stringify({verified:items.length}));"
  verified=node(check,'candidate-source')
  check_holds(receipt);clear_requests(receipt);released=True
  fleet=observe(since);settings()
  result={'deployed':SHA,'image':IMAGE,'fleet':fleet,'verifiedSourceFiles':verified['verified'],'backup':str(BACKUP),'rollbackCommand':'python3 '+str(BACKUP/'deploy.py')+' --rollback','proactiveFanMessages':0,'financialDataRestored':False}
  (BACKUP/'deployed.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
 except Exception:
  if switched:
   if released:rollback()
   else:
    check_holds(receipt);restore_code();since=time.time();compose();runtime(OLD['twin-v2-bot-1'],OLD_SHA);clear_requests(receipt);observe(since)
  else:clear_requests(receipt)
  raise
if __name__=='__main__':
 if sys.argv[1:]==['--rollback']:rollback()
 elif not sys.argv[1:]:deploy()
 else:raise SystemExit('Unsupported release action')
