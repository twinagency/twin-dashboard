import json, subprocess, time
from pathlib import Path
def aws(*args):
    r=subprocess.run(["aws",*args,"--output","json"],capture_output=True,text=True,check=True)
    return json.loads(r.stdout)
code="python3 - <<'PY'\nimport json,subprocess\nids=subprocess.check_output([\"docker\",\"ps\",\"-aq\",\"--filter\",\"name=flirt-dashboard-archive-\"],text=True).split()\nrows=json.loads(subprocess.check_output([\"docker\",\"inspect\",*ids],text=True))\nfor row in sorted(rows,key=lambda r:r[\"Created\"])[:5]:\n image=json.loads(subprocess.check_output([\"docker\",\"image\",\"inspect\",row[\"Image\"]],text=True))[0]\n diff=subprocess.check_output([\"docker\",\"diff\",row[\"Id\"]],text=True)\n print(json.dumps({\"id\":row[\"Id\"],\"name\":row[\"Name\"],\"created\":row[\"Created\"],\"running\":row[\"State\"][\"Running\"],\"labels\":row[\"Config\"].get(\"Labels\"),\"mounts\":row[\"Mounts\"],\"image\":row[\"Image\"],\"digests\":image.get(\"RepoDigests\"),\"diff\":diff}))\nPY"
r=aws("ssm","send-command","--instance-ids","i-09a9dd3bd749643a5","--document-name","AWS-RunShellScript","--comment","Inspect oldest FLIRT deployment archives for history release","--parameters",json.dumps({"commands":[code],"executionTimeout":["180"]}))
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
