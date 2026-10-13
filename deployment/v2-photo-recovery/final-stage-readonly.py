"""Read-only final stage check. No writes, model calls, fan sends, restart or deployment."""
import datetime, hashlib, json, pathlib, re, subprocess, sys
ROOT = pathlib.Path('/home/ubuntu/twin-v2')
INCIDENT = ROOT / 'data/_operator_backups/photo-incident-20261013-morning'
REVISION = '45931b6f56db9f97cc8406154e35a0d216f5de65'
IMAGE = 'sha256:2f076bf6fbc17b4de58a31887e9328a56e0275d90edda39ea789efbd13517d2e'
CANDIDATE = '76c5e0038eb2c4bf4c4fa23d3ea0cce91be249a8'
FIXTURE_HASH = '43e21019a2c33d1e840c81ec6d683cf7bb6546f68e1de4106db9218b6d3bd253'
errors = []
runtime = []
def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)
for name in ['twin-v2-bot-1', 'twin-v2-dash-1']:
    try:
        info = json.loads(subprocess.check_output(['docker', 'inspect', name], text=True, stderr=subprocess.DEVNULL, timeout=15))[0]
        revision = next((entry.split('=', 1)[1] for entry in info['Config']['Env'] if entry.startswith('GIT_SHA=')), None)
        checked = bool(info['State']['Running']) and revision == REVISION and info['Image'] == IMAGE
        runtime.append({'container': name, 'running': bool(info['State']['Running']), 'revision': revision, 'image': info['Image'], 'matchesRollback': checked})
        if not checked:
            errors.append('rollback-runtime-drift:' + name)
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
    try {
      const response=await fetch('http://127.0.0.1:4300/api/girls/details?girl='+encodeURIComponent(row.slug),{signal:AbortSignal.timeout(15000)});
      if(!response.ok) throw new Error('display-unreadable');
      const display=await response.json();
      const displayed=display.parts.filter(part=>!part.optional).map(part=>part.text).join('');
      const actual=render(row.v2_vars);
      const section=text=>{const start=text.indexOf('PHOTOS AND VIDEOS'),end=text.indexOf('HARD LIMITS, NEVER CROSSED');return start>=0 && end>start ? text.slice(start,end):'';};
      const promptDisplayMatches=Array.isArray(display.errors) && display.errors.length===0 && section(actual).length>100 && section(displayed)===section(actual);
      const testerPrice=priceFor(2700,{cloneId:row.id,telegramId:6814483810,kind:'photo'});
      const normalPrice=priceFor(2700,{cloneId:row.id,telegramId:6814483811,kind:'photo'});
      const priceScopeMatches=testerPrice===(['riley-mae-lewis','kyla-yesenosky'].includes(row.slug)?5:2700) && normalPrice===2700;
      result.results.push({slug:row.slug,promptDisplayMatches,testerPrice,normalPrice,priceScopeMatches});
      if(!promptDisplayMatches) result.errors.push('prompt-display-drift:'+row.slug);
      if(!priceScopeMatches) result.errors.push('tester-price-drift:'+row.slug);
    } catch { result.errors.push('prompt-or-price-check-unreadable:'+row.slug); }
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
if len(runtime) == 2 and all(row['matchesRollback'] for row in runtime):
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

# Read the newest attempt, never silently fall back to an older passing attempt.
candidate = {'candidate': CANDIDATE, 'summaryAvailable': False}
base=pathlib.Path('/home/ubuntu/twin-v2-validation')
pattern=re.compile(r'^selection-' + re.escape(CANDIDATE[:12]) + r'-([0-9]+)$')
try:
    choices=[]
    for directory in base.iterdir():
        match=pattern.fullmatch(directory.name)
        if match and directory.is_dir() and not directory.is_symlink() and directory.resolve().parent==base.resolve():
            choices.append((int(match.group(1)),directory))
    if not choices:
        errors.append('candidate-summary-directory-not-found')
    else:
        directory=max(choices,key=lambda value:value[0])[1]
        candidate['artifactDirectory']=str(directory)
        summary_file=directory/'structured-candidate.summary.json'
        if not summary_file.is_file() or summary_file.is_symlink() or summary_file.stat().st_size>2_000_000:
            errors.append('newest-candidate-summary-missing-or-invalid')
        else:
            summary=json.loads(summary_file.read_text())
            if summary.get('candidate')!=CANDIDATE or summary.get('fixtureHash')!=FIXTURE_HASH or summary.get('rollbackRevision')!=REVISION:
                errors.append('candidate-summary-identity-mismatch')
            else:
                outcomes=summary.get('results',[])
                accepted=bool(outcomes) and len(outcomes)==22 and all(row.get('passed') is True for row in outcomes)
                false_checks=[]
                for row in outcomes:
                    case=row.get('case','unknown')
                    if not re.fullmatch(r'(business|ordinary)/(original-turn-[1-7]|greeting-with-retained-history|empty-catalogue-unavailable|explicit-no-offer|new-photo-request)',str(case)):
                        case='invalid-case-name'
                    failed=[name for name,value in row.get('checks',{}).items() if value is not True and re.fullmatch(r'[A-Za-z][A-Za-z0-9]{0,79}',str(name))]
                    if failed or row.get('passed') is not True:
                        false_checks.append({'case':case,'failedChecks':failed or ['execution-failed']})
                candidate.update({'summaryAvailable':True,'checkedAt':summary.get('checkedAt'),'normalCallsPlanned':summary.get('normalCallsPlanned'),'requests':summary.get('requests'),
                    'passedCases':sum(row.get('passed') is True for row in outcomes),'totalCases':len(outcomes),'accepted':accepted,
                    'realTelegramSends':summary.get('realTelegramSends'),'realDownloads':summary.get('realDownloads'),
                    'actualProductContract':summary.get('actualProductContract'),'noRequestOrResponseAdapter':summary.get('noRequestOrResponseAdapter'),
                    'failures':false_checks,'resendAcceptance':False,'transportAndOwnership':'simulated'})
                if summary.get('realTelegramSends')!=0 or summary.get('realDownloads')!=0:
                    errors.append('candidate-isolation-count-mismatch')
                if not accepted:
                    errors.append('candidate-model-replay-not-accepted')
except Exception:
    errors.append('candidate-summary-unreadable')
result={'checkedAt':utcnow().isoformat(),'status':'READ-ONLY FINAL CHECK PASSED' if not errors else 'READ-ONLY FINAL CHECK FAILED',
    'runtime':runtime,'fleet':fleet,'frozenIncidentPreserved':fixture_preserved,'live':live,'candidate':candidate,
    'errors':errors,'modelCalls':0,'messagesSent':0,'restarts':0,'deployments':0,'filesWritten':0}
print(json.dumps(result),flush=True)
if errors:
    sys.exit(1)

