"""Read-only production audit for one existing Twin V2 tip pilot."""
import base64
import datetime
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
BRANCH = "codex/v2-tip-pilot-audit-20261014"
REVISION = "771f713b58c11d1b0fcf094595dc8f67ac898eb3"
IMAGE = "sha256:ac361b6304d4fa20ee251177b01277e37c826173f1ecd2d2afc2f8cb04f7ca9c"
PILOT = "alanna-pow"
EXPECTED = [
    "alanna-pow", "allison-parker", "bethany-marquez", "briana-redd",
    "cat-chase", "dakota-lyn", "dreka-cakez", "fit-sid", "kyla-yesenosky",
    "mrs-callace", "olivia-jade", "riley-mae-lewis", "sania-mallory",
    "tammy", "toochi", "trashy", "tru-kait",
]
EXPECTED_ENABLED = [
    "alanna-pow", "bethany-marquez", "cat-chase", "dreka-cakez",
    "olivia-jade", "toochi", "trashy", "tru-kait",
]
RECEIPT = pathlib.Path("docs/tip-pilot-audit-20261014.json")


def ssm(command: str, timeout: int = 420) -> str:
    params = pathlib.Path("/tmp") / f"tip-pilot-audit-{time.time_ns()}.json"
    params.write_text(json.dumps({"commands": [command], "executionTimeout": [str(timeout)]}))
    command_id = subprocess.check_output([
        "aws", "ssm", "send-command", "--instance-ids", INSTANCE,
        "--document-name", "AWS-RunShellScript", "--parameters", f"file://{params}",
        "--comment", "Read-only Twin V2 tip pilot audit",
        "--query", "Command.CommandId", "--output", "text",
    ], text=True).strip()
    print(json.dumps({"commandId": command_id, "phase": "read-only tip audit"}), flush=True)
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
        raise RuntimeError("Tip pilot audit did not finish")
    print(result.get("StandardOutputContent", ""), flush=True)
    if result["Status"] != "Success":
        raise RuntimeError(f"Tip pilot audit {result['Status']}: {result.get('StandardErrorContent', '')[-900:]}")
    return result.get("StandardOutputContent", "")


remote = r'''import base64,datetime,gzip,json,pathlib,subprocess,time,urllib.parse,urllib.request
REVISION=__REVISION__
IMAGE=__IMAGE__
EXPECTED=__EXPECTED__
EXPECTED_ENABLED=__EXPECTED_ENABLED__
PILOT=__PILOT__
runtime=[]
for name in ['twin-v2-bot-1','twin-v2-dash-1']:
  info=json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]
  revision=next((x.split('=',1)[1] for x in info['Config']['Env'] if x.startswith('GIT_SHA=')),None)
  runtime.append({'name':name,'running':info['State']['Running'],'restarting':info['State'].get('Restarting',False),'image':info['Image'],'revision':revision})
assert all(x['running'] and not x['restarting'] and x['image']==IMAGE and x['revision']==REVISION for x in runtime),'Runtime changed'
fleet=json.loads(pathlib.Path('/home/ubuntu/twin-v2/data/_fleet.json').read_text())
age=time.time()-datetime.datetime.fromisoformat(fleet['at'].replace('Z','+00:00')).timestamp()
assert age<90,'Fleet snapshot is stale'
girls=fleet.get('girls',{})
assert sorted(girls)==EXPECTED and all(girls[x].get('status')=='running' for x in EXPECTED),'Fleet is not fully running'
checks=[]
for slug in EXPECTED:
  url='http://127.0.0.1:4300/api/tips?girl='+urllib.parse.quote(slug,safe='')
  with urllib.request.urlopen(url,timeout=15) as response:
    assert response.status==200
    value=json.load(response)
  saved=value.get('saved');applied=value.get('applied');open_work=value.get('openWork')
  assert saved and applied and value.get('inSync') is True,slug+' saved/applied tip settings are not in sync'
  assert value.get('offersEnabled') is (saved.get('enabled') is True),slug+' offer switch is inconsistent'
  assert isinstance(open_work,dict) and open_work.get('ok') is True,slug+' open work is unreadable'
  assert int(open_work.get('open_exceptions',0))==0,slug+' has an open tip exception'
  assert int(open_work.get('awaiting_receipt_refunds',0))==0,slug+' has a refund awaiting receipt'
  receipts=value.get('receipts') or {}
  assert int(receipts.get('pending',0))==0,slug+' has a pending local tip receipt'
  checks.append({'slug':slug,'saved':saved,'applied':applied,'offersEnabled':value.get('offersEnabled'),'inSync':value.get('inSync'),'offers':value.get('offers'),'receipts':receipts,'openWork':open_work})
enabled=sorted(x['slug'] for x in checks if x['saved']['enabled'])
assert enabled==EXPECTED_ENABLED,'The approved tip enablement scope changed'
pilot=next(x for x in checks if x['slug']==PILOT)
assert pilot['offersEnabled'] is True and pilot['inSync'] is True
result={'status':'complete','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'revision':REVISION,'image':IMAGE,'runtime':runtime,'fleetAt':fleet['at'],'fleetAgeSeconds':age,'creators':len(checks),'enabled':enabled,'disabled':sorted(set(EXPECTED)-set(enabled)),'pilot':PILOT,'pilotState':pilot,'checks':checks,'openExceptions':0,'awaitingReceiptRefunds':0,'pendingReceipts':0,'modelCalls':0,'fanMessages':0,'databaseWrites':0,'productionWrites':0,'runtimeMutations':0,'containerRestarts':0}
print('TIP_AUDIT_BASE64 '+base64.b64encode(gzip.compress(json.dumps(result).encode(),mtime=0)).decode())
'''
remote = (remote.replace("__REVISION__", repr(REVISION))
                .replace("__IMAGE__", repr(IMAGE))
                .replace("__EXPECTED__", repr(EXPECTED))
                .replace("__EXPECTED_ENABLED__", repr(EXPECTED_ENABLED))
                .replace("__PILOT__", repr(PILOT)))

result = {"status": "not-started", "revision": REVISION, "image": IMAGE, "pilot": PILOT,
          "workflowRun": os.environ.get("GITHUB_RUN_ID")}
try:
    output = ssm("python3 -c " + shlex.quote(remote))
    encoded = next(x.split(" ", 1)[1] for x in output.splitlines() if x.startswith("TIP_AUDIT_BASE64 "))
    audited = json.loads(gzip.decompress(base64.b64decode(encoded)))
    assert audited["status"] == "complete" and audited["revision"] == REVISION and audited["image"] == IMAGE
    assert audited["pilot"] == PILOT and audited["enabled"] == EXPECTED_ENABLED and audited["creators"] == 17
    assert audited["openExceptions"] == audited["awaitingReceiptRefunds"] == audited["pendingReceipts"] == 0
    assert audited["modelCalls"] == audited["fanMessages"] == audited["databaseWrites"] == 0
    result.update(audited)
except Exception as exc:
    result.update(status="audit-failed", error=str(exc)[-1200:])

url = "https://api.github.com/repos/jesse98/twin-dashboard/contents/" + str(RECEIPT).replace("\\", "/")
payload = {
    "message": "Record read-only Twin V2 tip pilot audit [skip ci]",
    "branch": BRANCH,
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
print("TIP_AUDIT_STATUS " + json.dumps({k: result.get(k) for k in ["status", "pilot", "enabled", "error"]}), flush=True)
if result["status"] != "complete":
    sys.exit(1)
