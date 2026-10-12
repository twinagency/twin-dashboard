// One authorised creator, one frozen creator-owned file, actual dashboard action.
// No Telegram calls. Credentials remain inside the deployed server process.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const CLONE='c92560e7-1dd9-4e62-b5c3-04a30fbe4925';
const SOURCE='31a95666-c518-4992-a4d1-4ab12f78b858';
const SOURCE_PATH=CLONE+'/photos/1787735809138-dreka-cakez-15.jpg';
const SOURCE_SHA='37d13829fa072e03edd8ec8fb8f83c1e72da98eb4548c4f56fe977c0929f148b';
const MODEL='qwen/qwen3.8-27b', PREVIOUS='qwen/qwen3-vl-32b-instruct';
const COMMIT='cb7958720a8467ec152928966790dbda36a1eb8f';
const NAME='photo-launch-control-dreka-15-posture-20261012.jpg';
// Frozen before model execution: pink hair, lavender top, pink thong, exposed
// buttock cheeks; no visible nipples/genitals/anus, full nudity, act or toy.
const REFERENCE={yes:['bare_buttocks','lingerie','suggestive_pose'],not_positive:['nipples','genitals','anus','full_nudity','sexual_activity','sex_toy','swimwear'],garments:['top','thong'],forbidden_posture:'kneeling; knees are outside this frozen crop'};
const e=process.env,base=e.SUPABASE_URL,key=e.SUPABASE_SERVICE_KEY;
const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
const report={creator:'dreka-cakez',clone_id:CLONE,source_id:SOURCE,source_sha256:SOURCE_SHA,reference:REFERENCE,previous_model:PREVIOUS,model:MODEL,commit:COMMIT,checks:[]};
let changed=false,success=false;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function db(path,options={}){
 const r=await fetch(base+'/rest/v1/'+path,{...options,headers:{...headers,Prefer:'return=representation',...options.headers},signal:AbortSignal.timeout(30000)});
 assert.ok(r.ok,'Database request failed: '+r.status);return r.status===204?null:r.json();
}
async function upload(bytes){
 const form=new FormData();form.set('clone',CLONE);form.set('type','photo');form.set('star_value','1260');form.set('is_free','false');
 form.append('file',new Blob([bytes],{type:'image/jpeg'}),NAME);
 const r=await fetch('http://127.0.0.1:3001/api/admin/v1/media',{method:'POST',headers:{Authorization:'Bearer '+e.TWIN_ADMIN_API_KEY},body:form,signal:AbortSignal.timeout(900000)});
 assert.equal(r.status,200);return r.json();
}
(async()=>{
 try{
  assert.equal(e.GIT_SHA,COMMIT);assert.equal(new URL(base).hostname,'aouaenqayfltoqrmpitg.supabase.co');
  const [creator]=await db('clones?select=id,slug,vision_model,photo_vision_enabled&id=eq.'+CLONE);
  assert.equal(creator.slug,'dreka-cakez');assert.equal(creator.vision_model,PREVIOUS);report.previous_settings=creator;
  const other=await db('clones?select=id,vision_model,photo_vision_enabled&id=neq.'+CLONE+'&order=id');
  const [source]=await db('photos?select=id,clone_id,storage_path,star_value,is_free&id=eq.'+SOURCE);
  assert.equal(source.clone_id,CLONE);assert.equal(source.storage_path,SOURCE_PATH);assert.equal(source.star_value,1260);assert.equal(source.is_free,false);
  assert.equal((await db('photos?select=id&clone_id=eq.'+CLONE+'&image_name=eq.'+NAME)).length,0,'Control upload already exists; inspect instead of repeating');
  const r=await fetch(base+'/storage/v1/object/authenticated/media/'+SOURCE_PATH,{headers,signal:AbortSignal.timeout(30000)});
  assert.ok(r.ok);const bytes=Buffer.from(await r.arrayBuffer());assert.equal(sha(bytes),SOURCE_SHA);
  await db('photos?id=eq.00602d64-0ce5-4e9b-a61c-4495a97583b4&clone_id=eq.'+CLONE+'&analysis_status=eq.needs_review',{method:'PATCH',body:JSON.stringify({analysis_error:'Controlled launch review: kneeling posture is unconfirmed because knees are outside the crop; test duplicate held',caption:null})});
  const patched=await db('clones?id=eq.'+CLONE+'&vision_model=eq.'+PREVIOUS,{method:'PATCH',body:JSON.stringify({vision_model:MODEL})});assert.equal(patched.length,1);changed=true;
  report.activation_at=new Date().toISOString();
  const start=Date.now();const result=await upload(bytes);report.elapsed_ms=Date.now()-start;report.upload_response=result;
  assert.deepEqual(result.uploaded,[NAME]);assert.deepEqual(result.failed,[]);
  const rows=await db('photos?select=*&clone_id=eq.'+CLONE+'&image_name=eq.'+NAME);assert.equal(rows.length,1);
  const row=rows[0];report.saved_result=row;
  // This is a duplicate of an existing paid catalogue file. Keep the test row
  // unavailable after observing its original analysis result, preserving the
  // original item and all purchase records.
  if(row.analysis_status==='analysed'){
   await db('photos?id=eq.'+row.id+'&clone_id=eq.'+CLONE,{method:'PATCH',body:JSON.stringify({analysis_status:'needs_review',analysis_error:'Controlled launch duplicate of existing creator-owned file; intentionally held after verification',caption:null})});
   report.control_duplicate_held=true;
  }
  assert.equal(row.analysis_model,MODEL);assert.match(row.analysis_provider||'',/^deepinfra$/i);
  assert.equal(row.clone_id,CLONE);assert.equal(row.is_free,false);assert.equal(row.star_value,1260);
  assert.ok(row.storage_path.startsWith(CLONE+'/photos/'));assert.notEqual(row.storage_path,SOURCE_PATH);
  assert.ok(['analysed','needs_review'].includes(row.analysis_status),'Analysis failed');
  if(row.analysis_status==='analysed'){
   for(const k of REFERENCE.not_positive)assert.notEqual(row.visual_facts.evidence[k],'yes','Unsupported positive '+k);
   for(const k of REFERENCE.yes)assert.equal(row.visual_facts.evidence[k],'yes','Missed confirmed '+k);
   assert.ok(row.tags.includes('ass'));assert.ok(!row.tags.includes('full_nude'));
   assert.match(row.visual_description,/thong|g-string/i);assert.match(row.visual_description,/top|shirt/i);
   assert.doesNotMatch([row.visual_description,row.auto_desc,row.caption,...row.visual_facts.visible].join(' '),/\b(?:kneel(?:s|ing|ed)?|knelt|on (?:her |both )?knees)\b/i,'Kneeling is unconfirmed in the frozen crop');
  }else assert.equal(row.caption,null);
  const stored=await fetch(base+'/storage/v1/object/authenticated/media/'+row.storage_path,{headers});assert.ok(stored.ok);
  report.stored_sha256=sha(Buffer.from(await stored.arrayBuffer()));assert.equal(report.stored_sha256,'0e860ce2297b4a312a50b20d2e48595019faecf82151015dcacbdfe4bec7c25b');
  const login=await fetch('http://127.0.0.1:3001/admin-auth',{method:'POST',headers:{Origin:'https://dashboard.tgaiclone.xyz'},body:new URLSearchParams({password:e.DASHBOARD_PASSWORD,next:'/media'}),redirect:'manual'});
  assert.equal(login.status,303);
  const cookie=login.headers.getSetCookie().find(c=>c.startsWith('allie_admin_session='))?.split(';')[0];assert.ok(cookie);
  const refreshed=await fetch('https://dashboard.tgaiclone.xyz/media',{headers:{Cookie:cookie+'; clone_scope='+CLONE},cache:'no-store'});
  assert.equal(refreshed.status,200);assert.ok((await refreshed.text()).includes(NAME));
  report.checks.push('Actual production upload action, private storage, saved facts, creator and price','Authenticated catalogue refresh through public TLS proxy');
  const retry=await upload(bytes);assert.deepEqual(retry.failed,[]);assert.equal((await db('photos?select=id&clone_id=eq.'+CLONE+'&image_name=eq.'+NAME)).length,1);
  assert.deepEqual(await db('photos?select=id,clone_id,storage_path,star_value,is_free&id=eq.'+SOURCE),[source]);
  assert.deepEqual(await db('clones?select=id,vision_model,photo_vision_enabled&id=neq.'+CLONE+'&order=id'),other);
  report.checks.push('Duplicate retry saved once','Original catalogue row and other creator settings unchanged');
  report.final_control_row=(await db('photos?select=id,analysis_status,analysis_error,caption&id=eq.'+row.id))[0];
  assert.equal(report.final_control_row.analysis_status,'needs_review');assert.equal(report.final_control_row.caption,null);
  report.status='passed';success=true;
 }catch(err){report.status='failed';report.error=String(err.message);process.exitCode=1;}
 finally{
  if(changed&&!success){try{await db('clones?id=eq.'+CLONE+'&vision_model=eq.'+MODEL,{method:'PATCH',body:JSON.stringify({vision_model:PREVIOUS})});report.model_restored=true;}catch{report.model_restored=false;}}
  fs.writeFileSync('/tmp/photo-production-control-posture.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }
})();
