"""Use the existing deployment identity for a scoped, rollbackable monitor update."""
import base64, json, pathlib, shlex, subprocess, time, zlib
instance = 'i-0584d283506f3f6be'

def ssm(command, timeout=120):
    params = pathlib.Path('/tmp/messages-monitor-command.json')
    params.write_text(json.dumps({'commands': [command], 'executionTimeout': [str(timeout)]}))
    cid = subprocess.check_output(['aws', 'ssm', 'send-command', '--instance-ids', instance, '--document-name', 'AWS-RunShellScript', '--parameters', 'file://' + str(params), '--comment', 'Approved dashboard load-time fix, monitor reader only', '--query', 'Command.CommandId', '--output', 'text'], text=True).strip()
    for _ in range(timeout // 3 + 20):
        try:
            result = json.loads(subprocess.check_output(['aws', 'ssm', 'get-command-invocation', '--command-id', cid, '--instance-id', instance, '--output', 'json'], text=True, stderr=subprocess.DEVNULL))
        except subprocess.CalledProcessError:
            time.sleep(3)
            continue
        if result['Status'] in ['Success', 'Failed', 'Cancelled', 'TimedOut']:
            print(result.get('StandardOutputContent', ''), flush=True)
            if result['Status'] != 'Success':
                print(result.get('StandardErrorContent', '')[-2500:], flush=True)
                raise RuntimeError('History update ' + result['Status'])
            return
        time.sleep(3)
    raise RuntimeError('History update timed out')

for name in ['messages-monitor-patch.json', 'messages-monitor-parity.cjs', 'messages-monitor-fleet-cache.cjs', 'messages-history-cache.cjs', 'messages-monitor-release-host.py']:
    encoded = base64.b64encode(zlib.compress(pathlib.Path('deployment', name).read_bytes())).decode()
    assert len(encoded) < 16000
    code = 'import pathlib,base64,zlib; pathlib.Path(' + repr('/tmp/' + name) + ').write_bytes(zlib.decompress(base64.b64decode(' + repr(encoded) + ')))'
    ssm('python3 -c ' + shlex.quote(code), 30)
ssm('sudo python3 -u /tmp/messages-monitor-release-host.py', 360)
