import pathlib,json,subprocess,time,hashlib
root=pathlib.Path("/home/ubuntu/twin-v2")
for name in ["twin-v2-bot-1","twin-v2-dash-1"]:
 o=json.loads(subprocess.check_output(["docker","inspect",name],text=True))[0];e=dict(x.split("=",1) for x in o["Config"]["Env"])
 print("RUNTIME",name,o["Id"],e.get("GIT_SHA"),e.get("HISTORY_REVISION"),o["State"]["Running"])
for p in sorted((root/"data").rglob("*6814483810*.json")):
 if p.is_symlink():continue
 try:d=json.loads(p.read_bytes())
 except ValueError:continue
 print("STATE",json.dumps({"path":str(p.relative_to(root)),"bytes":p.stat().st_size,"age_seconds":round(time.time()-p.stat().st_mtime),"hash":hashlib.sha256(p.read_bytes()).hexdigest(),"epoch":d.get("epoch"),"history":len(d.get("history",[])),"sent":len(d.get("sent",[])),"who":d.get("who"),"keys":list(d)}))
p=root/"data"/"_operator_resets"/"rcy07-20261013-fresh-chat.json"
print("MARKER",p.read_text() if p.exists() else "absent")
