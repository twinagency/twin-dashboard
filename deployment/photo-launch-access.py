"""Read one retained isolated-replay turn through SSM; no model or production writes."""
import base64, json, os, pathlib, shlex, subprocess, time, urllib.request

INSTANCE = "i-0584d283506f3f6be"
BRANCH = "codex/v2-reply-diagnostic-20261013"
SOURCE = "/home/ubuntu/twin-v2-validation/reply-outcomes-candidate-1791892632127052684/cat-chase/turns.private.json"


def ssm(command: str, timeout: int = 90) -> str:
    params = pathlib.Path("/tmp") / f"reply-detail-{time.time_ns()}.json"
    params.write_text(json.dumps({"commands": [command], "executionTimeout": [str(timeout)]}))
    command_id = subprocess.check_output([
        "aws", "ssm", "send-command", "--instance-ids", INSTANCE,
        "--document-name", "AWS-RunShellScript", "--parameters", f"file://{params}",
        "--comment", "Read retained isolated V2 failed turn; no production writes",
        "--query", "Command.CommandId", "--output", "text",
    ], text=True).strip()
    print(json.dumps({"commandId": command_id}), flush=True)
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
        raise RuntimeError("SSM command incomplete")
    if result["Status"] != "Success":
        raise RuntimeError(f"SSM {result['Status']}: {result.get('StandardErrorContent', '')[-700:]}")
    return result.get("StandardOutputContent", "")


remote = r'''import base64,json,pathlib
p=pathlib.Path(%r)
turns=json.loads(p.read_text())
t=next(x for x in turns if x.get("case")=="business-new-after-refusal")
r=t.get("row",{})
detail={
 "case":t.get("case"),
 "before":{"photo":t.get("before",{}).get("photo"),"sent":t.get("before",{}).get("sent")},
 "row":{k:r.get(k) for k in ["fanText","raw","selection","selectionError","menu","note","generated","grounding","selectedMedia","media","final","delivery","photoAlternative"]},
 "after":{"photo":t.get("after",{}).get("photo"),"sent":t.get("after",{}).get("sent")},
 "calls":t.get("calls",[]),
}
print("DETAIL_BASE64 "+base64.b64encode((json.dumps(detail,indent=2)+"\n").encode()).decode())''' % SOURCE
output = ssm("python3 -c " + shlex.quote(remote))
line = next(x for x in output.splitlines() if x.startswith("DETAIL_BASE64 "))
detail_bytes = base64.b64decode(line.split(" ", 1)[1])

token = os.environ["GITHUB_TOKEN"]
url = "https://api.github.com/repos/jesse98/twin-dashboard/contents/docs/reply-outcomes-candidate-v4-failure-detail.json"
body = json.dumps({
    "message": "Record retained Cat Chase replay failure detail [skip ci]",
    "branch": BRANCH,
    "content": base64.b64encode(detail_bytes).decode(),
}).encode()
request = urllib.request.Request(url, data=body, method="PUT", headers={
    "Authorization": f"Bearer {token}",
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json",
})
with urllib.request.urlopen(request, timeout=30) as response:
    assert response.status == 201, "Evidence commit failed"
print("DETAIL_RECORDED", flush=True)
