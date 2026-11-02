// Jesse approved this exact2GiB->4GiB change, planned restart and USD25/month
// additional limit. No credential/IAM changes or EBS data changes are made.
const {spawnSync}=require('node:child_process');
const {readFileSync,writeFileSync,existsSync}=require('node:fs');
const {join}=require('node:path');
const instance='i-09a9dd3bd749643a5',volume='vol-09ac44a45db545c6c';
const statePath=join(require('node:os').tmpdir(),'twin-private-signin-recovery-20261020.json');
let state=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):{};
const save=()=>writeFileSync(statePath,JSON.stringify(state,null,2));
function aws(args){const r=spawnSync('aws',['--profile','tsocial','--region','ap-southeast-2','--no-cli-pager','--cli-connect-timeout','10','--cli-read-timeout','20',...args,'--output','json'],{encoding:'utf8',timeout:30000,windowsHide:true,maxBuffer:3*1024*1024,env:{...process.env,AWS_MAX_ATTEMPTS:'1'}});if(r.status!==0)throw Error(r.stderr?.slice(-1500)||r.error?.message||'AWS request outcome not confirmed');return r.stdout.trim()?JSON.parse(r.stdout):{};}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const describe=()=>aws(['ec2','describe-instances','--instance-ids',instance]).Reservations[0].Instances[0];
async function until(check,label,n=60){for(let i=0;i<n;i++){if(await check())return;await sleep(5000);}throw Error(label+' is pending; inspect the saved state before continuing');}
async function ssm(commands,comment){
 const id=aws(['ssm','send-command','--instance-ids',instance,'--document-name','AWS-RunShellScript','--comment',comment,'--parameters',JSON.stringify({commands,executionTimeout:['120']})]).Command.CommandId;
 console.log(comment+': '+id);state.lastCommand=id;save();
 for(let n=0;n<70;n++){await sleep(2000);let r;try{r=aws(['ssm','get-command-invocation','--command-id',id,'--instance-id',instance]);}catch{continue;}if(r.Status==='Success'){console.log(r.StandardOutputContent);return;}if(['Failed','Cancelled','TimedOut'].includes(r.Status))throw Error(comment+' '+r.Status+': '+r.StandardErrorContent.slice(-1200));}
 throw Error(comment+' outcome pending; do not repeat the command');
}
const gates=`sudo python3 - <<'PY'
import json,subprocess
busy=subprocess.run(['pgrep','-f',r'^(/usr/bin/|/bin/)?(bash |sudo )?/usr/local/bin/twin-pull.sh( |$)'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
if busy.returncode not in [0,1]:raise RuntimeError('Deployment state is unavailable')
if busy.returncode==0:raise RuntimeError('An existing deployment is active; no restart allowed')
for name,project in [('next-app','aouaenqayfltoqrmpitg'),('flirt-dashboard','lkmfwpqegjluirfusnaw')]:
    code="const fs=require('node:fs');if(process.env.SUPABASE_URL!=="+json.dumps('https://'+project+'.supabase.co')+")process.exit(2);const n=fs.readdirSync('/tmp').filter(x=>x.startsWith('creator-upload-')).length;console.log(JSON.stringify({stagedUploads:n}));process.exit(n?3:0)"
    result=subprocess.run(['docker','exec',name,'node','-e',code],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if result.returncode:raise RuntimeError('Creator upload-idle gate did not pass for '+name)
    print(name+': '+result.stdout.decode().strip())
print('PASS both upload-idle gates and no active deployment; no private script contents read')
PY`;
const health=`sudo python3 - <<'PY'
import json,subprocess,time
names=['twin-onlyfans-database-1','twin-onlyfans-api-1','twin-onlyfans-worker-1','next-app','flirt-bot','flirt-dashboard']
subprocess.run(['docker','start',names[0]],check=True,stdout=subprocess.DEVNULL)
for n in range(40):
    data=json.loads(subprocess.check_output(['docker','inspect',names[0]]))[0]
    if data.get('State',{}).get('Health',{}).get('Status')=='healthy':break
    time.sleep(2)
else:raise RuntimeError('Existing database did not become healthy')
subprocess.run(['docker','start',*names[1:]],check=True,stdout=subprocess.DEVNULL)
time.sleep(5)
rows=json.loads(subprocess.check_output(['docker','inspect',*names]))
if not all(v['State']['Running'] for v in rows):raise RuntimeError('An existing service did not restart')
mem=int(next(line.split()[1] for line in open('/proc/meminfo') if line.startswith('MemTotal:')))
if mem<3500*1024:raise RuntimeError('New memory capacity is not visible')
print(json.dumps({'memoryMiB':mem//1024,'existingServices':{v['Name']:v['State']['Running'] for v in rows}}))
PY
curl --fail --retry 12 --retry-delay 2 --retry-connrefused --max-time 5 --silent --output /dev/null https://dashboard.tgaiclone.xyz/
echo 'PASS public dashboard HTTPS after approved resize'`;
(async()=>{
 if(aws(['sts','get-caller-identity']).Account!=='323149985112')throw Error('Wrong AWS account');
 if(!state.backupConfirmed||!state.snapshot)throw Error('Validated backup and recovery snapshot are required');
 const snapshot=aws(['ec2','describe-snapshots','--snapshot-ids',state.snapshot]).Snapshots[0];
 if(snapshot.VolumeId!==volume||!['pending','completed'].includes(snapshot.State))throw Error('Recovery snapshot is unavailable');
 let current=describe();if(current.RootDeviceType!=='ebs'||current.Architecture!=='x86_64'||!current.BlockDeviceMappings.some(v=>v.Ebs.VolumeId===volume)||!['t3.small','t3.medium'].includes(current.InstanceType))throw Error('Instance configuration changed');
 const stable=aws(['ec2','describe-addresses','--filters','Name=instance-id,Values='+instance]).Addresses;
 if(stable.length!==1)throw Error('Fixed public IP not confirmed');
 if(current.InstanceType==='t3.small'){
  if(current.State.Name==='running'){
   await ssm([gates],'Approved restart upload and deployment gates');
   console.log('Stopping the existing2GiB instance for the approved upgrade');
   state.resizeStarted=true;save();aws(['ec2','stop-instances','--instance-ids',instance]);
  }
  await until(()=>describe().State.Name==='stopped','Instance stop');
  aws(['ec2','modify-instance-attribute','--instance-id',instance,'--instance-type','Value=t3.medium']);
  if(describe().InstanceType!=='t3.medium')throw Error('New instance type was not confirmed');
  console.log('Instance type is now t3.medium');
 }
 current=describe();if(current.State.Name==='stopped'){aws(['ec2','start-instances','--instance-ids',instance]);console.log('Starting the4GiB instance');}
 await until(()=>describe().State.Name==='running','Instance start');
 await until(()=>aws(['ssm','describe-instance-information','--filters','Key=InstanceIds,Values='+instance]).InstanceInformationList.some(v=>v.PingStatus==='Online'),'SSM reconnect');
 await ssm([health],'Verify existing services after approved4GiB resize');
 state.resizeComplete=true;state.instanceType='t3.medium';save();
 console.log('PASS approved4GiB upgrade and existing-service recovery');
})().catch(async error=>{
 console.error(error.message);
 try{const i=describe();if(state.resizeStarted&&i.State.Name==='stopped'){aws(['ec2','start-instances','--instance-ids',instance]);console.error('Recovery start requested; the persistent disk and original containers remain intact');}}
 catch{console.error('Recovery status unconfirmed; use the saved instance and command IDs');}
 process.exitCode=1;
});
