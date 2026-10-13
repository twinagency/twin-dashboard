"""Bounded read-only observation of the deployed shared repair. No model calls or fan sends."""
import datetime,json,pathlib,subprocess,sys
ROOT=pathlib.Path('/home/ubuntu/twin-v2')
BACKUP=pathlib.Path('/home/ubuntu/twin-v2-backups/shared-photo-baseline-5e789f1-1791872165074291746')
SHA='2f24f023c0cf46bea1c3b3b334458cf1a5df265e'
deployed=json.loads((BACKUP/'shared-deployed.json').read_text());assert deployed['deployed']==SHA
expected=deployed['settings']['active'];errors=[];runtime=[]
now=datetime.datetime.now(datetime.timezone.utc)
for name in ['twin-v2-bot-1','twin-v2-dash-1']:
 info=json.loads(subprocess.check_output(['docker','inspect',name],text=True,timeout=15))[0]
 rev=next((x.split('=',1)[1] for x in info['Config']['Env'] if x.startswith('GIT_SHA=')),None)
 ok=info['State']['Running'] and info['Image']==deployed['image'] and rev==SHA
 runtime.append({'container':name,'running':info['State']['Running'],'image':info['Image'],'revision':rev,'matches':ok})
 if not ok:errors.append('runtime:'+name)
fleet=json.loads((ROOT/'data/_fleet.json').read_text())
age=(now-datetime.datetime.fromisoformat(fleet['at'].replace('Z','+00:00'))).total_seconds()
running=sorted(k for k,v in fleet['girls'].items() if v.get('status')=='running')
if not 0<=age<90 or running!=expected or sorted(fleet['girls'])!=expected:errors.append('fleet')
pending=[]
for p in (ROOT/'data/_handover').glob('*.request.json'):
 r=json.loads(p.read_text())
 if (now-datetime.datetime.fromisoformat(r['at'].replace('Z','+00:00'))).total_seconds()<300:pending.append(p.name)
if pending:errors.append('pending-handover')
source=r"""
import {createHash} from 'node:crypto';import {config} from './src/config.ts';
const r=await fetch(config.supabaseUrl+'/rest/v1/clones?select=id,slug,name,engine,status,v2_vars,v2_credits_enabled,tips_enabled,v2_memory_enabled&order=slug',{headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey},signal:AbortSignal.timeout(15000)});
if(!r.ok)throw Error('Settings unavailable');const rows=await r.json();
const h=await fetch('http://127.0.0.1:'+Number(process.env.DASH_PORT??4300)+'/',{signal:AbortSignal.timeout(8000)});await h.text();
console.log('READONLY_JSON '+JSON.stringify({settingsHash:createHash('sha256').update(JSON.stringify(rows)).digest('hex'),dashboardStatus:h.status}));
"""
p=subprocess.run(['docker','exec','-i','twin-v2-dash-1','node','--import','tsx','--input-type=module'],input=source,text=True,capture_output=True,timeout=40)
assert p.returncode==0,'Read-only configuration/HTTP probe failed'
live=json.loads(next(x[len('READONLY_JSON '):] for x in p.stdout.splitlines() if x.startswith('READONLY_JSON ')))
if live['settingsHash']!=deployed['settings']['settingsHash'] or live['dashboardStatus']!=200:errors.append('settings-or-dashboard')
since=min(datetime.datetime.fromisoformat(g['startedAt'].replace('Z','+00:00')) for g in deployed['fleet']['girls'].values())
traffic=[]
for slug in expected:
 path=ROOT/'logs'/slug/'requests.jsonl';rows=[];truncated=False
 if path.is_file():
  with path.open('rb') as f:
   size=path.stat().st_size;offset=max(0,size-2_000_000);f.seek(offset)
   if offset:f.readline();truncated=True
   for line in f:
    try:
     row=json.loads(line);at=datetime.datetime.fromisoformat(row['ts'].replace('Z','+00:00'))
     if at>=since:rows.append(row)
    except (ValueError,KeyError):pass
 outcomes={};routes={};notes={}
 for row in rows:
  route=row.get('route','unrecorded');routes[route]=routes.get(route,0)+1
  if row.get('note'):notes[row['note']]=notes.get(row['note'],0)+1
  for kind in ['text','media','recovery']:
   status=(row.get('delivery',{}).get(kind) or {}).get('status')
   if status:outcomes[kind+':'+status]=outcomes.get(kind+':'+status,0)+1
 traffic.append({'slug':slug,'turns':len(rows),'modelTurns':sum(r.get('modelRequest') is True for r in rows),'photoSelections':sum((r.get('selectedMedia') or {}).get('kind')=='photo' for r in rows),'photoAcknowledgements':sum((r.get('media') or {}).get('kind')=='photo' and (r.get('delivery',{}).get('media') or {}).get('status')=='acknowledged' for r in rows),'referenceTurns':sum(bool(r.get('photoReference')) for r in rows),'invalidSelections':sum(bool(r.get('selectionError')) for r in rows),'localDeliveryErrors':sum(bool(r.get('delivery',{}).get('error')) for r in rows),'outcomes':outcomes,'routes':routes,'notes':notes,'boundedTail':truncated})
result={'passed':not errors,'checkedAt':now.isoformat(),'runtime':runtime,'fleet':{'at':fleet['at'],'ageSeconds':round(age,1),'running':running},'pendingHandovers':pending,'live':live,'promptChecksAtDeployment':len(deployed['promptVerification']['checks']),'trafficSince':since.isoformat(),'traffic':traffic,'errors':errors,'additionalModelCalls':0,'proactiveMessagesSent':0,'purchasesMade':0,'databaseWrites':0,'actualFanVisibilityVerified':False}
print('SHARED_RELEASE_OBSERVED_JSON '+json.dumps(result),flush=True)
if errors:sys.exit(1)
