#!/usr/bin/env python3
"""Run disposable FLIRT-only HTTP checks without exporting runtime secrets."""
import base64
import importlib.util
import json
import os
from pathlib import Path
import re
import shlex
import sys
import time

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("release", ROOT / "flirt-release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


def main(check_file="flirt-optional-live-check.cjs"):
    if release.aws(["sts", "get-caller-identity"])["Account"] != release.ACCOUNT:
        raise RuntimeError("Unexpected AWS account")
    source = base64.b64encode((ROOT / check_file).read_bytes()).decode()
    expected = os.environ.get("FLIRT_EXPECTED_COMMIT") or os.environ.get("GITHUB_SHA", "")
    if not re.fullmatch(r"[a-f0-9]{40}", expected):
        raise RuntimeError("An exact deployed revision is required for verification")
    host = '''import base64,json,subprocess

def run(args, data=None):
    return subprocess.run(args,input=data,capture_output=True,timeout=420)

project=run(['docker','inspect','--format','{{index .Config.Labels "io.flirt.project"}}','flirt-dashboard'])
if project.returncode or project.stdout.decode().strip()!='lkmfwpqegjluirfusnaw':
    raise SystemExit('Refusing a non-FLIRT container')
commit=run(['docker','exec','flirt-dashboard','printenv','GIT_SHA'])
if commit.returncode or commit.stdout.decode().strip()!=EXPECTED:
    raise SystemExit('FLIRT is not running the requested release')
twin_format='{{.Id}} {{.State.StartedAt}} {{.RestartCount}} {{.State.Running}}'
before=run(['docker','inspect','--format',twin_format,'next-app'])
if before.returncode or not before.stdout.decode().strip().endswith('true'):
    raise SystemExit('Twin must be running before verification')
result=run(['docker','exec','-i','flirt-dashboard','node','-'],base64.b64decode(SOURCE))
try:
    report=json.loads(result.stdout)
except Exception:
    report={'passed':False,'error':'Verification returned no structured report','credentials_logged':False}
after=run(['docker','inspect','--format',twin_format,'next-app'])
report['twin_container_unchanged']=not after.returncode and before.stdout==after.stdout
report['release_commit']=EXPECTED
print(json.dumps(report),flush=True)
raise SystemExit(0 if result.returncode==0 and report.get('passed') and report['twin_container_unchanged'] else 1)
'''.replace("SOURCE", repr(source)).replace("EXPECTED", repr(expected))
    request = {
        "InstanceIds": [release.INSTANCE], "DocumentName": "AWS-RunShellScript",
        "Comment": "Verify FLIRT over HTTPS and preserve Twin",
        "TimeoutSeconds": 60,
        "Parameters": {"commands": ["python3 -c " + shlex.quote(host)], "executionTimeout": ["480"]},
    }
    command_id = release.aws(["ssm", "send-command", "--cli-input-json", json.dumps(request)])["Command"]["CommandId"]
    for _ in range(170):
        time.sleep(3)
        state = release.aws(["ssm", "get-command-invocation", "--command-id", command_id, "--instance-id", release.INSTANCE])
        if state["Status"] in ("Pending", "InProgress", "Delayed"):
            continue
        print(state.get("StandardOutputContent", ""), flush=True)
        if state["Status"] != "Success":
            raise RuntimeError("FLIRT verification failed; see structured report")
        return
    raise RuntimeError("FLIRT verification timed out")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else type(error).__name__, file=sys.stderr)
        sys.exit(1)
