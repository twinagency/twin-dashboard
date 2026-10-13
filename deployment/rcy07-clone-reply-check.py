"""Read-only diagnosis for Jesse's five named clones and his @rcy07 account.
No model calls, messages, restarts, database writes, or production file changes.
"""
import json,pathlib,shlex,subprocess,time
REMOTE=r'''
import collections,datetime,json,pathlib,re,subprocess
ROOT=pathlib.Path('/home/ubuntu/twin-v2')
FAN='6814483810'
SLUGS=['alanna-pow','sania-mallory','tammy','tru-kait','bethany-marquez']
SINCE='2026-10-13T06:20:00'
def readjson(p):
 try:return json.loads(p.read_text())
 except (OSError,ValueError):return None
def tail(p,cap):
 try:
  with p.open('rb') as f:
   size=p.stat().st_size;start=max(0,size-cap);f.seek(start)
   if start:f.readline()
   raw=f.read(cap)
  return raw.decode('utf8','replace').splitlines(),size,start>0
 except OSError:return [],0,False
def safe(s,n=350):
 return re.sub(r'\b\d{7,}:[A-Za-z0-9_-]{20,}\b','[redacted]',str(s))[:n]
out={'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'read_only':True,'creators':[]}
fleet=readjson(ROOT/'data/_fleet.json') or {}
out['fleet_at']=fleet.get('at')
out['pending_handover_files']=[p.name for p in (ROOT/'data/_handover').glob('*.request.json')]
out['containers']=[]
for name in ['twin-v2-bot-1','twin-v2-dash-1']:
 try:
  d=json.loads(subprocess.check_output(['docker','inspect',name],text=True,timeout=10))[0]
  out['containers'].append({'name':name,'running':d['State']['Running'],'oom':d['State'].get('OOMKilled'),'restart_count':d.get('RestartCount'),'started':d['State'].get('StartedAt'),'revision':next((x.split('=',1)[1] for x in d['Config']['Env'] if x.startswith('GIT_SHA=')),None)})
 except Exception as e:out['containers'].append({'name':name,'error':type(e).__name__})
for slug in SLUGS:
 c={'slug':slug,'runtime':{k:v for k,v in fleet.get('girls',{}).get(slug,{}).items() if k in ['status','startedAt','botUsername','error']}}
 p=ROOT/'data'/slug/(FAN+'.json')
 chat=readjson(p)
 if chat is None:c['personal_chat']={'exists':False}
 else:
  owners=readjson(ROOT/'data'/slug/'_business.json') or {}
  c['personal_chat']={'exists':True,'updated':datetime.datetime.fromtimestamp(p.stat().st_mtime,datetime.timezone.utc).isoformat(),'who':chat.get('who'),'bcid':chat.get('bcid'),'epoch':chat.get('epoch'),'ageConfirmed':chat.get('ageConfirmed'),'history_count':len(chat.get('history',[])),'history_roles':[m.get('role') for m in chat.get('history',[])[-6:]],'last_fan_inputs':[safe(m.get('content'),120) for m in chat.get('history',[]) if m.get('role')=='user'][-3:],'owner_is_personal_account':str(owners.get(chat.get('bcid'))) == FAN}
 rows,size,bounded=tail(ROOT/'logs'/slug/'requests.jsonl',20*1024*1024)
 valid=[]
 for line in rows:
  try:
   r=json.loads(line)
   if r.get('mode')!='simulated':valid.append(r)
  except ValueError:pass
 recent=[r for r in valid if str(r.get('ts',''))>=SINCE]
 mine=[r for r in valid if str(r.get('chatId'))==FAN]
 c['turn_scan']={'file_bytes':size,'bounded_tail':bounded,'first_scanned_at':valid[0].get('ts') if valid else None,'last_scanned_at':valid[-1].get('ts') if valid else None,'turns_since_1620':len(recent),'reply_outcomes':dict(collections.Counter(str((r.get('delivery') or {}).get('text',{}).get('status')) for r in recent)),'personal_count_in_scan':len(mine)}
 c['personal_turns']=[]
 for r in mine[-12:]:
  d=r.get('delivery') or {}
  c['personal_turns'].append({'ts':r.get('ts'),'fan':safe(r.get('fanText'),140),'note':safe(r.get('note'),180),'bcid':r.get('bcid') or (r.get('route') or {}).get('bcid'),'error':safe(d.get('error'),180) if d.get('error') else None,'outcomes':{k:{a:safe(v.get(a),180) for a in ['status','description','error','messageId'] if v.get(a) is not None} for k,v in d.items() if k in ['text','media','recovery'] and isinstance(v,dict)}})
 blocks,_,_=tail(ROOT/'logs'/slug/'blocked.jsonl',2*1024*1024)
 c['personal_blocks']=[]
 for line in blocks:
  try:
   r=json.loads(line)
   if str(r.get('chatId'))==FAN:c['personal_blocks'].append({k:safe(v,180) for k,v in r.items() if k in ['ts','chatId','reason','rule','category','text','fanText']})
  except ValueError:pass
 c['personal_blocks']=c['personal_blocks'][-8:]
 out['creators'].append(c)
try:
 logs=subprocess.check_output(['docker','logs','--since','2026-10-13T06:20:00Z','--tail','2500','twin-v2-bot-1'],stderr=subprocess.STDOUT,text=True,timeout=15).splitlines()
 out['scoped_runtime_errors']=[safe(x,280) for x in logs if ((FAN in x and re.search(r'error|fail|blocked|denied|start|reset',x,re.I)) or ('getBusinessConnection failed' in x and any(slug in x for slug in SLUGS)))][-15:]
except Exception as e:out['scoped_runtime_errors']=[type(e).__name__]
print('CLONE_REPLY_DIAGNOSIS '+json.dumps(out,separators=(',',':')))
'''
INSTANCE='i-0584d283506f3f6be'
command='python3 -c '+shlex.quote(REMOTE)
params=pathlib.Path('/tmp/rcy07-clone-reply-check.json')
params.write_text(json.dumps({'commands':[command],'executionTimeout':['120']}))
cid=subprocess.check_output(['aws','ssm','send-command','--instance-ids',INSTANCE,'--document-name','AWS-RunShellScript','--parameters','file://'+str(params),'--comment','Read-only named clone and personal-account reply diagnosis','--query','Command.CommandId','--output','text'],text=True).strip()
print(json.dumps({'command_id':cid}),flush=True)
for attempt in range(50):
 try:r=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id',INSTANCE,'--output','json'],text=True,stderr=subprocess.DEVNULL))
 except subprocess.CalledProcessError:time.sleep(3);continue
 if r['Status'] in ['Success','Failed','Cancelled','TimedOut']:
  print(r.get('StandardOutputContent',''),flush=True)
  if r['Status']!='Success':print(r.get('StandardErrorContent','')[-1000:]);raise RuntimeError(r['Status'])
  break
 time.sleep(3)
else:raise RuntimeError('Read-only diagnostic timed out')
