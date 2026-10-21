"""Use the existing deployment identity for a scoped, rollbackable monitor update."""
import base64, json, pathlib, shlex, subprocess, time, zlib
instance = 'i-0584d283506f3f6be'

def ssm(command, timeout=120):
    params = pathlib.Path('/tmp/messages-memory-command.json')
    params.write_text(json.dumps({'commands': [command], 'executionTimeout': [str(timeout)]}))
    cid = subprocess.check_output(['aws', 'ssm', 'send-command', '--instance-ids', instance, '--document-name', 'AWS-RunShellScript', '--parameters', 'file://' + str(params), '--comment', 'Read-only monitor memory diagnosis', '--query', 'Command.CommandId', '--output', 'text'], text=True).strip()
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

ssm('sudo docker inspect --format \'{{.State.Status}} OOM={{.State.OOMKilled}} restarts={{.RestartCount}} image={{.Image}}\' twin-v2-dash-1\nsudo docker exec twin-v2-dash-1 node -e \'console.log(JSON.stringify({node:process.version,heapLimit:require(\'"\'"\'node:v8\'"\'"\').getHeapStatistics().heap_size_limit}))\'\nsudo docker logs --tail 100 twin-v2-dash-1 2>&1 | python3 -c \'import sys; print(\'"\'"\'\'"\'"\'.join(l for l in sys.stdin if any(t in l for t in [\'"\'"\'FATAL ERROR\'"\'"\',\'"\'"\'heap limit\'"\'"\',\'"\'"\'heap out of memory\'"\'"\',\'"\'"\'Allocation failed\'"\'"\',\'"\'"\'Mark-Compact\'"\'"\',\'"\'"\'Scavenge\'"\'"\',\'"\'"\'monitor on\'"\'"\'])))\'\ngrep -E \'MemTotal|MemAvailable\' /proc/meminfo', 60)
