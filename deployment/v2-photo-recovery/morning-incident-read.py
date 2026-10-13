import datetime,hashlib,json,pathlib,subprocess
root=pathlib.Path('/home/ubuntu/twin-v2')
backup=pathlib.Path('/home/ubuntu/twin-v2/data/_operator_backups/photo-incident-20261013-morning');backup.mkdir(mode=0o700,parents=True,exist_ok=True)
runtime=[]
for name in ['twin-v2-bot-1','twin-v2-dash-1']:
 p=json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]
 runtime.append({'container':name,'running':p['State']['Running'],'image':p['Image'],'revision':next((x.split('=',1)[1] for x in p['Config']['Env'] if x.startswith('GIT_SHA=')),None),'startedAt':p['State']['StartedAt']})
print(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runtime':runtime}),flush=True)
p=root/'logs/riley-mae-lewis/requests.jsonl'
rows=[]
with p.open() as f:
 for line in f:
  try:r=json.loads(line)
  except:continue
  if str(r.get('chatId'))=='6814483810' and r.get('ts','')>='2026-10-13T00:10:00':rows.append(r)
out=backup/'riley-morning-requests.json';out.write_text(json.dumps(rows));out.chmod(0o600)
print(json.dumps({'retainedRecords':len(rows),'privateEvidence':str(out),'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}),flush=True)
for r in rows[-12:]:
 print(json.dumps({k:r.get(k) for k in ['ts','turnId','fanText','raw','generated','final','photoRequest','selectedMedia','media','grounding','note','route','modelRequest','attempts']}|{'menu':[{'key':m.get('key'),'slot':m.get('slot'),'desc':m.get('desc','')[:650]} for m in r.get('menu',[])],'delivery':r.get('delivery')}),flush=True)
fleet=json.loads((root/'data/_fleet.json').read_text())
print(json.dumps({'fleetAt':fleet.get('at'),'fleet':{k:{'status':v.get('status'),'startedAt':v.get('startedAt')} for k,v in fleet.get('girls',{}).items()}}),flush=True)
