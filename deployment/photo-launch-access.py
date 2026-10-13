"""Run bounded read-only data checks and simulated replay, never deploy or send to fans."""
import base64, gzip, hashlib, json, pathlib, shlex, subprocess, time
INSTANCE = 'i-0584d283506f3f6be'
CANDIDATE = 'c457f176737762fcec0ef56250d2762b72820f85'
root = pathlib.Path('deployment/v2-photo-recovery')
source = root / 'structured-source'
manifest = json.loads((source / 'manifest.json').read_text())
files = {rel: (source / (rel + '.txt')).read_text() for rel in manifest}
files.update({'manifest.json': json.dumps(manifest), 'replay.mjs': (root / 'replay-structured-candidate.mjs').read_text(), 'run.py': (root / 'replay-structured-candidate.py').read_text(), 'data-readonly.mjs': (root / 'reference-data-readonly.mjs').read_text(), 'data-run.py': (root / 'reference-data-readonly.py').read_text()})
packed = base64.b64encode(gzip.compress(json.dumps(files).encode())).decode()
digest = hashlib.sha256(packed.encode()).hexdigest()
stamp = str(time.time_ns())
work = '/tmp/v2-structured-' + CANDIDATE[:12] + '-' + stamp
output = '/home/ubuntu/twin-v2-validation/reference-' + CANDIDATE[:12] + '-' + stamp

def execute(host, label, timeout):
 command = 'python3 -c ' + shlex.quote(host)
 assert len(command.encode()) < 80000, 'Keep each SSM document safely below its 97KB limit'
 parameters = pathlib.Path('/tmp') / ('reference-ssm-' + stamp + '-' + label + '.json')
 parameters.write_text(json.dumps({'commands': [command], 'executionTimeout': [str(timeout)]}))
 cid = subprocess.check_output(['aws','ssm','send-command','--instance-ids',INSTANCE,'--document-name','AWS-RunShellScript','--parameters','file://'+str(parameters),'--comment','Isolated V2 reference verification: '+label,'--query','Command.CommandId','--output','text'],text=True).strip()
 print(json.dumps({'commandId':cid,'candidate':CANDIDATE,'phase':label}),flush=True)
 result = None
 for _ in range(timeout//3+15):
  try:
   result=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id',INSTANCE,'--output','json'],text=True,stderr=subprocess.DEVNULL))
  except subprocess.CalledProcessError:
   time.sleep(3);continue
  if result['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
  time.sleep(3)
 else:raise RuntimeError('Command still running; inspect existing SSM command before another run')
 print(result.get('StandardOutputContent',''),flush=True)
 if result['Status']!='Success':
  print(result.get('StandardErrorContent','')[-1200:],flush=True)
  raise RuntimeError('Candidate verification '+result['Status']+'; no deployment performed')

# Stage immutable nonsecret source in bounded pieces; only the final command can run a probe.
parts = [packed[i:i+40000] for i in range(0,len(packed),40000)]
for index,part in enumerate(parts):
 host = f"""import pathlib,os
root=pathlib.Path({work!r})
root.mkdir(mode=0o700,exist_ok={index>0!r})
target=root/('payload.'+{str(index)!r})
fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as stream:stream.write({part!r})
print('Nonsecret diagnostic source part stored')
"""
 execute(host,'source-part-'+str(index+1),60)

host = f"""import base64,gzip,hashlib,json,pathlib,subprocess
root=pathlib.Path({work!r})
packed=''.join((root/('payload.'+str(i))).read_text() for i in range({len(parts)}))
assert hashlib.sha256(packed.encode()).hexdigest()=={digest!r}
files=json.loads(gzip.decompress(base64.b64decode(packed)))
for rel,text in files.items():
 p=root/rel;assert root in p.resolve().parents;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text);p.chmod(0o600)
subprocess.run(['python3',str(root/'data-run.py'),'--source-dir',str(root),'--manifest',str(root/'manifest.json'),'--candidate-sha',{CANDIDATE!r},'--script',str(root/'data-readonly.mjs'),'--output-dir',{(output+'-data')!r}],check=True)
subprocess.run(['python3',str(root/'run.py'),'--source-dir',str(root),'--manifest',str(root/'manifest.json'),'--candidate-sha',{CANDIDATE!r},'--script',str(root/'replay.mjs'),'--output-dir',{output!r}],check=True)
"""
execute(host,'read-only-data-then-50-model-turns',1450)
