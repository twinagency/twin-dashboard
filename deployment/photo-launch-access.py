import base64,json,pathlib,subprocess,time
node = """const fs=require('fs'); console.log(JSON.stringify({path:'src/media.ts',source_base64:fs.readFileSync('src/media.ts').toString('base64')}));"""
commands = [
 "printf '%s' '"+base64.b64encode(node.encode()).decode()+"' | base64 -d | sudo docker exec -i twin-v2-bot-1 node",
 "sudo docker inspect -f '{{.Name}} image={{.Image}} mounts={{json .Mounts}} stop={{.Config.StopTimeout}}' next-app twin-v2-bot-1 twin-v2-dash-1",
 "sudo ls -lt /home/ubuntu/twin-v2-backups | head -12",
 "sudo find /home/ubuntu/twin-v2 -maxdepth 2 -type f -name '*.sh' -printf '%p\\n'"
]
instance='i-0584d283506f3f6be'
path=pathlib.Path('/tmp/photo-launch-readonly-command.json');path.write_text(json.dumps({'commands':commands,'executionTimeout':['120']}))
cmd_id=subprocess.check_output(['aws','ssm','send-command','--instance-ids',instance,'--document-name','AWS-RunShellScript','--parameters','file://'+str(path),'--comment','Read current V2 media source and rollback mounts only','--query','Command.CommandId','--output','text'],text=True).strip()
for attempt in range(50):
 result=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cmd_id,'--instance-id',instance,'--output','json'],text=True))
 if result['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
 time.sleep(4)
print(json.dumps({k:result.get(k) for k in ['Status','StandardOutputContent','StandardErrorContent']}))
if result['Status']!='Success':raise SystemExit(1)
