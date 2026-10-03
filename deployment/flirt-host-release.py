#!/usr/bin/env python3
"""FLIRT-only host provisioning. Run through the existing authorised AWS SSM connection.
No credentials are printed. Incoming credentials use RSA-OAEP transport encryption.
"""
import base64, fcntl, json, os, re, secrets, shutil, stat, subprocess, sys, tempfile, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

PROJECT = "lkmfwpqegjluirfusnaw"
ORIGIN = "https://dashboard.flirtaiagency.com"
ROOT = Path("/etc/flirt")
REGISTRY = "323149985112.dkr.ecr.ap-southeast-2.amazonaws.com"
TWIN_PROJECT = "aouaenqayfltoqrmpitg"
PROVIDERS = ("OPENROUTER_API_KEY", "ELEVENLABS_API_KEY", "DEEPGRAM_API_KEY")


def command(args, data=None, timeout=180):
    result = subprocess.run(args, input=data, capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError("Host command failed: " + args[0])
    return result.stdout


def secured_directory():
    if os.geteuid() != 0:
        raise RuntimeError("Root-owned FLIRT configuration is required")
    if ROOT.is_symlink():
        raise RuntimeError("Unsafe configuration directory")
    ROOT.mkdir(mode=0o700, exist_ok=True)
    info = ROOT.stat()
    if info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o700:
        raise RuntimeError("FLIRT configuration must be owned by root with mode 0700")


def check_private_file(path):
    if path.is_symlink():
        raise RuntimeError("Symlinked credential files are not permitted")
    if path.exists():
        info = path.stat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o600:
            raise RuntimeError("FLIRT credential files require root ownership and mode 0600")


def private_write(path, content):
    check_private_file(path)
    fd, tmp = tempfile.mkstemp(prefix=".flirt-", dir=ROOT)
    try:
        with os.fdopen(fd, "w") as handle:
            handle.write(content)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)


def initialise():
    secured_directory()
    lock = ROOT / "provision.lock"
    check_private_file(lock)
    fd = os.open(lock, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        key = ROOT / "transport.key"
        check_private_file(key)
        if not key.exists():
            private = command(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:4096"])
            private_write(key, private.decode())
        public = command(["openssl", "pkey", "-in", str(key), "-pubout"])
    print(json.dumps({"public_key": base64.b64encode(public).decode(), "project": PROJECT}))


def validate_payload(payload):
    if set(payload) != {"project", "kind", "key", "public_key"}:
        raise ValueError("Unexpected credential payload fields")
    if payload["project"] != PROJECT or payload["kind"] not in ("dashboard", "bot"):
        raise ValueError("Payload is not for the approved FLIRT deployment")
    if not re.fullmatch(r"sb_secret_[A-Za-z0-9_-]{25,}", payload["key"]):
        raise ValueError("Invalid FLIRT server key format")
    if not re.fullmatch(r"sb_publishable_[A-Za-z0-9_-]{25,}", payload["public_key"]):
        raise ValueError("Invalid FLIRT public key format")
    return payload


def read_env(path):
    check_private_file(path)
    if not path.exists(): return {}
    return dict(line.split("=", 1) for line in path.read_text().splitlines() if line and not line.startswith("#"))


def verify_database(key):
    request = Request("https://" + PROJECT + ".supabase.co/rest/v1/partner_agencies?select=id&limit=1", headers={"apikey": key})
    try:
        with urlopen(request, timeout=20) as response:
            if response.status != 200 or not isinstance(json.load(response), list):
                raise RuntimeError("FLIRT database verification failed")
    except HTTPError as error:
        # Only allow a status and structured PostgREST code into deployment logs.
        code = "unavailable"
        try:
            candidate = json.loads(error.read(4096)).get("code", "")
            if isinstance(candidate, str) and re.fullmatch(r"(?:PGRST\d{3}|[0-9A-Z]{5})", candidate):
                code = candidate
        except (ValueError, AttributeError):
            pass
        raise RuntimeError("FLIRT database verification failed: HTTP " + str(error.code) + ", code " + code) from None


def configure(encoded):
    secured_directory()
    key_file = ROOT / "transport.key"
    check_private_file(key_file)
    encrypted = base64.b64decode(encoded, validate=True)
    if len(encrypted) != 512:
        raise ValueError("Unexpected encrypted payload size")
    clear = command(["openssl", "pkeyutl", "-decrypt", "-inkey", str(key_file), "-pkeyopt", "rsa_padding_mode:oaep", "-pkeyopt", "rsa_oaep_md:sha256", "-pkeyopt", "rsa_mgf1_md:sha256"], encrypted)
    payload = validate_payload(json.loads(clear))
    # Confirm the credential is accepted by the exact FLIRT project before storing it.
    verify_database(payload["key"])
    provider_script = "const names=" + json.dumps(PROVIDERS) + "; console.log(JSON.stringify(Object.fromEntries(names.map(k=>[k,process.env[k]||'']))));"
    providers = json.loads(command(["docker", "exec", "next-app", "node", "-e", provider_script], timeout=20))
    if set(providers) != set(PROVIDERS) or not all(providers.values()):
        raise RuntimeError("An authorised shared provider key is missing")
    path = ROOT / (payload["kind"] + ".env")
    previous = read_env(path)
    if previous and previous.get("FLIRT_SUPABASE_PROJECT_REF") != PROJECT:
        raise RuntimeError("Existing configuration has an unexpected database target")
    env = {
        "NODE_ENV": "production", "FLIRT_BACKEND_ENABLED": "true",
        "FLIRT_SUPABASE_PROJECT_REF": PROJECT,
        "SUPABASE_URL": "https://" + PROJECT + ".supabase.co",
        "SUPABASE_SERVICE_KEY": payload["key"], "SUPABASE_PUBLISHABLE_KEY": payload["public_key"],
        "OPENROUTER_APP_NAME": "FLIRT", "OPENROUTER_APP_URL": "", **providers,
    }
    if payload["kind"] == "dashboard":
        # User-authorised live management of exactly four creators. Credentials
        # stay on this same host; neither Actions nor SSM history receives them.
        live_script = "console.log(JSON.stringify({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_KEY}));"
        live = json.loads(command(["docker", "exec", "next-app", "node", "-e", live_script], timeout=20))
        if live.get("url", "").rstrip("/") != "https://" + TWIN_PROJECT + ".supabase.co" or not live.get("key"):
            raise RuntimeError("The existing Twin live connection could not be verified")
        env.update({"FLIRT_LIVE_TWIN_ENABLED": "true", "FLIRT_LIVE_TWIN_URL": live["url"].rstrip("/"), "FLIRT_LIVE_TWIN_SERVICE_KEY": live["key"]})
        env["DASHBOARD_PUBLIC_ORIGIN"] = ORIGIN
        # Operator-set switch for the approved-applicant -> paused Twin clone pipeline.
        # Off unless it was already turned on in this protected file; a release never enables it.
        if previous.get("FLIRT_CLONE_PIPELINE_ENABLED") == "true":
            env["FLIRT_CLONE_PIPELINE_ENABLED"] = "true"
        for name in ("DASHBOARD_SESSION_SECRET", "CREATOR_SESSION_SECRET", "DASHBOARD_PASSWORD"):
            env[name] = previous.get(name) or secrets.token_hex(32)
    else:
        env.update({"MOCK": "false", "BOT_TOKEN": ""})
    if any(not isinstance(value, str) or any(c in value for c in "\r\n\x00") for value in env.values()):
        raise ValueError("Unexpected multiline credential")
    private_write(path, "".join(name + "=" + value + "\n" for name, value in env.items()))
    print(json.dumps({"configured": payload["kind"], "project": PROJECT, "database_verified": True, "shared_providers": list(PROVIDERS)}))


def inspect(name):
    projection = '{"Id":{{json .Id}},"Config":{"Labels":{{json .Config.Labels}}},"State":{{json .State}},"RestartCount":{{.RestartCount}}}'
    result = subprocess.run(["docker", "inspect", "--format", projection, name], capture_output=True)
    if result.returncode: return None
    return json.loads(result.stdout)


def validate_release(kind, image, sha):
    if kind not in ("dashboard", "bot") or not re.fullmatch(r"[a-f0-9]{40}", sha):
        raise ValueError("Invalid FLIRT release")
    expected = REGISTRY + "/twin-" + kind + "@sha256:"
    if not image.startswith(expected) or not re.fullmatch(r"[a-f0-9]{64}", image[len(expected):]):
        raise ValueError("Image must be an immutable digest from the approved ECR repository")


def deploy(kind, image, sha):
    validate_release(kind, image, sha)
    secured_directory()
    env_file = ROOT / (kind + ".env")
    env = read_env(env_file)
    if env.get("FLIRT_SUPABASE_PROJECT_REF") != PROJECT or env.get("FLIRT_BACKEND_ENABLED") != "true":
        raise RuntimeError("Approved FLIRT runtime configuration is missing")
    if shutil.disk_usage("/").free < 5 * 1024**3:
        raise RuntimeError("Host has insufficient free disk; no images were removed")
    memory = dict(line.split(":", 1) for line in Path("/proc/meminfo").read_text().splitlines())
    if int(memory["MemAvailable"].split()[0]) < 512 * 1024:
        raise RuntimeError("Host has insufficient available memory")
    twin_before = inspect("next-app")
    if not twin_before or not twin_before["State"]["Running"]:
        raise RuntimeError("Existing Twin application must be healthy before proceeding")
    name = "flirt-" + kind
    previous = inspect(name)
    if previous and (previous["Config"].get("Labels") or {}).get("io.flirt.project") != PROJECT:
        raise RuntimeError("Container name belongs to an unrecognised deployment")
    rollback = name + "-rollback"
    older = inspect(rollback)
    archived = None
    if older:
        labels = older["Config"].get("Labels") or {}
        old_sha = labels.get("io.flirt.commit", "")
        if labels.get("io.flirt.project") != PROJECT or not re.fullmatch(r"[a-f0-9]{40}", old_sha) or older["State"]["Running"]:
            raise RuntimeError("An earlier FLIRT rollback container needs review")
        archived = name + "-archive-" + old_sha[:12]
        if inspect(archived):
            raise RuntimeError("A FLIRT rollback archive already uses the expected name")
    password = command(["aws", "ecr", "get-login-password", "--region", "ap-southeast-2"])
    command(["docker", "login", "--username", "AWS", "--password-stdin", REGISTRY], password)
    command(["docker", "pull", image], timeout=480)
    built_sha = command(["docker", "run", "--rm", "--network", "none", "--entrypoint", "node", image, "-e", "process.stdout.write(process.env.GIT_SHA || '')"]).decode()
    if built_sha != sha:
        raise RuntimeError("Image commit does not match the intended FLIRT release")
    command(["docker", "run", "--rm", "--network", "none", "--env-file", str(env_file), "--entrypoint", "node", image, "/app/deployment/flirt-preflight.cjs", kind])
    limit = "512m" if kind == "dashboard" else "384m"
    args = ["docker", "run", "-d", "--name", name, "--restart", "unless-stopped", "--stop-timeout", "30", "--memory", limit, "--memory-swap", limit, "--cpus", "1", "--log-opt", "max-size=10m", "--log-opt", "max-file=3", "--label", "io.flirt.project=" + PROJECT, "--label", "io.flirt.commit=" + sha, "--env-file", str(env_file)]
    if kind == "dashboard": args.extend(["-p", "127.0.0.1:3101:3001"])
    args.append(image)
    if older:
        # Preserve the stopped, labelled older version without blocking the
        # current version from becoming the new rollback.
        command(["docker", "rename", rollback, archived])
    try:
        if previous:
            command(["docker", "stop", "-t", "30", name])
            command(["docker", "rename", name, rollback])
        command(args)
        healthy = False
        for _ in range(25):
            current = inspect(name)
            if current and current["State"]["Running"] and current["RestartCount"] == 0:
                if kind == "bot":
                    time.sleep(12)
                    current = inspect(name)
                    healthy = bool(current and current["State"]["Running"] and current["RestartCount"] == 0)
                else:
                    try:
                        with urlopen("http://127.0.0.1:3101/creator/login", timeout=5) as response:
                            healthy = response.status == 200 and b"FLIRT" in response.read()
                    except Exception:
                        pass
                if healthy: break
            time.sleep(2)
        if not healthy: raise RuntimeError("FLIRT startup check failed")
        runtime_sha = command(["docker", "exec", name, "printenv", "GIT_SHA"]).decode().strip()
        if runtime_sha != sha: raise RuntimeError("Running FLIRT commit differs from release")
        twin_after = inspect("next-app")
        if twin_after["Id"] != twin_before["Id"] or twin_after["State"]["StartedAt"] != twin_before["State"]["StartedAt"] or not twin_after["State"]["Running"]:
            raise RuntimeError("Twin state changed during the FLIRT release")
        print(json.dumps({"running": name, "commit": sha, "project": PROJECT, "twin_unchanged": True, "public_hostname_pending": kind == "dashboard", "rollback_retained": bool(previous)}))
    except Exception:
        # Only remove this newly created, labelled FLIRT container. Never touch Twin.
        current = inspect(name)
        if current and (current["Config"].get("Labels") or {}).get("io.flirt.commit") == sha:
            if current["State"]["Running"]: command(["docker", "stop", "-t", "30", name])
            command(["docker", "rm", name])
        if previous and inspect(rollback):
            command(["docker", "rename", rollback, name])
            command(["docker", "start", name])
        if older and archived and inspect(archived) and not inspect(rollback):
            command(["docker", "rename", archived, rollback])
        raise


if __name__ == "__main__":
    try:
        mode = sys.argv[1]
        if mode == "init" and len(sys.argv) == 2: initialise()
        elif mode == "configure" and len(sys.argv) == 3: configure(sys.argv[2])
        elif mode == "deploy" and len(sys.argv) == 5: deploy(*sys.argv[2:])
        else: raise ValueError("Unsupported FLIRT host operation")
    except Exception as error:
        # Neither service credentials nor provider responses may enter SSM logs.
        print("FLIRT host operation failed: " + (str(error) if isinstance(error, RuntimeError) else type(error).__name__) + ". No credentials logged.", file=sys.stderr)
        sys.exit(1)

