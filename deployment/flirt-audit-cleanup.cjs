/* One identified disposable audit account only. Uses existing FLIRT runtime credentials; never logs them. */
const API='https://lkmfwpqegjluirfusnaw.supabase.co';
async function api(path,options={}){
 const response=await fetch(API+path,{...options,signal:AbortSignal.timeout(25000),headers:{apikey:process.env.SUPABASE_SERVICE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_KEY,'Content-Type':'application/json',...options.headers}});
 let body=null;try{const text=await response.text();body=text?JSON.parse(text):null;}catch{}
 return response.ok?{data:body,error:null}:{data:null,error:{status:response.status,statusCode:Number(body?.statusCode)||response.status,code:body?.code}};
}
function createClient(){
 return {from:(table)=>{
  const params=new URLSearchParams();let method='GET',singleton=false;
  const q={select:(s)=>{params.set('select',s);return q;},eq:(k,v)=>{params.set(k,'eq.'+v);return q;},in:(k,v)=>{params.set(k,'in.('+v.join(',')+')');return q;},limit:(n)=>{params.set('limit',n);return q;},maybeSingle:()=>{singleton=true;return q;},delete:()=>{method='DELETE';return q;},then:(yes,no)=>api('/rest/v1/'+table+'?'+params,{method}).then(result=>({...result,data:singleton?(result.data?.[0]||null):result.data})).then(yes,no)};return q;
 },storage:{from:bucket=>({
   remove:paths=>api('/storage/v1/object/'+encodeURIComponent(bucket),{method:'DELETE',body:JSON.stringify({prefixes:paths})}),
   info:path=>api('/storage/v1/object/info/'+encodeURIComponent(bucket)+'/'+path.split('/').map(encodeURIComponent).join('/'))
 })},auth:{admin:{
   getUserById:async id=>{const result=await api('/auth/v1/admin/users/'+id);return {...result,data:{user:result.error?null:(result.data?.user||result.data)}};},
   deleteUser:id=>api('/auth/v1/admin/users/'+id,{method:'DELETE',body:JSON.stringify({should_soft_delete:false})})
 }}};
}

const PROJECT='lkmfwpqegjluirfusnaw', ACCOUNT='4bc272a8-46ec-480e-a110-1845bdb33160', AUTH='8724aac7-99f7-459f-baa1-94587283759c';
const MANIFEST=[{"id":"159acab3-8278-41cf-acd6-48bfea095e92","kind":"content_sfw_image","bucket":"onboarding-content","storage_path":"creators/4bc272a8-46ec-480e-a110-1845bdb33160/content_sfw_image/1791065619394-2e04a668-f88f-4376-bb2e-c464462d485e-photo-test-pattern.jpg","original_name":"photo-test-pattern.jpg","size_bytes":66848},{"id":"22d0c5e9-8a39-444e-8809-6c1ee2904d6c","kind":"content_sfw_video","bucket":"onboarding-content","storage_path":"creators/4bc272a8-46ec-480e-a110-1845bdb33160/content_sfw_video/1791065508963-ebcc98f1-9389-4fb6-8484-8c002bc5b243-normal-12s-portrait-1080p-hevc.mov","original_name":"normal-12s-portrait-1080p-hevc.mov","size_bytes":6092106},{"id":"a2b9f6db-0830-47af-8419-d6218abd42ff","kind":"content_sfw_video","bucket":"onboarding-content","storage_path":"creators/4bc272a8-46ec-480e-a110-1845bdb33160/content_sfw_video/1791065158121-7074db80-a3b2-40db-8f3d-3a9eb3b6ae02-normal-5min-portrait-1080p-h264.mp4","original_name":"normal-5min-portrait-1080p-h264.mp4","size_bytes":150336242},{"id":"a2be7269-17e5-466a-8664-8250468aa01b","kind":"content_nsfw_image","bucket":"onboarding-content","storage_path":"creators/4bc272a8-46ec-480e-a110-1845bdb33160/content_nsfw_image/1791066002559-8ea6b48e-3177-4422-83a5-1cffd2d04a22-photo-color-bars.jpg","original_name":"photo-color-bars.jpg","size_bytes":26552},{"id":"d42d8255-2a5f-4550-bf49-bb3a94465516","kind":"content_sfw_video","bucket":"onboarding-content","storage_path":"creators/4bc272a8-46ec-480e-a110-1845bdb33160/content_sfw_video/1791065154830-d1b22283-a879-47a1-af52-79b8c7bca508-normal-45s-landscape-1080p-h264.mp4","original_name":"normal-45s-landscape-1080p-h264.mp4","size_bytes":22865957},{"id":"e289ba76-6c62-48c2-99eb-867537a1e7a9","kind":"content_nsfw_image","bucket":"onboarding-content","storage_path":"creators/4bc272a8-46ec-480e-a110-1845bdb33160/content_nsfw_image/1791065655785-ee4d711b-b7f3-4fab-a4cc-0916b6be7b74-photo-test-pattern.jpg","original_name":"photo-test-pattern.jpg","size_bytes":66848},{"id":"eba5a043-aa32-4a4e-88f2-0ba9cc869bbe","kind":"content_sfw_image","bucket":"onboarding-content","storage_path":"creators/4bc272a8-46ec-480e-a110-1845bdb33160/content_sfw_image/1791065619779-981538ed-1db3-4112-bee6-eba1671e69c1-photo-color-bars.jpg","original_name":"photo-color-bars.jpg","size_bytes":26552},{"id":"ee2d0b06-355f-45de-88f9-4b0d25786915","kind":"content_sfw_video","bucket":"onboarding-content","storage_path":"creators/4bc272a8-46ec-480e-a110-1845bdb33160/content_sfw_video/1791065509936-55457726-4db6-440c-a7f8-2055e15ec34f-normal-8s-landscape-4k-h264.mp4","original_name":"normal-8s-landscape-4k-h264.mp4","size_bytes":8766069},{"id":"f92adead-542d-4200-a7b0-9f2e41058388","kind":"content_nsfw_video","bucket":"onboarding-content","storage_path":"creators/4bc272a8-46ec-480e-a110-1845bdb33160/content_nsfw_video/1791065294071-15fb4b46-d890-404f-a9aa-88675e92c540-normal-10min-landscape-1080p-h264.mov","original_name":"normal-10min-landscape-1080p-h264.mov","size_bytes":300414756}];
const APPLY=true;
const report={passed:false,scope:'identified disposable FLIRT onboarding audit account',expected_files:9,credentials_logged:false};
function assert(ok,label){if(!ok)throw new Error(label);}
function missing(error){return !!error&&(Number(error.statusCode||error.status)===404||error.code==='user_not_found');}
async function main(){
 assert(process.env.FLIRT_BACKEND_ENABLED==='true'&&process.env.FLIRT_SUPABASE_PROJECT_REF===PROJECT&&process.env.SUPABASE_URL==='https://'+PROJECT+'.supabase.co','Unexpected runtime');
 const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const account=await db.from('creator_accounts').select('id,auth_user_id,email,account_status,created_at').eq('id',ACCOUNT).maybeSingle();
 assert(!account.error,'Account lookup failed');
 if(account.data){
   assert(account.data.id===ACCOUNT&&account.data.auth_user_id===AUTH&&account.data.account_status==='applicant'&&new Date(account.data.created_at).toISOString()==='2026-10-03T21:48:24.057Z','Disposable identity mismatch');
   const auth=await db.auth.admin.getUserById(AUTH); assert(!auth.error&&auth.data.user?.id===AUTH&&auth.data.user.email===account.data.email,'Auth identity mismatch');
   for(const table of ['creator_clone_links','creator_consents']){const r=await db.from(table).select('creator_account_id').eq('creator_account_id',ACCOUNT).limit(1);assert(!r.error&&!r.data.length,'Account is no longer disposable');}
   const rows=await db.from('creator_files').select('id,kind,bucket,storage_path,original_name,size_bytes').eq('creator_account_id',ACCOUNT);
   assert(!rows.error&&rows.data.length<=9,'Unexpected file count');
   for(const row of rows.data){const known=MANIFEST.find(x=>x.id===row.id);assert(known&&Object.keys(known).every(key=>String(row[key])===String(known[key])),'File identity changed');}
 }
 if(!APPLY){
   let existing=0;
   for(const item of MANIFEST){const check=await db.storage.from(item.bucket).info(item.storage_path);assert(!check.error&&Number(check.data?.size)===Number(item.size_bytes),'Stored fixture differs from evidence');existing++;}
   Object.assign(report,{passed:true,dry_run:true,verified_objects:existing,account_identity_verified:!!account.data});return;
 }
 // Reject any newly created downstream references before deleting captured fixtures.
 for(const item of MANIFEST){
   for(const [table,column] of [['photos','storage_path'],['videos','storage_path'],['photo_bundle_items','storage_path'],['video_sequence_jobs','source_storage_path']]){
     const refs=await db.from(table).select(column).eq(column,item.storage_path).limit(1);
     assert(!refs.error&&!refs.data.length,'Fixture acquired a downstream reference');
   }
   const refs=await db.from('creator_files').select('id,creator_account_id').eq('bucket',item.bucket).eq('storage_path',item.storage_path);
   assert(!refs.error&&refs.data.every(row=>row.id===item.id&&row.creator_account_id===ACCOUNT),'Fixture has another owner or reference');
 }
 // Exact captured paths only: no prefix purge, metadata-only Storage deletion, or invitation changes.
 for(const item of MANIFEST){
   assert(item.bucket==='onboarding-content'&&item.storage_path.startsWith('creators/'+ACCOUNT+'/'),'Unsafe manifest path');
   const removed=await db.storage.from(item.bucket).remove([item.storage_path]);assert(!removed.error,'Storage removal failed; references preserved');
   const absent=await db.storage.from(item.bucket).info(item.storage_path);assert(!absent.data&&missing(absent.error),'Storage removal could not be confirmed; references preserved');
 }
 report.stored_objects_absent=9;
 const deleted=await db.from('creator_files').delete().eq('creator_account_id',ACCOUNT).in('id',MANIFEST.map(x=>x.id));assert(!deleted.error,'File metadata cleanup incomplete');
 const auth=await db.auth.admin.getUserById(AUTH);
 if(auth.data?.user){const removed=await db.auth.admin.deleteUser(AUTH);assert(!removed.error,'Auth cleanup incomplete');}
 else assert(missing(auth.error),'Auth absence could not be confirmed');
 const remaining=await db.from('creator_accounts').delete().eq('id',ACCOUNT);assert(!remaining.error,'Account cleanup incomplete');
 const checkAccount=await db.from('creator_accounts').select('id').eq('id',ACCOUNT);assert(!checkAccount.error&&!checkAccount.data.length,'Account remains');
 const checkFiles=await db.from('creator_files').select('id').eq('creator_account_id',ACCOUNT);assert(!checkFiles.error&&!checkFiles.data.length,'File references remain');
 const checkAuth=await db.auth.admin.getUserById(AUTH);assert(!checkAuth.data?.user&&missing(checkAuth.error),'Auth remains');
 Object.assign(report,{passed:true,account_removed:true,auth_removed:true,file_records_removed:9,customer_content_touched:false,invitations_changed:false});
}
main().catch(error=>{report.error=error.message;process.exitCode=1;}).finally(()=>console.log(JSON.stringify(report)));
