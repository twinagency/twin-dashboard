#!/usr/bin/env python3
"""Run the normal-HTTP fixture runner in one existing authorized dashboard only.

Uses the same established AWS host as the current dashboard workflows. No
runtime credential is exported. This script neither deploys nor changes env.
"""
import argparse
import base64
import json
from pathlib import Path
import re
import shlex
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
REGION = "ap-southeast-2"
ACCOUNT = "323149985112"
INSTANCE = "i-09a9dd3bd749643a5"


def aws(arguments):
    result = subprocess.run(["aws", "--region", REGION, *arguments, "--output", "json"], capture_output=True, text=True, timeout=60)
    if result.returncode and arguments[:2] == ["ssm", "get-command-invocation"] and "InvocationDoesNotExist" in result.stderr:
        return {"Status": "Pending"}
    if result.returncode:
        raise RuntimeError("Authorized AWS operation failed; raw response suppressed")
    return json.loads(result.stdout)


def host_program(brand, expected, mode, removal_guards, encoded_source):
    configuration = repr({"brand": brand, "expected": expected, "mode": mode, "removal_guards": removal_guards, "source": encoded_source})
    return "CONFIG = " + configuration + r'''
import base64,json,subprocess
target = 'flirt-dashboard' if CONFIG['brand']=='flirt' else 'next-app'
other = 'next-app' if CONFIG['brand']=='flirt' else 'flirt-dashboard'
def run(args, data=None, timeout=30):
    return subprocess.run(args,input=data,capture_output=True,timeout=timeout)
def snapshot(container):
    result=run(['docker','inspect','--format','{{.Id}} {{.State.StartedAt}} {{.RestartCount}} {{.State.Running}}',container])
    if result.returncode or not result.stdout.decode().strip().endswith('true'):
        raise RuntimeError('Expected dashboard container is not running')
    return result.stdout
try:
    target_before=snapshot(target)
    other_before=snapshot(other)
    commit=run(['docker','exec',target,'printenv','GIT_SHA'])
    if commit.returncode or commit.stdout.decode().strip()!=CONFIG['expected']:
        raise RuntimeError('Serving runtime differs from independently expected commit')
    if CONFIG['brand']=='flirt':
        project=run(['docker','inspect','--format','{{index .Config.Labels "io.flirt.project"}}',target])
        if project.returncode or project.stdout.decode().strip()!='lkmfwpqegjluirfusnaw':
            raise RuntimeError('Refusing non-FLIRT container')
    args=['docker','exec','-i',target,'node','-','--run','--brand='+CONFIG['brand'],'--expected-sha='+CONFIG['expected'],'--'+CONFIG['mode']]
    if CONFIG['removal_guards']: args.append('--removal-guards')
    result=run(args,base64.b64decode(CONFIG['source']),2400)
    lines=result.stdout.decode(errors='replace').splitlines()
    report=None
    for line in lines:
        try: value=json.loads(line)
        except Exception: continue
        if value.get('event')=='upload_result': print(json.dumps(value),flush=True)
        elif 'passed' in value: report=value
    if report is None:
        report={'passed':False,'failure':'Runtime returned no structured final report; inspect exact disposable manifest before rerunning','credentials_logged':False}
    report['other_dashboard_unchanged']=snapshot(other)==other_before
    report['target_dashboard_unchanged']=snapshot(target)==target_before
    report['serving_commit_verified']=CONFIG['expected']
    print(json.dumps(report),flush=True)
    raise SystemExit(0 if result.returncode==0 and report.get('passed') and report['other_dashboard_unchanged'] and report['target_dashboard_unchanged'] else 1)
except Exception as error:
    print(json.dumps({'passed':False,'failure':str(error) if isinstance(error,RuntimeError) else 'Host runner failed or timed out; exact fixture cleanup may remain pending','credentials_logged':False}),flush=True)
    raise SystemExit(1)
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--brand", required=True, choices=("flirt", "moxy"))
    parser.add_argument("--expected-sha", required=True)
    parser.add_argument("--mode", required=True, choices=("flow-only", "small-only", "large"))
    parser.add_argument("--removal-guards", action="store_true")
    options = parser.parse_args()
    if not re.fullmatch(r"[a-f0-9]{40}", options.expected_sha) or (options.removal_guards and options.mode == "flow-only"):
        raise RuntimeError("Invalid expected commit or test mode")
    if aws(["sts", "get-caller-identity"])["Account"] != ACCOUNT:
        raise RuntimeError("Unexpected AWS account")
    encoded = base64.b64encode((ROOT / "creator-flow-live-check.cjs").read_bytes()).decode()
    host = host_program(options.brand, options.expected_sha, options.mode, options.removal_guards, encoded)
    command = {"InstanceIds": [INSTANCE], "DocumentName": "AWS-RunShellScript", "Comment": "Normal signup and isolated creator regression: " + options.brand,
               "TimeoutSeconds": 60, "Parameters": {"commands": ["python3 -c " + shlex.quote(host)], "executionTimeout": ["2460"]}}
    command_id = aws(["ssm", "send-command", "--cli-input-json", json.dumps(command)])["Command"]["CommandId"]
    print(json.dumps({"brand": options.brand, "mode": options.mode, "status": "running", "expected_commit": options.expected_sha}), flush=True)
    deadline = time.monotonic() + 2500
    last_progress = time.monotonic()
    while time.monotonic() < deadline:
        time.sleep(3)
        state = aws(["ssm", "get-command-invocation", "--command-id", command_id, "--instance-id", INSTANCE])
        if state["Status"] in ("Pending", "InProgress", "Delayed"):
            if time.monotonic() - last_progress >= 30:
                print(json.dumps({"brand": options.brand, "mode": options.mode, "status": "still_running"}), flush=True)
                last_progress = time.monotonic()
            continue
        # The host emits only redacted runner JSON. Never print raw stderr.
        print(state.get("StandardOutputContent", ""), flush=True)
        if state["Status"] != "Success":
            raise RuntimeError("Creator checks failed or remain blocked; see structured report")
        return
    raise RuntimeError("Host runner timed out; exact disposable cleanup needs verification")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else "Runner configuration or AWS operation failed", file=sys.stderr)
        sys.exit(1)
