"""Retrieve a strictly scoped, read-only production log review into a private artifact."""
import base64
import gzip
import json
import os
import pathlib
import shlex
import subprocess
import time

INSTANCE = 'i-0584d283506f3f6be'
source = pathlib.Path('deployment/v2-photo-recovery/read-ryan-conversations-remote.py').read_text()
params = pathlib.Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'ryan-review-ssm.json'
params.write_text(json.dumps({'commands': ['python3 -c ' + shlex.quote(source)], 'executionTimeout': ['120']}))
cid = subprocess.check_output([
    'aws', 'ssm', 'send-command', '--instance-ids', INSTANCE,
    '--document-name', 'AWS-RunShellScript', '--parameters', 'file://' + str(params),
    '--comment', 'Read-only scoped Ryan conversation review',
    '--query', 'Command.CommandId', '--output', 'text'
], text=True).strip()
print(json.dumps({'commandId': cid, 'operation': 'read-only conversation review'}), flush=True)
for attempt in range(55):
    try:
        response = json.loads(subprocess.check_output([
            'aws', 'ssm', 'get-command-invocation', '--command-id', cid,
            '--instance-id', INSTANCE, '--output', 'json'
        ], text=True, stderr=subprocess.DEVNULL))
    except subprocess.CalledProcessError:
        time.sleep(3)
        continue
    if response['Status'] in ['Success', 'Failed', 'Cancelled', 'TimedOut']:
        break
    time.sleep(3)
else:
    raise RuntimeError('Read-only review timed out')
if response['Status'] != 'Success':
    raise RuntimeError('Read-only review failed: ' + response['Status'] + ' ' + response.get('StandardErrorContent', '')[-800:])
output = response.get('StandardOutputContent', '')
line = next(x for x in output.splitlines() if x.startswith('RYAN_REVIEW_GZIP '))
data = json.loads(gzip.decompress(base64.b64decode(line.split(' ', 1)[1])))
destination = pathlib.Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'ryan-review'
destination.mkdir(exist_ok=True)
(destination / 'conversations.json').write_text(json.dumps(data, indent=2) + '\n')
print('Review saved to private artifact; no conversation text printed to workflow log.', flush=True)
