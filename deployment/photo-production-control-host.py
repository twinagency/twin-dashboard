import base64,json,pathlib,subprocess
source=pathlib.Path('/tmp/photo-production-control.cjs').read_text()
result=subprocess.run(['docker','exec','-i','next-app','node'],input=source,text=True,capture_output=True,timeout=930)
backup=pathlib.Path('/home/ubuntu/photo-launch-backups/20261012')
backup.mkdir(parents=True,exist_ok=True,mode=0o700)
try:
 report=json.loads(result.stdout.strip().splitlines()[-1])
 (backup/'production-control-posture.json').write_text(json.dumps(report,indent=2))
 print(json.dumps(report))
except Exception:
 print('Control process did not return a report; inspect deployed container /tmp/photo-production-control-posture.json')
if result.returncode:
 print(result.stderr[-1500:])
 raise SystemExit(result.returncode)
