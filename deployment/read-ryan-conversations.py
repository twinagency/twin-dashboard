"""Retrieve a strictly scoped, read-only production log review into a private artifact."""
import base64
import gzip
import json
import os
import pathlib
import shlex
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor

INSTANCE = 'i-0584d283506f3f6be'
source_template = pathlib.Path('deployment/v2-photo-recovery/read-ryan-conversations-remote.py').read_text()
groups = [['alanna-pow','allison-parker','bethany-marquez','briana-redd'],
          ['cat-chase','dakota-lyn','dreka-cakez','fit-sid'],
          ['kyla-yesenosky','mrs-callace','olivia-jade','riley-mae-lewis'],
          ['sania-mallory','tammy','toochi','trashy','tru-kait']]

def read_group(slugs):
 source = source_template.replace('SCOPED = EXPECTED', 'SCOPED = '+repr(slugs))
 params = pathlib.Path(os.environ.get('RUNNER_TEMP', '/tmp')) / ('ryan-review-ssm-'+slugs[0]+'.json')
 params.write_text(json.dumps({'commands': ['python3 -c ' + shlex.quote(source)], 'executionTimeout': ['120']}))
 cid = subprocess.check_output([
    'aws', 'ssm', 'send-command', '--instance-ids', INSTANCE,
    '--document-name', 'AWS-RunShellScript', '--parameters', 'file://' + str(params),
    '--comment', 'Read-only scoped Ryan conversation review',
    '--query', 'Command.CommandId', '--output', 'text'
 ], text=True).strip()
 print(json.dumps({'commandId': cid, 'creators': slugs, 'operation': 'read-only conversation review'}), flush=True)
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
 return json.loads(gzip.decompress(base64.b64decode(line.split(' ', 1)[1])))

with ThreadPoolExecutor(max_workers=2) as pool:
 parts = list(pool.map(read_group, groups))
data = parts[0]
data['creators'] = [creator for part in parts for creator in part['creators']]
data['readWindows'] = [part['checkedAt'] for part in parts]
destination = pathlib.Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'ryan-review'
destination.mkdir(exist_ok=True)
(destination / 'conversations.json').write_text(json.dumps(data, indent=2) + '\n')
print('Review saved to private artifact; no conversation text printed to workflow log.', flush=True)
