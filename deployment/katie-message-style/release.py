"""Release an already-tested overlay while preserving the live container config.

Run on the V2 host as: python3 release.py STAGING_ROOT CODE_COMMIT
No credentials are printed, copied to Git, or passed in command arguments.
The host's historical compose override is not the running configuration.
"""
import copy
import http.client
import json
import pathlib
import socket
import subprocess
import sys
import time
import urllib.parse

stage = pathlib.Path(sys.argv[1])
revision = sys.argv[2]
assert len(revision) == 40 and all(c in "0123456789abcdef" for c in revision)
base = json.loads((stage / "base.json").read_text())
results = json.loads((stage / "final-results.json").read_text())
assert {r["test"] for r in results} == {"typecheck", "katie", "check-delivery", "check-runner-recovery"}
assert all(r["exit"] == 0 for r in results), "candidate checks failed"
earlier = json.loads((stage / "regression-results.json").read_text())
required = {"check-text-retry", "check-structured-turn", "check-prompt-parity", "check-identity-truth", "check-shutdown"}
assert required <= {r["test"] for r in earlier if r["exit"] == 0}

class Docker(http.client.HTTPConnection):
    def __init__(self):
        super().__init__("localhost", timeout=160)
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect("/var/run/docker.sock")

def api(method, path, body=None, allowed=(200, 201, 204, 304)):
    conn = Docker()
    payload = json.dumps(body).encode() if body is not None else None
    try:
        conn.request(method, "/v1.47" + path, payload, {"Content-Type": "application/json"})
        response = conn.getresponse()
        data = response.read()
        # Do not echo request bodies or daemon responses that could contain config.
        if response.status not in allowed:
            raise RuntimeError(f"Docker {method} {path.split('?')[0]} failed ({response.status})")
        return json.loads(data) if data else None
    finally:
        conn.close()

names = ["twin-v2-bot-1", "twin-v2-dash-1"]
old = {name: api("GET", "/containers/" + name + "/json") for name in names}
assert old[names[0]]["Id"] == base["container"] and old[names[1]]["Id"] == base["dashboard"], "live containers changed"
assert all(x["Image"] == base["image"] and x["State"]["Running"] for x in old.values())
candidate = api("GET", "/images/twin-v2:katie-style-20261030/json")["Id"]
assert candidate != base["image"]
fleet_file = stage.parent / "data" / "_fleet.json"
baseline = json.loads(fleet_file.read_text())
expected = {slug for slug, row in baseline.get("girls", {}).items() if row.get("status") == "running"}
assert "katie-price" in expected, "Katie is not running before the release"

def create_config(prior, bot):
    cfg = copy.deepcopy(prior["Config"])
    cfg["Image"] = candidate
    env = {v.split("=", 1)[0]: v.split("=", 1)[1] for v in cfg.get("Env", [])}
    env["GIT_SHA"] = revision
    if bot:
        env["V2_SHUTDOWN_DEADLINE_MS"] = "125000"
        cfg["StopTimeout"] = 135
    cfg["Env"] = [k + "=" + v for k, v in env.items()]
    cfg["HostConfig"] = copy.deepcopy(prior["HostConfig"])
    cfg["NetworkingConfig"] = {"EndpointsConfig": {
        name: {k: copy.deepcopy(info[k]) for k in ("Aliases", "IPAMConfig", "Links", "DriverOpts") if info.get(k) is not None}
        for name, info in prior["NetworkSettings"]["Networks"].items()
    }}
    return cfg

rollback_names = {name: name + "-pre-katie-20261030" for name in names}
for name in rollback_names.values():
    try:
        api("GET", "/containers/" + name + "/json")
    except RuntimeError:
        continue
    raise RuntimeError("rollback container name already exists")

replaced = []
renamed = []
try:
    # Retain the old containers intact, with the exact prior configuration.
    for index, name in enumerate(names):
        prior = old[name]
        api("POST", "/containers/" + prior["Id"] + "/stop?t=35")
        stopped = api("GET", "/containers/" + prior["Id"] + "/json")
        if index == 0 and stopped["State"]["ExitCode"] != 0:
            api("POST", "/containers/" + prior["Id"] + "/start")
            raise RuntimeError("bot drain did not exit cleanly; original service restarted")
        api("POST", "/containers/" + prior["Id"] + "/rename?name=" + rollback_names[name])
        renamed.append(name)
        created = api("POST", "/containers/create?name=" + name, create_config(prior, index == 0))
        replaced.append((name, created["Id"]))
        api("POST", "/containers/" + created["Id"] + "/start")
        print(json.dumps({"started": name, "image": candidate}), flush=True)
    deadline = time.monotonic() + 100
    while time.monotonic() < deadline:
        states = [api("GET", "/containers/" + name + "/json") for name in names]
        if any(not x["State"]["Running"] for x in states):
            raise RuntimeError("replacement exited during startup")
        try:
            fleet = json.loads(fleet_file.read_text())
            running = {slug for slug, row in fleet.get("girls", {}).items() if row.get("status") == "running"}
            if fleet.get("revision") == revision and expected <= running:
                break
        except (ValueError, OSError):
            pass
        time.sleep(2)
    else:
        raise RuntimeError("fleet startup was not verified")
    receipt = {"revision": revision, "image": candidate, "baseImage": base["image"],
               "containers": dict(replaced), "rollbackContainers": rollback_names,
               "runningCreators": sorted(running), "katieStatus": fleet["girls"]["katie-price"]["status"],
               "botDrainExitCode": 0, "verifiedAt": fleet["at"]}
    (stage / "release-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt), flush=True)
except BaseException:
    # Preserve the shared journals and histories. Stop the new writer before
    # restoring the previous one. No container data volume is removed.
    for name, ident in reversed(replaced):
        try:
            api("POST", "/containers/" + ident + "/stop?t=135")
            api("DELETE", "/containers/" + ident)
        except RuntimeError:
            raise RuntimeError("replacement could not stop; manual rollback required") from None
    for name in reversed(renamed):
        ident = old[name]["Id"]
        api("POST", "/containers/" + ident + "/rename?name=" + name)
        api("POST", "/containers/" + ident + "/start")
    print("RELEASE FAILED: original containers restored", flush=True)
    raise
