"""Read-only verification of saved production control through deployed consumers."""
import base64,concurrent.futures,json,pathlib,subprocess,time
INSTANCE='i-0584d283506f3f6be'
def ssm(command, timeout=120):
 p=pathlib.Path('/tmp')/('photo-'+str(time.time_ns())+'.json')
 p.write_text(json.dumps({'commands':[command],'executionTimeout':[str(timeout)]}))
 cid=subprocess.check_output(['aws','ssm','send-command','--instance-ids',INSTANCE,'--document-name','AWS-RunShellScript','--parameters','file://'+str(p),'--comment','Read-only photo launch final verification','--query','Command.CommandId','--output','text'],text=True).strip()
 for _ in range(timeout//3+20):
  try:r=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id',INSTANCE,'--output','json'],text=True,stderr=subprocess.DEVNULL))
  except subprocess.CalledProcessError:time.sleep(3);continue
  if r['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
  time.sleep(3)
 if r['Status']!='Success':raise RuntimeError(json.dumps({k:r.get(k) for k in ['Status','StandardOutputContent','StandardErrorContent']}))
 return r['StandardOutputContent']

def node_check(container,path,timeout=120):
 source=pathlib.Path(path).read_text()
 host="import subprocess\nsource="+repr(source)+"\nr=subprocess.run(['docker','exec','-i',"+repr(container)+",'node','--import','tsx','--input-type=module'],input=source,text=True,capture_output=True,timeout=100)\nprint(r.stdout)\nprint(r.stderr[-4000:] if r.returncode else '')\nraise SystemExit(r.returncode)\n"
 encoded=base64.b64encode(host.encode()).decode()
 return ssm("printf '%s' '"+encoded+"' | base64 -d > /tmp/photo-final-consumer-check.py\npython3 /tmp/photo-final-consumer-check.py",timeout)
print(node_check('next-app','deployment/photo-final-v1.mjs'),flush=True)
print(node_check('twin-v2-bot-1','deployment/photo-final-v2.mjs'),flush=True)
INSTANCE='i-09a9dd3bd749643a5'
source=pathlib.Path('deployment/photo-final-dashboard.cjs').read_text()
host="import subprocess,json\nsource="+repr(source)+"\nr=subprocess.run(['docker','exec','-i','next-app','node'],input=source,text=True,capture_output=True,timeout=100)\nprint(r.stdout)\nprint(r.stderr[-4000:] if r.returncode else '')\nprint(subprocess.check_output(['docker','inspect','-f','{{json .Config.Image}}','next-app'],text=True))\nraise SystemExit(r.returncode)\n"
encoded=base64.b64encode(host.encode()).decode()
print(ssm("printf '%s' '"+encoded+"' | base64 -d > /tmp/photo-final-dashboard-check.py\npython3 /tmp/photo-final-dashboard-check.py",120),flush=True)
