let payoutStage='start'; let payoutReport=null;
const crypto = require('node:crypto');
async function main() {
  const flirt = process.env.FLIRT_SUPABASE_PROJECT_REF === 'lkmfwpqegjluirfusnaw';
  const publicOrigin = process.env.DASHBOARD_PUBLIC_ORIGIN || (flirt ? 'https://dashboard.flirtaiagency.com' : 'https://dashboard.tgaiclone.xyz');
  const internal = 'http://127.0.0.1:' + (process.env.PORT || 3001);
  const secret = process.env.DASHBOARD_SESSION_SECRET || process.env.DASHBOARD_PASSWORD;
  if (!secret) throw Error('Existing dashboard session signing is unavailable');
  const sign = (value, key=secret) => crypto.createHmac('sha256',key).update(value).digest('base64url');
  const expires = String(Date.now()+120000);
  const adminCookie = 'allie_admin_session=' + expires + '.' + sign(expires);
  async function request(path,cookie='',options={}) {
    return fetch(internal+path,{redirect:'manual',signal:AbortSignal.timeout(45000),...options,headers:{host:new URL(publicOrigin).host,...(cookie?{cookie}:{}),...(options.headers||{})}});
  }
  const report=payoutReport={sha:process.env.GIT_SHA,brand:flirt?'flirt':'twin',checks:{}};
  payoutStage='anonymous request';
  const denied=await request('/api/payouts');
  report.checks.anonymousDenied=denied.status!==200;
  payoutStage='admin API';
  const api=await request('/api/payouts',adminCookie);
  report.checks.adminApi=api.status===200;
  if(!api.ok){console.log(JSON.stringify({...report,status:api.status}));process.exitCode=1;return;}
  payoutStage='admin API JSON';
  const data=await api.json();
  report.checks.adminScope=data.audience==='admin'&&data.canManage===true;
  report.creators=data.creators.length;report.payoutRecords=data.historyCount;
  payoutStage='admin page';
  const page=await request('/payouts',adminCookie);const html=await page.text();
  report.checks.adminPage=page.status===200&&html.includes('Withdrawals / Payouts');
  payoutStage='deployed conversion bundle';
  const chunks=[...new Set(Array.from(html.matchAll(/src="([^"]+[.]js[^"]*)"/g),m=>m[1]))];
  const scripts=await Promise.all(chunks.filter(path=>path.startsWith('/_next/')).map(async path=>(await request(path)).text()));
  report.checks.currencyConversionShipped=scripts.some(source=>source.includes('Originally paid ')&&source.includes('Converted amounts are estimates'));

  payoutStage='invalid payment rejection';
  if(data.creators.length){
    const invalid=await request('/api/payouts',adminCookie,{method:'POST',headers:{origin:publicOrigin,'content-type':'application/json'},body:JSON.stringify({cloneId:data.creators[0].id,amount:'0',currency:'USD',paidOn:'',requestId:crypto.randomUUID()})});
    report.checks.invalidPaymentRejected=invalid.status===400;
  }
  async function rest(base,key,path){const response=await fetch(base.replace(/\/$/,'')+'/rest/v1/'+path,{headers:{apikey:key,authorization:'Bearer '+key},signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Creator verification lookup failed');return response.json();}
  payoutStage='creator account lookup';
  let account=null;
  if(!flirt){
    const links=await rest(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_KEY,'creator_clone_links?select=creator_account_id,creator_accounts!inner(id,auth_user_id,account_status)&creator_accounts.account_status=in.(active,approved,applicant)&creator_accounts.auth_user_id=not.is.null&limit=40');
    for(const link of links) {
      const candidate=link.creator_accounts;
      if(!candidate?.auth_user_id)continue;
      const key=process.env.CREATOR_SESSION_SECRET||secret;
      const payload=Buffer.from(JSON.stringify({accountId:candidate.id,userId:candidate.auth_user_id,exp:Date.now()+120000})).toString('base64url');
      const response=await request('/api/payouts','twin_creator_session='+payload+'.'+sign(payload,key));
      const candidateView=await response.json().catch(()=>null);
      if(response.ok&&candidateView?.audience==='creator'&&candidateView.creators?.length===1){account=candidate;break;}
    }
    payoutStage='Moxy view-as read';
    const value=Buffer.from(JSON.stringify({targetType:'agency',targetId:'bc670215-110b-4ea0-8f5c-af3dfe21d253',admin:'payout-read-verification',exp:Date.now()+120000})).toString('base64url');
    const moxy=await request('/api/payouts',adminCookie+'; twin_admin_view_as='+value+'.'+sign(value));
    const moxyData=await moxy.json();report.checks.moxyScopedRead=moxy.status===200&&moxyData.brand==='moxy'&&moxyData.canManage===false;
  }else{
    const known='22952fd9-0a82-4da2-a172-f1a0d1aa2c6d,c9c6d09d-71e4-424d-9150-07147c9bd5d2,eb46dd1c-2d5b-4a6e-a848-3154b5c7fc0a,f003afbf-d57a-4a24-8376-234e2abfb4fb';
    for(const [base,key]of [[process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_KEY],[process.env.FLIRT_LIVE_TWIN_URL,process.env.FLIRT_LIVE_TWIN_SERVICE_KEY]]){
      if(!base||!key)continue;
      const rows=await rest(base,key,'creator_accounts?select=id,auth_user_id&account_status=in.(active,approved,applicant)&id=in.('+known+')&limit=1');
      if(rows[0]){account=rows[0];break;}
    }
  }
  payoutStage='creator reads';
  if(account){
    const key=process.env.CREATOR_SESSION_SECRET||secret;
    const payload=Buffer.from(JSON.stringify({accountId:account.id,userId:account.auth_user_id,exp:Date.now()+120000})).toString('base64url');
    const cookie='twin_creator_session='+payload+'.'+sign(payload,key);
    const read=await request('/api/payouts',cookie);const creator=await read.json();
    report.creatorReadStatus=read.status;
    report.checks.creatorOwnRead=read.status===200&&creator.audience==='creator'&&creator.canManage===false&&creator.creators.length===1;
    const creatorPage=await request('/creator/payouts',cookie);report.checks.creatorPage=creatorPage.status===200&&(await creatorPage.text()).includes('Withdrawals / Payouts');
    const mutation=await request('/api/payouts',cookie,{method:'POST',headers:{origin:publicOrigin,'content-type':'application/json'},body:'{}'});report.checks.creatorWriteDenied=mutation.status===403;
    const other=data.creators.find(row=>!creator.creators?.some(own=>own.id===row.id));
    if(other&&creator.creators){const cross=await request('/api/payouts?cloneId='+other.id,cookie);report.checks.crossCreatorDenied=cross.status===403;}
  }else report.checks.creatorAccountAvailable=false;
  console.log(JSON.stringify(report));
  if(Object.values(report.checks).some(value=>value!==true))process.exitCode=1;
}
main().catch(error=>{console.log(JSON.stringify({stage:payoutStage,report:payoutReport,type:error?.name,error:'Payout live verification failed. No credentials or payment values were logged.'}));process.exitCode=1;});
