"""Run the reviewed account-scoped maintenance script using the existing SSM identity."""
import base64,json,pathlib,shlex,subprocess,time
instance="i-0584d283506f3f6be"
script=pathlib.Path("deployment/rcy07-reset-host.py").read_bytes()
command="python3 -c "+shlex.quote("import base64;exec(compile(base64.b64decode("+repr(base64.b64encode(script).decode())+"),'rcy07-reset-host','exec'))")
params=pathlib.Path("/tmp/rcy07-reset-ssm.json");params.write_text(json.dumps({"commands":[command],"executionTimeout":["120"]}))
cid=subprocess.check_output(["aws","ssm","send-command","--instance-ids",instance,"--document-name","AWS-RunShellScript","--comment","Requested rcy07 conversation reset inspection","--parameters","file://"+str(params),"--query","Command.CommandId","--output","text"],text=True).strip()
print("SSM_COMMAND",cid,flush=True)
deadline=time.time()+150
while time.time()<deadline:
 try:r=json.loads(subprocess.check_output(["aws","ssm","get-command-invocation","--command-id",cid,"--instance-id",instance,"--output","json"],text=True,stderr=subprocess.DEVNULL))
 except subprocess.CalledProcessError:time.sleep(2);continue
 if r["Status"] in ["Success","Failed","Cancelled","TimedOut"]:
  print(r.get("StandardOutputContent",""),flush=True)
  print(r.get("StandardErrorContent","")[-4000:],flush=True)
  assert r["Status"]=="Success",r["Status"]
  break
 time.sleep(2)
else:raise RuntimeError("SSM result pending; inspect this command ID before retrying")
