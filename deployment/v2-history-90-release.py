"""Deploy only the reviewed V2 visible-history change using the existing release helper."""
import base64, hashlib, json, re, shlex, time
from pathlib import Path
import boto3
from botocore.config import Config

INSTANCE = "i-0584d283506f3f6be"
DASH_INSTANCE = "i-09a9dd3bd749643a5"
COMMIT = "84d59e2cfa220d46c083a7c2d4a9891b61de43a8"
HELPER_SHA = "ff85364625964c6ce91541b6c0d367c62cb9017593c5a3195f23996069c5ff75"
BUCKET = "allieai2-backups-323149985112"
KEY = "deploy/twin-v2/dashboard-history-90-" + COMMIT + ".tgz"
ssm = boto3.client("ssm", region_name="ap-southeast-2")
s3 = boto3.client("s3", region_name="ap-southeast-2", config=Config(signature_version="s3v4"))
patches = json.loads(Path("deployment/v2-history-90-patch.json").read_text())

def command(script, label, instance=INSTANCE, timeout=900):
    cid=ssm.send_command(InstanceIds=[instance],DocumentName="AWS-RunShellScript",
        Comment=label,Parameters={"commands":[script],"executionTimeout":[str(timeout)]})["Command"]["CommandId"]
    print(json.dumps({"operation":label,"command_id":cid}),flush=True)
    end=time.monotonic()+timeout+30
    while time.monotonic()<end:
        try: r=ssm.get_command_invocation(CommandId=cid,InstanceId=instance)
        except ssm.exceptions.InvocationDoesNotExist:
            time.sleep(3); continue
        if r["Status"] in ("Pending","InProgress","Delayed"):
            time.sleep(5); continue
        out=r.get("StandardOutputContent",""); err=r.get("StandardErrorContent","")
        print(out,flush=True)
        if err: print(err[-4000:],flush=True)
        if r["Status"]!="Success": raise RuntimeError(label+" failed: "+r["Status"])
        return out
    raise RuntimeError(label+" timed out; inspect command before retrying")

def python_script(code):
    b64=base64.b64encode(code.encode()).decode()
    return "python3 - <<'PY'\nimport base64\nexec(base64.b64decode("+repr(b64)+"))\nPY"

stage_code=r'''
import hashlib,json,os,shutil,subprocess,tempfile,tarfile,urllib.request
from pathlib import Path
app=Path("/home/ubuntu/twin-v2")
patches=PATCHES
assert hashlib.sha256(Path("/root/twin-v2-release.sh").read_bytes()).hexdigest()==HELPER_SHA
for p in patches:
    assert hashlib.sha256((app/p["path"]).read_bytes()).hexdigest()==p["before_sha"],"live source changed: "+p["path"]
    live=subprocess.check_output(["docker","compose","-p","twin-v2","exec","-T","bot","sha256sum",p["path"]],cwd=app,text=True).split()[0]
    assert live==p["before_sha"],"running source differs: "+p["path"]
candidates=sorted(Path("/tmp").glob("twin-v2-history90-*"),key=lambda p:p.stat().st_mtime,reverse=True)
stage=next(p for p in candidates if (p/"test-output.log").exists() and "all 177 memory wiring checks passed" in (p/"test-output.log").read_text())
code=stage/"code"
for p in patches:
    assert hashlib.sha256((code/p["path"]).read_bytes()).hexdigest()==p["after_sha"],"tested source changed"
print("Reusing the exact Linux-tested release source:",str(stage),flush=True)
archive=stage/"release.tgz"
with tarfile.open(archive,"w:gz") as tar:
    for file in sorted(code.rglob("*")):
        relative=file.relative_to(code)
        assert not any(part in ("data","logs","node_modules",".git") or part.startswith(".env") for part in relative.parts)
        if file.is_file(): tar.add(file,arcname=str(relative),recursive=False)
digest=hashlib.sha256(archive.read_bytes()).hexdigest()
print("STAGED_RELEASE="+json.dumps({"sha256":digest,"archive":str(archive),"commit":COMMIT}))
'''.replace("PATCHES",repr(patches)).replace("HELPER_SHA",repr(HELPER_SHA)).replace("COMMIT",repr(COMMIT))
out=command(python_script(stage_code),"Verify existing tested V2 local release archive")
record=json.loads(re.search(r"STAGED_RELEASE=(\{[^\n]+\})",out).group(1))
checks="\n".join("echo "+shlex.quote(p["before_sha"]+"  /home/ubuntu/twin-v2/"+p["path"])+" | sha256sum -c --quiet -" for p in patches)
deploy="set -eu\n"+checks+"\n"+"echo "+shlex.quote(HELPER_SHA+"  /root/twin-v2-release.sh")+" | sha256sum -c --quiet -\n"
deploy+="bash /root/twin-v2-release.sh deploy "+shlex.quote(record["archive"])+" "+shlex.quote(record["sha256"])+" "+COMMIT
command(deploy,"Deploy V2 history release through approved helper")
verify_code=r'''
import hashlib,json,subprocess,urllib.request
from pathlib import Path
app=Path("/home/ubuntu/twin-v2")
for container in ["twin-v2-bot-1","twin-v2-dash-1"]:
    assert subprocess.check_output(["docker","inspect","-f","{{.State.Running}}",container],text=True).strip()=="true"
    for p in PATCHES:
        digest=subprocess.check_output(["docker","exec",container,"sha256sum",p["path"]],text=True).split()[0]
        assert digest==p["after_sha"],container+" source mismatch"
for slug in ["kyla-yesenosky","riley-mae-lewis","briana-redd","fit-sid","sania-mallory"]:
    with urllib.request.urlopen("http://127.0.0.1:4300/api/chats?girl="+slug,timeout=30) as r:
        rows=json.load(r)
    counts=[len(row.get("history",[])) for row in rows]
    assert all(n<=90 for n in counts)
    print(json.dumps({"creator":slug,"chat_count":len(rows),"largest_visible_history":max(counts,default=0),"history_limit":90}))
print("VERIFIED: V2 bot and monitor run the reviewed history-only release.")
'''.replace("PATCHES",repr(patches))
command(python_script(verify_code),"Verify V2 running source and all creator history APIs",timeout=120)
