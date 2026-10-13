"""Read-only final stage check. No writes, model calls, fan sends, restart or deployment."""
import datetime, hashlib, json, pathlib, re, subprocess, sys
ROOT = pathlib.Path('/home/ubuntu/twin-v2')
INCIDENT = ROOT / 'data/_operator_backups/photo-incident-20261013-morning'
REVISION = '86b0ad199ea33fd7855f1c0dd54cc355f706e7f5'
BACKUP = pathlib.Path('/home/ubuntu/twin-v2-backups/photo-reference-86b0ad1-20261013')
DEPLOYED = json.loads((BACKUP/'deployed.json').read_text())
assert DEPLOYED['deployed']==REVISION
IMAGE = DEPLOYED['image']
# Only three reviewed all-time dashboard history files differ from the rollback image.
DASHBOARD_IMAGE = IMAGE
CANDIDATE = '5228ff383628382ee1366d319c39e3f27b052c02'
# Frozen from the reviewed structured-source/manifest.json for this exact candidate.
SOURCE_HASHES = {'src/llm.ts': 'd735ae7df3a36944ce6f43bd55b88f0baea55465eeae5f8aebfdc26abce56193', 'src/turn.ts': 'bc3b960eeb89cf5b54bf43cbad52670666a7f3e787a9537f3ab7684a2de58972', 'src/media.ts': '0465e0e986fce439b4ffc2bfb77991d938c98365be0d990568527f9c67ec0c78', 'src/girls/template.ts': 'b29a51d2d17799e6a054f0df2d0d0ed4f42a6c8a0c4c688599ce53de7386bc4d', 'src/memory.ts': '261d1af5ce647e93b58572f353086b553191ed74acef81b59edfb2e084b40e98', 'src/deliver.ts': '355b87bbbfe4b034b511a5574334bfe49cd587deeec258deeebc64cea12770ff', 'src/payments.ts': '26261db531ef0293c82fcebbb394f64aec46ba597fbd0d57974585c9c3d4421d', 'src/runner.ts': '8ac43eb24c092fa235ba0dd26465ade9e24f26f2a02070ad25be11d636afd454', 'src/bundle-offers.ts': 'f16cb2a67bb55ddac9498ab4568548682fe2fa953134397f1d94b5cf96387e99', 'src/grounding.ts': '139a7334647d4feb3f40b7cbd883d51edf8e8f7a2e9601ffa2c1b93c56a6107e'}
FIXTURE_HASH = '43e21019a2c33d1e840c81ec6d683cf7bb6546f68e1de4106db9218b6d3bd253'
errors = []
runtime = []
def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)
for name in ['twin-v2-bot-1', 'twin-v2-dash-1']:
    try:
        info = json.loads(subprocess.check_output(['docker', 'inspect', name], text=True, stderr=subprocess.DEVNULL, timeout=15))[0]
        revision = next((entry.split('=', 1)[1] for entry in info['Config']['Env'] if entry.startswith('GIT_SHA=')), None)
        checked = bool(info['State']['Running']) and revision == REVISION and info['Image'] == (DASHBOARD_IMAGE if name == 'twin-v2-dash-1' else IMAGE)
        runtime.append({'container': name, 'running': bool(info['State']['Running']), 'revision': revision, 'image': info['Image'], 'matchesApprovedRelease': checked})
        if not checked:
            errors.append('approved-runtime-drift:' + name)
    except Exception:
        errors.append('runtime-unreadable:' + name)
fixture_preserved = False
expected_active = []
try:
    expected = json.loads((INCIDENT / 'current-settings.json').read_text())
    expected_active = sorted(row['slug'] for row in expected if row['engine'] == 'v2' and row['status'] == 'active')
    fixture_preserved = hashlib.sha256((INCIDENT / 'riley-morning-requests.json').read_bytes()).hexdigest() == FIXTURE_HASH
    if not fixture_preserved:
        errors.append('frozen-incident-hash-changed')
except Exception:
    errors.append('frozen-baseline-unreadable')

# Existing process environment is reused inside the established dashboard runtime.
# This script only GETs current rows and the local displayed prompt; secrets/profile text never leave it.
js = r"""
import fs from 'node:fs'; import path from 'node:path';
import {config} from './src/config.ts';
import {render} from './src/girls/template.ts';
import {priceFor} from './src/payments.ts';
const result = {errors:[], settingsPreserved:false, bundles:process.env.V2_BUNDLES, model:config.model, providerOrder:config.providerOrder, results:[], mrsCallaceOnV2:false, saniaPaused:false, trashy:{checked:false}};
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const equal = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const getRows = async query => {
  const response = await fetch(config.supabaseUrl + '/rest/v1/clones?' + query, {headers:{apikey:config.supabaseKey, Authorization:'Bearer ' + config.supabaseKey}, signal:AbortSignal.timeout(15000)});
  if(!response.ok) throw new Error('read-failed');
  const rows = await response.json(); if(!Array.isArray(rows)) throw new Error('invalid-rows'); return rows;
};
try {
  const before = JSON.parse(fs.readFileSync(path.join(config.dataDir,'_operator_backups/photo-incident-20261013-morning/current-settings.json'),'utf8'));
  const fields='id,slug,name,engine,status,v2_credits_enabled,tips_enabled,v2_memory_enabled,vision_model,photo_vision_model,sell_via_mini_app,v2_vars';
  const rows=await getRows('or=(engine.eq.v2,slug.eq.sania-mallory)&select=' + fields);
  const sorted = list => [...list].sort((a,b)=>a.id.localeCompare(b.id));
  result.settingsPreserved=equal(sorted(rows),sorted(before));
  result.currentActive=rows.filter(row=>row.engine==='v2' && row.status==='active').map(row=>row.slug).sort();
  if(!result.settingsPreserved) {
    result.errors.push('creator-settings-drift');
    const byId=new Map(before.map(row=>[row.id,row]));
    result.changedCreators=rows.filter(row=>!equal(row,byId.get(row.id))).map(row=>row.slug);
    result.removedCreators=before.filter(row=>!rows.some(current=>current.id===row.id)).map(row=>row.slug);
  }
  if(process.env.V2_BUNDLES!=='off') result.errors.push('bundle-switch-drift');
  const mrs=rows.find(row=>row.slug==='mrs-callace'), sania=rows.find(row=>row.slug==='sania-mallory');
  result.mrsCallaceOnV2=!!mrs && mrs.engine==='v2' && mrs.status==='active';
  result.saniaPaused=!!sania && sania.engine==='v2' && sania.status==='paused';
  if(!result.mrsCallaceOnV2) result.errors.push('mrs-callace-assignment-drift');
  if(!result.saniaPaused) result.errors.push('sania-assignment-drift');
  for(const row of rows.filter(row=>row.engine==='v2' && row.status==='active')){
    const testerPrice=priceFor(2700,{cloneId:row.id,telegramId:6814483810,kind:'photo'});
    const normalPrice=priceFor(2700,{cloneId:row.id,telegramId:6814483811,kind:'photo'});
    const priceScopeMatches=testerPrice===(['riley-mae-lewis','kyla-yesenosky'].includes(row.slug)?5:2700) && normalPrice===2700;
    const checked={slug:row.slug,testerPrice,normalPrice,priceScopeMatches};
    result.results.push(checked);
    if(!priceScopeMatches) result.errors.push('tester-price-drift:'+row.slug);
    try {
      const response=await fetch('http://127.0.0.1:'+Number(process.env.DASH_PORT??4300)+'/api/girls/details?girl='+encodeURIComponent(row.slug),{signal:AbortSignal.timeout(8000)});
      checked.httpStatus=response.status;
      if(!response.ok) throw new Error('display-unreadable');
      const display=await response.json();
      checked.hasParts=Array.isArray(display.parts);
      const displayed=display.parts.filter(part=>!part.optional).map(part=>part.text).join('');
      const actual=render(row.v2_vars);
      const section=text=>{const start=text.indexOf('PHOTOS AND VIDEOS'),end=text.indexOf('HARD LIMITS, NEVER CROSSED');return start>=0 && end>start ? text.slice(start,end):'';};
      const promptDisplayMatches=Array.isArray(display.errors) && display.errors.length===0 && section(actual).length>100 && section(displayed)===section(actual);
      checked.promptDisplayMatches=promptDisplayMatches;
      if(!promptDisplayMatches) result.errors.push('prompt-display-drift:'+row.slug);
    } catch(error) { checked.errorClass=error?.name??'Error'; checked.errorCode=error?.cause?.code??null; result.errors.push('prompt-check-unreadable:'+row.slug); }
  }
} catch { result.errors.push('current-settings-check-unreadable'); }
try {
  // Database enum is live|v2: twin-bot db/migrations/20261008130000_clone_engine_v2.sql.
  // 'live' assigns the legacy V1 runtime; this checks assignment, not that separate runtime's health.
  const matches=await getRows('or=(slug.ilike.*trashy*,name.ilike.*trashy*)&select=id,slug,name,engine,status&limit=10');
  const exact=matches.filter(row=>row.slug==='trashy' || String(row.name).trim().toLowerCase()==='trashy');
  const row=exact.length===1 ? exact[0] : exact.length===0 && matches.length===1 ? matches[0] : null;
  result.trashy={checked:!!row,matchCount:matches.length,...(row?{slug:row.slug,engine:row.engine,status:row.status,assignedToV1:row.engine==='live',separateRuntimeHealthChecked:false}:{reason:matches.length?'ambiguous-match':'no-match'})};
  if(!row || row.engine!=='live') result.errors.push('trashy-legacy-assignment-not-confirmed');
} catch { result.trashy={checked:false,reason:'lookup-unavailable'}; result.errors.push('trashy-current-record-unreadable'); }
console.log('FINAL_READONLY_JSON ' + JSON.stringify(result));
"""
live = {}
# Do not load candidate code or run follow-up checks inside a changed runtime.
if len(runtime) == 2 and all(row['matchesApprovedRelease'] for row in runtime):
    try:
        process = subprocess.run(['docker','exec','-i','twin-v2-dash-1','node','--import','tsx','--input-type=module'],input=js,text=True,capture_output=True,timeout=180)
        records=[line[len('FINAL_READONLY_JSON '):] for line in process.stdout.splitlines() if line.startswith('FINAL_READONLY_JSON ')]
        if process.returncode or len(records)!=1:
            errors.append('live-readonly-check-failed')
        else:
            live=json.loads(records[0])
            errors.extend(live.pop('errors',[]))
    except Exception:
        errors.append('live-readonly-check-unavailable')
else:
    errors.append('live-readonly-check-skipped-after-runtime-drift')
fleet = {}
try:
    raw=json.loads((ROOT/'data/_fleet.json').read_text())
    at=datetime.datetime.fromisoformat(raw['at'].replace('Z','+00:00'))
    age=(utcnow()-at).total_seconds()
    current=raw.get('girls',{})
    running=sorted(slug for slug,value in current.items() if value.get('status')=='running')
    matches=bool(expected_active) and sorted(current)==expected_active and running==expected_active and 0<=age<120
    fleet={'at':raw['at'],'ageSeconds':round(age,1),'running':running,'matchesFrozenActiveFleet':matches}
    if not matches:
        errors.append('fleet-state-drift-or-stale')
except Exception:
    errors.append('fleet-state-unreadable')



manifest=json.loads((BACKUP/'source-manifest.json').read_text())
source_verified={}
for container in ['twin-v2-bot-1','twin-v2-dash-1']:
 try:
  js="import fs from 'node:fs';import crypto from 'node:crypto';const items="+json.dumps(manifest)+";for(const x of items){const b=fs.readFileSync(x.path);if(crypto.createHash('sha1').update('blob '+b.length).update(Buffer.from([0])).update(b).digest('hex')!==x.sha)throw Error(x.path)}console.log(JSON.stringify({verified:items.length}));"
  p=subprocess.run(['docker','exec','-i',container,'node','--input-type=module'],input=js,text=True,capture_output=True,timeout=30)
  assert p.returncode==0
  source_verified[container]=json.loads(p.stdout)['verified']
 except Exception:errors.append('source-verification-failed:'+container)
# Read only the bounded newest request records; never send a test message.
since=min(datetime.datetime.fromisoformat(g['startedAt'].replace('Z','+00:00')) for g in DEPLOYED['fleet']['girls'].values())
traffic=[]
for slug in expected_active:
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
 outcomes={}
 for row in rows:
  for kind in ['text','media','recovery']:
   status=(row.get('delivery',{}).get(kind) or {}).get('status')
   if status:outcomes[kind+':'+status]=outcomes.get(kind+':'+status,0)+1
 traffic.append({'slug':slug,'turns':len(rows),'modelTurns':sum(r.get('modelRequest') is True for r in rows),'photoSelections':sum((r.get('selectedMedia') or {}).get('kind')=='photo' for r in rows),'photoAcknowledgements':sum((r.get('media') or {}).get('kind')=='photo' and (r.get('delivery',{}).get('media') or {}).get('status')=='acknowledged' for r in rows),'referenceTurns':sum(bool(r.get('photoReference')) for r in rows),'invalidSelections':sum(bool(r.get('selectionError')) for r in rows),'localDeliveryErrors':sum(bool(r.get('delivery',{}).get('error')) for r in rows),'outcomes':outcomes,'boundedTail':truncated})
result={'status':'POST-DEPLOY READ-ONLY CHECK PASSED' if not errors else 'POST-DEPLOY READ-ONLY CHECK FAILED','checkedAt':utcnow().isoformat(),'runtime':runtime,'fleet':fleet,'live':live,'sourceFilesVerified':source_verified,'frozenIncidentPreserved':fixture_preserved,'trafficSince':since.isoformat(),'traffic':traffic,'errors':errors,'proactiveMessagesSent':0,'additionalModelCalls':0,'financialDataRestored':False,'actualFanVisibilityVerified':False}
print('POST_DEPLOY_JSON '+json.dumps(result),flush=True)
if errors:sys.exit(1)
