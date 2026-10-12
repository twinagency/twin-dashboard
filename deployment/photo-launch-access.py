"""Transfer the checked source and prepare rollback/image; no container restart or setting change."""
import base64,concurrent.futures,json,pathlib,subprocess,time
INSTANCE='i-0584d283506f3f6be'
def ssm(command, timeout=120):
 p=pathlib.Path('/tmp')/('photo-'+str(time.time_ns())+'.json')
 p.write_text(json.dumps({'commands':[command],'executionTimeout':[str(timeout)]}))
 cid=subprocess.check_output(['aws','ssm','send-command','--instance-ids',INSTANCE,'--document-name','AWS-RunShellScript','--parameters','file://'+str(p),'--comment','Prepare photo candidate and rollback; no restart','--query','Command.CommandId','--output','text'],text=True).strip()
 for _ in range(timeout//3+20):
  try:r=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id',INSTANCE,'--output','json'],text=True,stderr=subprocess.DEVNULL))
  except subprocess.CalledProcessError:time.sleep(3);continue
  if r['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
  time.sleep(3)
 if r['Status']!='Success':raise RuntimeError(json.dumps({k:r.get(k) for k in ['Status','StandardOutputContent','StandardErrorContent']}))
 return r['StandardOutputContent']
root='/tmp/twin-v2-photo-ef040a7'
ssm('mkdir -p '+root+' && chmod 700 '+root)
b=pathlib.Path('deployment/photo-v2-source.b64').read_text().strip()
chunks=[b[i:i+35000] for i in range(0,len(b),35000)]
def transfer(pair):
 i,chunk=pair
 return ssm("printf '%s' '"+chunk+"' > "+root+'/'+str(i).zfill(3)+'.b64')
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(transfer,enumerate(chunks)))
print('Transferred source chunks:',len(chunks),flush=True)
manifest=base64.b64encode(pathlib.Path('deployment/photo-v2-manifest.json').read_bytes()).decode()
host=base64.b64encode(pathlib.Path('deployment/photo-v2-prepare-host.py').read_bytes()).decode()
command="set -eu\ncat "+root+"/*.b64 | base64 -d > /tmp/twin-v2-photo-ef040a7.tar.gz\nprintf '%s' '"+manifest+"' | base64 -d > /tmp/twin-v2-photo-manifest.json\nprintf '%s' '"+host+"' | base64 -d > /tmp/twin-v2-photo-prepare-host.py\npython3 /tmp/twin-v2-photo-prepare-host.py"
print(ssm(command,900),flush=True)
