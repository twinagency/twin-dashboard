import json,pathlib,subprocess,time
commands=["sudo python3 - <<'PY'\nimport json,pathlib,subprocess,hashlib\np=pathlib.Path('/home/ubuntu/twin-v2')\nc=json.loads(subprocess.check_output(['docker','compose','-f',str(p/'docker-compose.yml'),'config','--format','json'],text=True))\nprint(json.dumps({'services':{k:{x:v.get(x) for x in ['image','build','command','volumes','ports','stop_grace_period']} for k,v in c['services'].items()}}))\nfor f in [p/'Dockerfile',p/'src/handover.ts',p/'src/fleet.ts']:\n print(str(f),hashlib.sha256(f.read_bytes()).hexdigest())\nprint('scripts', [str(f) for f in p.glob('scripts/*deploy*')])\nprint('host_scripts', [str(f) for f in p.glob('*.sh')])\nPY"]
instance='i-0584d283506f3f6be'
path=pathlib.Path('/tmp/photo-launch-readonly-command.json');path.write_text(json.dumps({'commands':commands,'executionTimeout':['120']}))
cmd_id=subprocess.check_output(['aws','ssm','send-command','--instance-ids',instance,'--document-name','AWS-RunShellScript','--parameters','file://'+str(path),'--comment','Read V2 deployment configuration without credentials','--query','Command.CommandId','--output','text'],text=True).strip()
for attempt in range(50):
 result=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cmd_id,'--instance-id',instance,'--output','json'],text=True))
 if result['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
 time.sleep(4)
print(json.dumps({k:result.get(k) for k in ['Status','StandardOutputContent','StandardErrorContent']}))
if result['Status']!='Success':raise SystemExit(1)
