// Scoped read-only inventory of the server that Jesse approved for sign-in.
const {spawnSync}=require('node:child_process');
const instance='i-09a9dd3bd749643a5';
function aws(args){const r=spawnSync('aws',['--profile','tsocial','--region','ap-southeast-2','--no-cli-pager',...args,'--output','json'],{encoding:'utf8',timeout:30000,windowsHide:true,maxBuffer:3*1024*1024});if(r.status!==0)throw Error(r.stderr?.slice(-2000)||r.error?.message||'AWS request failed');return JSON.parse(r.stdout);}
const commands=[
  "sudo docker inspect next-app --format '{{.Config.Image}} {{.HostConfig.NetworkMode}} {{.HostConfig.RestartPolicy.Name}} {{.HostConfig.Memory}} {{.HostConfig.NanoCpus}} {{.HostConfig.PidsLimit}} {{json .Mounts}}'",
  'sudo docker exec next-app printenv GIT_SHA',
  "sudo docker inspect twin-onlyfans-api-1 --format '{{index .Config.Labels \"com.docker.compose.project.environment_file\"}}'",
  "sudo python3 - <<'PY'\nfrom pathlib import Path\np=Path('/etc/twin-onlyfans')\nprint('Native config filenames:',sorted(x.name for x in p.iterdir() if x.is_file()))\nPY",
  "sudo docker inspect twin-onlyfans-api-1 twin-onlyfans-worker-1 twin-onlyfans-database-1 --format '{{.Name}} {{.Config.Image}} {{index .Config.Labels \"com.docker.compose.project.working_dir\"}} {{index .Config.Labels \"com.docker.compose.project.config_files\"}} {{.HostConfig.NetworkMode}} {{.HostConfig.RestartPolicy.Name}} {{json .Mounts}}'",
  "sudo docker inspect flirt-bot flirt-dashboard --format '{{.Name}} {{.HostConfig.RestartPolicy.Name}} {{json .Mounts}}'",
  "sudo python3 - <<'PY'\nimport json,pathlib\np=pathlib.Path('/etc/twin-onlyfans/host-compose.json');d=json.loads(p.read_text());out={}\nfor name,v in d.get('services',{}).items():out[name]={k:(sorted(x.keys()) if k=='environment' and isinstance(x,dict) else x) for k,x in v.items() if k in ['image','env_file','environment','network_mode','networks','ports','volumes','mem_limit','cpus','restart','command']}\nprint(json.dumps(out))\nfor p in [pathlib.Path('/etc/twin-onlyfans/onlyfans.env'),pathlib.Path('/opt/twin-onlyfans/releases/995d031b326df68f39d488b5bc487549d0626307/deploy/.env'),pathlib.Path('/home/ubuntu/allieai2-dashboard/.env')]:print(str(p),'exists',p.is_file())\nPY",
  'free -m',
  'df -h /',
  "sudo docker ps --format '{{.Names}} {{.Status}}'"
];
(async()=>{
 if(aws(['sts','get-caller-identity']).Account!=='323149985112')throw Error('Wrong AWS account');
 const started=aws(['ssm','send-command','--instance-ids',instance,'--document-name','AWS-RunShellScript','--comment','Read deployment metadata for the approved private sign-in release','--parameters',JSON.stringify({commands})]);
 const identity=started.Command.CommandId;console.log('Read-only command',identity);
 for(let n=0;n<70;n++){
  await new Promise(r=>setTimeout(r,1500));let result;try{result=aws(['ssm','get-command-invocation','--command-id',identity,'--instance-id',instance]);}catch{continue;}
  if(['Success','Failed','Cancelled','TimedOut'].includes(result.Status)){console.log(result.StandardOutputContent);if(result.StandardErrorContent)console.error(result.StandardErrorContent);if(result.Status!=='Success')throw Error('Read-only inventory '+result.Status);return;}
 }
 throw Error('Inventory outcome not confirmed; do not issue a duplicate command');
})().catch(error=>{console.error(error.message);process.exitCode=1});
