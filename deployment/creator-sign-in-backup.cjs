// Approved recovery preparation. All database/env/container backups stay on
// the original server with root-only permissions; only metadata is printed.
const {spawnSync}=require('node:child_process');
const {existsSync,readFileSync,writeFileSync}=require('node:fs');
const {join}=require('node:path');
const instance='i-09a9dd3bd749643a5',volume='vol-09ac44a45db545c6c',release='creator-sign-in-0525e51-20261020';
const statePath=join(require('node:os').tmpdir(),'twin-private-signin-recovery-20261020.json');
let state=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):{};
function save(){writeFileSync(statePath,JSON.stringify(state,null,2));}
function aws(args){const r=spawnSync('aws',['--profile','tsocial','--region','ap-southeast-2','--no-cli-pager',...args,'--output','json'],{encoding:'utf8',timeout:30000,windowsHide:true,maxBuffer:3*1024*1024,env:{...process.env,AWS_MAX_ATTEMPTS:'1'}});if(r.status!==0)throw Error(r.stderr?.slice(-1500)||r.error?.message||'AWS request not confirmed');return JSON.parse(r.stdout);}
const backup=`sudo python3 - <<'PY'
import json,os,pathlib,shutil,subprocess,hashlib
root=pathlib.Path('/var/backups/twin-private-signin-0525e51-20261020');root.mkdir(mode=0o700,parents=True,exist_ok=True);os.chmod(root,0o700)
containers=['next-app','twin-onlyfans-api-1','twin-onlyfans-worker-1','twin-onlyfans-database-1','flirt-bot','flirt-dashboard']
records=json.loads(subprocess.check_output(['docker','inspect',*containers]))
private=root/'containers-before.json'
if not private.exists():
    fd=os.open(private,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:json.dump(records,f)
for source in ['/home/ubuntu/allieai2-dashboard/.env','/etc/twin-onlyfans/compose.env','/etc/twin-onlyfans/runtime.env','/etc/twin-onlyfans/host-compose.json']:
    target=root/(source.replace('/','_').lstrip('_'))
    if not target.exists():shutil.copyfile(source,target);os.chmod(target,0o600)
dump=root/'native-database.dump'
if not dump.exists():
    fd=os.open(dump,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    try:
        with os.fdopen(fd,'wb') as f:subprocess.run(['docker','exec','twin-onlyfans-database-1','sh','-c','exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner'],stdout=f,stderr=subprocess.PIPE,check=True)
    except Exception:
        dump.unlink(missing_ok=True);raise RuntimeError('Database backup failed') from None
if dump.stat().st_size<100:raise RuntimeError('Database backup is empty')
with dump.open('rb') as f:subprocess.run(['docker','exec','-i','twin-onlyfans-database-1','pg_restore','--list'],stdin=f,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,check=True)
code='''import json,os
from sqlalchemy import create_engine,select,func
from db.onlyfans_models import OfRuntime
from db.onlyfans_delivery_models import OfDeliveryPolicy
from db.onlyfans_connection_models import OfProviderConnection
from db.models import OfCreatorBinding
with create_engine(os.environ['DATABASE_URL']).connect() as c:
 print(json.dumps({"bindings":c.scalar(select(func.count()).select_from(OfCreatorBinding)),"connections":c.scalar(select(func.count()).select_from(OfProviderConnection)),"enabledRuntimes":c.scalar(select(func.count()).select_from(OfRuntime).where(OfRuntime.enabled.is_(True))),"enabledPolicies":c.scalar(select(func.count()).select_from(OfDeliveryPolicy).where(OfDeliveryPolicy.enabled.is_(True)))}))
'''
baseline=root/'native-counts-before.json'
if not baseline.exists():
    result=subprocess.run(['docker','exec','-i','twin-onlyfans-api-1','python','-'],input=code.encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True)
    counts=json.loads(result.stdout);baseline.write_text(json.dumps(counts));os.chmod(baseline,0o600)
else:counts=json.loads(baseline.read_text())
subprocess.run(['sync'],check=True)
print(json.dumps({'backupDirectory':str(root),'databaseBackupBytes':dump.stat().st_size,'databaseBackupValidated':True,'databaseBackupSha256':hashlib.sha256(dump.read_bytes()).hexdigest(),'nativeBaselineCounts':counts,'containerImages':{v['Name']:v['Config']['Image'] for v in records}}))
PY`;
(async()=>{
 if(aws(['sts','get-caller-identity']).Account!=='323149985112')throw Error('Wrong AWS account');
 if(!state.backupCommand){state.backupCommand=aws(['ssm','send-command','--instance-ids',instance,'--document-name','AWS-RunShellScript','--comment','Approved sign-in upgrade recovery backup without service interruption','--parameters',JSON.stringify({commands:[backup]})]).Command.CommandId;save();}
 if(!state.backupConfirmed){
  console.log('Recovery backup command',state.backupCommand);
  for(let n=0;n<80;n++){
   await new Promise(r=>setTimeout(r,1500));const r=aws(['ssm','get-command-invocation','--command-id',state.backupCommand,'--instance-id',instance]);
   if(r.Status==='Success'){console.log(r.StandardOutputContent);state.backupConfirmed=true;save();break;}
   if(['Failed','Cancelled','TimedOut'].includes(r.Status))throw Error('Backup '+r.Status+': '+r.StandardErrorContent.slice(-1500));
  }
  if(!state.backupConfirmed)throw Error('Backup outcome pending; resume this command, do not repeat the backup');
 }
 if(!state.snapshot){
  const found=aws(['ec2','describe-snapshots','--owner-ids','self','--filters','Name=volume-id,Values='+volume,'Name=tag:TwinRelease,Values='+release]).Snapshots;
  if(found.length>1)throw Error('Multiple matching recovery snapshots; inspect before continuing');
  const s=found[0]||aws(['ec2','create-snapshot','--volume-id',volume,'--description','Approved Twin private sign-in upgrade recovery','--tag-specifications',JSON.stringify([{ResourceType:'snapshot',Tags:[{Key:'TwinRelease',Value:release},{Key:'Name',Value:release+'-recovery'}]}])]);
  state.snapshot=s.SnapshotId;save();
 }
 const snapshot=aws(['ec2','describe-snapshots','--snapshot-ids',state.snapshot]).Snapshots[0];
 console.log(JSON.stringify({snapshot:state.snapshot,state:snapshot.State,progress:snapshot.Progress,backupConfirmed:state.backupConfirmed,localRecoveryMetadata:statePath,servicesStopped:false}));
})().catch(error=>{console.error(error.message);process.exitCode=1});
