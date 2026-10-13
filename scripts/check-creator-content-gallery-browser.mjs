// Exercise the real intake with synthetic owned content, never live creator data.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import path from 'node:path';
import {build} from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {chromium,webkit} from 'playwright';
const out=path.resolve('test-results/creator-gallery');mkdirSync(out,{recursive:true});
const fixture=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{AppRouterContext}from'next/dist/shared/lib/app-router-context.shared-runtime';import Layout from './components/CreatorSetupLayout';import Intake from './components/CreatorContentIntake';import{CreatorContentUploadProvider}from'./components/CreatorContentUploadProvider';
function Fixture(){const[section,setSection]=useState('content');const[total,setTotal]=useState(63);const brand=new URLSearchParams(location.search).get('brand')||'moxy';const router={push(href){setSection(new URL(href,location.href).searchParams.get('step'));},refresh(){fetch('/total').then(r=>r.json()).then(r=>setTotal(r.total));}};globalThis.__galleryRouter=router;return <AppRouterContext.Provider value={router}><CreatorContentUploadProvider accountId={brand}><Layout brand={brand} logoSrc="/logo.svg" activeSection={section}>{section==='content'?<Intake savedPhotos={total} savedVideos={0} locked={false} loginPath="/login"/>:<><h1>Questions</h1><button onClick={()=>setSection('content')}>Back to content</button></>}</Layout></CreatorContentUploadProvider></AppRouterContext.Provider>};createRoot(document.getElementById('root')).render(<Fixture/>);`;
await build({stdin:{contents:fixture,resolveDir:process.cwd(),loader:'tsx'},outfile:path.join(out,'bundle.js'),bundle:true,platform:'browser',jsx:'automatic',plugins:[{name:'router',setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:'router',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const useRouter=()=>globalThis.__galleryRouter;'}));}}]});
const css=await postcss([tailwind()]).process('@import "./app/globals.css";',{from:path.resolve('creator-gallery-check.css')});writeFileSync(path.join(out,'globals.css'),css.css);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHfsAAAAASUVORK5CYII=','base64');
const video=Buffer.from(readFileSync('scripts/fixtures/creator-gallery-video-base64.txt','utf8').trim(),'base64');
let files=[],removed=new Set(),failRemove=false,posts=0,holdLastAccess=false,lastAccessRequests=[],lastAccessObserved;
function reset(){files=Array.from({length:63},(_,i)=>({id:`file-${i}`,name:i===0?'Video.mp4':`Photo ${i+1}.png`,mime:i===0?'video/mp4':'image/png',status:'verified',previewAvailable:true,removalAvailable:i!==1}));removed=new Set();failRemove=false;posts=0;}
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');const json=(body,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
 if(url.pathname==='/creator-auth/uploads')return json({uploads:url.searchParams.get('ids').split(',').map(id=>({id,state:removed.has(id)?'removed':files.some(f=>f.id===id)?'saved':'needs_file'}))});
 if(url.pathname==='/creator-auth/upload'){let data='';for await(const chunk of req)data+=chunk;posts++;await new Promise(r=>setTimeout(r,850));const id=req.headers['x-creator-upload-id'];files.unshift({id,name:/filename="([^"]+)"/.exec(data)?.[1]||'New photo.png',mime:'image/png',status:'verified',previewAvailable:true,removalAvailable:true});return json({status:'content_saved'});}
 if(url.pathname==='/creator-auth/files'){const page=Number(url.searchParams.get('page')||0);return json({files:files.slice(page*50,page*50+50),hasMore:files.length>(page+1)*50,total:files.length,savedCount:files.length});}
 if(url.pathname.endsWith('/access')){const id=url.pathname.split('/')[3];const file=files.find(f=>f.id===id);if(file&&id==='file-62'&&holdLastAccess){lastAccessRequests.push(()=>json({url:'/photo.png'}));lastAccessObserved?.();return;}return file?json({url:file.mime.startsWith('video/')?'/video.mp4':'/photo.png'}):json({error:'missing'},404);}
 if(req.method==='DELETE'&&url.pathname.startsWith('/creator-auth/files/')){const id=url.pathname.split('/')[3];if(failRemove){failRemove=false;return json({error:'storage_removal_failed'},503);}const file=files.find(f=>f.id===id);if(file&&!file.removalAvailable)return json({error:'content_in_use'},409);removed.add(id);files=files.filter(f=>f.id!==id);return json({removed:true,progressSaved:true});}
 if(url.pathname==='/photo.png'){res.writeHead(200,{'content-type':'image/png'});res.end(png);return;}
 if(url.pathname==='/video.mp4'){const range=req.headers.range;if(range){const match=/bytes=(\d+)-(\d*)/.exec(range);const start=Number(match?.[1]||0),end=Math.min(Number(match?.[2]||video.length-1),video.length-1);res.writeHead(206,{'content-type':'video/mp4','content-range':`bytes ${start}-${end}/${video.length}`,'accept-ranges':'bytes','content-length':end-start+1});res.end(video.subarray(start,end+1));}else{res.writeHead(200,{'content-type':'video/mp4','content-length':video.length,'accept-ranges':'bytes'});res.end(video);}return;}
 if(url.pathname==='/total')return json({total:files.length});
 if(url.pathname==='/logo.svg'){res.writeHead(200,{'content-type':'image/svg+xml'});res.end('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><text y="28" fill="#d51365" font-size="24">Brand</text></svg>');return;}
 if(['/bundle.js','/bundle.css','/globals.css'].includes(url.pathname)){res.writeHead(200,{'content-type':url.pathname.endsWith('.js')?'text/javascript':'text/css'});res.end(readFileSync(path.join(out,url.pathname.slice(1))));return;}
 res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/bundle.css"><style>body{margin:0;font-family:Arial,sans-serif}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{for(const engine of (process.env.CREATOR_GALLERY_ENGINES||'chromium').split(',')){
 const browser=await ({chromium,webkit}[engine]).launch({...(engine==='chromium'?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']}:{} )});
 try{for(let repeat=0;repeat<Number(process.env.CREATOR_GALLERY_REPEATS||1);repeat++)for(const brand of process.env.CREATOR_GALLERY_BRANDS?.split(',')||(process.argv.includes('--flirt')?['flirt']:['moxy','twin']))for(const width of [390,1280]){
  reset();const context=await browser.newContext({viewport:{width,height:844}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/creator/onboarding?brand=${brand}`);
  await page.getByRole('button',{name:'View all (63)',exact:true}).waitFor();
  assert.equal(await page.locator('[aria-label="Saved content previews"] button').count(),6);
  const size=await page.locator('[aria-label="Saved content previews"] button').first().boundingBox();assert.ok(Math.abs(size.width-size.height)<2,'Square compact tiles');
  await page.getByText('Need help?',{exact:true}).click();
  await page.getByText('Continue to the questions while your content uploads.',{exact:true}).waitFor();
  assert.equal(await page.getByText(/Photos: JPG/).isVisible(),false,'Technical limits stay collapsed');
  await page.getByText('Need help?',{exact:true}).click();
  await page.screenshot({path:path.join(out,`${engine}-${brand}-${width}-content.png`),fullPage:true});
  await page.getByRole('button',{name:'View Video.mp4',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();const player=dialog.locator('video');await player.waitFor();
  await player.evaluate(video=>video.play());await page.waitForFunction(()=>document.querySelector('dialog video')?.currentTime>0);assert.equal(await player.evaluate(video=>video.controls),true);
  await dialog.getByRole('button',{name:'Next',exact:true}).click();await dialog.getByRole('img',{name:'Photo 2.png',exact:true}).waitFor();
  assert.equal(await dialog.getByRole('button',{name:'Remove file',exact:true}).isEnabled(),false,'Submitted file stays protected');
  await dialog.getByRole('button',{name:'Previous',exact:true}).click();await dialog.locator('video').waitFor();
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'View all (63)',exact:true}).click();
  assert.equal(await page.locator('[aria-label="All uploaded files"] button').count(),50);
  holdLastAccess=true;
  const lastAccessRequested=new Promise(resolve=>{lastAccessObserved=resolve;});
  await dialog.getByRole('button',{name:'Load more',exact:true}).click();await page.locator('[aria-label="All uploaded files"] button').nth(62).waitFor();
  assert.equal(await page.locator('[aria-label="All uploaded files"] button').count(),63);
  await page.evaluate(()=>{window.__galleryPointerEvents=[];for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,event=>{const target=event.target;window.__galleryPointerEvents.push({type,tag:target.tagName,label:target.getAttribute?.('aria-label'),button:target.closest?.('button')?.getAttribute('aria-label'),x:event.clientX,y:event.clientY});},true);});
  try {
    const lastTile=dialog.getByRole('button',{name:'View Photo 63.png',exact:true});
    await lastTile.scrollIntoViewIfNeeded();await lastAccessRequested;
    assert.equal(await lastTile.locator('img').count(),0,'The last thumbnail starts with its placeholder');
    const box=await lastTile.boundingBox();assert.ok(box);
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
    // Complete the actual lazy image request between pointer down and up.
    holdLastAccess=false;for(const release of lastAccessRequests.splice(0))release();
    await lastTile.getByRole('img',{name:'Photo 63.png',exact:true}).waitFor();
    await page.mouse.up();
    await page.getByRole('dialog',{name:'View file',exact:true}).waitFor({timeout:5000});await dialog.getByRole('img',{name:'Photo 63.png',exact:true}).waitFor();
  } catch(error) {
    await page.screenshot({path:path.join(out,`${engine}-${brand}-${width}-failure-${repeat}.png`),fullPage:true});
    console.log('GALLERY_SELECTION_DIAGNOSTIC',JSON.stringify({engine,brand,width,repeat,state:await page.evaluate(()=>{const d=document.querySelector('dialog');return {open:d?.open,label:d?.getAttribute('aria-label'),scroll:d?.scrollTop,height:d?.getBoundingClientRect().height,text:d?.innerText.slice(0,900),buttons:d?.querySelectorAll('[aria-label="All uploaded files"] button').length,events:window.__galleryPointerEvents,errors:[...document.querySelectorAll('[role="alert"]')].map(n=>n.textContent)};})}));
    throw error;
  }
  await page.screenshot({path:path.join(out,`${engine}-${brand}-${width}-preview.png`)});
  await dialog.getByRole('button',{name:'Remove file',exact:true}).click();await dialog.getByRole('button',{name:'Keep file',exact:true}).click();assert.equal(files.length,63);
  failRemove=true;await dialog.getByRole('button',{name:'Remove file',exact:true}).click();await dialog.getByRole('button',{name:'Yes, remove',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.equal(files.length,63);
  await dialog.getByRole('button',{name:'Yes, remove',exact:true}).click();await dialog.getByText('62 files · Tap to view or remove',{exact:true}).waitFor();
  assert.equal(files.length,62);assert.equal(await dialog.getByRole('button',{name:'View Photo 63.png',exact:true}).count(),0);
  await page.screenshot({path:path.join(out,`${engine}-${brand}-${width}-all.png`)});
  await dialog.getByRole('button',{name:'Close gallery',exact:true}).click();await page.getByText('62 of 50 uploaded',{exact:true}).waitFor();
  const uploads=Array.from({length:7},(_,i)=>({name:`new-${i}.png`,mimeType:'image/png',buffer:png}));
  await page.getByLabel('Add photos and videos',{exact:true}).setInputFiles(uploads);
  await page.getByText('64 of 50 uploaded',{exact:true}).waitFor();assert.ok(files.length<69,'Saved count updates before the whole selection finishes');
  await page.getByRole('button',{name:'Continue to questions →',exact:true}).click();await page.getByRole('heading',{name:'Questions',exact:true}).waitFor();
  await page.getByText('7 of 7 files saved',{exact:true}).waitFor();assert.equal(posts,7);
  await page.getByRole('button',{name:'Back to content',exact:true}).click();await page.getByText('69 of 50 uploaded',{exact:true}).waitFor();
  await page.getByRole('button',{name:'View all (69)',exact:true}).click();
  await dialog.getByRole('button',{name:'View new-0.png',exact:true}).click();await dialog.getByRole('button',{name:'Remove file',exact:true}).click();await dialog.getByRole('button',{name:'Yes, remove',exact:true}).click();await dialog.getByText('68 files · Tap to view or remove',{exact:true}).waitFor();
  await dialog.getByRole('button',{name:'Close gallery',exact:true}).click();
  // Finish fixture thumbnail requests before an intentional document teardown.
  // WebKit reports interrupted access fetches as page errors during reload.
  await page.waitForLoadState('networkidle');await page.reload();await page.getByText('68 of 50 uploaded',{exact:true}).waitFor();
  await page.getByRole('button',{name:'View all (68)',exact:true}).click();await dialog.getByRole('button',{name:'Load more',exact:true}).click();await page.locator('[aria-label="All uploaded files"] button').nth(67).waitFor();
  assert.equal(await dialog.getByRole('button',{name:'View new-0.png',exact:true}).count(),0,'Removed upload cannot reappear from local queue recovery');
  assert.equal(await page.locator('[aria-label="All uploaded files"] button').count(),68);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  console.log(`PASS ${engine} ${brand} ${width}: 63-file pagination, native video playback, photo navigation, removal cancel/failure/retry, protected file, live counts, background uploads and removed-file persistence`);
  await context.close();
 }}finally{await browser.close();}
}}finally{await new Promise(r=>server.close(r));}
