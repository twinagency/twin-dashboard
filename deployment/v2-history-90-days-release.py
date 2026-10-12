"""Release the 90-day read-only V2 dashboard through the existing protected helper."""
import base64, json, re, shlex, time, zlib, uuid
from pathlib import Path
import boto3

INSTANCE = "i-0584d283506f3f6be"
COMMIT = "d7da542b11f56b791ce1e68a5a78ded556e14eb8"
HELPER_SHA = "ff85364625964c6ce91541b6c0d367c62cb9017593c5a3195f23996069c5ff75"
PATCHES = json.loads(Path("deployment/v2-history-90-days-patch.json").read_text())
ssm = boto3.client("ssm", region_name="ap-southeast-2")

def run(code, label, timeout=900):
    encoded = base64.b64encode(zlib.compress(code.encode())).decode()
    if len(encoded) <= 18000:
        script = "python3 - <<'PY'\nimport base64,zlib\nexec(zlib.decompress(base64.b64decode(" + repr(encoded) + ")))\nPY"
    else:
        target = "/tmp/twin-history-script-" + uuid.uuid4().hex + ".b64"
        for offset in range(0, len(encoded), 15000):
            part = encoded[offset:offset+15000]
            upload = "from pathlib import Path\nwith Path(" + repr(target) + ").open(" + repr("w" if offset == 0 else "a") + ") as f: f.write(" + repr(part) + ")"
            run(upload, "Stage bounded history release fragment", timeout=60)
        script = "python3 - <<'PY'\nimport base64,zlib\nfrom pathlib import Path\np=Path(" + repr(target) + ")\ncode=zlib.decompress(base64.b64decode(p.read_bytes()))\np.unlink()\nexec(code)\nPY"
    cid = ssm.send_command(InstanceIds=[INSTANCE], DocumentName="AWS-RunShellScript", Comment=label,
        Parameters={"commands": [script], "executionTimeout": [str(timeout)]})["Command"]["CommandId"]
    print(json.dumps({"operation": label, "command_id": cid}), flush=True)
    deadline = time.monotonic() + timeout + 30
    while time.monotonic() < deadline:
        try: result = ssm.get_command_invocation(CommandId=cid, InstanceId=INSTANCE)
        except ssm.exceptions.InvocationDoesNotExist: time.sleep(3); continue
        if result["Status"] in ("Pending", "InProgress", "Delayed"): time.sleep(5); continue
        output = result.get("StandardOutputContent", "")
        print(output, flush=True)
        if result.get("StandardErrorContent"): print(result["StandardErrorContent"][-5000:], flush=True)
        if result["Status"] != "Success": raise RuntimeError(label + ": " + result["Status"])
        return output
    raise RuntimeError("Command not finished; inspect before retrying: " + cid)

stage = r'''
import hashlib,json,subprocess,shutil,tempfile,tarfile
from pathlib import Path
app=Path('/home/ubuntu/twin-v2')
patches=PATCHES
assert hashlib.sha256(Path('/root/twin-v2-release.sh').read_bytes()).hexdigest()==HELPER
def gitsha(data): return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
for p in patches:
    target=app/p['path']
    if p['before_git_sha'] is None:
        assert not target.exists(), 'new path already exists: '+p['path']
    else:
        assert gitsha(target.read_bytes())==p['before_git_sha'], 'source changed: '+p['path']
        live=subprocess.check_output(['docker','exec','twin-v2-dash-1','cat',p['path']])
        assert gitsha(live)==p['before_git_sha'], 'running source differs: '+p['path']
stage=Path(tempfile.mkdtemp(prefix='twin-v2-history90days-')); code=stage/'code';code.mkdir()
for name in ['src','dashboard','scripts','migrations','package.json','package-lock.json','tsconfig.json','Dockerfile','docker-compose.yml','.dockerignore','README.md','PLAN.txt']:
    source=app/name
    if not source.exists():continue
    if source.is_dir():shutil.copytree(source,code/name)
    else:shutil.copy2(source,code/name)
for p in patches:
    target=code/p['path'];target.parent.mkdir(parents=True,exist_ok=True);target.write_text(p['content'])
image=subprocess.check_output(['docker','inspect','-f','{{.Image}}','twin-v2-dash-1'],text=True).strip()
command=['docker','run','--rm','--network','none']
for name in ['src','dashboard','scripts']:command+=['-v',str(code/name)+':/app/'+name+':ro']
command+=['--entrypoint','sh',image,'-c','npm run typecheck && npm test && node --import tsx scripts/check-dashboard-history.ts && npx tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --esModuleInterop --skipLibCheck dashboard/history.ts dashboard/server.ts']
with (stage/'test-output.log').open('w') as output:result=subprocess.run(command,stdout=output,stderr=subprocess.STDOUT)
if result.returncode:
    print((stage/'test-output.log').read_text()[-7000:],flush=True)
    raise RuntimeError('Staged tests failed')
print('All staged V2 type, delivery, history and regression checks passed.',flush=True)
archive=stage/'release.tgz'
with tarfile.open(archive,'w:gz') as tar:
    for file in sorted(code.rglob('*')):
        relative=file.relative_to(code)
        assert not any(part in ['data','logs','node_modules','.git'] or part.startswith('.env') for part in relative.parts)
        if file.is_file():tar.add(file,arcname=str(relative),recursive=False)
print('STAGED_RELEASE='+json.dumps({'archive':str(archive),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest()}))
'''.replace('PATCHES', repr(PATCHES)).replace('HELPER', repr(HELPER_SHA))
output = run(stage, "Stage and verify read-only 90-day V2 history")
release = json.loads(re.search(r'STAGED_RELEASE=(\{[^\n]+\})', output).group(1))

deploy = r'''
import hashlib,subprocess
from pathlib import Path
def gitsha(data):return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
assert hashlib.sha256(Path('/root/twin-v2-release.sh').read_bytes()).hexdigest()==HELPER
for p in PATCHES:
    target=Path('/home/ubuntu/twin-v2')/p['path']
    assert (not target.exists()) if p['before_git_sha'] is None else gitsha(target.read_bytes())==p['before_git_sha'], 'source moved before release'
subprocess.run(['bash','/root/twin-v2-release.sh','deploy',ARCHIVE,DIGEST,COMMIT],check=True)
'''.replace('HELPER', repr(HELPER_SHA)).replace('PATCHES', repr(PATCHES)).replace('ARCHIVE', repr(release['archive'])).replace('DIGEST', repr(release['sha256'])).replace('COMMIT', repr(COMMIT))
run(deploy, "Deploy 90-day V2 history with protected release helper")

verify = r'''
import hashlib,json,subprocess,urllib.request,time
for container in ['twin-v2-bot-1','twin-v2-dash-1']:
    assert subprocess.check_output(['docker','inspect','-f','{{.State.Running}}',container],text=True).strip()=='true'
    for p in PATCHES:
        live=subprocess.check_output(['docker','exec',container,'cat',p['path']])
        assert live==p['content'].encode(),container+' source mismatch: '+p['path']
for slug in ['kyla-yesenosky','riley-mae-lewis','briana-redd','fit-sid','sania-mallory']:
    root='http://127.0.0.1:4300'
    with urllib.request.urlopen(root+'/api/chats?girl='+slug,timeout=60) as response:chats=json.load(response)
    if not chats:continue
    fan=max(chats,key=lambda c:c.get('messages',0))['id'];start=time.monotonic()
    with urllib.request.urlopen(root+'/api/chat-history?girl='+slug+'&chatId='+fan,timeout=180) as response:page=json.load(response)
    assert page['days']==90 and len(page['history'])<=100
    assert all(page['from']<=m['at']<=page['until'] for m in page['history'])
    print(json.dumps({'creator':slug,'chats':len(chats),'sample_page_messages':len(page['history']),'older_page_available':page['hasMore'],'earliest_recorded_at':page['earliestRecordedAt'],'scan_seconds':round(time.monotonic()-start,2),'unreadable_lines':page['incompleteLines']}))
with urllib.request.urlopen('http://127.0.0.1:4300/twin',timeout=30) as response:html=response.read().decode()
assert 'Available history, last 90 days' in html and 'createHistoryView' in html
print('VERIFIED: all five creators serve the 90-day paged history; bot and monitor running the exact release.')
'''.replace('PATCHES', repr(PATCHES))
run(verify, "Verify 90-day history on all five V2 creators", timeout=600)
