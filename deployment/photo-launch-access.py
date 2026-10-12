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

 if(key) {
  const staging='https://zqotxvrxuaocsonpizuw.supabase.co';
  const headers={apikey:key};
  if(!key.startsWith('sb_secret_')) headers.Authorization='Bearer '+key;
  const probe=async(path)=>{
   try {
    const response=await fetch(staging+path,{headers,signal:AbortSignal.timeout(20000)});
    await response.arrayBuffer();
    return {http_status:response.status,accepted:response.ok};
   } catch(error) { return {accepted:false,error_type:error.name}; }
  };
  report.existing_key_against_staging={
   project_ref:'zqotxvrxuaocsonpizuw',
   database:await probe('/rest/v1/photos?select=id,analysis_status&limit=0'),
   storage:await probe('/storage/v1/bucket')
  };
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

# Existing staging paths and current source identity, names/booleans only.
for instance,commands in [
 ('i-0584d283506f3f6be',[
  "sudo git -C /home/ubuntu/twin-v2 rev-parse HEAD; sudo git -C /home/ubuntu/twin-v2 status --short",
  "sudo find /home/ubuntu/twin-v2 /home/ubuntu/twin-v2-backups -maxdepth 3 -type f \\( -name '*.sh' -o -name '.env*' -o -name '*release*' \\) -printf '%p\\n' 2>/dev/null | head -65",
  "sudo docker exec twin-v2-bot-1 node -e 'console.log(JSON.stringify({staging_env_names:Object.keys(process.env).filter(k=>/TEST|STAG/.test(k))}))'"
 ]),
 ('i-09a9dd3bd749643a5',[
  "sudo find /home/ubuntu/allieai2-dashboard -maxdepth 3 -type f \\( -name '.env*' -o -name '*staging*' \\) -printf '%p\\n' 2>/dev/null | head -40",
  "sudo docker exec next-app node -e 'console.log(JSON.stringify({staging_env_names:Object.keys(process.env).filter(k=>/TEST|STAG/.test(k))}))'",
  "sudo grep -R -E '^[[:space:]]*(Timeout|ProxyTimeout|ProxyPass|RequestReadTimeout)[[:space:]]' /etc/apache2/apache2.conf /etc/apache2/conf-enabled /etc/apache2/sites-enabled 2>/dev/null | head -50"
 ])
]:
 path.write_text(json.dumps({'commands':commands,'executionTimeout':['120']}))
 cmd_id=subprocess.check_output(['aws','ssm','send-command','--instance-ids',instance,'--document-name','AWS-RunShellScript','--parameters','file://'+str(path),'--comment','Twin photo staging read-only prerequisite check','--query','Command.CommandId','--output','text'],text=True).strip()
 for attempt in range(50):
  result=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cmd_id,'--instance-id',instance,'--output','json'],text=True))
  if result['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
  time.sleep(4)
 print(json.dumps({'instance':instance,'staging_preflight':{k:result.get(k) for k in ['Status','StandardOutputContent','StandardErrorContent']}}))
 if result['Status']!='Success':raise SystemExit(1)

# Capture exact rollback images and hashes of the running V2 application sources.
instance='i-0584d283506f3f6be'
commands=["sudo docker inspect -f '{{.Name}} image={{.Image}} workdir={{.Config.WorkingDir}}' next-app twin-v2-bot-1 twin-v2-dash-1","for name in twin-v2-bot-1 twin-v2-dash-1; do image=$(sudo docker inspect -f '{{.Image}}' $name); sudo docker image inspect -f '{{.Id}} {{json .RepoDigests}}' $image; done","sudo docker exec twin-v2-bot-1 sh -c 'pwd; ls -d src dist app scripts 2>/dev/null; find src -type f -exec sha256sum {} + 2>/dev/null' | head -180","sudo find /home/ubuntu/twin-v2 -maxdepth 2 -type f \\( -name '*compose*' -o -name '*Dockerfile*' \\)","sudo docker exec twin-v2-bot-1 node -e 'const fs=require(\"fs\");for(const path of [\"src/config.ts\",\"src/credits/ids.ts\",\"package.json\"]){console.log(JSON.stringify({path,source_base64:fs.readFileSync(path).toString(\"base64\")}))}'","sudo cat /home/ubuntu/twin-v2/Dockerfile"]
path.write_text(json.dumps({'commands':commands,'executionTimeout':['120']}))
cmd_id=subprocess.check_output(['aws','ssm','send-command','--instance-ids',instance,'--document-name','AWS-RunShellScript','--parameters','file://'+str(path),'--comment','Photo launch rollback image and V2 source hash audit','--query','Command.CommandId','--output','text'],text=True).strip()
for attempt in range(50):
 result=json.loads(subprocess.check_output(['aws','ssm','get-command-invocation','--command-id',cmd_id,'--instance-id',instance,'--output','json'],text=True))
 if result['Status'] in ['Success','Failed','Cancelled','TimedOut']:break
 time.sleep(4)
print(json.dumps({'rollback_source_audit':{k:result.get(k) for k in ['Status','StandardOutputContent','StandardErrorContent']}}))
if result['Status']!='Success':raise SystemExit(1)
