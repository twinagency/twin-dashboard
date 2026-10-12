import json, subprocess, time
from pathlib import Path
def aws(*args):
    r=subprocess.run(["aws",*args,"--output","json"],capture_output=True,text=True,check=True)
    return json.loads(r.stdout)
code="""set -eu
df -h /
docker system df
docker builder prune -af
docker image prune -f
df -h /
docker system df
docker ps -a --format '{{.Names}} {{.Image}} {{.Status}}'
"""
r=aws("ssm","send-command","--instance-ids","i-09a9dd3bd749643a5","--document-name","AWS-RunShellScript","--comment","Clear reproducible unused build cache for authorised FLIRT history release","--parameters",json.dumps({"commands":[code],"executionTimeout":["180"]}))
cid=r["Command"]["CommandId"]; print("command:",cid,flush=True)
for _ in range(48):
    time.sleep(5)
    try:r=aws("ssm","get-command-invocation","--command-id",cid,"--instance-id","i-09a9dd3bd749643a5")
    except subprocess.CalledProcessError:continue
    if r["Status"] in ["Pending","InProgress","Delayed"]:continue
    print(r.get("StandardOutputContent",""));print(r.get("StandardErrorContent",""))
    if r["Status"]!="Success":raise RuntimeError(r["Status"])
    break
else:raise RuntimeError("Command still pending; inspect before retry")
