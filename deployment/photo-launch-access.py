import base64,json,pathlib,subprocess,time
node=r"""
(async () => {
 const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY;
 const report={git_sha:process.env.GIT_SHA,openrouter_configured:!!process.env.OPENROUTER_API_KEY,supabase_configured:!!url&&!!key};
 if(url) report.project_ref=new URL(url).hostname.split('.')[0];
 if(url&&key) {
  const read=async(path)=>{const r=await fetch(url+'/rest/v1/'+path,{headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(20000)});const data=await r.json();return {status:r.status,data:r.ok?data:{code:data.code,message:data.message}};};
  report.photo_columns=await read('photos?select=id,analysis_status,analysis_version&limit=0');
  report.video_columns=await read('videos?select=id,analysis_status,analysis_version&limit=0');
  report.creator_models=await read('clones?select=id,slug,engine,vision_model&limit=200');
 }
 console.log(JSON.stringify(report));
})().catch(e=>{console.error('access check failed: '+e.name);process.exitCode=1});
"""
commands=[
 "sudo docker inspect -f '{{.State.Running}} {{.Config.Image}}' next-app; sudo docker exec next-app printenv GIT_SHA",
 "printf '%s' '"+base64.b64encode(node.encode()).decode()+"' | base64 -d | sudo docker exec -i next-app node",
 "sudo apachectl -t; sudo grep -R -E '^[[:space:]]*(Timeout|ProxyTimeout|ProxyPass)[[:space:]]' /etc/apache2/sites-enabled /etc/apache2/conf-enabled 2>/dev/null | head -35",
 "ls -d /home/ubuntu/* 2>/dev/null | head -25"
]
instance='i-09a9dd3bd749643a5'
path=pathlib.Path('/tmp/photo-launch-readonly-command.json');path.write_text(json.dumps({'commands':commands,'executionTimeout':['300']}))
cmd_id=subprocess.check_output(['aws','ssm','send-command','--instance-ids',instance,'--document-name','AWS-RunShellScript','--parameters','file://'+str(path),'--comment','Twin photo launch read-only access preflight','--query','Command.CommandId','--output','text'],text=True).strip()
for attempt in range(70):
 result=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cmd_id,'--instance-id',instance,'--output','json'],text=True))
 if result['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
 time.sleep(4)
print(json.dumps({k:result.get(k) for k in ['Status','StandardOutputContent','StandardErrorContent']}))
if result['Status']!='Success':raise SystemExit(1)

# Read the existing bot release identities and staging credential availability.
# Values of credentials are never returned; no process is restarted.
commands=[
 "sudo docker ps --format '{{.Names}} {{.Image}}'",
 "for name in $(sudo docker ps --format '{{.Names}}'); do echo container:$name; sudo docker exec \"$name\" printenv GIT_SHA 2>/dev/null || true; done",
 "ls -d /home/ubuntu/* /opt/twin* /opt/bot* 2>/dev/null || true",
 "ls /usr/local/bin/twin* 2>/dev/null || true"
]
instance='i-0584d283506f3f6be'
path.write_text(json.dumps({'commands':commands,'executionTimeout':['120']}))
cmd_id=subprocess.check_output(['aws','ssm','send-command','--instance-ids',instance,'--document-name','AWS-RunShellScript','--parameters','file://'+str(path),'--comment','Twin photo launch read-only bot runtime preflight','--query','Command.CommandId','--output','text'],text=True).strip()
for attempt in range(50):
 result=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cmd_id,'--instance-id',instance,'--output','json'],text=True))
 if result['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
 time.sleep(4)
print(json.dumps({'bot_runtime':{k:result.get(k) for k in ['Status','StandardOutputContent','StandardErrorContent']}}))
if result['Status']!='Success':raise SystemExit(1)
