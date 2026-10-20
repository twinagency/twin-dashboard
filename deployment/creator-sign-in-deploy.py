"""Pinned sign-in release. Run only through the scoped deployment helper.

No credentials, Docker environment values or provider data are printed. Each
phase is explicit; existing database, bot and vault containers are preserved.
"""
import hashlib
import json
import os
import pathlib
import secrets
import shutil
import subprocess
import sys
import time
import urllib.request

NATIVE_COMMIT = '0525e51aa690b44d1c9f1dc0bc2b9aed6baa627a'
DASHBOARD_COMMIT = 'aaffe90fddb1631862edc34a89c40e9965b1e180'
REGISTRY = '323149985112.dkr.ecr.ap-southeast-2.amazonaws.com'
REPOSITORY = REGISTRY + '/twin-dashboard@sha256:'
RUNTIME_IMAGE = REPOSITORY + 'e5611032fbf5d5b4f9b3962515b5332efcca06e39c9d267177b089ef94d23554'
BROWSER_IMAGE = REPOSITORY + 'bd438064738e17f8524b7ee2dc5694e22412033940ef6dc369ef2bdb81fee300'
DASHBOARD_IMAGE = REPOSITORY + '513336b02ac04335ed65bb919e65b45f9a5b9d567709a71354ccdb506f968a02'
BACKUP = pathlib.Path('/var/backups/twin-private-signin-0525e51-20261020')
OLD_BASE = pathlib.Path('/opt/twin-onlyfans/releases/995d031b326df68f39d488b5bc487549d0626307/deploy/onlyfans-compose.yml')
RELEASE = pathlib.Path('/opt/twin-onlyfans/releases') / NATIVE_COMMIT / 'deploy'
CONFIG = pathlib.Path('/etc/twin-onlyfans')
OVERLAY = CONFIG / 'creator-sign-in-release-compose.json'
DASHBOARD_ENV = pathlib.Path('/home/ubuntu/allieai2-dashboard/.env')
SERVICE_ENV = CONFIG / 'creator-sign-in.env'
NAMES = ['next-app', 'twin-onlyfans-api-1', 'twin-onlyfans-worker-1', 'twin-onlyfans-database-1', 'flirt-bot', 'flirt-dashboard']


def run(args, *, data=None, timeout=180):
    result = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    if result.returncode:
        # Arguments and stderr may contain private config. Neither is reported.
        raise RuntimeError('Command failed: ' + args[0] + ' (exit ' + str(result.returncode) + ')')
    return result.stdout


def inspect(names):
    return json.loads(run(['docker', 'inspect', *names]))


def environment(record):
    return dict(line.split('=', 1) for line in record['Config']['Env'] if '=' in line)


def write_private(path, content):
    temporary = path.with_name(path.name + '.new')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as handle:
        handle.write(content)
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)


def compose(*args, original=False):
    base = OLD_BASE if original else RELEASE / 'onlyfans-compose.yml'
    overlay = CONFIG / 'host-compose.json' if original else OVERLAY
    return run(['docker', 'compose', '--project-name', 'twin-onlyfans', '--project-directory', str(base.parent),
                '--env-file', str(CONFIG / 'compose.env'), '-f', str(base), '-f', str(overlay), *args], timeout=240)


def upload_gate():
    busy = subprocess.run(['pgrep', '-f', r'^(/usr/bin/|/bin/)?(bash |sudo )?/usr/local/bin/twin-pull.sh( |$)'], stdout=subprocess.PIPE)
    if busy.returncode != 1:
        raise RuntimeError('Deployment state is busy or unconfirmed')
    code = "const fs=require('node:fs');if(process.env.SUPABASE_URL!=='https://aouaenqayfltoqrmpitg.supabase.co')process.exit(2);const n=fs.readdirSync('/tmp').filter(x=>x.startsWith('creator-upload-')).length;console.log(JSON.stringify({stagedUploads:n}));process.exit(n?3:0)"
    result = run(['docker', 'exec', 'next-app', 'node', '-e', code])
    print('PASS dashboard upload-idle gate: ' + result.decode().strip(), flush=True)


def native_counts():
    code = '''import json,os
from sqlalchemy import create_engine,select,func
from db.onlyfans_models import OfRuntime
from db.onlyfans_delivery_models import OfDeliveryPolicy
from db.onlyfans_connection_models import OfProviderConnection
from db.models import OfCreatorBinding
with create_engine(os.environ['DATABASE_URL']).connect() as c:
 print(json.dumps({"bindings":c.scalar(select(func.count()).select_from(OfCreatorBinding)),"connections":c.scalar(select(func.count()).select_from(OfProviderConnection)),"enabledRuntimes":c.scalar(select(func.count()).select_from(OfRuntime).where(OfRuntime.enabled.is_(True))),"enabledPolicies":c.scalar(select(func.count()).select_from(OfDeliveryPolicy).where(OfDeliveryPolicy.enabled.is_(True)))}))
'''
    return json.loads(run(['docker', 'exec', '-i', 'twin-onlyfans-api-1', 'python', '-'], data=code.encode()))


def browser_record():
    ids = compose('ps', '-q', 'creator-sign-in').decode().split()
    if len(ids) != 1:
        raise RuntimeError('Expected one private sign-in container')
    return inspect(ids)[0]


def wait_native():
    for _ in range(60):
        try:
            value = json.loads(run(['curl', '--fail', '--silent', '--max-time', '3', 'http://127.0.0.1:8788/healthz']))
            if value.get('ok'):
                return
        except (RuntimeError, ValueError):
            pass
        time.sleep(2)
    raise RuntimeError('Native API did not become healthy')


def pull():
    if shutil.disk_usage('/').free < 4 * 1024**3:
        raise RuntimeError('Image pull needs at least4GiB free; no images were pruned')
    password = run(['aws', 'ecr', 'get-login-password', '--region', 'ap-southeast-2'])
    try:
        run(['docker', 'login', '--username', 'AWS', '--password-stdin', REGISTRY], data=password)
    finally:
        password = None
    for image in [RUNTIME_IMAGE, BROWSER_IMAGE, DASHBOARD_IMAGE]:
        run(['docker', 'pull', image], timeout=900)
        record = json.loads(run(['docker', 'image', 'inspect', image]))[0]
        if image not in record.get('RepoDigests', []):
            raise RuntimeError('Pulled image digest not confirmed')
        print('PASS pulled immutable image ' + image, flush=True)
    print(json.dumps({'freeDiskMiB': shutil.disk_usage('/').free // 1024**2}), flush=True)
    if shutil.disk_usage('/').free < 1024**3:
        raise RuntimeError('Insufficient rollout headroom after pulls')


def native():
    old_data = OLD_BASE.read_bytes().replace(b'\r\n', b'\n')
    if hashlib.sha1(b'blob ' + str(len(old_data)).encode() + b'\0' + old_data).hexdigest() != '61fdf6c2114d16d384ec6992101e223968a140d3':
        raise RuntimeError('Existing base compose differs from tested release; normalized Git blob=' + hashlib.sha1(b'blob ' + str(len(old_data)).encode() + b'\0' + old_data).hexdigest())
    RELEASE.mkdir(parents=True, exist_ok=True)
    (RELEASE / 'onlyfans-compose.yml').write_bytes(old_data)
    url = 'https://raw.githubusercontent.com/microsoft/playwright/v1.61.1/utils/docker/seccomp_profile.json'
    with urllib.request.urlopen(url, timeout=30) as response:
        profile = json.load(response)
    first = profile['syscalls'][0]
    if first['names'] != ['clone', 'setns', 'unshare']:
        raise RuntimeError('Unexpected pinned Microsoft seccomp source')
    first['names'].insert(1, 'chroot')
    first['comment'] = 'Allow Chromium user namespaces and their chroot sandbox without host capabilities'
    canonical = json.dumps(profile, sort_keys=True, separators=(',', ':')).encode()
    if hashlib.sha256(canonical).hexdigest() != 'fe014a34956d42ab3d12f982a2727a073cb2626307ec50b163e554c3dd486112':
        raise RuntimeError('Seccomp profile differs from tested security policy')
    seccomp = CONFIG / 'creator-sign-in-seccomp.json'
    seccomp.write_text(json.dumps(profile, indent=2) + '\n')
    os.chmod(seccomp, 0o644)
    if not SERVICE_ENV.exists():
        existing = environment(inspect(['twin-onlyfans-api-1'])[0])
        token = secrets.token_hex(32)
        if token in existing.values():
            raise RuntimeError('A distinct service credential is required')
        write_private(SERVICE_ENV, 'ONLYFANS_SIGNIN_TOKEN=' + token + '\n')
    host = json.loads((CONFIG / 'host-compose.json').read_text())
    for service in ['api', 'worker']:
        host['services'][service]['image'] = RUNTIME_IMAGE
    host['services']['creator-sign-in'] = {
        'image': BROWSER_IMAGE, 'init': True, 'restart': 'unless-stopped',
        'read_only': True, 'user': 'pwuser', 'cap_drop': ['ALL'],
        'security_opt': ['no-new-privileges:true', 'seccomp=' + str(seccomp)],
        'tmpfs': ['/tmp:rw,nosuid,nodev,size=256m,mode=1777'],
        'shm_size': '256m', 'mem_limit': '1536m', 'cpus': 1.0, 'pids_limit': 256,
        'env_file': str(SERVICE_ENV),
        'environment': {'ONLYFANS_SIGNIN_MAX_BROWSERS': '1', 'PORT': '8479'},
        'expose': ['8479'], 'stop_grace_period': '20s',
        'healthcheck': {'test': ['CMD', 'node', '-e', "fetch('http://127.0.0.1:8479/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],
                        'interval': '15s', 'timeout': '5s', 'retries': 3}}
    write_private(OVERLAY, json.dumps(host, indent=2) + '\n')
    before = inspect(['twin-onlyfans-database-1', 'flirt-bot', 'flirt-dashboard'])
    # Never include database, migrate or unrelated bots in this operation.
    compose('up', '--no-build', '--no-deps', '-d', 'api', 'worker', 'creator-sign-in')
    wait_native()
    after = inspect(['twin-onlyfans-database-1', 'flirt-bot', 'flirt-dashboard'])
    if [v['Id'] for v in before] != [v['Id'] for v in after]:
        raise RuntimeError('An unrelated container unexpectedly changed')
    print('PASS native API/worker release and private browser started; database and bot containers preserved', flush=True)


def verify_native():
    wait_native()
    browser = browser_record()
    for _ in range(40):
        browser = inspect([browser['Id']])[0]
        if browser['State'].get('Health', {}).get('Status') == 'healthy':
            break
        time.sleep(2)
    else:
        raise RuntimeError('Private browser health check failed')
    hc = browser['HostConfig']
    if (browser['Config']['Image'] != BROWSER_IMAGE or browser['Config']['User'] != 'pwuser'
            or not hc['ReadonlyRootfs'] or hc.get('PortBindings') or hc['CapDrop'] != ['ALL']
            or 'no-new-privileges:true' not in hc['SecurityOpt'] or hc['Memory'] != 1536*1024**2
            or hc['PidsLimit'] != 256):
        raise RuntimeError('Private browser isolation settings differ')
    output = run(['docker', 'exec', '-e', 'TWIN_SIGNIN_TEST_HEADED=1', '-e', 'TWIN_SIGNIN_TEST_SANDBOX=1',
                  browser['Id'], 'xvfb-run', '-a', 'node', 'creator-sign-in/check.mjs'], timeout=180)
    if b'PASS self-hosted sign-in' not in output:
        raise RuntimeError('Target-host headed sandboxed browser fixture failed')
    print(output.decode().strip(), flush=True)
    code = "const assert=require('node:assert/strict');(async()=>{assert.equal((await fetch('http://creator-sign-in:8479/health')).status,200);assert.equal((await fetch('http://creator-sign-in:8479/v1/attempts')).status,401);console.log('PASS private Docker reachability and unauthenticated refusal');})().catch(()=>process.exit(1));"
    print(run(['docker', 'exec', 'next-app', 'node', '-e', code]).decode().strip(), flush=True)
    # Exercise the existing connection configuration without recording an
    # enrollment or contacting the provider. Do not output the private context.
    code = '''import json,os,urllib.request
from onlyfans_commands.connection_api import configured
assert configured() is not None
req=urllib.request.Request('http://127.0.0.1:8787/onlyfans/connection/v1/capture-context',data=json.dumps({'creatorId':'signin-deployment-probe','accountId':None}).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+os.environ['ONLYFANS_CONNECTION_TOKEN'],'X-OnlyFans-Connection-Version':'of-connections.v1'})
with urllib.request.urlopen(req,timeout=10) as r:v=json.load(r)
assert v['ok'] and v['context']['accountId'] is None and v['context']['ownerId'] is None and v['context']['proxyUrl'] is None
print('PASS private native capture-context; no enrollment or provider I/O')
'''
    print(run(['docker', 'exec', '-i', 'twin-onlyfans-api-1', 'python', '-'], data=code.encode()).decode().strip(), flush=True)
    rows = inspect(['twin-onlyfans-api-1', 'twin-onlyfans-worker-1'])
    if any(v['Config']['Image'] != RUNTIME_IMAGE or not v['State']['Running'] for v in rows):
        raise RuntimeError('Native release image or running state differs')
    counts = native_counts()
    if counts != json.loads((BACKUP / 'native-counts-before.json').read_text()):
        raise RuntimeError('Native activation/connection counts changed unexpectedly')
    write_private(BACKUP / 'target-browser-verified.json', json.dumps({'image': BROWSER_IMAGE, 'native': RUNTIME_IMAGE, 'nativeCounts': counts}))
    print(json.dumps({'nativeCounts': counts, 'privateHostPortPublished': False}), flush=True)


def dashboard():
    proof = json.loads((BACKUP / 'target-browser-verified.json').read_text())
    if proof['image'] != BROWSER_IMAGE or proof['native'] != RUNTIME_IMAGE:
        raise RuntimeError('Matching target-host browser proof required')
    upload_gate()
    token = SERVICE_ENV.read_text().strip().split('=', 1)[1]
    old_lines = DASHBOARD_ENV.read_text().splitlines()
    settings = {'ONLYFANS_SIGNIN_BASE_URL': 'http://creator-sign-in:8479', 'ONLYFANS_SIGNIN_TOKEN': token}
    lines = [line for line in old_lines if not any(line.startswith(key+'=') for key in settings)]
    lines.extend(key + '=' + value for key, value in settings.items())
    write_private(DASHBOARD_ENV, '\n'.join(lines) + '\n')
    # Existing documented release interface; its contents are not read.
    run(['/usr/local/bin/twin-pull.sh', DASHBOARD_IMAGE, 'next-app', '/home/ubuntu/allieai2-dashboard',
         '-p', '127.0.0.1:3001:3001', '-e', 'PORT=3001', '--network', 'twin-onlyfans_default'], timeout=240)
    print('PASS existing deployment interface completed the pinned dashboard swap', flush=True)


def verify():
    rows = inspect(NAMES)
    if not all(v['State']['Running'] for v in rows):
        raise RuntimeError('An existing service is not running')
    current = rows[0]
    env = environment(current)
    browser_env = environment(browser_record())
    if (current['Config']['Image'] != DASHBOARD_IMAGE or env.get('GIT_SHA') != DASHBOARD_COMMIT
            or env.get('ONLYFANS_SIGNIN_BASE_URL') != 'http://creator-sign-in:8479'
            or env.get('ONLYFANS_SIGNIN_TOKEN') != browser_env.get('ONLYFANS_SIGNIN_TOKEN')
            or len(env.get('ONLYFANS_SIGNIN_TOKEN', '')) < 32):
        raise RuntimeError('Running dashboard release/configuration not confirmed')
    native_env = environment(inspect(['twin-onlyfans-api-1'])[0])
    if (not env.get('ONLYFANS_CONNECTION_TOKEN') or env.get('ONLYFANS_CONNECTION_TOKEN') != native_env.get('ONLYFANS_CONNECTION_TOKEN')
            or env['ONLYFANS_SIGNIN_TOKEN'] in [env.get('ONLYFANS_'+p+'_TOKEN') for p in ['API','CONTROL','CONFIGURATION','CAMPAIGN','CONTENT','CONNECTION']]):
        raise RuntimeError('Existing private connection configuration does not match')
    # Real dashboard-to-native authenticated request, with private headers and
    # response kept inside the container. No provider access or database write.
    code = "const assert=require('node:assert/strict');(async()=>{const r=await fetch(process.env.ONLYFANS_API_BASE_URL.replace(/\\/+$/,'')+'/onlyfans/connection/v1/capture-context',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.ONLYFANS_CONNECTION_TOKEN,'X-OnlyFans-Connection-Version':'of-connections.v1'},body:JSON.stringify({creatorId:'signin-deployment-probe',accountId:null})});assert.equal(r.status,200);assert.equal((await r.json()).ok,true);console.log('PASS dashboard authenticated native capture-context');})().catch(()=>process.exit(1));"
    print(run(['docker', 'exec', 'next-app', 'node', '-e', code]).decode().strip(), flush=True)
    for _ in range(40):
        try:
            run(['curl', '--fail', '--silent', '--output', '/dev/null', '--max-time', '5', 'https://dashboard.tgaiclone.xyz/'])
            break
        except RuntimeError:
            time.sleep(2)
    else:
        raise RuntimeError('Public HTTPS is unavailable')
    code = "const assert=require('node:assert/strict');(async()=>{const r=await fetch('http://127.0.0.1:3001/creator-auth/platforms/onlyfans/sign-in');assert.equal(r.status,401);console.log('PASS deployed sign-in route rejects unauthenticated requests');})().catch(()=>process.exit(1));"
    print(run(['docker', 'exec', 'next-app', 'node', '-e', code]).decode().strip(), flush=True)
    original = json.loads((BACKUP / 'containers-before.json').read_text())
    preserved = ['twin-onlyfans-database-1', 'flirt-bot', 'flirt-dashboard']
    if {v['Name']:v['Id'] for v in original if v['Name'].lstrip('/') in preserved} != {v['Name']:v['Id'] for v in rows if v['Name'].lstrip('/') in preserved}:
        raise RuntimeError('Original database or Telegram container identity changed')
    counts = native_counts()
    if counts != json.loads((BACKUP / 'native-counts-before.json').read_text()):
        raise RuntimeError('Connection/activation baseline changed unexpectedly')
    result = {'dashboardCommit': env['GIT_SHA'], 'dashboardImage': DASHBOARD_IMAGE, 'nativeCommit': NATIVE_COMMIT,
              'allExistingServicesRunning': True, 'nativeCounts': counts, 'publicHTTPS': True,
              'freeDiskMiB': shutil.disk_usage('/').free // 1024**2}
    write_private(BACKUP / 'release-verified.json', json.dumps(result, indent=2))
    print(json.dumps(result), flush=True)


def rollback_dashboard():
    upload_gate()
    original = json.loads((BACKUP / 'containers-before.json').read_text())
    image = next(v['Config']['Image'] for v in original if v['Name'] == '/next-app')
    write_private(DASHBOARD_ENV, (BACKUP / 'home_ubuntu_allieai2-dashboard_.env').read_text())
    run(['/usr/local/bin/twin-pull.sh', image, 'next-app', '/home/ubuntu/allieai2-dashboard', '-p', '127.0.0.1:3001:3001', '-e', 'PORT=3001', '--network', 'twin-onlyfans_default'], timeout=240)
    print('PASS restored original dashboard image and private settings', flush=True)


def checks():
    scripts = ['catalogue-preview-check.cjs'] if sys.argv[1] == 'catalogue' else ['dashboard-recovery-check.cjs', 'catalogue-preview-check.cjs']
    for script in scripts:
        # Established read-only post-deployment checks. Responses remain private.
        result = subprocess.run(['docker', 'exec', 'next-app', 'node', script], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=240)
        output = (result.stdout + b'\n' + result.stderr).decode(errors='replace')
        write_private(BACKUP / (script + '.log'), output)
        if result.returncode:
            # The established preview check emits these bounded labels without
            # URLs or credentials. Complete diagnostics stay root-only.
            import re
            for line in output.splitlines():
                if re.fullmatch(r'(?:Live video preview check: \d+ passed, \d+ failed|Live video preview check could not complete|Video preview failed for item [a-f0-9-]+: (?:download|probe|metadata|encode|output|poster|upload|verification)/(?:timeout|killed|invalid|failed))', line):
                    print(line, flush=True)
            raise RuntimeError('Existing post-deployment check failed: ' + script)
        print('PASS existing post-deployment check: ' + script, flush=True)
    for name in NAMES:
        if not inspect([name])[0]['State']['Running']:
            raise RuntimeError('An existing service stopped during checks')


def rollback_native():
    compose('stop', 'creator-sign-in')
    compose('up', '--no-build', '--no-deps', '-d', 'api', 'worker', original=True)
    wait_native()
    print('PASS restored original native API/worker; database untouched', flush=True)


def baseline_catalogue():
    # Run the prior immutable dashboard image against its original private env,
    # with no ports or persistent mounts. Establish whether the same source
    # inventory fails independently of this sign-in release.
    original = json.loads((BACKUP / 'containers-before.json').read_text())
    image = next(v['Config']['Image'] for v in original if v['Name'] == '/next-app')
    name = 'twin-sign-in-baseline-preview-0525e51'
    if subprocess.run(['docker', 'inspect', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        raise RuntimeError('Previous isolated baseline check still exists; inspect before continuing')
    try:
        result = subprocess.run(['docker', 'run', '--rm', '--name', name, '--network', 'twin-onlyfans_default',
                                 '--env-file', str(BACKUP / 'home_ubuntu_allieai2-dashboard_.env'),
                                 '--memory', '1400m', '--cpus', '0.5', '--pids-limit', '256',
                                 image, 'node', 'catalogue-preview-check.cjs'],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=240)
        output = (result.stdout + b'\n' + result.stderr).decode(errors='replace')
        write_private(BACKUP / 'catalogue-baseline-image.log', output)
        import re
        failed = sorted(re.findall(r'Video preview failed for item ([a-f0-9-]+):', output))
        current_output = (BACKUP / 'catalogue-preview-check.cjs.log').read_text()
        current_failed = sorted(re.findall(r'Video preview failed for item ([a-f0-9-]+):', current_output))
        summary = re.search(r'Live video preview check: (\d+) passed, (\d+) failed', output)
        if not summary or failed != current_failed or result.returncode not in [0, 1]:
            raise RuntimeError('Baseline catalogue comparison was inconclusive')
        evidence = {'priorDashboardImage': image, 'passed': int(summary[1]), 'failed': int(summary[2]),
                    'sameFailedItemsAsCandidate': True, 'failureStage': 'probe/invalid', 'itemIds': failed}
        write_private(BACKUP / 'catalogue-baseline-comparison.json', json.dumps(evidence))
        print(json.dumps(evidence), flush=True)
    finally:
        if subprocess.run(['docker', 'inspect', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
            run(['docker', 'stop', '--time', '15', name], timeout=30)


def anonymous_screen():
    # Open only the provider's unauthenticated screen through the real private
    # API. No credentials or input are supplied, and the attempt is cancelled.
    code = r'''const {randomUUID,createHash}=require('node:crypto');
const sharp=require('sharp');
(async()=>{
 const root=process.env.ONLYFANS_SIGNIN_BASE_URL,headers={Authorization:'Bearer '+process.env.ONLYFANS_SIGNIN_TOKEN,'X-Twin-Creator':'signin-anonymous-release-probe','X-Twin-Actor':'creator-session:'+'c'.repeat(64),'Content-Type':'application/json'};
 let id;
 const call=async(path,body)=>{const r=await fetch(root+path,{method:body===undefined?'GET':'POST',headers,...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Private screen probe request failed '+r.status);return r;};
 try{
  const body=await(await call('/v1/attempts',{startKey:randomUUID(),network:{accountId:null,ownerId:null,proxyUrl:null,fingerprint:createHash('sha256').update('twin-capture-network.v1\0').digest('hex')}})).json();
  id=body.attempt.id;let attempt=body.attempt;
  for(let n=0;n<40&&attempt.phase==='opening';n++){await new Promise(r=>setTimeout(r,1000));attempt=(await(await call('/v1/attempts/'+id)).json()).attempt;}
  if(attempt.phase!=='waiting')throw Error('Anonymous provider screen unavailable: '+attempt.phase);
  await new Promise(r=>setTimeout(r,5000));
  const frame=Buffer.from(await(await call('/v1/attempts/'+id+'/frame')).arrayBuffer());
  const thumbnail=await sharp(frame).resize({width:320}).jpeg({quality:40}).toBuffer();
  if(thumbnail.length>14000)throw Error('Anonymous screen exceeds bounded output');
  console.log(JSON.stringify({anonymousProviderScreen:true,frameBase64:thumbnail.toString('base64')}));
 }finally{if(id)await call('/v1/attempts/'+id+'/cancel',{});}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
'''
    output = run(['docker', 'exec', '-i', 'next-app', 'node', '-'], data=code.encode(), timeout=100)
    # This bounded image contains only a new anonymous login page, never an
    # account frame, capture, cookie, password or creator's live attempt.
    print(output.decode().strip(), flush=True)


def health():
    rows = inspect(NAMES)
    if not all(v['State']['Running'] for v in rows):
        raise RuntimeError('An existing service stopped')
    current = rows[0]
    if environment(current).get('GIT_SHA') != DASHBOARD_COMMIT or current['Config']['Image'] != DASHBOARD_IMAGE:
        raise RuntimeError('Dashboard release changed unexpectedly')
    if browser_record()['State'].get('Health', {}).get('Status') != 'healthy':
        raise RuntimeError('Private browser service is not healthy')
    wait_native()
    run(['curl', '--fail', '--silent', '--output', '/dev/null', '--max-time', '10', 'https://dashboard.tgaiclone.xyz/'])
    print(json.dumps({'allExistingServicesRunning': True, 'privateBrowserHealthy': True, 'nativeAPIHealthy': True,
                      'publicHTTPS': True, 'dashboardCommit': DASHBOARD_COMMIT,
                      'freeDiskMiB': shutil.disk_usage('/').free//1024**2}), flush=True)


try:
    if not BACKUP.is_dir() or not (BACKUP / 'containers-before.json').is_file():
        raise RuntimeError('Validated private recovery backup missing')
    if int(next(line.split()[1] for line in open('/proc/meminfo') if line.startswith('MemTotal:'))) < 3500*1024:
        raise RuntimeError('Approved4GiB host required')
    {'pull': pull, 'native': native, 'verify-native': verify_native, 'dashboard': dashboard, 'verify': verify, 'health': health, 'checks': checks, 'catalogue': checks, 'baseline-catalogue': baseline_catalogue, 'anonymous-screen': anonymous_screen,
     'rollback-dashboard': rollback_dashboard, 'rollback-native': rollback_native}[sys.argv[1]]()
except Exception as exc:
    # No exception URLs, command arguments, environment values or provider body.
    print('Release phase failed: ' + (str(exc) if isinstance(exc, RuntimeError) else type(exc).__name__), file=sys.stderr)
    sys.exit(1)
