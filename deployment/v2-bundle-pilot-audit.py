"""Resolve current V2 chat bundle eligibility without enabling bundles or writing production data."""
import base64
import gzip
import json
import os
import pathlib
import shlex
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

INSTANCE = "i-0584d283506f3f6be"
BRANCH = "codex/v2-bundle-pilot-audit-20261014"
REVISION = "771f713b58c11d1b0fcf094595dc8f67ac898eb3"
IMAGE = "sha256:ac361b6304d4fa20ee251177b01277e37c826173f1ecd2d2afc2f8cb04f7ca9c"
EXPECTED = [
    "alanna-pow", "allison-parker", "bethany-marquez", "briana-redd",
    "cat-chase", "dakota-lyn", "dreka-cakez", "fit-sid", "kyla-yesenosky",
    "mrs-callace", "olivia-jade", "riley-mae-lewis", "sania-mallory",
    "tammy", "toochi", "trashy", "tru-kait",
]
RECEIPT = pathlib.Path("docs/bundle-pilot-audit-20261014.json")


def ssm(command: str, timeout: int = 720) -> str:
    params = pathlib.Path("/tmp") / f"bundle-pilot-audit-{time.time_ns()}.json"
    params.write_text(json.dumps({"commands": [command], "executionTimeout": [str(timeout)]}))
    command_id = subprocess.check_output([
        "aws", "ssm", "send-command", "--instance-ids", INSTANCE,
        "--document-name", "AWS-RunShellScript", "--parameters", f"file://{params}",
        "--comment", "Read-only Twin V2 bundle eligibility audit",
        "--query", "Command.CommandId", "--output", "text",
    ], text=True).strip()
    print(json.dumps({"commandId": command_id, "phase": "read-only bundle audit"}), flush=True)
    for _ in range(timeout // 3 + 20):
        try:
            result = json.loads(subprocess.check_output([
                "aws", "ssm", "get-command-invocation", "--command-id", command_id,
                "--instance-id", INSTANCE, "--output", "json",
            ], text=True, stderr=subprocess.DEVNULL))
        except subprocess.CalledProcessError:
            time.sleep(3)
            continue
        if result["Status"] in {"Success", "Failed", "Cancelled", "TimedOut"}:
            break
        time.sleep(3)
    else:
        raise RuntimeError("Bundle pilot audit did not finish")
    print(result.get("StandardOutputContent", ""), flush=True)
    if result["Status"] != "Success":
        raise RuntimeError(f"Bundle pilot audit {result['Status']}: {result.get('StandardErrorContent', '')[-1000:]}")
    return result.get("StandardOutputContent", "")


node_source = r'''import fs from 'node:fs';
import {config} from './src/config.ts';
import {loadRawCatalogue,catalogueFromRaw} from './src/media.ts';
import {fetchBundleRows,resolveBundles,storageSize} from './src/bundles.ts';
import {offerTableReady} from './src/bundle-offers.ts';
const expected=__EXPECTED__;
if(!/^(0|off|false)$/i.test(process.env.V2_BUNDLES??''))throw Error('Bundles are no longer globally off');
const response=await fetch(config.supabaseUrl+'/rest/v1/clones?engine=eq.v2&status=eq.active&select=id,slug&order=slug',{headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey},signal:AbortSignal.timeout(15000)});
if(!response.ok)throw Error('Active V2 creators unreadable');const creators=await response.json();
if(JSON.stringify(creators.map(x=>x.slug))!==JSON.stringify(expected))throw Error('Active V2 creator scope changed');
if(!(await offerTableReady()))throw Error('v2_bundle_offers is not readable');
const checks=[];
for(const creator of creators){
  const raw=await loadRawCatalogue(creator.id), catalogue=catalogueFromRaw(raw), rows=await fetchBundleRows(creator.id);
  const resolved=await resolveBundles(rows,raw,catalogue,creator.id,storageSize);
  checks.push({slug:creator.slug,rawBundles:rows.length,eligible:resolved.bundles.map(b=>({id:b.id,name:b.name,stars:b.stars,files:b.files.length,kinds:{photos:b.files.filter(f=>f.kind==='photo').length,videos:b.files.filter(f=>f.kind==='video').length}})),excluded:resolved.excluded});
}
const eligible=checks.filter(x=>x.eligible.length).map(x=>x.slug),riley=checks.find(x=>x.slug==='riley-mae-lewis'),alanna=checks.find(x=>x.slug==='alanna-pow');
const recommended=riley?.eligible.length?'riley-mae-lewis':alanna?.eligible.length?'alanna-pow':eligible[0]??null;
console.log('BUNDLE_AUDIT_JSON '+JSON.stringify({flag:process.env.V2_BUNDLES,offerTableReady:true,checks,eligibleCreators:eligible,recommended}));
'''.replace("__EXPECTED__", json.dumps(EXPECTED))

remote = r'''import base64,datetime,gzip,json,pathlib,subprocess,time
REVISION=__REVISION__
IMAGE=__IMAGE__
EXPECTED=__EXPECTED__
runtime=[]
for name in ['twin-v2-bot-1','twin-v2-dash-1']:
  info=json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]
  revision=next((x.split('=',1)[1] for x in info['Config']['Env'] if x.startswith('GIT_SHA=')),None)
  runtime.append({'name':name,'running':info['State']['Running'],'restarting':info['State'].get('Restarting',False),'image':info['Image'],'revision':revision})
assert all(x['running'] and not x['restarting'] and x['image']==IMAGE and x['revision']==REVISION for x in runtime),'Runtime changed'
fleet=json.loads(pathlib.Path('/home/ubuntu/twin-v2/data/_fleet.json').read_text())
age=time.time()-datetime.datetime.fromisoformat(fleet['at'].replace('Z','+00:00')).timestamp();girls=fleet.get('girls',{})
assert age<90 and sorted(girls)==EXPECTED and all(girls[x].get('status')=='running' for x in EXPECTED),'Fleet is not fresh and fully running'
source=base64.b64decode(__SOURCE__).decode()
run=subprocess.run(['docker','exec','-i','twin-v2-bot-1','node','--import','tsx','--input-type=module'],input=source,text=True,capture_output=True,timeout=600)
assert run.returncode==0,'Bundle resolver failed: '+run.stderr[-600:]
lines=[x[len('BUNDLE_AUDIT_JSON '):] for x in run.stdout.splitlines() if x.startswith('BUNDLE_AUDIT_JSON ')]
assert len(lines)==1,'Bundle resolver result missing';audit=json.loads(lines[0])
assert audit['flag'].lower()=='off' and audit['offerTableReady'] is True and len(audit['checks'])==17 and audit['recommended'],'Bundle pilot preconditions failed'
result={'status':'complete','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'revision':REVISION,'image':IMAGE,'runtime':runtime,'fleetAt':fleet['at'],'fleetAgeSeconds':age,**audit,'modelCalls':0,'fanMessages':0,'databaseWrites':0,'productionWrites':0,'runtimeMutations':0,'containerRestarts':0}
print('BUNDLE_AUDIT_BASE64 '+base64.b64encode(gzip.compress(json.dumps(result).encode(),mtime=0)).decode())
'''
remote = (remote.replace("__REVISION__", repr(REVISION))
                .replace("__IMAGE__", repr(IMAGE))
                .replace("__EXPECTED__", repr(EXPECTED))
                .replace("__SOURCE__", repr(base64.b64encode(node_source.encode()).decode())))

result = {"status": "not-started", "revision": REVISION, "image": IMAGE,
          "workflowRun": os.environ.get("GITHUB_RUN_ID")}
try:
    output = ssm("python3 -c " + shlex.quote(remote))
    encoded = next(x.split(" ", 1)[1] for x in output.splitlines() if x.startswith("BUNDLE_AUDIT_BASE64 "))
    audited = json.loads(gzip.decompress(base64.b64decode(encoded)))
    assert audited["status"] == "complete" and audited["revision"] == REVISION and audited["image"] == IMAGE
    assert audited["flag"].lower() == "off" and audited["offerTableReady"] is True and len(audited["checks"]) == 17
    assert audited["recommended"] in audited["eligibleCreators"]
    assert audited["modelCalls"] == audited["fanMessages"] == audited["databaseWrites"] == 0
    result.update(audited)
except Exception as exc:
    result.update(status="audit-failed", error=str(exc)[-1600:])

url = "https://api.github.com/repos/jesse98/twin-dashboard/contents/" + str(RECEIPT).replace("\\", "/")
payload = {
    "message": "Record read-only Twin V2 bundle pilot audit [skip ci]", "branch": BRANCH,
    "content": base64.b64encode((json.dumps(result, indent=2) + "\n").encode()).decode(),
}
try:
    request = urllib.request.Request(url + "?ref=" + urllib.parse.quote(BRANCH, safe=""), headers={
        "Authorization": "Bearer " + os.environ["GITHUB_TOKEN"], "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        payload["sha"] = json.load(response)["sha"]
except urllib.error.HTTPError as existing:
    if existing.code != 404:
        raise
request = urllib.request.Request(url, data=json.dumps(payload).encode(), method="PUT", headers={
    "Authorization": "Bearer " + os.environ["GITHUB_TOKEN"],
    "Accept": "application/vnd.github+json", "Content-Type": "application/json"})
with urllib.request.urlopen(request, timeout=30) as response:
    assert response.status in {200, 201}
print("BUNDLE_AUDIT_STATUS " + json.dumps({k: result.get(k) for k in ["status", "flag", "eligibleCreators", "recommended", "error"]}), flush=True)
if result["status"] != "complete":
    sys.exit(1)
