import json,pathlib,subprocess,time
commands=["sudo docker inspect -f '{{.Config.Image}} {{.Image}}' next-app","sudo docker exec next-app node -e 'console.log(JSON.stringify({git_sha:process.env.GIT_SHA,admin_api_configured:!!process.env.TWIN_ADMIN_API_KEY,dashboard_password_configured:!!process.env.DASHBOARD_PASSWORD,openrouter_configured:!!process.env.OPENROUTER_API_KEY}))'","sudo apachectl -S 2>&1","sudo grep -R -E '^[[:space:]]*(ServerName|ServerAlias|ProxyTimeout|ProxyPass|Timeout)[[:space:]]' /etc/apache2/sites-enabled /etc/apache2/apache2.conf 2>/dev/null"]
instance='i-09a9dd3bd749643a5'
path=pathlib.Path('/tmp/photo-launch-readonly-command.json');path.write_text(json.dumps({'commands':commands,'executionTimeout':['120']}))
cmd_id=subprocess.check_output(['aws','ssm','send-command','--instance-ids',instance,'--document-name','AWS-RunShellScript','--parameters','file://'+str(path),'--comment','Read current V2 media source and rollback mounts only','--query','Command.CommandId','--output','text'],text=True).strip()
for attempt in range(50):
 result=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cmd_id,'--instance-id',instance,'--output','json'],text=True))
 if result['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
 time.sleep(4)
print(json.dumps({k:result.get(k) for k in ['Status','StandardOutputContent','StandardErrorContent']}))
if result['Status']!='Success':raise SystemExit(1)
