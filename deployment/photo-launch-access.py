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

audit="import json,subprocess\nrows=[]\nfor name in ['next-app','twin-v2-bot-1','twin-v2-dash-1']:\n x=json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]\n env=dict(s.split('=',1) for s in x['Config']['Env'] if '=' in s)\n rows.append({'name':name,'running':x['State']['Running'],'image':x['Image'],'imageReference':x['Config']['Image'],'revision':env.get('GIT_SHA'),'startedAt':x['State']['StartedAt']})\nassert rows[0]['revision']=='caa2a94ee519eb84d25b6c77023f732e8fed7b36','V1 runtime changed'\nfor row in rows[1:]:\n assert row['running'] and row['revision']=='45931b6f56db9f97cc8406154e35a0d216f5de65' and row['image']=='sha256:2f076bf6fbc17b4de58a31887e9328a56e0275d90edda39ea789efbd13517d2e','V2 runtime changed'\ncmd=\"import './src/config.ts';console.log(JSON.stringify({bundles:process.env.V2_BUNDLES??null}))\"\nflags=json.loads(subprocess.check_output(['docker','exec','twin-v2-bot-1','node','--import','tsx','--input-type=module','-e',cmd],text=True))\nprint(json.dumps({'runtimeInventory':rows,'v2Flags':flags}))\n"
encoded=base64.b64encode(audit.encode()).decode()
print(ssm("printf '%s' '"+encoded+"' | base64 -d > /tmp/mrs-v2-runtime-check.py\npython3 /tmp/mrs-v2-runtime-check.py"),flush=True)
print(node_check('twin-v2-dash-1','deployment/riley-missing-card-inspect.mjs'),flush=True)
