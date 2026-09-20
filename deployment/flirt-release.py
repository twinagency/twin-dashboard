#!/usr/bin/env python3
"""GitHub-side release orchestrator. Secrets only travel to the approved host encrypted."""
import base64, json, os, re, shlex, subprocess, sys, tempfile, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
INSTANCE = "i-09a9dd3bd749643a5"
REGION = "ap-southeast-2"
ACCOUNT = "323149985112"
PROJECT = "lkmfwpqegjluirfusnaw"
PUBLIC_KEY = "sb_publishable_LKzRhbFTC59TlzwS2diSdw_QPszKjgA"


def aws(args):
    result = subprocess.run(["aws", "--region", REGION, *args, "--output", "json"], capture_output=True, text=True)
    if result.returncode and args[:2] == ["ssm", "get-command-invocation"] and "InvocationDoesNotExist" in result.stderr:
        return {"Status": "Pending"}
    if result.returncode:
        # API stderr is intentionally not relayed alongside any credential operation.
        raise RuntimeError("AWS request failed: " + " ".join(args[:2]))
    return json.loads(result.stdout)


def host(mode, *args):
    source = (ROOT / "flirt-host-release.py").read_text()
    cmd = "python3 -c " + shlex.quote(source) + " " + " ".join(shlex.quote(a) for a in (mode, *args))
    request = {"InstanceIds": [INSTANCE], "DocumentName": "AWS-RunShellScript", "Comment": "FLIRT " + mode + ": separate application only", "TimeoutSeconds": 60, "Parameters": {"commands": [cmd], "executionTimeout": ["600"]}}
    result = aws(["ssm", "send-command", "--cli-input-json", json.dumps(request)])
    command_id = result["Command"]["CommandId"]
    print("FLIRT host operation:", mode, "command:", command_id, flush=True)
    deadline = time.monotonic() + 650
    while time.monotonic() < deadline:
        time.sleep(3)
        state = aws(["ssm", "get-command-invocation", "--command-id", command_id, "--instance-id", INSTANCE])
        if state["Status"] in ("Pending", "InProgress", "Delayed"): continue
        if state["Status"] != "Success":
            # Host script catches exceptions and deliberately emits no credentials.
            print(state.get("StandardErrorContent", "FLIRT host operation failed")[:600], file=sys.stderr)
            raise RuntimeError("FLIRT host operation did not complete: " + mode)
        return json.loads(state["StandardOutputContent"])
    raise RuntimeError("FLIRT host operation timed out")


def main():
    kind, image, sha = sys.argv[1:]
    if kind not in ("dashboard", "bot") or not re.fullmatch(r"[a-f0-9]{40}", sha):
        raise ValueError("Invalid release arguments")
    if aws(["sts", "get-caller-identity"])["Account"] != ACCOUNT:
        raise RuntimeError("Unexpected AWS account")
    key = os.environ.get("FLIRT_SUPABASE_SERVICE_KEY", "")
    if not re.fullmatch(r"sb_secret_[A-Za-z0-9_-]{25,}", key):
        raise ValueError("Approved FLIRT deployment secret is missing")
    handshake = host("init")
    if handshake.get("project") != PROJECT:
        raise RuntimeError("Host project differs from FLIRT")
    public = base64.b64decode(handshake["public_key"], validate=True)
    if not public.startswith(b"-----BEGIN PUBLIC KEY-----"):
        raise ValueError("Invalid host transport public key")
    payload = json.dumps({"project": PROJECT, "kind": kind, "key": key, "public_key": PUBLIC_KEY}).encode()
    with tempfile.TemporaryDirectory() as temp:
        pem = Path(temp) / "host-public.pem"
        pem.write_bytes(public)
        result = subprocess.run(["openssl", "pkeyutl", "-encrypt", "-pubin", "-inkey", str(pem), "-pkeyopt", "rsa_padding_mode:oaep", "-pkeyopt", "rsa_oaep_md:sha256", "-pkeyopt", "rsa_mgf1_md:sha256"], input=payload, capture_output=True)
        if result.returncode: raise RuntimeError("Could not encrypt the FLIRT credentials")
        encrypted = base64.b64encode(result.stdout).decode()
    print(json.dumps(host("configure", encrypted)), flush=True)
    print(json.dumps(host("deploy", kind, image, sha)), flush=True)


if __name__ == "__main__":
    try: main()
    except Exception as error:
        message = str(error) if isinstance(error, RuntimeError) else type(error).__name__
        print("FLIRT release stopped: " + message, file=sys.stderr)
        sys.exit(1)
