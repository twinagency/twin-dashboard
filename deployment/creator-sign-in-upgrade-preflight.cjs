// Read-only/dry-run preflight. Uses the owner's existing local AWS profile;
// credentials are never exported, logged or copied to GitHub.
const {spawnSync}=require('node:child_process');
const instance='i-09a9dd3bd749643a5',region='ap-southeast-2',profile='tsocial';
function aws(args,{location=region,dry=false}={}){
  const p=spawnSync('aws',['--profile',profile,'--region',location,'--no-cli-pager','--cli-connect-timeout','10','--cli-read-timeout','20',...args,'--output','json'],{encoding:'utf8',timeout:30000,windowsHide:true,maxBuffer:5*1024*1024});
  if(dry){if(!p.stderr?.includes('DryRunOperation'))throw Error(p.stderr?.slice(-2000)||'Dry-run failed');return;}
  if(p.status!==0)throw Error(p.stderr?.slice(-2000)||p.error?.message||'AWS request failed');
  return JSON.parse(p.stdout);
}
const identity=aws(['sts','get-caller-identity']);
if(identity.Account!=='323149985112')throw Error('Wrong AWS account');
const current=aws(['ec2','describe-instances','--instance-ids',instance]).Reservations[0].Instances[0];
if(!['t3.small','t3.medium'].includes(current.InstanceType)||current.Architecture!=='x86_64'||current.RootDeviceType!=='ebs'||current.InstanceLifecycle||current.Tags?.some(t=>t.Key==='aws:autoscaling:groupName'))throw Error('Resize compatibility needs review');
const addresses=aws(['ec2','describe-addresses','--filters','Name=instance-id,Values='+instance]).Addresses;
if(addresses.length!==1)throw Error('Stable public IP is not confirmed; no stop allowed');
const prices={};
for(const kind of ['t3.small','t3.medium']){
  const filters=Object.entries({instanceType:kind,location:'Asia Pacific (Sydney)',operatingSystem:'Linux',tenancy:'Shared',preInstalledSw:'NA',capacitystatus:'Used'}).map(([Field,Value])=>({Type:'TERM_MATCH',Field,Value}));
  const rows=aws(['pricing','get-products','--service-code','AmazonEC2','--filters',JSON.stringify(filters),'--max-items','10'],{location:'us-east-1'}).PriceList;
  const values=new Set();
  for(const row of rows)for(const term of Object.values(JSON.parse(row).terms?.OnDemand||{}))for(const price of Object.values(term.priceDimensions))if(price.unit==='Hrs'&&price.beginRange==='0')values.add(price.pricePerUnit.USD);
  if(values.size!==1)throw Error('Standard hourly price is ambiguous');prices[kind]=Number([...values][0]);
}
const extra=(prices['t3.medium']-prices['t3.small'])*744;
if(!(extra>=0&&extra<=25))throw Error('Approved USD25 additional monthly limit exceeded');
for(const action of ['stop-instances','start-instances'])aws(['ec2',action,'--instance-ids',instance,'--dry-run'],{dry:true});
aws(['ec2','modify-instance-attribute','--instance-id',instance,'--instance-type','Value=t3.medium','--dry-run'],{dry:true});
for(const v of current.BlockDeviceMappings)aws(['ec2','create-snapshot','--volume-id',v.Ebs.VolumeId,'--description','Twin approved sign-in upgrade recovery','--dry-run'],{dry:true});
const volumes=aws(['ec2','describe-volumes','--volume-ids',...current.BlockDeviceMappings.map(v=>v.Ebs.VolumeId)]).Volumes;
console.log(JSON.stringify({account:identity.Account,instance,currentType:current.InstanceType,targetType:'t3.medium',architecture:current.Architecture,rootDevice:current.RootDeviceType,elasticIpConfirmed:true,usdPerHour:prices,additionalComputeUsdPer31DayMonth:Number(extra.toFixed(4)),approvedAdditionalLimitUsd:25,volumes:volumes.map(v=>({id:v.VolumeId,sizeGiB:v.Size,encrypted:v.Encrypted})),dryRunPermissions:'stop/start/resize/snapshot passed',changesApplied:false},null,2));
