"""Deploy the prepared photo consumer with the existing verified handover protocol."""
import json, pathlib, subprocess, time, hashlib, shutil
SHA='ef040a757627bb5813b4f19ac47af2c1f373506c'
IMAGE='sha256:77b0e687db21388334749d7fbf6ceeb59650caa72e35a9f91fd1d0cab4717447'
ROOT=pathlib.Path('/home/ubuntu/twin-v2')
RELEASE=pathlib.Path('/home/ubuntu/twin-v2-photo-releases')/SHA
BACKUP=pathlib.Path('/home/ubuntu/twin-v2-backups/photo-launch-20261012')
OLD=json.loads((BACKUP/'images.json').read_text())
manifest=json.loads(pathlib.Path('/tmp/twin-v2-photo-manifest.json').read_text())
def out(*args): return subprocess.check_output(args,text=True).strip()
def node(source):
    return subprocess.check_output(['docker','exec','-i','twin-v2-bot-1','node','--import','tsx','--input-type=module'],input=source,text=True)
for name,expected in OLD.items():
    assert out('docker','inspect','-f','{{.Image}}',name)==expected, 'Runtime changed before release'
assert out('docker','image','inspect','-f','{{.Id}}','twin-v2-photo:'+SHA)==IMAGE
assert (BACKUP/'images.tar').stat().st_size>0 and (BACKUP/'code.tgz').stat().st_size>0
# Preserve any newer edits on the host: changed runtime/config files must agree
# with the inspected old image before replacement. New tests do not run live.
paths=[x['path'] for x in manifest if x['path'].startswith(('src/','dashboard/')) or x['path'] in ['package.json','package-lock.json','Dockerfile','docker-compose.yml','tsconfig.json']]
source="import fs from 'node:fs';import crypto from 'node:crypto';console.log(JSON.stringify(Object.fromEntries("+json.dumps(paths)+".map(p=>[p,fs.existsSync(p)?crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null]))));"
current=json.loads(node(source))
for p,digest in current.items():
    if digest is not None: assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==digest, 'Uncommitted host edit: '+p
drain=r"""
import fs from 'node:fs';import path from 'node:path';
import {config} from './src/config.ts';
import {pendingSlugs,runHandover,clearHandover} from './src/handover.ts';
if(pendingSlugs(config.dataDir).length)throw Error('Another handover is already in progress');
const r=await fetch(config.supabaseUrl+'/rest/v1/clones?select=slug&engine=eq.v2&status=eq.active',{headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey},signal:AbortSignal.timeout(15000)});
if(!r.ok)throw Error('Could not read active fleet');
const rows=await r.json();const snapshot=JSON.parse(fs.readFileSync(path.join(config.dataDir,'_fleet.json'),'utf8'));
if(Date.now()-Date.parse(snapshot.at)>90000)throw Error('Fleet status is stale');
const slugs=[...new Set([...rows.map(x=>x.slug),...Object.keys(snapshot.girls||{})])];
const results=await Promise.all(slugs.map(async slug=>({slug,...await runHandover(config.dataDir,slug)})));
if(results.some(x=>!x.ok)){for(const slug of slugs)clearHandover(config.dataDir,slug);console.log(JSON.stringify({ok:false,results}));process.exit(2)}
console.log(JSON.stringify({ok:true,at:new Date().toISOString(),results}));
"""
receipt=json.loads(node(drain))
assert receipt['ok']
(BACKUP/'photo-drain.json').write_text(json.dumps(receipt,indent=2))
print(json.dumps({'verified_drain':True,'creators':[r['slug'] for r in receipt['results']]}),flush=True)
override=ROOT/'photo-release.override.json'
switched=False;released=False
def compose():
    subprocess.run(['docker','compose','-p','twin-v2','-f',str(ROOT/'docker-compose.yml'),'-f',str(override),'up','-d','--no-build'],check=True,timeout=90)
def clear_requests():
    for r in receipt['results']:
        folder=ROOT/'data/_handover';req=folder/(r['slug']+'.request.json')
        if req.exists() and json.loads(req.read_text()).get('id')==r['id']:
            req.unlink();(folder/(r['slug']+'.result.json')).unlink(missing_ok=True)
try:
    # Existing requests keep both old and new fleets paused during the swap.
    for r in receipt['results']:
        p=ROOT/'data/_handover'/(r['slug']+'.request.json')
        assert json.loads(p.read_text())['id']==r['id']
    for item in manifest:
        p=item['path'];target=ROOT/p;target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(RELEASE/p,target)
    override.write_text(json.dumps({'services':{service:{'image':IMAGE,'environment':{'GIT_SHA':SHA}} for service in ['bot','dash']}},indent=2))
    switched=True;compose()
    for name in OLD:
        assert out('docker','inspect','-f','{{.State.Running}}',name)=='true'
        assert out('docker','inspect','-f','{{.Image}}',name)==IMAGE
        assert out('docker','exec',name,'printenv','GIT_SHA')==SHA
    check="import fs from 'node:fs';import crypto from 'node:crypto';const items="+json.dumps(manifest)+";for(const x of items){const b=fs.readFileSync(x.path);const h=crypto.createHash('sha1').update(Buffer.from('blob '+b.length+'\\0')).update(b).digest('hex');if(h!==x.sha)throw Error(x.path)}console.log('Exact source verified');"
    print(node(check),flush=True)
    clear_requests();released=True
    # Observe normal fleet reconciliation, with no fan message or connection switch.
    deadline=time.monotonic()+70
    expected={r['slug'] for r in receipt['results']}
    while time.monotonic()<deadline:
        snapshot=json.loads((ROOT/'data/_fleet.json').read_text())
        statuses={s:x.get('status') for s,x in snapshot.get('girls',{}).items()}
        if expected and all(statuses.get(s)=='running' for s in expected):break
        time.sleep(3)
    print(json.dumps({'deployed':SHA,'image':IMAGE,'fleet_statuses':statuses,'backup':str(BACKUP)}),flush=True)
    assert all(statuses.get(s)=='running' for s in expected), 'Fleet requires inspection; do not force a rollback without another verified drain'
except Exception:
    if not released:
        if switched:
            subprocess.run(['tar','xzf',str(BACKUP/'code.tgz'),'-C',str(ROOT)],check=True)
            override.write_text(json.dumps({'services':{'bot':{'image':OLD['twin-v2-bot-1']},'dash':{'image':OLD['twin-v2-dash-1']}}}))
            compose()
        clear_requests()
    raise
