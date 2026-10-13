"""Run the authorized V2 bundle setting cutover through the existing SSM release identity."""
import base64, gzip, json, os, pathlib, shlex, subprocess, sys, time, urllib.error, urllib.parse, urllib.request
INSTANCE = 'i-0584d283506f3f6be'
BRANCH = 'codex/v2-enable-bundles-tips-20261014'
RECEIPT = 'docs/commercial-enabled-20261014.json'
source = pathlib.Path('deployment/enable-commercial-host.py').read_text()
compile(source, 'enable-commercial-host.py', 'exec')
command = 'python3 -c ' + shlex.quote(source)
params = pathlib.Path('/tmp') / ('commercial-enable-' + str(time.time_ns()) + '.json')
params.write_text(json.dumps({'commands': [command], 'executionTimeout': ['1200']}))
command_id = subprocess.check_output(['aws', 'ssm', 'send-command', '--instance-ids', INSTANCE,
    '--document-name', 'AWS-RunShellScript', '--parameters', 'file://' + str(params),
    '--comment', 'Enable authorized Twin V2 bundles with verified drain and rollback',
    '--query', 'Command.CommandId', '--output', 'text'], text=True).strip()
print(json.dumps({'commandId': command_id, 'phase': 'running guarded activation'}), flush=True)
result = {'status': 'unverified', 'workflowRun': os.environ['GITHUB_RUN_ID'], 'commandId': command_id}
try:
    deadline = time.monotonic() + 1250
    while time.monotonic() < deadline:
        try:
            value = json.loads(subprocess.check_output(['aws', 'ssm', 'get-command-invocation',
                '--command-id', command_id, '--instance-id', INSTANCE, '--output', 'json'],
                text=True, stderr=subprocess.DEVNULL))
        except subprocess.CalledProcessError:
            time.sleep(3)
            continue
        if value['Status'] in {'Success', 'Failed', 'Cancelled', 'TimedOut'}:
            break
        time.sleep(3)
    else:
        raise RuntimeError('SSM command did not finish within the observation period')
    stdout = value.get('StandardOutputContent', '')
    lines = [x.split(' ', 1)[1] for x in stdout.splitlines() if x.startswith('ACTIVATION_BASE64 ')]
    if len(lines) == 1:
        result.update(json.loads(gzip.decompress(base64.b64decode(lines[0]))))
    else:
        result.update(status='unverified', remoteStatus=value['Status'], error='Activation receipt was not returned')
    if value['Status'] != 'Success' and result.get('status') == 'complete':
        result['status'] = 'unverified'
except Exception as error:
    result.update(error=str(error))
url = 'https://api.github.com/repos/jesse98/twin-dashboard/contents/' + RECEIPT
headers = {'Authorization': 'Bearer ' + os.environ['GITHUB_TOKEN'], 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json'}
payload = {'message': 'Record Twin V2 commercial activation result [skip ci]', 'branch': BRANCH,
           'content': base64.b64encode((json.dumps(result, indent=2) + '\n').encode()).decode()}
try:
    with urllib.request.urlopen(urllib.request.Request(url + '?ref=' + urllib.parse.quote(BRANCH, safe=''), headers=headers), timeout=30) as response:
        payload['sha'] = json.load(response)['sha']
except urllib.error.HTTPError as error:
    if error.code != 404:
        raise
with urllib.request.urlopen(urllib.request.Request(url, data=json.dumps(payload).encode(), method='PUT', headers=headers), timeout=30) as response:
    assert response.status in (200, 201)
print(json.dumps({k: result.get(k) for k in ('status', 'at', 'phase', 'bundleCount', 'eligibleCreators', 'error', 'rollbackError')}), flush=True)
if result['status'] != 'complete':
    sys.exit(1)
