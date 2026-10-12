"""Guarded host release: prepare/resume protocol, then existing pull helper.

The only legacy bootstrap allowed is the verified PR 77 runtime, after two
fresh quiet observations. No synthetic messages, DB writes or claim clearing.
"""
import datetime
import json
import pathlib
import re
import subprocess
import sys
import tempfile
import time

LEGACY_SHA = '47993445e23c5eec2f3a4a38f1b40930253e8ac6'
NATURAL_EXIT_SHA = 'ce490124368e3b6042dc4f7c8b9a89462ee85a58'
NATURAL_EXIT_IMAGE = 'sha256:8fa315f0a643f9cf920ee8c0fa747ee4e1ddc5f4adc5f2f8012a1b1f35fe3e62'
STATUS_JS = """const fs=require('node:fs');let status=null;
try{status=JSON.parse(fs.readFileSync('/tmp/twin-runtime-drain.json','utf8'))}catch{}
console.log(JSON.stringify({sha:process.env.GIT_SHA,status}));"""
QUIET_JS = r"""
import {createClient} from '@supabase/supabase-js';
const e=process.env;
if(new URL(e.SUPABASE_URL).hostname!=='aouaenqayfltoqrmpitg.supabase.co')throw Error('Wrong database');
const db=createClient(e.SUPABASE_URL,e.SUPABASE_SERVICE_KEY,{auth:{persistSession:false}});
const now=Date.now(),since=new Date(now-900000).toISOString();
const rows=await db.from('system_logs').select('ts,source,clone_id,telegram_id,detail',{count:'exact'})
 .in('source',['trace','telegram-ingress']).gte('ts',since).order('ts').limit(5000);
const paid=await db.from('offer_delivery_attempts').select('id',{count:'exact',head:true}).in('status',['sending','uncertain']);
const paywall=await db.from('paywall_delivery_claims').select('id',{count:'exact',head:true}).in('state',['claimed','sending','uncertain']);
if(rows.error||paid.error||paywall.error||!rows.data||rows.count!==rows.data.length||rows.data.length>=5000)throw Error('Incomplete quiet evidence');
const excluded=new Set(),incoming=new Map(),finished=new Map();
for(const r of rows.data){const d=r.detail||{},key=r.clone_id+':'+r.telegram_id;
 if(r.source==='telegram-ingress'&&d.event==='excluded')excluded.add(key+':'+d.updateId);
 if(r.source==='trace'&&d.incoming&&d.outcome!=='delivery_pending'&&(d.pendingTransports||0)===0){
  finished.set(key,Math.max(finished.get(key)||0,d.incoming.updateId));
 }
}
let last=0;
for(const r of rows.data){const d=r.detail||{},key=r.clone_id+':'+r.telegram_id;
 if(r.source!=='telegram-ingress'||d.event!=='received'||d.updateType!=='business_message'
 ||d.senderTelegramId!==d.chatId||excluded.has(key+':'+d.updateId))continue;
 const stamp=Date.parse(r.ts);last=Math.max(last,stamp);
 if(!incoming.has(key)||incoming.get(key).id<d.updateId)incoming.set(key,{id:d.updateId,stamp});
}
const unmatched=[...incoming].filter(([key,r])=>(finished.get(key)||0)<r.id).length;
const quietMs=last?now-last:900000;
console.log(JSON.stringify({observedAt:new Date(now).toISOString(),rows:rows.data.length,
 eligibleConversations:incoming.size,unmatched,quietMs,paidClaims:paid.count,paywallClaims:paywall.count,
 ready:rows.data.length>0&&unmatched===0&&quietMs>=15000&&paid.count===0&&paywall.count===0}));
"""

def run(*args, timeout=30):
    return subprocess.check_output(args, text=True, timeout=timeout).strip()

def container_node(container, source, module=False):
    args = ['sudo', 'docker', 'exec', container, 'node', '--import', 'dotenv/config']
    if module:
        args += ['--input-type=module']
    return json.loads(run(*args, '-e', source))

def read_runtime(container):
    return container_node(container, STATUS_JS)

def read_stopped_runtime(container):
    info = json.loads(run('sudo', 'docker', 'inspect', container))[0]
    env = dict(x.split('=', 1) for x in info['Config']['Env'])
    receipt = None
    if not info['State']['Running']:
        with tempfile.TemporaryDirectory(prefix='twin_drain_receipt_') as folder:
            path = pathlib.Path(folder) / 'status.json'
            copied = subprocess.run(['sudo', 'docker', 'cp', container + ':/tmp/twin-runtime-drain.json', str(path)],
                                    capture_output=True, text=True, timeout=20)
            if copied.returncode == 0:
                try:
                    receipt = json.loads(path.read_text())
                except (ValueError, OSError):
                    pass
    return {'sha': env.get('GIT_SHA'), 'image': info['Image'], 'status': receipt,
            'running': info['State']['Running'], 'exitCode': info['State']['ExitCode'],
            'containerId': info['Id'], 'startedAt': info['State']['StartedAt'], 'finishedAt': info['State']['FinishedAt']}

def prepare_natural_exit(container, runtime, deadline):
    # Only this exact observed image has the pre-fix natural-exit defect. A
    # stopped process may substitute fresh on-disk zero-work proof for stdout;
    # every future runtime must survive prepare and use the normal TERM guard.
    status = runtime.get('status') or {}
    if (status.get('protocol') != 1 or status.get('gitSha') != NATURAL_EXIT_SHA or status.get('state') != 'running'
            or not isinstance(status.get('pid'), int) or status['pid'] <= 0):
        raise RuntimeError('Release held: incident runtime is not idle/running')
    initial = read_stopped_runtime(container)
    if initial['sha'] != NATURAL_EXIT_SHA or initial['image'] != NATURAL_EXIT_IMAGE or not initial['running']:
        raise RuntimeError('Release held: exact incident image is not running')
    requested = int(time.time() * 1000)
    run('sudo', 'docker', 'kill', '--signal=USR2', container)
    try:
        while time.monotonic() < deadline:
            stopped = read_stopped_runtime(container)
            if (stopped['sha'] != NATURAL_EXIT_SHA or stopped['image'] != NATURAL_EXIT_IMAGE
                    or stopped['containerId'] != initial['containerId'] or stopped['startedAt'] != initial['startedAt']):
                raise RuntimeError('Incident runtime identity changed during preparation')
            if not stopped['running']:
                s = stopped.get('status') or {}
                if (stopped['exitCode'] == 0 and s.get('protocol') == 1 and s.get('state') == 'ready'
                        and s.get('gitSha') == NATURAL_EXIT_SHA and s.get('pid') == status.get('pid')
                        and s.get('requestedAt', 0) >= requested - 1000 and s.get('updatedAt', 0) >= requested
                        and s.get('pendingTurns') == 0 and s.get('pendingBackground') == 0):
                    print(json.dumps({'verifiedNaturalExit': stopped}), flush=True)
                    return {'verifiedNaturalExit': stopped}
                raise RuntimeError('Incident runtime did not leave fresh complete drain proof')
            try:
                current = read_runtime(container)
            except subprocess.CalledProcessError:
                # Natural exit can happen between inspect and exec. Re-read
                # its stopped receipt rather than mistaking that race for a
                # failed preparation and restarting a completed process.
                if not read_stopped_runtime(container)['running']:
                    continue
                raise
            if (current.get('status') or {}).get('state') == 'blocked':
                raise RuntimeError('Incident runtime reported blocked preparation')
            time.sleep(1)
        raise RuntimeError('Incident runtime preparation budget expired')
    except Exception:
        current = read_stopped_runtime(container)
        if (current['sha'] == NATURAL_EXIT_SHA and current['image'] == NATURAL_EXIT_IMAGE
                and current['containerId'] == initial['containerId'] and current['startedAt'] == initial['startedAt']):
            if current['running']:
                run('sudo', 'docker', 'kill', '--signal=CONT', container)
            else:
                run('sudo', 'docker', 'start', container)
            print('Release held: incident runtime restored; no image swap', flush=True)
        raise

def prepare(container, runtime, budget=330):
    sha, status = runtime['sha'], runtime.get('status')
    deadline = time.monotonic() + budget
    if sha == NATURAL_EXIT_SHA:
        return prepare_natural_exit(container, runtime, deadline)
    if status and status.get('protocol') == 1 and status.get('gitSha') == sha:
        # Require an idle controller; never adopt another deployer's receipt.
        if status.get('state') != 'running':
            raise RuntimeError('Release held: runtime is already preparing or blocked')
        requested = int(time.time() * 1000)
        run('sudo', 'docker', 'kill', '--signal=USR2', container)
        try:
            while time.monotonic() < deadline:
                current = read_runtime(container)
                s = current.get('status') or {}
                if current['sha'] != sha:
                    raise RuntimeError('Runtime changed during preparation')
                if s.get('state') == 'blocked':
                    raise RuntimeError('Runtime reported blocked drain')
                if (s.get('state') == 'ready' and s.get('gitSha') == sha
                        and s.get('requestedAt', 0) >= requested - 1000
                        and s.get('updatedAt', 0) >= requested
                        and s.get('pendingTurns') == 0 and s.get('pendingBackground') == 0):
                    print(json.dumps({'prepared': s}), flush=True)
                    return
                time.sleep(2)
            raise RuntimeError('Release preparation budget expired; no stop attempted')
        except Exception:
            # Cancellation resumes the same process and preserves its turns.
            run('sudo', 'docker', 'kill', '--signal=CONT', container)
            for _ in range(20):
                resumed = read_runtime(container)
                if resumed['sha'] == sha and (resumed.get('status') or {}).get('state') == 'running':
                    print('Release held: same runtime resumed without a restart', flush=True)
                    break
                time.sleep(1)
            else:
                print('Release held: resume not yet confirmed; inspect runtime before any further action', flush=True)
            raise
    if sha != LEGACY_SHA or status is not None:
        raise RuntimeError('Release held: unsupported runtime drain protocol')
    # Legacy bootstrap cannot use SIGUSR2. Observe current fan ingress and
    # final traces twice before the existing zero-pending shutdown guard.
    consecutive = 0
    while time.monotonic() < deadline:
        observation = container_node(container, QUIET_JS, module=True)
        print(json.dumps({'legacyQuietObservation': observation}), flush=True)
        consecutive = consecutive + 1 if observation.get('ready') else 0
        if consecutive >= 2:
            if read_runtime(container)['sha'] != sha:
                raise RuntimeError('Runtime changed during legacy observation')
            return
        time.sleep(5)
    raise RuntimeError('Release held: no verified legacy quiet window; runtime untouched')

def deploy(digest, container, remote_dir):
    if not re.fullmatch(r'323149985112\.dkr\.ecr\.ap-southeast-2\.amazonaws\.com/twin-bot@sha256:[0-9a-f]{64}', digest):
        raise ValueError('Invalid deployment digest')
    run('sudo', 'docker', 'inspect', 'twin-reliability-rollback-5f38085bbe5b')
    if run('sudo', 'docker', 'inspect', '-f', '{{.State.Running}}', container) != 'true':
        raise RuntimeError('Release held: current container is not running')
    runtime = read_runtime(container)
    prepared = prepare(container, runtime)
    if isinstance(prepared, dict) and prepared.get('verifiedNaturalExit'):
        final = read_stopped_runtime(container)
        if (final != prepared['verifiedNaturalExit'] or final['running'] or final['exitCode'] != 0):
            raise RuntimeError('Release held: complete natural-exit identity changed before helper')
        run('sudo', '/usr/local/bin/twin-pull.sh', digest, container, remote_dir, timeout=120)
        return
    stopped_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    run('sudo', 'docker', 'stop', '-t', '35', container, timeout=45)
    logs = subprocess.run(['sudo', 'docker', 'logs', '--since', stopped_at, container],
                          capture_output=True, text=True, timeout=20)
    text = logs.stdout + logs.stderr
    receipts = re.findall(r'shutdown complete:.*flushed, ([0-9]+) turn\(s\) still pending at exit', text)
    exit_code = run('sudo', 'docker', 'inspect', '-f', '{{.State.ExitCode}}', container)
    if logs.returncode or not receipts or receipts[-1] != '0' or exit_code != '0':
        run('sudo', 'docker', 'start', container)
        raise RuntimeError('Release held: prior process did not prove a complete drain; existing container restarted')
    print('\n'.join(line for line in text.splitlines() if 'shutdown complete:' in line), flush=True)
    run('sudo', '/usr/local/bin/twin-pull.sh', digest, container, remote_dir, timeout=120)


# A longer observation window for a verified decreasing backlog. Zero pending
# work, successful shutdown receipt and resume-on-failure checks remain intact.
original_prepare=prepare
def prepare(container,runtime,budget=900):
    return original_prepare(container,runtime,budget)
assert read_runtime('next-app')['sha']=='278e3c3d639ae6384882735a42975718d93dbb32','Runtime changed'
deploy('323149985112.dkr.ecr.ap-southeast-2.amazonaws.com/twin-bot@sha256:f9618c70eb79abd38cce8991f47b4a6b11f19b7d28eb7d3886baa0a4e5b368ab','next-app','/home/ubuntu/allieai2-bot')
assert run('docker','exec','next-app','printenv','GIT_SHA')=='caa2a94ee519eb84d25b6c77023f732e8fed7b36'
print(json.dumps({'deployed':read_runtime('next-app'),'image':run('docker','inspect','-f','{{.Image}}','next-app')}),flush=True)
