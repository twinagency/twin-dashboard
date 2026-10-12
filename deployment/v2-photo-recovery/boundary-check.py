import json,pathlib,subprocess,os
SHA='bcc68c7e801ad65310f43f4a4ce09f05d3e3b4f7'
BACKUP=pathlib.Path('/home/ubuntu/twin-v2-backups/photo-recovery-20261013')
PRIVATE=pathlib.Path('/home/ubuntu/twin-v2/data/_operator_backups/photo-recovery-20261013')
prep=json.loads((BACKUP/(SHA+'-prepared.json')).read_text())
roots=list((PRIVATE/SHA).glob('photo-real-model-*'));assert len(roots)==1
for p in sorted(roots[0].glob('logs/*/requests.jsonl')):
 for line in p.read_text().splitlines():
  x=json.loads(line);print(json.dumps({'scenario':p.parent.name,'final':x.get('final'),'note':x.get('note'),'key':(x.get('media')or{}).get('key'),'stars':(x.get('media')or{}).get('stars')}),flush=True)
source=pathlib.Path('/tmp/photo-boundary-check.mjs').read_text()
raw=subprocess.check_output(['docker','inspect','twin-v2-bot-1'],text=True)
ev=dict(x.split('=',1) for x in json.loads(raw)[0]['Config']['Env'] if '=' in x)
assert all(ev.get(k) for k in ['SUPABASE_URL','SUPABASE_SERVICE_KEY','STAR_PRICE'])
envfile=BACKUP/'read-only-boundary.env'
fd=os.open(envfile,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:
 for k in ['SUPABASE_URL','SUPABASE_SERVICE_KEY','STAR_PRICE']:
  assert '\n' not in ev[k];f.write(k+'='+ev[k]+'\n')
try:
 r=subprocess.run(['docker','run','--rm','-i','--memory','512m','--env-file',str(envfile),'-v',str(PRIVATE/'input')+':/private:ro','-v','/home/ubuntu/twin-v2/data:/live-data:ro',prep['image'],'node','--import','tsx','--input-type=module'],input=source,text=True,capture_output=True,timeout=100)
 (BACKUP/(SHA+'-boundary-check.log')).write_text(r.stdout+r.stderr);print(r.stdout,flush=True)
 assert r.returncode==0,'Fresh boundary check failed: '+r.stderr[-700:]
finally:envfile.unlink(missing_ok=True)
