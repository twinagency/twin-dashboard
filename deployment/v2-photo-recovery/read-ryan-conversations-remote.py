"""Read existing V2 test-account records only; no models, messages, or production writes."""
import base64, datetime, gzip, json, pathlib, subprocess, time, urllib.request

ROOT = pathlib.Path('/home/ubuntu/twin-v2')
FAN = '6814483810'
START = '2026-10-13T13:30:00'
EXPECTED = ['alanna-pow','allison-parker','bethany-marquez','briana-redd','cat-chase','dakota-lyn','dreka-cakez','fit-sid','kyla-yesenosky','mrs-callace','olivia-jade','riley-mae-lewis','sania-mallory','tammy','toochi','trashy','tru-kait']
SCOPED = EXPECTED
fleet = json.loads((ROOT/'data/_fleet.json').read_text())
runtime = []
for name in ['twin-v2-bot-1','twin-v2-dash-1']:
    raw = json.loads(subprocess.check_output(['docker','inspect',name],text=True,timeout=10))[0]
    runtime.append({'name':name,'running':raw['State']['Running'],'image':raw['Image'],
        'startedAt':raw['State'].get('StartedAt'),'restartCount':raw.get('RestartCount'),
        'revision':next((v[8:] for v in raw['Config'].get('Env',[]) if v.startswith('GIT_SHA=')),None),
        'ports':raw['NetworkSettings'].get('Ports')})
health = {}
for address in ['127.0.0.1','172.31.6.134']:
    try:
        with urllib.request.urlopen('http://'+address+':4300/',timeout=4) as r:health[address]=r.status
    except Exception as e:health[address]=type(e).__name__+': '+str(e)[:160]

def selected(row):
    return {key:row.get(key) for key in ['ts','turnId','chatId','fanText','final','selection','selectionError','selectedMedia','media','delivery','photoReference','grounding','note','epoch','route','mode','photoAlternative'] if key in row}

creators = []
for slug in SCOPED:
    path = ROOT/'logs'/slug/'requests.jsonl'
    latest = None
    rows = []
    earliest = None
    offset = 0
    malformed = 0
    if path.is_file():
        with path.open('rb') as f:
            offset = max(0,path.stat().st_size-32_000_000)
            f.seek(offset)
            if offset:f.readline()
            for line in f:
                try:row=json.loads(line)
                except ValueError:
                    malformed+=1
                    continue
                ts=str(row.get('ts',''))
                if ts and (earliest is None or ts<earliest):earliest=ts
                if str(row.get('chatId'))!=FAN:continue
                if ts>=START:rows.append(selected(row))
                elif latest is None or ts>str(latest.get('ts','')):latest=selected(row)
    creators.append({'slug':slug,'exists':path.is_file(),'boundedTail':offset>0,'earliestRead':earliest,
        'malformed':malformed,'postCutoffCount':len(rows),'turns':rows,'latestBeforeCutoff':latest})
result={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'fan':FAN,'since':START,
    'runtime':runtime,'monitorHealth':health,'fleetAt':fleet.get('at'),
    'fleet':{s:{'status':v.get('status'),'error':v.get('error')} for s,v in fleet.get('girls',{}).items()},
    'creators':creators,'modelCalls':0,'telegramCalls':0,'productionWrites':0}
packed=base64.b64encode(gzip.compress(json.dumps(result,separators=(',',':')).encode())).decode()
assert len(packed)<23000,'Scoped result exceeds transport; no partial evidence emitted'
print('RYAN_REVIEW_GZIP '+packed)
