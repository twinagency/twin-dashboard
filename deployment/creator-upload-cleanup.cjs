/* Targeted maintenance for abandoned upload receipts; dry-run by default. */
const {createClient}=require('@supabase/supabase-js');
const arg=name=>process.argv.find(value=>value.startsWith(name+'='))?.slice(name.length+1);
const creator=arg('--creator'),expectedProject=arg('--project'),hours=Number(arg('--older-than-hours')||72),apply=process.argv.includes('--apply');
function requireCondition(ok,label){if(!ok)throw new Error(label);}
const report={passed:false,dry_run:!apply,eligible:0,removed:0,credentials_logged:false};
async function main(){
 requireCondition(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(creator||''),'One exact creator UUID is required');
 requireCondition(/^[a-z]{20}$/.test(expectedProject||'')&&process.env.SUPABASE_URL==='https://'+expectedProject+'.supabase.co','Explicit project does not match this runtime');
 requireCondition(Number.isFinite(hours)&&hours>=24,'Only abandoned uploads at least 24 hours old may be cleaned');
 const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const cutoff=new Date(Date.now()-hours*3600000).toISOString();
 const rows=await db.from('creator_upload_receipts').select('id,state,updated_at').eq('creator_account_id',creator).is('file_id',null).in('state',['uploading','stored','failed','removing']).lt('lease_until',new Date().toISOString()).order('id').limit(100);
 requireCondition(!rows.error,'Receipt lookup failed');
 for(const row of rows.data){
  if(row.state!=='removing'&&Date.parse(row.updated_at)>=Date.parse(cutoff))continue;
  report.eligible++;
  if(!apply)continue;
  const claimed=await db.rpc('begin_creator_upload_cleanup',{p_creator_id:creator,p_upload_id:row.id,p_cutoff:cutoff});
  requireCondition(!claimed.error&&claimed.data,'Cleanup claim failed; no references discarded');
  const receipt=claimed.data;if(receipt.state==='removed')continue;
  requireCondition(receipt.creator_account_id===creator&&receipt.storage_path===`creators/${creator}/${receipt.kind}/${row.id}`&&['onboarding-content','voice-samples'].includes(receipt.bucket),'Cleanup ownership mismatch');
  const bucket=db.storage.from(receipt.bucket),removed=await bucket.remove([receipt.storage_path]);
  requireCondition(!removed.error,'Storage removal failed; journal retained');
  const absent=await bucket.info(receipt.storage_path);
  requireCondition(!absent.data&&Number(absent.error?.statusCode)===404,'Storage absence not confirmed; journal retained');
  const finished=await db.rpc('finish_creator_upload_cleanup',{p_creator_id:creator,p_upload_id:row.id});
  requireCondition(!finished.error&&finished.data===true,'Cleanup journal finalization failed');report.removed++;
 }
 report.passed=true;
}
main().catch(error=>{report.error=error.message;process.exitCode=1;}).finally(()=>console.log(JSON.stringify(report)));
