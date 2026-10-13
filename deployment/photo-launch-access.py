"""Run the reviewed candidate against frozen evidence; no deployment or Telegram sends."""
import base64, gzip, json, pathlib, shlex, subprocess, time
INSTANCE = 'i-0584d283506f3f6be'
CANDIDATE = 'c457f176737762fcec0ef56250d2762b72820f85'
root = pathlib.Path('deployment/v2-photo-recovery')
source = root / 'structured-source'
manifest = json.loads((source / 'manifest.json').read_text())
files = {rel: (source / (rel + '.txt')).read_text() for rel in manifest}
files.update({'manifest.json': json.dumps(manifest), 'replay.mjs': (root / 'replay-structured-candidate.mjs').read_text(), 'run.py': (root / 'replay-structured-candidate.py').read_text(), 'data-readonly.mjs': (root / 'reference-data-readonly.mjs').read_text(), 'data-run.py': (root / 'reference-data-readonly.py').read_text()})
packed = base64.b64encode(gzip.compress(json.dumps(files).encode())).decode()
stamp = str(time.time_ns())
work = '/tmp/v2-structured-' + CANDIDATE[:12] + '-' + stamp
output = '/home/ubuntu/twin-v2-validation/reference-' + CANDIDATE[:12] + '-' + stamp
host = f'''import base64,gzip,json,pathlib,subprocess
root=pathlib.Path({work!r});root.mkdir(mode=0o700)
files=json.loads(gzip.decompress(base64.b64decode({packed!r})))
for rel,text in files.items():
 p=root/rel;assert root in p.resolve().parents;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text);p.chmod(0o600)
subprocess.run(['python3',str(root/'data-run.py'),'--source-dir',str(root),'--manifest',str(root/'manifest.json'),'--candidate-sha',{CANDIDATE!r},'--script',str(root/'data-readonly.mjs'),'--output-dir',{(output + '-data')!r}],check=True)
subprocess.run(['python3',str(root/'run.py'),'--source-dir',str(root),'--manifest',str(root/'manifest.json'),'--candidate-sha',{CANDIDATE!r},'--script',str(root/'replay.mjs'),'--output-dir',{output!r}],check=True)
'''
command = 'python3 -c ' + shlex.quote(host)
assert len(command.encode()) < 128000, 'Diagnostic payload exceeds the safe single-command bound'
parameters = pathlib.Path('/tmp') / ('selection-ssm-' + stamp + '.json')
parameters.write_text(json.dumps({'commands': [command], 'executionTimeout': ['1450']}))
cid = subprocess.check_output(['aws','ssm','send-command','--instance-ids',INSTANCE,'--document-name','AWS-RunShellScript','--parameters','file://'+str(parameters),'--comment','V2 reference verification, GET-only data probe and isolated replay','--query','Command.CommandId','--output','text'],text=True).strip()
print(json.dumps({'commandId':cid,'candidate':CANDIDATE,'phase':'Read-only data compatibility then 50 bounded real-model checks over simulated Telegram'}),flush=True)
result = None
for _ in range(500):
 try:
  result=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cid,'--instance-id',INSTANCE,'--output','json'],text=True,stderr=subprocess.DEVNULL))
 except subprocess.CalledProcessError:
  time.sleep(3);continue
 if result['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
 time.sleep(3)
else:raise RuntimeError('Validation still running; inspect existing SSM command before another run')
print(result.get('StandardOutputContent',''),flush=True)
if result['Status']!='Success':
 print(result.get('StandardErrorContent','')[-1200:],flush=True)
 raise RuntimeError('Candidate validation '+result['Status']+'; no deployment performed')
