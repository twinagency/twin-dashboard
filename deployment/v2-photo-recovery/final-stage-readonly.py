"""Read-only final stage check. No writes, model calls, fan sends, restart or deployment."""
import datetime, hashlib, json, pathlib, re, subprocess, sys
ROOT = pathlib.Path('/home/ubuntu/twin-v2')
INCIDENT = ROOT / 'data/_operator_backups/photo-incident-20261013-morning'
REVISION = '45931b6f56db9f97cc8406154e35a0d216f5de65'
IMAGE = 'sha256:2f076bf6fbc17b4de58a31887e9328a56e0275d90edda39ea789efbd13517d2e'
# Only three reviewed all-time dashboard history files differ from the rollback image.
DASHBOARD_IMAGE = 'sha256:051ec69b650fc06025d19c8d92e790dfc11185bdf435906840a13d6df823bb61'
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
        runtime.append({'container': name, 'running': bool(info['State']['Running']), 'revision': revision, 'image': info['Image'], 'matchesReviewedBaseline': checked})
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
if len(runtime) == 2 and all(row['matchesReviewedBaseline'] for row in runtime):
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
candidate = {'candidate': CANDIDATE, 'summaryAvailable': False, 'dataCompatibility': {'summaryAvailable': False}}
base=pathlib.Path('/home/ubuntu/twin-v2-validation')
pattern=re.compile(r'^reference-' + re.escape(CANDIDATE[:12]) + r'-([0-9]+)$')
routes=('business','ordinary')
original_names=['original-turn-' + str(number) for number in range(1,8)]
reference_names=['reference-seed','explicit-exact-resend','already-owned-exact-resend','new-photo-after-reference',
    'timeout-seed','missing-card-after-timeout','missing-card-without-context']
expected_cases={route+'/'+group+'/'+name for route in routes for group,names in [
    ('independent',original_names+['greeting-with-retained-history','empty-catalogue-unavailable','explicit-no-offer','new-photo-request']),
    ('sequential-original',original_names),('reference-controls',reference_names)] for name in names}
case_pattern=re.compile(r'(business|ordinary)/(independent|sequential-original|reference-controls)/[a-z][a-z0-9-]{0,79}')
grounding_checks={'noUnsupportedKnownPose','noUnsupportedSelectedVocabularyDelivered','actualPreparedOutputGrounded',
    'actualDispatchedCaptionGrounded','actualDispatchedCaptionMatchesPrepared','groundingRemovalTraceValid'}
reference_checks={'referencePrerequisite','exactReferenceSelected','referenceRecognized','exactReferenceMenu',
    'referenceOwnership','referenceDownloadedAgain'}
def read_summary(file):
    if not file.is_file() or file.is_symlink() or file.stat().st_size>2_000_000:
        raise ValueError('summary-missing-or-invalid')
    value=json.loads(file.read_text())
    if not isinstance(value,dict):
        raise ValueError('summary-not-an-object')
    return value
def case_passed(row):
    return isinstance(row,dict) and row.get('passed') is True and isinstance(row.get('checks'),dict) and grounding_checks<=set(row['checks']) and all(value is True for value in row['checks'].values())
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
            summary=read_summary(summary_file)
            if summary.get('candidate')!=CANDIDATE or summary.get('fixtureHash')!=FIXTURE_HASH or summary.get('rollbackRevision')!=REVISION:
                errors.append('candidate-summary-identity-mismatch')
            else:
                outcomes=summary.get('results',[])
                if not isinstance(outcomes,list) or not all(isinstance(row,dict) for row in outcomes):
                    raise ValueError('invalid-case-results')
                source_matches=summary.get('sourceHashes')==SOURCE_HASHES and len(SOURCE_HASHES)==10
                names=[row.get('case') for row in outcomes]
                cases_complete=len(outcomes)==50 and len(set(names))==50 and set(names)==expected_cases
                accepted=cases_complete and source_matches and summary.get('normalCallsPlanned')==50 and all(case_passed(row) for row in outcomes) and summary.get('fatal') is None and summary.get('status')=='DECLARED PHOTO REFERENCE GATES PASSED; ORIGINAL AMBIGUITIES REPORTED SEPARATELY; TELEGRAM SIMULATED'
                if not source_matches:
                    errors.append('candidate-reviewed-source-hashes-mismatch')
                if not cases_complete:
                    errors.append('candidate-fifty-case-set-mismatch')
                false_checks=[]
                for row in outcomes:
                    case=row.get('case','unknown')
                    if not case_pattern.fullmatch(str(case)) or case not in expected_cases:
                        case='invalid-case-name'
                    failed=[name for name,value in row.get('checks',{}).items() if value is not True and re.fullmatch(r'[A-Za-z][A-Za-z0-9]{0,79}',str(name))]
                    if failed or not case_passed(row):
                        false_checks.append({'case':case,'failedChecks':failed or ['execution-failed']})
                by_case={row.get('case'):row for row in outcomes}
                def both_routes(name):
                    needed={'noInventedReference'} if name=='missing-card-without-context' else reference_checks
                    return accepted and all(case_passed(by_case.get(route+'/reference-controls/'+name))
                        and all(by_case[route+'/reference-controls/'+name]['checks'].get(check) is True for check in needed) for route in routes)
                def original_final_passed(route):
                    row=by_case.get(route+'/sequential-original/original-turn-7',{})
                    return case_passed(row) and row.get('behaviorAcceptance') is True and row.get('parserClassification')=='missing' and row.get('priorPhotoScoped') is True and row.get('referenceAvailable') is True and all(row['checks'].get(name) is True for name in reference_checks)
                original_final=all(original_final_passed(route) for route in routes)
                independent_final=all(case_passed(by_case.get(route+'/independent/original-turn-7'))
                    and by_case[route+'/independent/original-turn-7'].get('behaviorAcceptance') is True
                    and by_case[route+'/independent/original-turn-7']['checks'].get('noInventedReference') is True for route in routes)
                if not original_final or not independent_final:
                    errors.append('original-turn-seven-recovery-or-no-context-gate-failed')
                    accepted=False
                unresolved=summary.get('originalRecoveryUnresolved')
                derived_unresolved=[row['case'] for row in outcomes if row.get('unresolvedOriginalRecovery') is True]
                if not isinstance(unresolved,list) or unresolved!=derived_unresolved or any(case not in {route+'/sequential-original/original-turn-7' for route in routes} for case in unresolved):
                    errors.append('original-recovery-evidence-inconsistent')
                    unresolved=derived_unresolved
                    accepted=False
                if unresolved:
                    errors.append('original-turn-seven-recovery-unresolved')
                    accepted=False
                observations=[row['case'] for row in outcomes if row.get('behaviorAcceptance') is False]
                raw_draft_cases=[row['case'] for row in outcomes if row.get('rawDraftUnsupportedClaims') and row.get('case') in expected_cases]
                historical_rows=[row for row in outcomes if isinstance(row.get('historicalSendClaimExemption'),dict) and row['historicalSendClaimExemption'].get('used') is True]
                historical_proof=summary.get('historicalClaimGateChecks')==20 and all(
                    row.get('case') in expected_cases and row.get('selection')=='none' and row.get('selected') is None
                    and row.get('priorPhotoScoped') is True and row.get('priorPhotoStatus')=='acknowledged'
                    and row['checks'].get('noExplicitFalseSendClaimWithoutSelection') is True
                    and row['historicalSendClaimExemption'].get('scopedAcknowledgedReceipt') is True
                    and row['historicalSendClaimExemption'].get('matchingLastAssistantDeliveryNote') is True
                    and type(row['historicalSendClaimExemption'].get('priorMessageId')) is int and row['historicalSendClaimExemption']['priorMessageId']>0
                    and isinstance(row['historicalSendClaimExemption'].get('priorTurnId'),str) and bool(row['historicalSendClaimExemption']['priorTurnId'])
                    for row in historical_rows)
                if not historical_proof:
                    errors.append('historical-send-claim-exemption-evidence-invalid')
                    accepted=False
                candidate.update({'summaryAvailable':True,'checkedAt':summary.get('checkedAt'),'normalCallsPlanned':summary.get('normalCallsPlanned'),'requests':summary.get('requests'),
                    'passedCases':sum(case_passed(row) for row in outcomes),'totalCases':len(outcomes),'accepted':accepted,
                    'sourceHashesMatchReviewedManifest':source_matches,'reviewedSourceFiles':len(SOURCE_HASHES),'exactDeclaredCaseSet':cases_complete,
                    'realTelegramSends':summary.get('realTelegramSends'),'realDownloads':summary.get('realDownloads'),
                    'actualProductContract':summary.get('actualProductContract'),'noRequestOrResponseAdapter':summary.get('noRequestOrResponseAdapter'),
                    'failures':false_checks,'resendAcceptance':both_routes('explicit-exact-resend'),
                    'ownedResendAcceptance':both_routes('already-owned-exact-resend'),'unconfirmedRecoveryAcceptance':both_routes('missing-card-after-timeout'),
                    'missingContextNoGuessAcceptance':both_routes('missing-card-without-context'),
                    'originalTurnSevenScopedRecoveryAcceptance':accepted and original_final,
                    'originalTurnSevenNoContextAcceptance':accepted and independent_final,
                    'transportedCaptionGroundingAcceptance':accepted and all(all(row['checks'].get(name) is True for name in grounding_checks) for row in outcomes),
                    'rawDraftQualityIsDiagnostic':True,'rawDraftCasesWithUnsupportedClaims':raw_draft_cases,
                    'historicalClaimGateChecks':summary.get('historicalClaimGateChecks'),'historicalClaimEvidenceVerified':historical_proof,
                    'historicalClaimExemptionCases':[row['case'] for row in historical_rows if row.get('case') in expected_cases],
                    'acceptedBehaviorCases':sum(row.get('behaviorAcceptance') is True and case_passed(row) for row in outcomes),
                    'observationalCaseNames':observations,'originalRecoveryUnresolved':unresolved,'fullOriginalConversationAcceptance':False,
                    'transportAndOwnership':'simulated'})
                if any(summary.get(field)!=0 for field in ['realTelegramSends','realDownloads','realDatabaseCalls']):
                    errors.append('candidate-isolation-count-mismatch')
                if any(summary.get(field) is not True for field in ['actualProductContract','noRequestOrResponseAdapter','assertionsFrozen','syntheticOwnership']) or summary.get('sequentialOriginalTurns')!=14:
                    errors.append('candidate-replay-contract-mismatch')
                if not accepted:
                    errors.append('candidate-model-replay-not-accepted')
        # Data checks must be from this exact paired attempt, never a previous passing run.
        data_file=directory.with_name(directory.name+'-data')/'data/summary.json'
        data_summary=read_summary(data_file)
        zero_fields=['modelCalls','telegramCalls','remoteWrites','realDownloads','productionFilesWritten','networkPolicyViolations']
        no_side_effects=all(data_summary.get(field)==0 for field in zero_fields)
        required_true=['sourceHashesVerified','frozenInputsPreserved','noOtherCredentials','ephemeralOwnershipCache',
            'exactPhotoAvailable','mismatchedPathRejected','strictOwnershipAvailable','secondStrictReadAvailable',
            'strictReadBypassedCache','exactCountHeadersCompatible']
        data_passed=data_summary.get('candidate')==CANDIDATE and data_summary.get('status')=='READ-ONLY DATA CHECK PASSED' and no_side_effects and all(data_summary.get(field) is True for field in required_true) and data_summary.get('errors')==[]
        scoped=data_summary.get('scopedManifest',{})
        scoped_valid=(scoped.get('exercised') is False and scoped.get('status')=='not_exercised') or (scoped.get('exercised') is True and scoped.get('status')=='passed' and scoped.get('matchesLocalImmutableManifest') is True)
        candidate['dataCompatibility']={'summaryAvailable':True,'candidateMatches':data_summary.get('candidate')==CANDIDATE,
            'status':data_summary.get('status'),'passed':data_passed and scoped_valid,'sourceHashesVerified':data_summary.get('sourceHashesVerified'),
            'noWritesMessagesModelCalls':no_side_effects,'exactCountHeadersCompatible':data_summary.get('exactCountHeadersCompatible'),
            'strictReadBypassedCache':data_summary.get('strictReadBypassedCache'),
            'scopedRemoteManifestExercised':scoped.get('exercised') is True,'scopedRemoteManifestStatus':scoped.get('status')}
        if not data_passed or not scoped_valid:
            errors.append('paired-readonly-data-check-not-accepted')
except Exception:
    errors.append('candidate-summary-unreadable')
result={'checkedAt':utcnow().isoformat(),'status':'READ-ONLY FINAL CHECK PASSED' if not errors else 'READ-ONLY FINAL CHECK FAILED',
    'runtime':runtime,'fleet':fleet,'frozenIncidentPreserved':fixture_preserved,'live':live,'candidate':candidate,
    'errors':errors,'modelCalls':0,'messagesSent':0,'restarts':0,'deployments':0,'filesWritten':0}
print(json.dumps(result),flush=True)
if errors:
    sys.exit(1)

