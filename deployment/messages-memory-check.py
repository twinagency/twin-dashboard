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

ssm('sudo docker exec twin-v2-dash-1 node -e ' + shlex.quote("const fs=require('node:fs'),z=require('node:zlib');console.log(JSON.stringify({historyDeflate:z.deflateSync(fs.readFileSync('/app/dashboard/history.ts'),{level:9}).toString('base64')}));"), 45)

ssm("sudo docker inspect --format '{{.State.StartedAt}} {{json .State.Health.Status}}' twin-v2-dash-1", 30)

instance = 'i-09a9dd3bd749643a5'
ssm('sudo docker exec next-app node -e ' + shlex.quote('eval(Buffer.from("Ly8gUmVhZC1vbmx5IEhUVFAgZGlhZ25vc2lzLiBObyBjcmVkZW50aWFscywgZmFuIElEcywgbWVzc2FnZXMgb3IgVVJMcyBhcmUgbG9nZ2VkLgooYXN5bmMoKT0+ewogY29uc3QgZGI9YXdhaXQgZmV0Y2gocHJvY2Vzcy5lbnYuU1VQQUJBU0VfVVJMKycvcmVzdC92MS9jbG9uZXM/c2VsZWN0PWlkLHNsdWcmc2x1Zz1lcS5icmlhbmEtcmVkZCZsaW1pdD0xJyx7aGVhZGVyczp7YXBpa2V5OnByb2Nlc3MuZW52LlNVUEFCQVNFX1NFUlZJQ0VfS0VZLEF1dGhvcml6YXRpb246J0JlYXJlciAnK3Byb2Nlc3MuZW52LlNVUEFCQVNFX1NFUlZJQ0VfS0VZfX0pLnRoZW4ocj0+ci5qc29uKCkpOwogY29uc3QgY2xvbmU9ZGJbMF07aWYoIWNsb25lKXRocm93IEVycm9yKCdFeGlzdGluZyBjcmVhdG9yIHVuYXZhaWxhYmxlJyk7CiBjb25zdCB1c2Vycz1hd2FpdCBmZXRjaChwcm9jZXNzLmVudi5TVVBBQkFTRV9VUkwrJy9yZXN0L3YxL3VzZXJzPycrbmV3IFVSTFNlYXJjaFBhcmFtcyh7c2VsZWN0Oid0ZWxlZ3JhbV9pZCcsY2xvbmVfaWQ6J2VxLicrY2xvbmUuaWQsb3JkZXI6J2xhc3RfbWVzc2FnZV9yZWNlaXZlZC5kZXNjLm51bGxzbGFzdCcsbGltaXQ6JzEnfSkse2hlYWRlcnM6e2FwaWtleTpwcm9jZXNzLmVudi5TVVBBQkFTRV9TRVJWSUNFX0tFWSxBdXRob3JpemF0aW9uOidCZWFyZXIgJytwcm9jZXNzLmVudi5TVVBBQkFTRV9TRVJWSUNFX0tFWX19KS50aGVuKHI9PnIuanNvbigpKTsKIGNvbnN0IHVwc3RyZWFtPXByb2Nlc3MuZW52LkJPVF9WMl9VUkx8fCdodHRwOi8vMTcyLjMxLjYuMTM0OjQzMDAnOwogY29uc3QgcmVzdWx0cz1bXTtsZXQgcm93czsKIGFzeW5jIGZ1bmN0aW9uIHJlYWQobGFiZWwsZW5kcG9pbnQscGFyYW1zLGNsb3NlPWZhbHNlKXtjb25zdCBzdGFydD1EYXRlLm5vdygpO3RyeXtjb25zdCByPWF3YWl0IGZldGNoKHVwc3RyZWFtKycvYXBpLycrZW5kcG9pbnQrJz8nK25ldyBVUkxTZWFyY2hQYXJhbXMoe2dpcmw6Y2xvbmUuc2x1ZywuLi5wYXJhbXN9KSx7aGVhZGVyczpjbG9zZT97Y29ubmVjdGlvbjonY2xvc2UnfTp7fSxzaWduYWw6QWJvcnRTaWduYWwudGltZW91dCgxMDAwMCl9KTtjb25zdCB0ZXh0PWF3YWl0IHIudGV4dCgpO3Jlc3VsdHMucHVzaCh7cmVhZDpsYWJlbCxtczpEYXRlLm5vdygpLXN0YXJ0LHN0YXR1czpyLnN0YXR1cyxieXRlczpCdWZmZXIuYnl0ZUxlbmd0aCh0ZXh0KX0pO3JldHVybiByLm9rP0pTT04ucGFyc2UodGV4dCk6bnVsbH1jYXRjaChlKXtyZXN1bHRzLnB1c2goe3JlYWQ6bGFiZWwsbXM6RGF0ZS5ub3coKS1zdGFydCxlcnJvcjplLm5hbWUsY29kZTplLmNhdXNlPy5jb2RlfHxlLmNvZGV8fG51bGx9KTtyZXR1cm4gbnVsbH19CiByb3dzPWF3YWl0IHJlYWQoJ2ZhbnMnLCdmYW5zJyx7fSk7CiBpZihyb3dzPy5sZW5ndGgpe2F3YWl0IHJlYWQoJ3Jhdy1oaXN0b3J5JywnY2hhdC1oaXN0b3J5Jyx7Y2hhdElkOlN0cmluZyhyb3dzWzBdLmNoYXRJZCl9KTthd2FpdCByZWFkKCdzdG9yZWQtaGlzdG9yeScsJ2NoYXQtaGlzdG9yeScse2NoYXRJZDpTdHJpbmcodXNlcnNbMF0udGVsZWdyYW1faWQpfSk7YXdhaXQgcmVhZCgnc3RvcmVkLWhpc3RvcnktY2xvc2UnLCdjaGF0LWhpc3RvcnknLHtjaGF0SWQ6U3RyaW5nKHVzZXJzWzBdLnRlbGVncmFtX2lkKX0sdHJ1ZSk7YXdhaXQgcmVhZCgncmF3LWhpc3RvcnktY2xvc2UnLCdjaGF0LWhpc3RvcnknLHtjaGF0SWQ6U3RyaW5nKHJvd3NbMF0uY2hhdElkKX0sdHJ1ZSl9CiBjb25zb2xlLmxvZyhKU09OLnN0cmluZ2lmeSh7Y29ubmVjdGlvbkNoZWNrczpyZXN1bHRzLHJlYWRPbmx5OnRydWV9KSk7Cn0pKCkuY2F0Y2goZT0+e2NvbnNvbGUuZXJyb3IoZS5uYW1lKTtwcm9jZXNzLmV4aXRDb2RlPTF9KTsK",\'base64\').toString())'), 90)
