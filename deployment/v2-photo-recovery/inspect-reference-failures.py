"""Read the one completed reference replay; print bounded diagnostic facts only.

No model, Docker, database, transport, production-state or filesystem mutation.
Conversation prose is excluded except the original four short fan inputs needed
to diagnose selection and the unrecognized final missing-card report.
"""
import datetime
import hashlib
import json
import pathlib
import re

RESULT = pathlib.Path('/home/ubuntu/twin-v2-validation/reference-c457f1767377-1791857424236297637')
FIXTURE = pathlib.Path('/home/ubuntu/twin-v2/data/_operator_backups/photo-incident-20261013-morning')
FIXTURE_HASH = '43e21019a2c33d1e840c81ec6d683cf7bb6546f68e1de4106db9218b6d3bd253'


def read_json(file, max_bytes=30_000_000):
    assert file.is_file() and file.stat().st_size <= max_bytes, 'Missing or unexpectedly large diagnostic input'
    return json.loads(file.read_bytes())


records_bytes = (FIXTURE / 'riley-morning-requests.json').read_bytes()
assert hashlib.sha256(records_bytes).hexdigest() == FIXTURE_HASH, 'Frozen incident hash differs'
records = json.loads(records_bytes)
assert len(records) == 7
summary = read_json(RESULT / 'structured-candidate.summary.json')
private = read_json(RESULT / 'structured-candidate.private.json')
snapshot = read_json(FIXTURE / 'catalogue-at-diagnosis.json')
assert str(summary.get('candidate', '')).startswith('c457f1767377'), 'Different candidate results'
assert summary.get('fixtureHash') == FIXTURE_HASH
assert len(summary.get('results', [])) == 50, 'Incomplete result set'
assert len(private.get('plan', {}).get('independent', [])) == 11, 'Unexpected replay plan'

# Only literal, closed vocabulary tags/keywords are emitted. A description keyword
# is not a statement that the attribute is visible: negated prose may contain it.
VOCAB = set(('nipples nipple topless boobs boob breasts breast tits tit titties chest cleavage '
             'genitals pussy vagina vulva anus anal ass butt buttocks booty bum nude naked '
             'lingerie underwear panties bra thong bodysuit corset bikini swimwear swimsuit '
             'mirror selfie dress shirt blouse crop tank hoodie sweater sweatshirt sweatpants '
             'skirt shorts jeans pants leggings robe towel stockings fishnet lace heels boots '
             'bed bedroom shower bathroom gym stairs porch garden beach pose toy plug dildo '
             'vibrator wand red blue black white pink green grey gray purple yellow orange '
             'brown gold silver beige cream navy teal sitting standing lying kneeling').split())
FACTS = {'nipples', 'genitals', 'anus', 'bare_buttocks', 'full_nudity', 'sexual_activity',
         'sex_toy', 'swimwear', 'lingerie', 'mirror_reflection', 'suggestive_pose'}
NEG = re.compile(r"\b(?:not|no|neither|nor|without|never|cannot|covered|covering|covers|hidden|obscured|concealed|blocked|cropped)\b|out of frame|n't\b|\bcant\b", re.I)


def keywords(value):
    return sorted(set(re.findall(r'[a-z]+', str(value).lower())) & VOCAB)


def attributes(description):
    clauses = re.split(r'[.;!?\n]+|\b(?:but|while|although|whereas)\b|\band\b(?=\s+(?:her|his|their|the|she|he|they|a|an|no|not)\b)', description or '', flags=re.I)
    return {
        'nonNegatedClauseKeywords': sorted({word for clause in clauses if not NEG.search(clause) for word in keywords(clause)}),
        'negatedClauseKeywords': sorted({word for clause in clauses if NEG.search(clause) for word in keywords(clause)}),
    }


rows = {}
catalogue_keys = set()
for kind, table in [('photo', 'photos'), ('video', 'videos')]:
    seen_basenames = set()
    for row in snapshot['raw'][table]:
        key = kind + ':' + str(row.get('id', ''))
        assert re.fullmatch(r'(?:photo|video):[a-zA-Z0-9_-]+', key)
        rows.setdefault(key, row)
        basename = re.sub(r'^[0-9]{10,}-', '', str(row.get('storage_path', '')).rsplit('/', 1)[-1]).lower()
        if basename not in seen_basenames:
            catalogue_keys.add(key)
            seen_basenames.add(basename)

pipeline = {value['case']: value for value in private['exchanges'] if 'pipelineRecord' in value}
requests = {}
for value in private['exchanges']:
    if 'request' in value:
        requests[value['case']] = value
exact_keys = private['plan']['sequentialRules']['exactKeys']
assert len(exact_keys) == 2 and all(key in rows for key in exact_keys)


def inspect_key(key, sent, menu):
    raw = rows.get(key)
    listed = next((item for item in menu if item.get('key') == key), None)
    result = {'key': key, 'presentInFrozenRows': raw is not None,
              'presentAfterCatalogueDeduplication': key in catalogue_keys,
              'excludedAsAlreadySent': key in sent, 'presentInActualMenu': listed is not None}
    if raw is not None:
        state = raw.get('analysis_status', 'legacy')
        result.update({'analysisState': state if state in ['legacy', 'pending', 'analysed', 'needs_review', 'failed'] else 'legacy',
                       'analysisEligibleForExactMatch': state not in ['pending', 'failed', 'needs_review'],
                       'free': raw.get('is_free') is True,
                       'descriptionAttributes': attributes(raw.get('visual_description', ''))})
        facts = raw.get('visual_facts')
        if isinstance(facts, dict) and facts.get('v') == 2 and isinstance(facts.get('evidence'), dict):
            result['storedFactEvidence'] = {fact: state for fact, state in facts['evidence'].items()
                                            if fact in FACTS and state in ['yes', 'no', 'unknown']}
            result['storedVisibleKeywords'] = keywords(' '.join(value for value in (facts.get('visible') or []) if isinstance(value, str)))
        result['storedTagKeywords'] = keywords(' '.join(value for value in (raw.get('tags') or []) if isinstance(value, str)))
    if listed:
        result['menuAttributes'] = attributes(listed.get('desc', ''))
        result['menuSlot'] = listed.get('slot')
    return result


failures = []
for result in summary['results']:
    if result.get('passed'):
        continue
    case = result['case']
    trace = pipeline.get(case, {})
    row = trace.get('pipelineRecord', {})
    before = trace.get('beforeChat', {})
    sent = set(before.get('sent', []))
    menu = row.get('menu', [])
    source = result.get('sourceTurn')
    expected = []
    if '/sequential-original/' in case and source in [1, 2, 4]:
        expected = [key for key in exact_keys if key not in sent]
    elif '/independent/' in case and source in [1, 2, 4]:
        expected = list(exact_keys)
    selected = result.get('selected')
    interest = list(dict.fromkeys(([selected] if selected else []) + exact_keys if source in [1, 2, 4] else ([selected] if selected else []) + expected))
    response = requests.get(case, {}).get('response') or {}
    choices = response.get('choices') or []
    try:
        decoded = json.loads(choices[0]['message']['content'])
    except (IndexError, KeyError, TypeError, ValueError):
        decoded = {}
    reply = decoded.get('reply', '')
    if not isinstance(reply, str):
        reply = ''
    claims = sorted({claim for drop in trace.get('rawSelectedClaims', []) for claim in drop.get('claims', [])
                     if isinstance(claim, str) and re.fullmatch(r'[a-z ]{1,60}', claim)})
    pipeline_claims = sorted({claim for drop in row.get('grounding', []) for claim in drop.get('claims', [])
                              if isinstance(claim, str) and re.fullmatch(r'[a-z ]{1,60}', claim)})
    delivered_claims = sorted({claim for drop in trace.get('selectedCaptionClaims', []) for claim in drop.get('claims', [])
                               if isinstance(claim, str) and re.fullmatch(r'[a-z ]{1,60}', claim)})
    normalized = lambda value: re.sub(r'\s+', ' ', str(value)).strip().lower()
    dropped_sentences = {normalized(drop.get('sentence', '')) for drop in row.get('grounding', [])}
    false_send_pattern = r"\b(?:i(?:'ve| have)?\s+(?:just\s+)?(?:sent|resent|attached|shared|uploaded)|(?:here(?:'s| is)|sent)\s+(?:the|your|that)\s+(?:photo|pic|picture|selfie|image|card))\b"
    failures.append({
        'case': case, 'failedChecks': [name for name, okay in result.get('checks', {}).items() if not okay],
        'sourceTurn': source, 'modelSelection': decoded.get('selection'), 'selectedKey': selected,
        'expectedExactKeysBeforeTurn': expected,
        'actualMenuKeys': [item.get('key') for item in menu],
        'fileFacts': [inspect_key(key, sent, menu) for key in interest],
        'rawUnsupportedClaims': claims,
        'actualPipelineGroundingRemovedClaims': pipeline_claims,
        'rawClaimsCoveredByPipelineRemoval': bool(claims) and set(claims).issubset(pipeline_claims),
        'rawUnsupportedSentenceCount': len(trace.get('rawSelectedClaims', [])),
        'exactUnsupportedSentencesRecordedDropped': sum(normalized(drop.get('sentence', '')) in dropped_sentences for drop in trace.get('rawSelectedClaims', [])),
        'acknowledgedOutputUnsupportedClaims': delivered_claims,
        'mediaAcknowledged': row.get('delivery', {}).get('media', {}).get('status') == 'acknowledged',
        'generatedUnsupportedCategories': sorted({'colour+attribute' if ' ' in claim else 'attribute' for claim in claims}),
        'selectionWasNone': decoded.get('selection') == 'none',
        'explicitSendClaimWithNone': decoded.get('selection') == 'none' and bool(re.search(false_send_pattern, reply, re.I)),
        'deliveredGroundingPassed': result.get('checks', {}).get('noUnsupportedSelectedVocabularyDelivered'),
        'parserClassification': result.get('parserClassification'),
    })

# Only this known Python launcher error is exposed, never an arbitrary stderr tail.
stderr = RESULT / 'runner.stderr.private.txt'
trace_tail = []
if stderr.is_file():
    with stderr.open('rb') as file:
        file.seek(max(0, stderr.stat().st_size - 65_536))
        lines = file.read().decode('utf8', errors='replace').splitlines()
    hits = [index for index, line in enumerate(lines) if re.search(r"FileNotFoundError:.*[\"']-c[\"']", line)]
    if hits:
        for line in lines[max(0, hits[-1] - 16):hits[-1] + 1]:
            frame = re.fullmatch(r'\s*File "([^"]+)", line ([0-9]+), in ([A-Za-z_][A-Za-z0-9_]*|<module>)\s*', line)
            if frame:
                basename = pathlib.Path(frame[1]).name
                if re.fullmatch(r'[A-Za-z0-9_.-]{1,80}', basename):
                    trace_tail.append({'file': basename, 'line': int(frame[2]), 'function': frame[3]})
        trace_tail = trace_tail[-5:] + [{'error': "FileNotFoundError: missing '-c' launcher path"}]

inputs = []
for index in [0, 1, 3, 6]:
    text = records[index]['fanText']
    assert isinstance(text, str) and len(text) <= 250, 'Unexpectedly long original input; no conversation dump permitted'
    inputs.append({'sourceTurn': index + 1, 'fanText': text})


# Verify the hardcoded expected keys against the exact product matcher, without credentials or networking.
import subprocess
source_root = pathlib.Path('/tmp/v2-structured-c457f1767377-1791857424236297637')
manifest = read_json(source_root / 'manifest.json')
assert hashlib.sha256((source_root/'src/media.ts').read_bytes()).hexdigest() == manifest['src/media.ts']
node = r"""
import fs from 'node:fs';
globalThis.fetch = async () => { throw Error('network forbidden'); };
const {catalogueFromRaw,requestedAttrs,isAlternative} = await import('./src/media.ts');
const snapshot=JSON.parse(fs.readFileSync('/probe/catalogue-at-diagnosis.json','utf8'));
const records=JSON.parse(fs.readFileSync('/probe/riley-morning-requests.json','utf8'));
const catalogue=catalogueFromRaw(snapshot.raw);
const keys=['photo:ceb606ce-4110-42b8-9c53-5507a8a787fc','photo:a5414325-ef14-49ee-9f30-f9487739fbde'];
const result=[0,1,3].map(source=>{
 const req=requestedAttrs(catalogue.filter(x=>!x.isFree),records[source].fanText);
 return {sourceTurn:source+1,requestedExact:[...req.exact],requestedNear:[...req.near],
 allExactLockedPhotoKeys:catalogue.filter(x=>x.kind==='photo'&&!x.isFree&&!isAlternative(x,req)).map(x=>x.key),
 expectedKeyFacts:keys.map(key=>{const item=catalogue.find(x=>x.key===key);return {key,exactMatch:!!item&&!isAlternative(item,req),searchWords:item?[...item.words]:[]};})};
});
console.log('MATCHER_FACTS '+JSON.stringify(result));
"""
command=['docker','run','--rm','-i','--read-only','--network','none','--tmpfs','/tmp:rw,size=64m','--memory','256m','--cpus','1','-w','/app',
 '--mount','type=bind,source=/dev/null,target=/app/.env,readonly',
 '--mount','type=bind,source='+str(FIXTURE)+',target=/probe,readonly',
 '--mount','type=bind,source='+str(source_root/'src/media.ts')+',target=/app/src/media.ts,readonly',
 'sha256:2f076bf6fbc17b4de58a31887e9328a56e0275d90edda39ea789efbd13517d2e','node','--import','tsx','--input-type=module']
ran=subprocess.run(command,input=node,text=True,capture_output=True,timeout=30)
assert ran.returncode==0, 'Network-isolated matcher inspection failed'
matcher_lines=[line[len('MATCHER_FACTS '):] for line in ran.stdout.splitlines() if line.startswith('MATCHER_FACTS ')]
assert len(matcher_lines)==1
matcher_facts=json.loads(matcher_lines[0])

print(json.dumps({
    'status': 'READ ONLY REFERENCE FAILURE FACTS', 'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'candidate': summary['candidate'], 'fixtureHash': FIXTURE_HASH,
    'totalCases': len(summary['results']), 'failedCases': len(failures),
    'originalInputsRequiredForDiagnosis': inputs, 'failures': failures, 'actualProductMatcherFacts': matcher_facts,
    'originalFinalTurn': [{key: result.get(key) for key in ['case', 'parserClassification', 'priorPhotoPresent', 'priorPhotoStatus',
                             'priorPhotoScoped', 'referenceAvailable', 'menuKeys', 'unresolvedOriginalRecovery']}
                          for result in summary['results'] if '/sequential-original/original-turn-7' in result['case']],
    'boundedLauncherTrace': trace_tail,
    'limitations': ['Description keyword lists are diagnostic text features, not fresh visual verification.',
                    'Only existing recorded grounding claims are reported; no semantic or model re-evaluation.',
                    'No full model replies, history, descriptions, credentials or arbitrary stderr printed.'],
    'modelCalls': 0, 'transportCalls': 0, 'writes': 0,
}, separators=(',', ':')))
