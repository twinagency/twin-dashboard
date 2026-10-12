// Real Next.js HTTP upload -> existing server action -> real analysis, private storage and saved row.
// Explicitly staging-only. Credentials arrive on stdin, never in this file or artifacts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import readline from 'node:readline/promises';
import sharp from 'sharp';
const PROJECT='zqotxvrxuaocsonpizuw', CLONE='7e57f10f-0000-4000-8000-00000000f001';
const API=`https://${PROJECT}.supabase.co`, ORIGIN='http://127.0.0.1:3211';
// Direct backend requests, as behind the production TLS proxy. The public origin remains HTTPS.
const PUBLIC_ORIGIN='https://photo-staging.invalid';
const MODEL='qwen/qwen3.8-27b';
const OUT=process.env.PHOTO_LAUNCH_RESULTS || '/tmp/twin-photo-real-staging-20261012';
const BASE=process.env.PHOTO_LAUNCH_RETAINED_ROOT || '/workspace/scratch/f388f4f2e89b';
const CASES=[
 {id:'b44898f3-a6e7-465b-b994-4bb18a91f493',group:'qwen38-27b-five-20261012',free:false},
 {id:'448462a7-19f8-4916-a1ad-474f53c813c3',group:'qwen38-27b-five-20261012',free:true},
 {id:'kyla-1',group:'qwen38-27b-five-20261012',free:false},
 {id:'70509013-75d6-4d67-8b35-550cf5e129dd',group:'qwen38-27b-ten-more-20261012',free:false},
].filter(item=>!process.env.PHOTO_LAUNCH_CASES || process.env.PHOTO_LAUNCH_CASES.split(',').includes(item.id));
assert.ok(CASES.length,'At least one frozen retained case is required');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const input=readline.createInterface({input:process.stdin,output:process.stdout,terminal:false});
const secret=JSON.parse(await input.question(''));input.close();
assert.equal(JSON.parse(Buffer.from(secret.supabase.split('.')[1],'base64url')).ref,PROJECT);
assert.equal(JSON.parse(Buffer.from(secret.supabase.split('.')[1],'base64url')).role,'service_role');
assert.ok(secret.openrouter.startsWith('sk-or-'));
fs.mkdirSync(OUT,{recursive:true});
const run='photo-launch-'+Date.now();
const adminKey=crypto.randomBytes(32).toString('hex'), password=crypto.randomBytes(24).toString('hex');
const sensitive=[secret.supabase,secret.openrouter,adminKey,password];
const redact=s=>sensitive.reduce((v,k)=>v.split(k).join('[REDACTED]'),String(s));
const headers={apikey:secret.supabase,Authorization:'Bearer '+secret.supabase};
async function api(url,options={}) {
 const r=await fetch(API+url,{...options,headers:{...headers,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(30000)});
 const data=await r.json().catch(()=>null);assert.ok(r.ok,`Staging API ${url.split('?')[0]} returned ${r.status}`);return data;
}
const rows=()=>api(`/rest/v1/photos?select=*&clone_id=eq.${CLONE}&image_name=like.${run}*`);
const report={run,project:PROJECT,clone_id:CLONE,model:MODEL,transport:'actual HTTP, Next server action, Supabase storage/database and OpenRouter',cases:[],checks:[],material_errors:[]};
const persist=()=>fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(report,null,2));
let server,original,cookie;
async function upload(bytes,name,{free=false}={}) {
 const form=new FormData();form.set('clone',CLONE);form.set('type','photo');form.set('star_value',free?'0':'350');form.set('is_free',String(free));
 form.append('file',new Blob([bytes],{type:'image/jpeg'}),name);
 const r=await fetch(ORIGIN+'/api/admin/v1/media',{method:'POST',headers:{Authorization:'Bearer '+adminKey},body:form,signal:AbortSignal.timeout(900000)});
 assert.equal(r.status,200,'HTTP upload route failed');return r.json();
}
try {
 const clones=await api(`/rest/v1/clones?select=id,slug,vision_model,category_pricing&id=eq.${CLONE}`);
 assert.equal(clones.length,1);original=clones[0];assert.equal(original.slug,'photoflow-editor-test');
 const bucket=await api('/storage/v1/bucket/media');assert.equal(bucket.public,false);
 const beforeOther=await api(`/rest/v1/photos?select=id,clone_id&clone_id=neq.${CLONE}`);report.other_clone_rows_before=beforeOther;
 console.log('Staging database and private media storage authenticated.');
 await api(`/rest/v1/clones?id=eq.${CLONE}&slug=eq.photoflow-editor-test`,{method:'PATCH',body:JSON.stringify({vision_model:MODEL})});
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3211'],{
  env:{...process.env,NODE_ENV:'production',SUPABASE_URL:API,SUPABASE_SERVICE_KEY:secret.supabase,OPENROUTER_API_KEY:secret.openrouter,
   TWIN_ADMIN_API_KEY:adminKey,TWIN_ADMIN_ALLOW_PUBLIC:'false',DASHBOARD_PASSWORD:password,DASHBOARD_PUBLIC_ORIGIN:PUBLIC_ORIGIN,
   PHOTO_LAUNCH_TRANSPORT_LOG:path.join(OUT,'transport.jsonl'),NODE_OPTIONS:`--require ${path.resolve('scripts/photo-launch-record-transport.cjs')}`},stdio:['ignore','pipe','pipe']});
 for(const stream of [server.stdout,server.stderr]) stream.on('data',data=>fs.appendFileSync(path.join(OUT,'server.log'),redact(data)));
 let ready=false;for(let i=0;i<60;i++){try{const r=await fetch(ORIGIN+'/login',{signal:AbortSignal.timeout(2000)});if(r.status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
 assert.ok(ready,'Next staging server did not become ready');
 const login=await fetch(ORIGIN+'/admin-auth',{method:'POST',body:new URLSearchParams({password,next:'/media'}),redirect:'manual',headers:{Origin:PUBLIC_ORIGIN}});
 assert.equal(login.status,303,'Actual dashboard login failed');
 cookie=login.headers.getSetCookie().find(c=>c.startsWith('allie_admin_session='))?.split(';')[0];assert.ok(cookie);
 cookie+='; clone_scope='+CLONE;
 const page=await fetch(ORIGIN+'/media',{headers:{Cookie:cookie}});assert.equal(page.status,200);assert.match(await page.text(),/Add photos/);
 report.checks.push('Real dashboard login and authenticated media page');persist();
 for(const item of CASES){
  const manifest=JSON.parse(fs.readFileSync(path.join(BASE,item.group,'manifest.json'),'utf8'));
  const reference=manifest.references.find(x=>x.id===item.id);assert.ok(reference);
  const bytes=fs.readFileSync(reference.file);assert.equal(sha(bytes),reference.imageSha256,'Frozen original image changed');
  const name=`${run}-${item.id}.jpg`;
  console.log('Uploading retained case',item.id);const started=Date.now();
  const result=await upload(bytes,name,item);assert.deepEqual(result.uploaded,[name]);assert.deepEqual(result.failed,[]);
  const saved=(await rows()).filter(x=>x.image_name===name);assert.equal(saved.length,1,'Exactly one saved photo expected');const row=saved[0];
  assert.equal(row.clone_id,CLONE);assert.equal(row.is_free,item.free);assert.equal(row.star_value,item.free?0:350);
  assert.equal(row.analysis_model,MODEL);assert.match(row.analysis_provider||'',/^deepinfra$/i);
  assert.ok(['analysed','needs_review','failed'].includes(row.analysis_status));
  assert.ok(row.storage_path.startsWith(CLONE+'/photos/'));
  const stored=await fetch(API+'/storage/v1/object/authenticated/media/'+row.storage_path,{headers});assert.ok(stored.ok);
  const storedBytes=Buffer.from(await stored.arrayBuffer());const metadata=await sharp(storedBytes).metadata();assert.equal(metadata.format,'jpeg');
  if(row.analysis_status==='analysed'){
   const evidence=row.visual_facts.evidence;const forbidden=[...reference.not_positive,...reference.uncertain];
   for(const key of forbidden)if(evidence[key]==='yes')report.material_errors.push({id:item.id,reason:`unsupported positive ${key}`});
   for(const key of reference.yes)if(evidence[key]!=='yes')report.material_errors.push({id:item.id,reason:`missed confirmed ${key}`});
   // The frozen reference names real held brushes; require that assertion to
   // remain present rather than enumerating just one wording of the known error.
   if(item.id==='448462a7-19f8-4916-a1ad-474f53c813c3'&&!/\b(?:holds?|holding|held|grips?|gripping|grasps?|grasping)\b[^.;]*\b(?:paint)?brush(?:es)?\b|\b(?:paint)?brush(?:es)?\b[^.;]*\b(?:in (?:her|the) hand|held)\b/i.test(row.visual_description||''))report.material_errors.push({id:item.id,reason:'real held paintbrush is absent or misdescribed as painted imagery'});
  } else {assert.equal(row.caption,null);}
  const refreshed=await fetch(ORIGIN+'/media',{headers:{Cookie:cookie},cache:'no-store'});assert.equal(refreshed.status,200);
  const html=await refreshed.text();assert.ok(html.includes(name),'Saved file missing from refreshed media catalogue');
  report.cases.push({id:item.id,elapsed_ms:Date.now()-started,source_sha256:sha(bytes),stored_sha256:sha(storedBytes),reference,row});persist();
  console.log('Saved and refreshed',item.id,row.analysis_status,row.analysis_error||'');
 }
 const first=report.cases[0];const ref=JSON.parse(fs.readFileSync(path.join(BASE,CASES[0].group,'manifest.json'),'utf8')).references.find(x=>x.id===first.id);
 const callsBefore=fs.readFileSync(path.join(OUT,'transport.jsonl'),'utf8').trim().split('\n').length;
 const retry=await upload(fs.readFileSync(ref.file),first.row.image_name,CASES[0]);assert.equal(retry.uploaded.length,1);assert.equal((await rows()).length,CASES.length);
 assert.equal(fs.readFileSync(path.join(OUT,'transport.jsonl'),'utf8').trim().split('\n').length,callsBefore,'Duplicate save must not rerun models');
 const bad=await upload(Buffer.from('not an image'),run+'-invalid.jpg');assert.equal(bad.uploaded.length,0);assert.equal(bad.failed.length,1);assert.equal((await rows()).length,CASES.length);
 const other=await api(`/rest/v1/photos?select=id,clone_id&clone_id=neq.${CLONE}`);assert.deepEqual(other,beforeOther,'Other creator rows changed');
 report.checks.push(`${CASES.length} actual uploads, original identity, private storage JPEG, saved facts/provider/status/prices and refreshed catalogue`,'Paid/free values preserved','Duplicate upload saves once and makes no duplicate model call','Invalid image reports failure and creates no photo row','Other creator photo ownership unchanged');
 const calls=fs.readFileSync(path.join(OUT,'transport.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 for(const call of calls.filter(c=>c.has_image)){assert.equal(call.model,MODEL);assert.deepEqual(call.provider,{only:['deepinfra'],allow_fallbacks:false});assert.match(call.effective_provider||'',/^deepinfra$/i);}
 for(const call of calls.filter(c=>c.model===MODEL)){assert.deepEqual(call.provider,{only:['deepinfra'],allow_fallbacks:false});assert.deepEqual(call.reasoning,{effort:'xhigh',exclude:true});assert.equal(call.max_tokens,16384);assert.equal(call.temperature,0);assert.equal(call.text_first,true);assert.deepEqual(call.response_format,{type:'json_object'});}
 report.call_count=calls.length;report.vision_call_count=calls.filter(c=>c.model===MODEL).length;
 report.status=report.material_errors.length?'material_failure':'transport_pass';persist();
 console.log('Real staging flow completed:',report.status,'vision calls:',report.vision_call_count);
 if(report.material_errors.length)process.exitCode=2;
}catch(error){report.status='failed';report.failure=redact(error.message);persist();console.error('Staging check failed:',redact(error.message));process.exitCode=1;}
finally{
 if(server)server.kill('SIGTERM');
 if(original){try{await api(`/rest/v1/clones?id=eq.${CLONE}&vision_model=eq.${MODEL}`,{method:'PATCH',body:JSON.stringify({vision_model:original.vision_model})});report.setting_restored=true;}catch{report.setting_restored=false;process.exitCode=1;}}
 persist();
}
