import base64, json, os, shlex, subprocess, time
def aws(*args):
    return json.loads(subprocess.check_output(["aws", "ssm", *args, "--region", "ap-southeast-2", "--output", "json"], text=True))
def command(value):
    sent=aws("send-command", "--instance-ids", "i-09a9dd3bd749643a5", "--document-name", "AWS-RunShellScript", "--comment", "Read-only payout deployment verification; no payment records added", "--parameters", json.dumps({"commands":[value],"executionTimeout":["180"]}))
    for attempt in range(100):
        time.sleep(2)
        try:
            result=aws("get-command-invocation","--command-id",sent["Command"]["CommandId"],"--instance-id","i-09a9dd3bd749643a5")
        except subprocess.CalledProcessError:
            continue
        if result["Status"] in ["Success","Failed","Cancelled","TimedOut"]:
            return result
    raise RuntimeError("Verification timed out")
container=os.environ["PAYOUT_CONTAINER"]
expected=os.environ["PAYOUT_EXPECTED_SHA"]
for attempt in range(80):
    result=command("sudo docker exec "+shlex.quote(container)+" printenv GIT_SHA")
    actual=result.get("StandardOutputContent","").strip()
    if actual==expected: break
    if attempt==0: print("Waiting for expected deployed payout revision",flush=True)
    time.sleep(15)
else: raise RuntimeError("Expected payout revision is not deployed")
print("Confirmed running revision "+actual,flush=True)
encoded=base64.b64encode(open("deployment/payout-live-check.cjs","rb").read()).decode()
program='eval(Buffer.from("'+encoded+'","base64").toString())'
result=command("sudo docker exec "+shlex.quote(container)+" node -e "+shlex.quote(program))
print(result.get("StandardOutputContent",""),flush=True)
if result["Status"]!="Success":
    print(result.get("StandardErrorContent",""),flush=True)
    raise SystemExit("Live payout verification failed")
