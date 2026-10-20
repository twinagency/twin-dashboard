import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
const origin=process.env.ONLYFANS_TEST_WEB_URL||'http://127.0.0.1:3026';
assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin));
const movie=fs.readFileSync(process.env.ONLYFANS_TEST_VIDEO);
const schema='of-content.v1',chunkBytes=8*1024**2;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const browser=await chromium.launch({headless:true,...(process.env.PREVIEW_CHROME?{executablePath:process.env.PREVIEW_CHROME}:{})});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
 let job=null,lost=false,offsets=[],streamRequests=0,denyVideo=false;
 const envelope=extra=>({schemaVersion:schema,ok:true,accountId:'acc-a',...extra});
 const view=()=>({...job,files:job.files.map(({digests,...file})=>({...file,prefixDigest:digest(digests.join(''))}))});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSFEAAAAASUVORK5CYII=','base64');
 await page.route('**/api/onlyfans-content/accounts/acc-a/vault/**',async route=>{
  const request=route.request(),url=new URL(request.url()),parts=url.pathname.split('/vault/')[1],method=request.method();
  const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(parts==='uploads'&&method==='GET')return json(envelope({uploads:{schemaVersion:'of-vault-media.v1',accountId:'acc-a',maxFiles:40,maxFileBytes:4000*1024**2,chunkBytes,enabled:true,jobs:job?[view()]:[]}}));
  if(parts==='uploads'&&method==='POST'){
   const body=request.postDataJSON();job={jobId:'fd2e6b88-4edb-43db-a654-e2025d57eece',kind:'upload',status:'receiving',lastError:null,cleanupRequired:false,requestedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),files:body.files.map(f=>({...f,receivedBytes:0,digests:[],status:'receiving',mediaId:null,processing:false,error:null}))};
   return json(envelope({upload:view()}));
  }
  if(parts.includes('/files/')&&method==='POST'){
   const file=job.files.find(f=>f.fileId===parts.split('/').at(-1)),offset=Number(url.searchParams.get('offset')),bytes=request.postDataBuffer();
   assert.equal(request.headers()['x-upload-sha256'],digest(bytes));assert.equal(offset,file.receivedBytes);offsets.push(offset);
   file.receivedBytes+=bytes.length;file.digests.push(digest(bytes));file.status=file.receivedBytes===file.size?'staged':'receiving';
   if(!lost){lost=true;return route.abort('connectionfailed');}
   return json(envelope({jobId:job.jobId,fileId:file.fileId,receivedBytes:file.receivedBytes}));
  }
  if(parts.endsWith('/finish')&&method==='POST'){
   assert(job.files.every(f=>f.receivedBytes===f.size));job.status='pending';
   const ack=view();setTimeout(()=>{job.status='failed';job.files.forEach((f,i)=>{f.status=i===2?'failed':'done';f.mediaId=i===2?null:String(901+i);f.error=i===2?'This file is not a supported photo or video.':null;});},300);
   return json(envelope({upload:ack}));
  }
  if(parts==='previews/13')return route.fulfill({status:200,contentType:'image/png',body:png});
  if(parts==='videos/13')return denyVideo?json({ok:false},401):json(envelope({video:{mediaId:'13',ready:true,status:'ready',bytes:movie.length,lastError:null}}));
  if(parts==='videos/13/stream'){
   streamRequests++;const range=request.headers()['range'],match=range?.match(/^bytes=(\d+)-(\d*)$/);let start=0,end=movie.length-1;
   if(match){start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
   assert(start<=end);return route.fulfill({status:range?206:200,headers:{'Content-Type':'video/mp4','Content-Length':String(end-start+1),'Accept-Ranges':'bytes','Cache-Control':'private, no-store',...(range?{'Content-Range':`bytes ${start}-${end}/${movie.length}`}:{})},body:movie.subarray(start,end+1)});
  }
  throw Error('Unexpected native media request: '+method+' '+parts);
 });
 await page.goto(origin+'/media-fixture',{waitUntil:'networkidle'});
 const panel=page.locator('[data-of-vault-uploader]');await panel.getByText('Up to 40 files per batch',{exact:false}).waitFor();
 const photo=Buffer.alloc(chunkBytes+111,17);png.copy(photo);
 const files=[{name:'Synthetic landscape.png',mimeType:'image/png',buffer:photo},{name:'Synthetic clip.mp4',mimeType:'video/mp4',buffer:movie},{name:'Invalid.png',mimeType:'image/png',buffer:Buffer.from('not an image')}];
 await panel.locator('input[type=file]').setInputFiles(files);await panel.getByRole('button',{name:'Upload to OnlyFans',exact:true}).click();
 await panel.getByRole('status').filter({hasText:'transfer was not confirmed'}).waitFor({timeout:30000});assert(lost);
 const changed=Buffer.from(photo);changed[100]^=1;
 await panel.locator('input[type=file]').setInputFiles([{...files[0],buffer:changed},...files.slice(1)]);await panel.getByRole('button',{name:'Resume transfer',exact:true}).click();
 await panel.getByRole('status').filter({hasText:'Choose the original file'}).waitFor();assert.deepEqual(offsets,[0]);
 await panel.locator('input[type=file]').setInputFiles(files);await panel.getByRole('button',{name:'Resume transfer',exact:true}).click();
 await panel.getByText('Needs review',{exact:true}).waitFor({timeout:15000});
 assert.equal(await panel.getByText('Uploaded',{exact:true}).count(),2);assert.equal(await panel.getByText('Failed',{exact:true}).count(),1);assert.deepEqual(offsets,[0,chunkBytes,0,0]);
 await page.getByRole('button',{name:'View video for asset 13',exact:true}).click();const player=page.locator('[data-of-video-player] video');await player.waitFor();
 await page.waitForFunction(()=>{const v=document.querySelector('[data-of-video-player] video');return v&&v.readyState>=2&&v.videoWidth===96&&v.duration>3.9;});
 await player.evaluate(async v=>{v.muted=true;await v.play();});await page.waitForFunction(()=>document.querySelector('video')?.currentTime>0.1);
 await player.evaluate(v=>{v.pause();v.currentTime=2.5;});await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&!v.seeking&&v.currentTime>=2.5&&v.readyState>=2;});
 assert(streamRequests>=1);await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'media UI overflows mobile');
 if(process.env.ONLYFANS_TEST_EVIDENCE)await page.screenshot({path:path.join(process.env.ONLYFANS_TEST_EVIDENCE,'native-vault-media-mobile.png'),fullPage:true});
 await page.setViewportSize({width:320,height:640});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'media UI overflows small phones');
 await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();denyVideo=true;
 await page.getByRole('button',{name:'View video for asset 13',exact:true}).click();await page.getByText('Sign in again to play this video.',{exact:true}).waitFor();assert.equal(await page.locator('[data-of-video-player] video').count(),0);
 console.log('Native media browser PASS: bulk selection, committed lost-ACK resume, changed-file refusal, per-file outcomes, actual MP4 decode/play/seek, 390/320px layout and session clearing');
}finally{await browser.close();}
