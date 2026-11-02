"""Update only the private history monitor. The running bot is never restarted."""
import hashlib, json, pathlib, subprocess, time, urllib.request

ROOT = pathlib.Path('/home/ubuntu/twin-v2')
payload = json.loads(pathlib.Path('/tmp/v2-history-release.json').read_text())
revision = payload['revision']
assert len(revision) == 40 and all(c in '0123456789abcdef' for c in revision)
expected = {'dashboard/history.ts', 'dashboard/history-client.js', 'scripts/check-dashboard-history.ts'}
assert {item['path'] for item in payload['files']} == expected
backup = pathlib.Path('/home/ubuntu/twin-v2-backups/all-history-20261013') / revision
release = backup / 'candidate'
override = ROOT / 'photo-release.override.json'

def inspect(name):
    return json.loads(subprocess.check_output(['docker', 'inspect', name], text=True))[0]

def runtime(name):
    obj = inspect(name)
    assert obj['State']['Running'], name + ' is not running'
    env = dict(x.split('=', 1) for x in obj['Config']['Env'])
    return {'id': obj['Id'], 'image': obj['Image'], 'revision': env.get('GIT_SHA'), 'history': env.get('HISTORY_REVISION')}

def digest(data):
    return hashlib.sha256(data).hexdigest()

def write_atomic(file, data):
    file.parent.mkdir(parents=True, exist_ok=True)
    tmp = file.with_name(file.name + '.history-tmp')
    tmp.write_bytes(data)
    tmp.replace(file)

def compose():
    subprocess.run(['docker', 'compose', '-p', 'twin-v2', '-f', str(ROOT / 'docker-compose.yml'), '-f', str(override), 'up', '-d', '--no-build', '--no-deps', 'dash'], check=True, timeout=90)

def verify():
    for attempt in range(20):
        try:
            with urllib.request.urlopen('http://127.0.0.1:4300/api/girls', timeout=15) as r:
                rows = json.load(r)
            break
        except (OSError, ValueError):
            if attempt == 19:
                raise
            time.sleep(2)
    # The data check is deliberately independent of the girls response's UI shape.
    slugs = ['briana-redd', 'fit-sid', 'kyla-yesenosky', 'mrs-callace', 'riley-mae-lewis', 'sania-mallory']
    for slug in slugs:
        with urllib.request.urlopen('http://127.0.0.1:4300/api/chat-history?girl=' + slug + '&chatId=6814483810', timeout=25) as r:
            page = json.load(r)
        assert page['scope'] == 'all-stored' and page['days'] is None, 'History cutoff remains: ' + slug
        assert isinstance(page['history'], list) and len(page['history']) <= 100
    return slugs

bot_before = runtime('twin-v2-bot-1')
dash_before = runtime('twin-v2-dash-1')
if dash_before['history'] == revision:
    print(json.dumps({'alreadyDeployed': revision, 'verified': verify(), 'botUnchanged': True}))
    raise SystemExit(0)
assert dash_before['revision'] == payload['base'], 'Monitor revision changed since inspection'
assert bot_before['revision'] == payload['base'], 'Bot revision changed since inspection'
old_override = override.read_bytes()
old_files = {}
for item in payload['files']:
    file = ROOT / item['path']
    old_files[item['path']] = file.read_bytes() if file.exists() else None
    if old_files[item['path']] is not None:
        assert digest(old_files[item['path']]) == item['oldSha256'], 'Host source changed: ' + item['path']
    new = item['content'].encode()
    assert digest(new) == item['sha256']
    write_atomic(release / item['path'], new)
    if old_files[item['path']] is not None:
        write_atomic(backup / 'source' / item['path'], old_files[item['path']])
write_atomic(backup / 'override.json', old_override)
write_atomic(backup / 'before.json', json.dumps({'bot': bot_before, 'dash': dash_before}).encode())

# Build on the exact currently running image; only these three files differ.
dockerfile = 'ARG BASE_IMAGE\nFROM ${BASE_IMAGE}\nCOPY dashboard/history.ts dashboard/history-client.js /app/dashboard/\nCOPY scripts/check-dashboard-history.ts /app/scripts/\n'
write_atomic(release / 'Dockerfile', dockerfile.encode())
tag = 'twin-v2-history:' + revision
subprocess.run(['docker', 'build', '--network=none', '--build-arg', 'BASE_IMAGE=' + dash_before['image'], '-t', tag, str(release)], check=True, timeout=180)
subprocess.run(['docker', 'run', '--rm', '--network=none', '--entrypoint', 'node', tag, '--import', 'tsx', 'scripts/check-dashboard-history.ts'], check=True, timeout=60)
image = subprocess.check_output(['docker', 'image', 'inspect', '-f', '{{.Id}}', tag], text=True).strip()
assert runtime('twin-v2-bot-1') == bot_before and runtime('twin-v2-dash-1') == dash_before, 'Another release changed the runtime'
assert override.read_bytes() == old_override, 'Deployment settings changed'
for item in payload['files']:
    p = ROOT / item['path']
    assert (p.read_bytes() if p.exists() else None) == old_files[item['path']], 'Source changed during build'

try:
    for item in payload['files']:
        write_atomic(ROOT / item['path'], item['content'].encode())
    updated = json.loads(old_override)
    dash = updated.setdefault('services', {}).setdefault('dash', {})
    dash['image'] = image
    dash.setdefault('environment', {})['HISTORY_REVISION'] = revision
    write_atomic(override, json.dumps(updated, indent=2).encode())
    compose()
    assert runtime('twin-v2-dash-1')['image'] == image
    assert runtime('twin-v2-dash-1')['history'] == revision
    slugs = verify()
    assert runtime('twin-v2-bot-1') == bot_before, 'Bot container changed unexpectedly'
    result = {'deployedHistory': revision, 'monitorImage': image, 'verifiedCreators': slugs, 'botUnchanged': True, 'backup': str(backup)}
    write_atomic(backup / 'result.json', json.dumps(result).encode())
    print(json.dumps(result))
except Exception:
    for p, content in old_files.items():
        if content is None:
            (ROOT / p).unlink(missing_ok=True)
        else:
            write_atomic(ROOT / p, content)
    write_atomic(override, old_override)
    compose()
    assert runtime('twin-v2-dash-1')['image'] == dash_before['image']
    assert runtime('twin-v2-bot-1') == bot_before
    print(json.dumps({'rolledBackMonitor': True, 'botUnchanged': True}))
    raise
