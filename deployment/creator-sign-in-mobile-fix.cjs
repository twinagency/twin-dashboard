const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const mode=process.argv[2],instance='i-09a9dd3bd749643a5';
if(!['preflight','pull','browser','dashboard','health','display','resources','rollback'].includes(mode))throw Error('Explicit phase required');
const statePath=path.join(os.tmpdir(),'twin-signin-mobile-fix-69dffdf.json');
const state=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath,'utf8')):{};
function aws(args){const r=spawnSync('aws',[...(process.env.GITHUB_ACTIONS?[]:['--profile','tsocial']),'--region','ap-southeast-2','--no-cli-pager','--cli-connect-timeout','10','--cli-read-timeout','20',...args,'--output','json'],{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,windowsHide:true,env:{...process.env,AWS_MAX_ATTEMPTS:'1'}});if(r.status!==0)throw Error('AWS request failed: '+(r.stderr?.slice(-800)||r.error?.message));return JSON.parse(r.stdout);}
(async()=>{
 if(aws(['sts','get-caller-identity']).Account!=='323149985112')throw Error('Wrong AWS account');
 const manifest=mode==='preflight'?JSON.stringify({dashboardCommit:'69dffdf7ba14482f651b918adc29312cc0949e8d'}):fs.readFileSync(path.join(__dirname,'creator-sign-in-input-images.json'),'utf8');
 const source=fs.readFileSync(path.join(__dirname,'creator-sign-in-mobile-fix.py'),'utf8');
 const command="sudo python3 - '"+mode+"' '"+JSON.stringify(JSON.parse(manifest))+"' <<'TWIN_SIGNIN_INPUT_FIX'\n"+source+"\nTWIN_SIGNIN_INPUT_FIX";
 state.commands??={};let id=state.commands[mode];
 if(id){const old=aws(['ssm','get-command-invocation','--command-id',id,'--instance-id',instance]);if(old.Status==='Success'){console.log(old.StandardOutputContent);return;}if(['Failed','Cancelled','TimedOut'].includes(old.Status))throw Error('Previous phase failed; inspect before retry');}
 if(!id){id=aws(['ssm','send-command','--instance-ids',instance,'--document-name','AWS-RunShellScript','--comment','Authorized Twin sign-in mobile/verification fix: '+mode,'--parameters',JSON.stringify({commands:[command],executionTimeout:[mode==='pull'?'1500':'600']})]).Command.CommandId;state.commands[mode]=id;fs.writeFileSync(statePath,JSON.stringify(state,null,2));}
 console.log(mode+' command: '+id);
 for(let n=0;n<500;n++){await new Promise(r=>setTimeout(r,2500));const v=aws(['ssm','get-command-invocation','--command-id',id,'--instance-id',instance]);if(['Success','Failed','Cancelled','TimedOut'].includes(v.Status)){console.log(v.StandardOutputContent);if(v.StandardErrorContent)console.error(v.StandardErrorContent.slice(-2000));if(v.Status!=='Success')throw Error(mode+' '+v.Status);return;}}
 throw Error('Phase pending; resume same command');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
