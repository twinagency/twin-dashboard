"""Bounded read-only correlation of Jesse's uploaded 16:36-16:45 texting test.

No model calls, Telegram calls, application writes, restarts, or database writes.
Only tester 6814483810 records in the named test and later release window are returned. The prompt
fingerprint distinguishes old/new wording; it is not a per-request commit receipt.
"""
import base64, datetime, gzip, json, pathlib, subprocess

ROOT = pathlib.Path('/home/ubuntu/twin-v2')
TESTER = '6814483810'
START, END = '2026-10-13T06:35:00', '2026-10-13T06:46:00'
SLUGS = ['alanna-pow', 'autumn-renae', 'bethany-marquez', 'briana-redd',
         'cat-chase', 'dakota-lyn', 'fit-sid', 'kyla-yesenosky', 'mrs-callace',
         'olivia-jade', 'riley-mae-lewis', 'tammy', 'toochi', 'trashy', 'tru-kait']

def compact(value, limit=100):
    return ' '.join(str(value or '').split())[:limit]

def read_json(path):
    try:
        if path.stat().st_size > 4_000_000:
            return {'tooLarge': True}
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None

runtime = []
for name in ['twin-v2-bot-1', 'twin-v2-dash-1']:
    info = json.loads(subprocess.check_output(['docker', 'inspect', name], text=True, timeout=15))[0]
    runtime.append({'name': name, 'running': info['State']['Running'], 'image': info['Image'],
                    'revision': next((s.split('=', 1)[1] for s in info['Config']['Env'] if s.startswith('GIT_SHA=')), None)})
fleet = read_json(ROOT/'data/_fleet.json') or {}
settings_source = r'''
import {config} from './src/config.ts';
const r=await fetch(config.supabaseUrl+'/rest/v1/clones?select=slug,engine,status,v2_memory_enabled&order=slug',{headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey},signal:AbortSignal.timeout(15000)});
if(!r.ok)throw Error('Settings read unavailable');
console.log('SETTINGS_JSON '+JSON.stringify(await r.json()));
'''
p = subprocess.run(['docker', 'exec', '-i', 'twin-v2-bot-1', 'node', '--import', 'tsx', '--input-type=module'], input=settings_source, text=True, capture_output=True, timeout=35)
assert p.returncode == 0, 'Read-only settings query failed'
settings = json.loads(next(line[14:] for line in p.stdout.splitlines() if line.startswith('SETTINGS_JSON ')))
rows_out = []
for slug in SLUGS:
    path = ROOT/'logs'/slug/'requests.jsonl'
    rows, earliest, offset, malformed = [], None, 0, 0
    if path.is_file():
        with path.open('rb') as f:
            offset = max(0, path.stat().st_size - 16_000_000)
            f.seek(offset)
            if offset:
                f.readline()
            for line in f:
                try:
                    row = json.loads(line)
                except ValueError:
                    malformed += 1
                    continue
                ts = str(row.get('ts', ''))
                if ts and (earliest is None or ts < earliest):
                    earliest = ts
                if str(row.get('chatId')) == TESTER and START <= ts:
                    rows.append(row)
    turns = []
    test_rows = [row for row in rows if str(row.get('ts', '')) < END]
    for row in test_rows[:24]:
        system = row.get('system', '')
        media = row.get('media') or {}
        delivery = row.get('delivery') or {}
        history = row.get('history') or []
        turns.append({'at': row.get('ts'), 'id': str(row.get('turnId', ''))[:8],
                      'prompt': 'new' if 'Use remaining totals for availability, not the shortlist.' in system else 'old-or-other',
                      'fan': compact(row.get('fanText'), 85),
                      'reply': compact(' '.join(row.get('final') or []), 125),
                      'selection': row.get('selection'), 'key': media.get('key'), 'free': media.get('free'),
                      'receipt': (delivery.get('media') or {}).get('messageId'),
                      'outcomes': {k: (delivery.get(k) or {}).get('status') for k in ['text', 'media'] if delivery.get(k)},
                      'history': len(history), 'epoch': row.get('epoch'), 'note': row.get('note'),
                      'route': row.get('route'), 'reference': bool(row.get('photoReference')),
                      'legacyPrefix': 'alternative photo, not an exact match.' in ' '.join(row.get('final') or []),
                      'priorLockedNotes': sum('[locked photo waiting for him to unlock:' in str(m.get('content', '')) for m in history),
                      'priorUnlockNotes': sum('[he unlocked' in str(m.get('content', '')) for m in history)})
    later = []
    after = [r for r in rows if str(r.get('ts', '')) >= '2026-10-13T06:43:20']
    # Keep only the four most recent attachment/price/reference examples per creator.
    # Full PDF-window rows above are preserved; this separate sample is not exhaustive.
    followups = [r for r in after if r.get('media') or r.get('photoReference') or
                 any(w in (' '.join(r.get('final') or [])).lower() for w in ['same pool', ' stars', 'free ones'])]
    for row in followups[-4:]:
        media = row.get('media') or {}
        delivery = row.get('delivery') or {}
        history = row.get('history') or []
        previous = next((m for m in reversed(history[:-1]) if m.get('role') == 'assistant'), {})
        later.append({'at': row.get('ts'), 'id': str(row.get('turnId', ''))[:8],
                      'newPrompt': 'Use remaining totals for availability, not the shortlist.' in row.get('system', ''),
                      'fan': compact(row.get('fanText'), 100), 'reply': compact(' '.join(row.get('final') or []), 160),
                      'key': media.get('key'), 'free': media.get('free'),
                      'selectedLabel': compact(media.get('label'), 240),
                      'mediaStatus': (delivery.get('media') or {}).get('status'),
                      'reference': row.get('photoReference'), 'note': row.get('note'),
                      'previousAssistant': compact(previous.get('content'), 170) if media else None,
                      'priorLockedNotes': sum('[locked photo waiting for him to unlock:' in str(m.get('content', '')) for m in history)})
    chat = read_json(ROOT/'data'/slug/(TESTER+'.json'))
    connection = read_json(ROOT/'data'/slug/'_business.json')
    rows_out.append({'slug': slug, 'fileExists': path.is_file(), 'boundedTail': offset > 0,
                     'earliestRead': earliest, 'malformedLines': malformed, 'testTurns': len(test_rows), 'turns': turns,
                     'afterFinalTurns': len(after), 'afterFinalExampleLimit': 4, 'afterFinalExamples': later,
                     'fleetStatus': (fleet.get('girls', {}).get(slug) or {}).get('status'),
                     'cachedBusinessConnections': len(connection) if isinstance(connection, dict) else None,
                     'chat': {'exists': chat is not None, 'history': len((chat or {}).get('history', [])),
                              'epoch': (chat or {}).get('epoch'), 'hasBusinessRoute': bool((chat or {}).get('bcid'))}})
backups = ROOT/'data/_operator_backups'
backup_names = sorted(p.name for p in backups.iterdir() if 'reset' in p.name.lower() or 'rcy07' in p.name.lower())[:40] if backups.is_dir() else []
result = {'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'runtime': runtime, 'fleetAt': fleet.get('at'),
    'running': sorted(k for k, v in fleet.get('girls', {}).items() if v.get('status') == 'running'),
    'settings': settings, 'creators': rows_out, 'resetEvidenceDirectoryNames': backup_names,
    'productionWrites': 0, 'modelCalls': 0, 'telegramCalls': 0}
# SSM caps stdout; compress the scoped result so evidence is not silently truncated.
packed = base64.b64encode(gzip.compress(json.dumps(result, separators=(',', ':')).encode())).decode()
if len(packed) > 21_000:
    result['postReleaseExamplesTrimmedForTransport'] = True
    for creator in result['creators']:
        creator['afterFinalExamples'] = creator['afterFinalExamples'][-2:]
        creator['afterFinalExampleLimit'] = 2
    packed = base64.b64encode(gzip.compress(json.dumps(result, separators=(',', ':')).encode())).decode()
assert len(packed) <= 23_000, 'Bounded output exceeds SSM stdout; no partial result emitted'
print('TEXTING_TEST_READONLY_GZIP '+packed, flush=True)
