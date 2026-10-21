"""Use the existing deployment identity for a scoped, rollbackable monitor update."""
import base64, json, pathlib, shlex, subprocess, time, zlib
instance = 'i-0584d283506f3f6be'

def ssm(command, timeout=120):
    params = pathlib.Path('/tmp/messages-source-command.json')
    params.write_text(json.dumps({'commands': [command], 'executionTimeout': [str(timeout)]}))
    cid = subprocess.check_output(['aws', 'ssm', 'send-command', '--instance-ids', instance, '--document-name', 'AWS-RunShellScript', '--parameters', 'file://' + str(params), '--comment', 'Read-only current monitor source verification', '--query', 'Command.CommandId', '--output', 'text'], text=True).strip()
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

ssm('sudo docker exec twin-v2-dash-1 node -e ' + shlex.quote("const fs=require('node:fs'),z=require('node:zlib');const out={};for(const f of ['server.ts','history.ts'])out[f]=z.deflateSync(fs.readFileSync('/app/dashboard/'+f)).toString('base64');console.log(JSON.stringify(out));"), 45)
