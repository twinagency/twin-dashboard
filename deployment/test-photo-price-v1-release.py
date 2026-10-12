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


source=pathlib.Path('deployment/test-photo-price-v1-host.py').read_text()
encoded=base64.b64encode(source.encode()).decode()
print(ssm("printf '%s' '"+encoded+"' | base64 -d > /tmp/test-photo-price-v1-deploy.py\npython3 /tmp/test-photo-price-v1-deploy.py",1100),flush=True)
