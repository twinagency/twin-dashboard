"""Run an exact allowlisted, read-only source check in the existing Moxy host."""
import base64
import importlib.util
import json
from pathlib import Path
import shlex
import time

root = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('creator_flow', root / 'creator-flow-live-check.py')
flow = importlib.util.module_from_spec(spec)
spec.loader.exec_module(flow)
assert flow.aws(['sts', 'get-caller-identity'])['Account'] == flow.ACCOUNT
source = base64.b64encode((root / 'catalogue-source-diagnostic.cjs').read_bytes()).decode()
host = flow.host_program('moxy', 'd22089ed89a1bbbc52bb8c6b7b3f6689a08893de', 'small-only', False, source)
command = {'InstanceIds': [flow.INSTANCE], 'DocumentName': 'AWS-RunShellScript',
           'Comment': 'Read-only diagnosis of four existing Moxy catalogue files',
           'TimeoutSeconds': 60, 'Parameters': {'commands': ['python3 -c ' + shlex.quote(host)], 'executionTimeout': ['360']}}
command_id = flow.aws(['ssm', 'send-command', '--cli-input-json', json.dumps(command)])['Command']['CommandId']
deadline = time.monotonic() + 390
while time.monotonic() < deadline:
    time.sleep(3)
    state = flow.aws(['ssm', 'get-command-invocation', '--command-id', command_id, '--instance-id', flow.INSTANCE])
    if state['Status'] in ('Pending', 'InProgress', 'Delayed'):
        continue
    print(state.get('StandardOutputContent', ''), flush=True)
    raise SystemExit(0 if state['Status'] == 'Success' else 1)
raise SystemExit('Read-only source diagnostic timed out')
