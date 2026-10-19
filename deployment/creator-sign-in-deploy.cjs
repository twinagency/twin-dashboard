// Bounded deployment of Jesse's approved sign-in release. Credentials stay on
// the target host; SSM output contains only digests, health and count metadata.
const {spawnSync}=require('node:child_process');
const {readFileSync,writeFileSync}=require('node:fs');
const {join}=require('node:path');
const instance='i-09a9dd3bd749643a5';
const statePath=join(require('node:os').tmpdir(),'twin-private-signin-recovery-20261020.json');
const state=JSON.parse(readFileSync(statePath,'utf8'));
const mode=process.argv[2];
if(!['pull','native','verify-native','dashboard','verify','health','checks','catalogue','baseline-catalogue','anonymous-screen','rollback-dashboard','rollback-native'].includes(mode))throw Error('Select an explicit release phase');
if(!state.resizeComplete||!state.backupConfirmed)throw Error('Verified upgrade and backup required');
function aws(args){const r=spawnSync('aws',['--profile','tsocial','--region','ap-southeast-2','--no-cli-pager','--cli-connect-timeout','10','--cli-read-timeout','20',...args,'--output','json'],{encoding:'utf8',timeout:30000,windowsHide:true,maxBuffer:4*1024*1024,env:{...process.env,AWS_MAX_ATTEMPTS:'1'}});if(r.status!==0)throw Error('AWS operation failed: '+(r.stderr?.slice(-1000)||r.error?.message||'outcome unconfirmed'));return r.stdout.trim()?JSON.parse(r.stdout):{};}
(async()=>{
 if(aws(['sts','get-caller-identity']).Account!=='323149985112')throw Error('Wrong AWS account');
 const source=readFileSync(join(__dirname,'creator-sign-in-deploy.py'),'utf8');
 const command="sudo python3 - '"+mode+"' <<'TWIN_SIGNIN_RELEASE_PY'\n"+source+"\nTWIN_SIGNIN_RELEASE_PY";
 state.releaseCommands??={};
 // A pending SSM invocation is resumed, never submitted twice.
 const old=state.releaseCommands[mode];
 let id=old;
 if(old){const previous=aws(['ssm','get-command-invocation','--command-id',old,'--instance-id',instance]);if(['Failed','Cancelled','TimedOut'].includes(previous.Status))id=null;else if(previous.Status==='Success'){console.log(previous.StandardOutputContent);return;}}
 if(!id){id=aws(['ssm','send-command','--instance-ids',instance,'--document-name','AWS-RunShellScript','--comment','Approved Twin private sign-in release: '+mode,'--parameters',JSON.stringify({commands:[command],executionTimeout:[mode==='pull'?'1500':'600']})]).Command.CommandId;state.releaseCommands[mode]=id;writeFileSync(statePath,JSON.stringify(state,null,2));}
 console.log(mode+' command: '+id);
 for(let n=0;n<500;n++){
  await new Promise(r=>setTimeout(r,2500));let result;try{result=aws(['ssm','get-command-invocation','--command-id',id,'--instance-id',instance]);}catch{continue;}
  if(['Success','Failed','Cancelled','TimedOut'].includes(result.Status)){
   if(result.StandardOutputContent)console.log(result.StandardOutputContent);
   if(result.StandardErrorContent)console.error(result.StandardErrorContent.slice(-2500));
   if(result.Status!=='Success')throw Error(mode+' '+result.Status+'; inspect this command before retrying');
   state.releaseCompleted??={};state.releaseCompleted[mode]=true;writeFileSync(statePath,JSON.stringify(state,null,2));return;
  }
 }
 throw Error('Release outcome pending; resume the same phase');
})().catch(error=>{console.error(error.message);process.exitCode=1});
