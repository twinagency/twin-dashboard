"""Run the read-only coverage check in the existing V2 monitor, without restarting it."""
import base64, json, pathlib, shlex, subprocess, time
instance = 'i-0584d283506f3f6be'
source = base64.b64encode(pathlib.Path('deployment/full-history-audit.mjs').read_bytes()).decode()
command = "printf '%s' " + shlex.quote(source) + " | base64 -d | sudo docker exec -i twin-v2-dash-1 node --import tsx --input-type=module"
params = pathlib.Path('/tmp/full-history-audit.json')
params.write_text(json.dumps({'commands': [command], 'executionTimeout': ['240']}))
cid = subprocess.check_output(['aws', 'ssm', 'send-command', '--instance-ids', instance, '--document-name', 'AWS-RunShellScript', '--parameters', 'file://' + str(params), '--comment', 'Read-only stored message coverage check', '--query', 'Command.CommandId', '--output', 'text'], text=True).strip()
for _ in range(90):
    try:
        result = json.loads(subprocess.check_output(['aws', 'ssm', 'get-command-invocation', '--command-id', cid, '--instance-id', instance, '--output', 'json'], text=True, stderr=subprocess.DEVNULL))
    except subprocess.CalledProcessError:
        time.sleep(3)
        continue
    if result['Status'] in ['Success', 'Failed', 'Cancelled', 'TimedOut']:
        print(result.get('StandardOutputContent', ''))
        if result['Status'] != 'Success':
            print(result.get('StandardErrorContent', '')[-1800:])
            raise RuntimeError('History audit ' + result['Status'])
        break
    time.sleep(3)
else:
    raise RuntimeError('History audit timed out')
