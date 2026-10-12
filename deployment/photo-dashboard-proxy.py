import hashlib,json,pathlib,shutil,subprocess
backup=pathlib.Path('/home/ubuntu/photo-launch-backups/20261012');backup.mkdir(parents=True,exist_ok=True,mode=0o700)
image=subprocess.check_output(['docker','inspect','-f','{{.Config.Image}}','next-app'],text=True).strip()
sha=subprocess.check_output(['docker','exec','next-app','printenv','GIT_SHA'],text=True).strip()
assert sha=='fb8948acd951e9a678791d13aa4e9ae85681c454','Dashboard changed; preserve newer deployment'
runtime={'git_sha':sha,'image':image,'container':'next-app','remote_dir':'/home/ubuntu/allieai2-dashboard','run_args':['-p','127.0.0.1:3001:3001','-e','PORT=3001']}
(backup/'dashboard-runtime.json').write_text(json.dumps(runtime,indent=2))
files=[];originals={}
for p in pathlib.Path('/etc/apache2/sites-enabled').glob('*.conf'):
 raw=p.read_text()
 if 'ProxyPass / http://127.0.0.1:3001/' not in raw:continue
 target=p.resolve();old=backup/target.name
 if not old.exists():shutil.copy2(target,old)
 originals[target]=raw
 lines=[]
 for line in raw.splitlines():
  if line.strip().startswith('ProxyTimeout '):continue
  lines.append(line)
  if line.strip().lower().startswith('<virtualhost '):lines.append('    ProxyTimeout 900')
 new='\n'.join(lines)+'\n'
 # Explicit worker timeout avoids inheriting another vhost's earlier-created worker.
 new=new.replace('ProxyPass / http://127.0.0.1:3001/\n','ProxyPass / http://127.0.0.1:3001/ connectiontimeout=10 timeout=900\n')
 target.write_text(new);files.append({'path':str(target),'backup':str(old),'original_sha256':hashlib.sha256(raw.encode()).hexdigest()})
assert len(files)==3,'Unexpected Twin proxy scope'
try:subprocess.run(['apachectl','configtest'],check=True)
except Exception:
 for p,raw in originals.items():p.write_text(raw)
 raise
subprocess.run(['apachectl','graceful'],check=True)
(backup/'proxy.json').write_text(json.dumps(files,indent=2))
print(json.dumps({'proxy_timeout_seconds':900,'files':files,'runtime_unchanged':runtime}))
