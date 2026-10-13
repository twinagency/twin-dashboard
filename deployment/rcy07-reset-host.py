"""Read-only inspection for the user-authorized @rcy07 fresh-chat reset."""
import subprocess,json,pathlib,hashlib,re
CID="6814483810"
names=json.loads(subprocess.check_output(["docker","ps","--format","json"],text=True).splitlines()[0]) if False else subprocess.check_output(["docker","ps","--format","{{.Names}}"],text=True).splitlines()
for name in names:
 if "twin-v2" not in name: continue
 obj=json.loads(subprocess.check_output(["docker","inspect",name],text=True))[0]
 env=dict(v.split("=",1) for v in obj["Config"]["Env"])
 print("RUNTIME",json.dumps({"name":name,"id":obj["Id"],"image":obj["Image"],"revision":env.get("GIT_SHA"),"historyRevision":env.get("HISTORY_REVISION"),"dirs":{k:v for k,v in env.items() if k in ["DATA_DIR","LOG_DIR"]},"mounts":[{"source":m["Source"],"destination":m["Destination"]} for m in obj["Mounts"]]}))
 if name!="twin-v2-bot-1":continue
 for file in ["src/memory.ts","src/bot.ts","src/memory/runtime.ts","src/context.ts","src/config.ts","src/prompts.ts"]:
  try:content=subprocess.check_output(["docker","exec",name,"cat","/app/"+file],text=True,stderr=subprocess.DEVNULL)
  except subprocess.CalledProcessError:continue
  print("SOURCE",file,"sha256",hashlib.sha256(content.encode()).hexdigest())
  lines=content.splitlines(); indexes=set()
  pats=r"resetChat|resetFan|memoryReset|resetMemory|command\(.*reset|command\(.*start|reset\(|dataDir|logDir|epoch|paused|prompt|fan_profiles|stated"
  if file in ["src/memory.ts","src/context.ts"]:indexes=set(range(len(lines)))
  else:
   for i,l in enumerate(lines):
    if re.search(pats,l): indexes.update(range(max(0,i-3),min(len(lines),i+7)))
  print("\n".join(str(i+1)+": "+lines[i] for i in sorted(indexes))[:15000 if file=="src/memory.ts" else 5000])
root=pathlib.Path("/home/ubuntu/twin-v2")
for folder in ["data","logs"]:
 base=root/folder
 print("FOLDER",str(base),base.exists())
 if not base.exists():continue
 for sub in sorted(base.iterdir()):
  if not sub.is_dir():continue
  files=[{"name":f.name,"bytes":f.stat().st_size} for f in sub.iterdir() if f.is_file()]
  if folder=="data":
   target=sub/(CID+".json")
   if target.exists():
    d=json.loads(target.read_text())
    print("FAN_STATE",json.dumps({"girl":sub.name,"file":str(target),"epoch":d.get("epoch"),"ageConfirmed":d.get("ageConfirmed"),"who":d.get("who"),"history":len(d.get("history",[])),"sent":len(d.get("sent",[])),"keys":list(d),"mtime":target.stat().st_mtime}))
   print("DATA_FILES",sub.name,json.dumps([f for f in files if CID in f["name"] or f["name"].startswith("_")])[:3000])
  else:print("LOG_FILES",sub.name,json.dumps(files)[:2000])
