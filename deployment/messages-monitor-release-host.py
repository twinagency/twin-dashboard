"""Replace only the monitor's fan reader on its exact current image; retain bot runtime."""
import hashlib,json,pathlib,subprocess,time,urllib.request
ROOT=pathlib.Path('/home/ubuntu/twin-v2')
payload=json.loads(pathlib.Path('/tmp/messages-monitor-patch.json').read_text())
revision=hashlib.sha256(json.dumps(payload,sort_keys=True).encode()).hexdigest()[:20]
release=pathlib.Path('/home/ubuntu/twin-v2-backups/messages-load-20261022')/revision
release.mkdir(parents=True,exist_ok=True)
override=ROOT/'photo-release.override.json'
def inspect(name):return json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]
def runtime(name):
 r=inspect(name);assert r['State']['Running'],name+' not running'
 return {'id':r['Id'],'image':r['Image']}
def sha(data):return hashlib.sha256(data).hexdigest()
def atomic(file,data):
 file.parent.mkdir(parents=True,exist_ok=True);tmp=file.with_name(file.name+'.messages-tmp');tmp.write_bytes(data);tmp.replace(file)
def compose():subprocess.run(['docker','compose','-p','twin-v2','-f',str(ROOT/'docker-compose.yml'),'-f',str(override),'up','-d','--no-build','--no-deps','dash'],check=True,timeout=90)
def verify():
 for attempt in range(20):
  try:
   with urllib.request.urlopen('http://127.0.0.1:4300/',timeout=2) as ready:assert ready.status==200
   break
  except (OSError,AssertionError):
   if attempt==19:raise
   time.sleep(0.5)
 # Populate the fleet once after restart. Later calls keep the incremental
 # offsets and validate changed chat files and receipts on every read.
 with urllib.request.urlopen('http://127.0.0.1:4300/api/girls',timeout=90) as r:creators=json.load(r)
 selected={};report=[]
 for creator in creators:
  slug=creator.get('slug','')
  if creator.get('engine')!='v2':continue
  assert slug and all(c.isalnum() or c=='-' for c in slug)
  started=time.monotonic()
  with urllib.request.urlopen('http://127.0.0.1:4300/api/fans?girl='+slug,timeout=60) as r:rows=json.load(r)
  assert isinstance(rows,list)
  elapsed=round((time.monotonic()-started)*1000)
  print(json.dumps({'preparedCreator':slug,'fans':len(rows),'ms':elapsed}),flush=True)
  if rows:
   fan=next((row for row in rows if str(row.get('chatId','')).isdigit()),None)
   if fan:selected[slug]=(str(fan['chatId']),elapsed,len(rows))
 for slug,(fan_id,elapsed,count) in selected.items():
  url='http://127.0.0.1:4300/api/chat-history?girl='+slug+'&chatId='+fan_id
  with urllib.request.urlopen(url,timeout=60) as r:history=json.load(r)
  assert history.get('scope')=='all-stored' and history.get('days') is None
  start=time.monotonic()
  with urllib.request.urlopen(url,timeout=8) as r:again=json.load(r)
  assert again.get('scope')=='all-stored' and again.get('days') is None
  report.append({'creator':slug,'fans':count,'initialFanReadMs':elapsed,'warmHistoryMs':round((time.monotonic()-start)*1000),'history':'all-stored'})
 assert 'briana-redd' in selected and 'fit-sid' in selected,'Existing creator histories verified'
 print(json.dumps({'historyIndexesPrepared':len(selected)}),flush=True)
 # A second whole-fleet pass must remain responsive after more than six
 # creators were read; this is the production regression that was failing.
 start=time.monotonic()
 for creator in creators:
  if creator.get('engine')!='v2':continue
  with urllib.request.urlopen('http://127.0.0.1:4300/api/fans?girl='+creator['slug'],timeout=8) as r:assert isinstance(json.load(r),list)
 print(json.dumps({'repeatFleetReadMs':round((time.monotonic()-start)*1000),'creatorSummariesRetained':True}),flush=True)
 print(subprocess.check_output(['docker','stats','--no-stream','--format','{{.Name}} CPU={{.CPUPerc}} MEM={{.MemUsage}}','twin-v2-dash-1','twin-v2-bot-1'],text=True),flush=True)
 return report
# Recover only the exact failed rollback state from this rollout. A different
# current configuration, image or bot is a concurrent release, so refuse it.
if (release/'before.json').exists():
 previous=json.loads((release/'before.json').read_text())
 saved=(release/'override-before.json').read_bytes()
 current_dash=runtime('twin-v2-dash-1')
 if current_dash['image']!=previous['dash']['image'] and override.read_bytes()==saved:
  saved_settings=json.loads(saved)
  saved_image=saved_settings['services']['dash']['image']
  saved_id=subprocess.check_output(['docker','image','inspect','-f','{{.Id}}',saved_image],text=True).strip()
  if current_dash['image']==saved_id:
   assert runtime('twin-v2-bot-1')==previous['bot'],'Concurrent bot release'
   saved_settings['services']['dash']['image']=previous['dash']['image']
   atomic(override,json.dumps(saved_settings,indent=2).encode());compose()
   assert runtime('twin-v2-dash-1')['image']==previous['dash']['image']
   print(json.dumps({'exactPreviousMonitorRestored':True,'botUnchanged':True}),flush=True)
before_bot=runtime('twin-v2-bot-1');before_dash=runtime('twin-v2-dash-1')
old_history=subprocess.check_output(['docker','exec','twin-v2-dash-1','cat','/app/dashboard/history.ts'])
settings=dict(e.split('=',1) for e in inspect('twin-v2-dash-1')['Config']['Env'])
if settings.get('MONITOR_LOAD_REVISION')==revision:
 recorded=json.loads((release/'result.json').read_text())
 actual=subprocess.check_output(['docker','exec','twin-v2-dash-1','cat','/app/dashboard/server.ts'])
 print(json.dumps({'currentSource':sha(actual),'recordedSource':recorded['serverSha256'],'patchPresence':[{'old':actual.decode().count(patch['old']),'new':actual.decode().count(patch['new'])} for patch in payload['patches']],'monitorImage':before_dash['image']}),flush=True)
 assert sha(actual)==recorded['serverSha256'],'Monitor source changed after this release'
 if payload.get('history'):assert sha(old_history)==recorded['historySha256'],'History source changed after this release'
 verified=verify();assert runtime('twin-v2-bot-1')==before_bot,'Concurrent bot release'
 print(json.dumps({'alreadyDeployed':revision,'verified':verified,'botUnchanged':True}));raise SystemExit(0)
old_server=subprocess.check_output(['docker','exec','twin-v2-dash-1','cat','/app/dashboard/server.ts'])
assert sha(old_server)==payload['expectedServerSha256'],'Monitor source changed since inspection'
source=old_server.decode()
for patch in payload['patches']:
 assert source.count(patch['old'])==1,'Fan reader changed since inspection'
 source=source.replace(patch['old'],patch['new'],1)
new_server=source.encode();old_override=override.read_bytes()
new_history=old_history
if payload.get('history'):
 h=payload['history'];assert sha(old_history)==h['expectedSha256'],'History source changed since inspection'
 text=old_history.decode();assert text.count(h['old'])==1,'History cache setting changed'
 new_history=text.replace(h['old'],h['new'],1).encode()
host_server=ROOT/'dashboard/server.ts';old_host=host_server.read_bytes()
# Preserve a separate host checkout; the running image is the deployment base.
new_host=old_host
if payload.get('patchHostHunks'):
 host_text=old_host.decode()
 for patch in payload['patches']:
  if host_text.count(patch['old'])==1:host_text=host_text.replace(patch['old'],patch['new'],1)
  elif host_text.count(patch['new'])!=1:print(json.dumps({'separateHostCheckoutPreserved':True}),flush=True)
 new_host=host_text.encode()
elif old_host==old_server:new_host=new_server
update_host=new_host!=old_host
host_history=ROOT/'dashboard/history.ts';old_host_history=host_history.read_bytes();new_host_history=old_host_history
if payload.get('history'):
 h=payload['history'];text=old_host_history.decode()
 if text.count(h['old'])==1:new_host_history=text.replace(h['old'],h['new'],1).encode()
update_history_host=new_host_history!=old_host_history
assert inspect('twin-v2-dash-1')['Config']['Labels']['com.docker.compose.project.config_files']==str(ROOT/'docker-compose.yml')+','+str(override)
for file,data in [('server-before.ts',old_server),('override-before.json',old_override),('before.json',json.dumps({'bot':before_bot,'dash':before_dash}).encode())]:atomic(release/file,data)
atomic(release/'server.ts',new_server)
atomic(release/'parity.cjs',pathlib.Path('/tmp/messages-monitor-parity.cjs').read_bytes())
atomic(release/'fleet-cache.cjs',pathlib.Path('/tmp/messages-monitor-fleet-cache.cjs').read_bytes())
atomic(release/'history-cache.cjs',pathlib.Path('/tmp/messages-history-cache.cjs').read_bytes())
atomic(release/'history.ts',new_history)
atomic(release/'history-before.ts',old_history)
atomic(release/'Dockerfile',b'ARG BASE_IMAGE\nFROM ${BASE_IMAGE}\nCOPY server.ts /app/dashboard/server.ts\nCOPY server-before.ts /app/deployment/messages-monitor-original.source\nCOPY parity.cjs /app/deployment/messages-monitor-parity.cjs\nCOPY fleet-cache.cjs /app/deployment/messages-monitor-fleet-cache.cjs\nCOPY history.ts /app/dashboard/history.ts\nCOPY history-before.ts /app/deployment/messages-history-original.source\nCOPY history-cache.cjs /app/deployment/messages-history-cache.cjs\n')
tag='twin-monitor-messages:'+revision
subprocess.run(['docker','build','--network=none','--build-arg','BASE_IMAGE='+before_dash['image'],'-t',tag,str(release)],check=True,timeout=120)
if payload.get('kind')=='fan-metadata':
 subprocess.run(['docker','run','--rm','--network=none','-e','MONITOR_INCREMENTAL=1','-e','MONITOR_ORIGINAL=/app/deployment/messages-monitor-original.source','-e','MONITOR_CANDIDATE=/app/dashboard/server.ts','--entrypoint','node',tag,'deployment/messages-monitor-parity.cjs'],check=True,timeout=45)
subprocess.run(['docker','run','--rm','--network=none','-e','MONITOR_ORIGINAL=/app/deployment/messages-monitor-original.source','-e','MONITOR_CANDIDATE=/app/dashboard/server.ts','--entrypoint','node',tag,'deployment/messages-monitor-fleet-cache.cjs'],check=True,timeout=45)
if payload.get('history'):
 subprocess.run(['docker','run','--rm','--network=none','-e','MONITOR_CANDIDATE=/app/dashboard/history.ts','--entrypoint','node',tag,'deployment/messages-history-cache.cjs'],check=True,timeout=45)
subprocess.run(['docker','run','--rm','--network=none','--entrypoint','node',tag,'--import','tsx','scripts/check-dashboard-history.ts'],check=True,timeout=45)
image=subprocess.check_output(['docker','image','inspect','-f','{{.Id}}',tag],text=True).strip()
assert runtime('twin-v2-bot-1')==before_bot and runtime('twin-v2-dash-1')==before_dash,'Concurrent runtime change'
assert override.read_bytes()==old_override and host_server.read_bytes()==old_host and host_history.read_bytes()==old_host_history,'Concurrent deployment edit'
try:
 updated=json.loads(old_override);dash=updated.setdefault('services',{}).setdefault('dash',{});dash['image']=image;dash.setdefault('environment',{})['MONITOR_LOAD_REVISION']=revision
 if update_host:atomic(host_server,new_host)
 if update_history_host:atomic(host_history,new_host_history)
 atomic(override,json.dumps(updated,indent=2).encode());compose()
 assert runtime('twin-v2-dash-1')['image']==image
 report=verify();assert runtime('twin-v2-bot-1')==before_bot,'Bot runtime changed'
 result={'monitorLoadRevision':revision,'serverSha256':sha(new_server),'historySha256':sha(new_history),'verified':report,'botUnchanged':True,'hostSourcePreserved':not update_host,'hostHunksUpdated':bool(payload.get('patchHostHunks') and update_host),'backup':str(release)}
 atomic(release/'result.json',json.dumps(result).encode());print(json.dumps(result))
except Exception:
 # Undo only this rollout's own state. A concurrent deployment is preserved.
 if update_host and host_server.read_bytes()==new_host:atomic(host_server,old_host)
 if update_history_host and host_history.read_bytes()==new_host_history:atomic(host_history,old_host_history)
 if runtime('twin-v2-dash-1')['image']==image and override.read_bytes()==json.dumps(updated,indent=2).encode():
  rollback=json.loads(old_override);rollback.setdefault('services',{}).setdefault('dash',{})['image']=before_dash['image']
  atomic(override,json.dumps(rollback,indent=2).encode());compose()
  assert runtime('twin-v2-dash-1')['image']==before_dash['image']
  print(json.dumps({'monitorRolledBack':True,'botUnchanged':runtime('twin-v2-bot-1')==before_bot}))
 else:print(json.dumps({'concurrentMonitorReleasePreserved':True}))
 raise
