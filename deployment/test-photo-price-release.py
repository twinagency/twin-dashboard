"""Verified scoped test-price release."""
import base64,concurrent.futures,json,pathlib,subprocess,time
INSTANCE='i-0584d283506f3f6be'
def ssm(command, timeout=120):
 p=pathlib.Path('/tmp')/('photo-'+str(time.time_ns())+'.json')
 p.write_text(json.dumps({'commands':[command],'executionTimeout':[str(timeout)]}))
 cid=subprocess.check_output(['aws','ssm','send-command','--instance-ids',INSTANCE,'--document-name','AWS-RunShellScript','--parameters','file://'+str(p),'--comment','Scoped photo test-price release','--query','Command.CommandId','--output','text'],text=True).strip()
 for _ in range(timeout//3+20):
  try:r=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id',INSTANCE,'--output','json'],text=True,stderr=subprocess.DEVNULL))
  except subprocess.CalledProcessError:time.sleep(3);continue
  if r['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
  time.sleep(3)
 if r['Status']!='Success':raise RuntimeError(json.dumps({k:r.get(k) for k in ['Status','StandardOutputContent','StandardErrorContent']}))
 return r['StandardOutputContent']


encoded=pathlib.Path('deployment/test-photo-price-payload.b64').read_text().strip()
print(ssm("rm -f /tmp/test-photo-price-payload.b64",30),flush=True)
for n in range(0,len(encoded),10000):
 chunk=encoded[n:n+10000]
 print(ssm("printf '%s' '"+chunk+"' >> /tmp/test-photo-price-payload.b64",30),flush=True)
unpack="""import pathlib,base64,zlib,json
p=pathlib.Path('/tmp/test-photo-price-payload.json')
p.write_bytes(zlib.decompress(base64.b64decode(pathlib.Path('/tmp/test-photo-price-payload.b64').read_bytes())))
v=json.loads(p.read_text())
for kind in ['prepare','deploy']:
 pathlib.Path('/tmp/test-photo-price-'+kind+'.py').write_text(v[kind])
"""
print(ssm("python3 -c "+__import__('shlex').quote(unpack),30),flush=True)
print(ssm("python3 /tmp/test-photo-price-prepare.py",900),flush=True)
print(ssm("python3 /tmp/test-photo-price-deploy.py",300),flush=True)
