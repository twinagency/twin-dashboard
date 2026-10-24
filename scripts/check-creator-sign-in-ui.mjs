// Real creator components and CSS; private transport/provider are local fixtures.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {mkdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium,webkit} from 'playwright';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const root=process.cwd(),out=resolve('test-results/creator-sign-in');mkdirSync(out,{recursive:true});
const initial={schemaVersion:'creator-platforms.v1',creatorName:'Fixture creator',profileId:'canonical-creator',requested:['onlyfans'],readOnly:false,telegram:{configured:false,status:null,handle:null},onlyfans:{status:'ready',signIn:'hosted',error:null,accounts:[],enrollments:[]}};
let snapshot,attempt,posted,expired,denied,lostConfirm,unavailableFrame,unavailableStatus;
let inputGate=null,frameGate=null,combinedGate=null,combinedFrames=true,combinedStarted=0,requestDelay=0,framesStarted=0,framesCompleted=0,inputsCompleted=0;
const gate=()=>{let release;const promise=new Promise(resolve=>{release=resolve});return {promise,release}};
const reset=()=>{snapshot=structuredClone(initial);attempt={id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',phase:'waiting',handle:null,expiresAt:new Date(Date.now()+900000).toISOString(),enrollmentId:null,width:432,height:720,keyboard:null};posted=[];expired=false;denied=false;lostConfirm=false;unavailableFrame=false;unavailableStatus=false;};reset();
async function until(check){for(let n=0;n<100;n++){if(check())return;await new Promise(r=>setTimeout(r,50));}assert(check(),'Expected fixture request was not received');}
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import Platforms from './components/creator-platforms/CreatorPlatforms';import Shell from './components/CreatorStudioShell';import {creatorStudioStatus} from './lib/creator-studio-model';createRoot(document.getElementById('root')).render(<React.StrictMode><Shell brand="moxy" creatorName="Fixture creator" status={creatorStudioStatus(false,"Draft / unfinished",null)} contentHref="/creator/onboarding?step=content"><Platforms initial={${JSON.stringify(initial)}}/></Shell></React.StrictMode>);`;
const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:root},bundle:true,write:false,outdir:out,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':root},define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'links',setup(b){b.onResolve({filter:/^next\/(link|navigation)$|\/CurrencyProvider$/},a=>({path:a.path,namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},a=>({resolveDir:root,loader:'jsx',contents:a.path==='next/link'?`import React from 'react';export const useLinkStatus=()=>({pending:false});export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}`:a.path==='next/navigation'?`export const useSearchParams=()=>new URLSearchParams(location.search);export const usePathname=()=>'/creator/platforms';export const useRouter=()=>({refresh(){}});`:`export const useCurrency=()=>({currency:'AUD',setCurrency(){}});`}))}}]});
const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text;
const css=(await postcss([tailwind()]).process('@import "./app/globals.css";',{from:resolve('creator-sign-in-review.css')})).css+'\n'+bundle.outputFiles.find(f=>f.path.endsWith('.css')).text+'\nbody{margin:0;font-family:Arial,sans-serif}html{--font-heading:Arial,sans-serif}';
const chrome=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:process.platform==='win32'?[]:['--no-sandbox']});
const framePage=await chrome.newPage({viewport:{width:432,height:720},deviceScaleFactor:2});
await framePage.setContent('<html><body style="font:18px Arial;margin:40px"><h1>OnlyFans fixture</h1><p>Local test account</p><label>Email<input type="email" style="display:block;width:100%;height:48px"></label><p><label>Password<input type="password" style="display:block;width:100%;height:48px"></label></p><button style="padding:12px">Sign in</button></body></html>');
const png=await framePage.screenshot({type:'png'});const jpeg=await framePage.screenshot({type:'jpeg'});await framePage.evaluate(()=>document.body.style.background='#dff3ff');const updatedPng=await framePage.screenshot({type:'png'});await framePage.close();
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),path=url.pathname;res.setHeader('Cache-Control','no-store');
 if(path==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(js)}
 if(path==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css)}
 if(path.startsWith('/creator-auth/')){
  if(requestDelay)await new Promise(r=>setTimeout(r,requestDelay));
  res.setHeader('Content-Type','application/json');
  if(denied){res.statusCode=401;return res.end(JSON.stringify({error:'Sign in to your creator account again.'}))}
  if(path==='/creator-auth/platforms')return res.end(JSON.stringify(snapshot));
  if(expired&&req.method==='GET'){res.statusCode=410;return res.end(JSON.stringify({error:'Your sign-in expired. Start again.'}))}
  if(unavailableStatus&&req.method==='GET'&&!url.searchParams.has('frame')){res.statusCode=503;return res.end(JSON.stringify({error:'Your sign-in status could not be loaded.'}))}
  if(req.method==='GET'&&url.searchParams.get('frame')==='1'){framesStarted++;const held=frameGate;if(held)await held.promise;if(unavailableFrame){res.statusCode=503;return res.end('{}')}res.setHeader('Content-Type','image/png');framesCompleted++;return res.end(png)}
  if(req.method==='POST'){
   let raw='';for await(const b of req)raw+=b;const body=JSON.parse(raw);posted.push(body);
   if(body.action==='cancel'&&expired){res.statusCode=410;return res.end(JSON.stringify({error:'Your sign-in expired. Start again.'}))}
   if(body.action==='start'){expired=false;attempt={...attempt,id:randomUUID(),phase:'waiting',handle:null,keyboard:null,enrollmentId:null};}
   if(body.action==='input'){
    if(inputGate)await inputGate.promise;
    if(body.input.type==='click')attempt.keyboard='email';
    if(body.input.key==='Tab')attempt.keyboard='password';
    // Deliberate variable response delay exposes out-of-order client dispatch.
    await new Promise(r=>setTimeout(r,body.input.type==='text'?80:15));
    inputsCompleted++;
    if(combinedFrames&&req.headers.accept==='image/png'&&attempt.phase==='waiting'){
      combinedStarted++;const result={...attempt};if(combinedGate)await combinedGate.promise;
      res.setHeader('Content-Type','image/png');res.setHeader('X-Twin-Sign-In-Attempt',encodeURIComponent(JSON.stringify(result)));return res.end(updatedPng);
    }
   }
   if(body.action==='confirm'){
    if(lostConfirm){lostConfirm=false;res.statusCode=503;return res.end(JSON.stringify({error:'Your connection could not be confirmed. Retry the same confirmation.'}))}
    attempt={...attempt,phase:'submitted',enrollmentId:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'};
    snapshot.onlyfans.enrollments=[{id:attempt.enrollmentId,status:'pending',accountId:null,error:null,expiresAt:attempt.expiresAt}];
   }
  }
  return res.end(JSON.stringify({ok:true,attempt}));
 }
 if(/^\/(?:brand\/(?:platforms\/)?|moxy\/)[^.\/]+\.(svg|png|webp)$/.test(path)){res.setHeader('Content-Type',path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':'image/webp');return res.end(readFileSync(resolve(root,'public',path.slice(1))))}
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><main id="root"></main><script src="/bundle.js"></script></html>');
}catch{res.statusCode=500;res.end('{}')}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port;
const safari=await webkit.launch({headless:true});
try{
 for(const [name,browser,width]of [['chromium',chrome,1440],['webkit-mobile',safari,390]]){
  reset();const context=await browser.newContext({viewport:{width,height:844},...(name==='webkit-mobile'?{isMobile:true,hasTouch:true}:{})});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.getByRole('button',{name:'Connect OnlyFans',exact:true}).click();
  const dialogBounds=await page.getByRole('dialog').boundingBox();assert(Math.abs(dialogBounds.x+dialogBounds.width/2-width/2)<2,'Connection dialog is horizontally centered');if(name==='chromium')assert(Math.abs(dialogBounds.y+dialogBounds.height/2-844/2)<2,'Desktop connection dialog is vertically centered');
  await page.getByLabel('Email address',{exact:true}).fill('fixture@example.test');await page.getByLabel('OnlyFans password',{exact:true}).fill('fixture-password');const formBounds=await page.getByLabel('Email address',{exact:true}).boundingBox();assert(formBounds.width>=300,'Mobile login uses normal full-width inputs');await page.screenshot({path:out+'/'+name+'-native-login.png',fullPage:true});await page.getByRole('button',{name:'Sign in',exact:true}).click();await until(()=>posted.some(b=>b.input?.type==='login'));const screen=page.getByLabel('OnlyFans sign-in screen');await screen.waitFor();
  assert(await page.getByRole('dialog').evaluate(el=>!['transparent','rgba(0, 0, 0, 0)'].includes(getComputedStyle(el).backgroundColor)),'The real creator theme supplies an opaque dialog');
  assert.equal(posted.filter(b=>b.action==='start').length,1,'StrictMode must not launch twice');
  assert.equal(await page.getByText('Install Twin connector',{exact:false}).count(),0);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  await page.waitForFunction(()=>document.querySelector('[aria-label="OnlyFans sign-in screen"]')?.dataset.ready==='true');const bounds=await screen.boundingBox();assert(bounds.width>200&&bounds.height<=720,'Whole remote viewport is scaled without clipping');
  await screen.click({position:{x:bounds.width*.4,y:bounds.height*.2}});
  await page.waitForFunction(()=>document.querySelector('[aria-label="OnlyFans sign-in screen"]')?.getAttribute('aria-disabled')==='false');
  const input=page.getByLabel('Type in the selected OnlyFans field');assert(await input.evaluate(el=>document.activeElement!==el),'Verification taps must not open the phone keyboard');await page.getByRole('button',{name:'Show keyboard',exact:true}).click();assert(await input.evaluate(el=>document.activeElement===el),'Typing remains available explicitly');await page.keyboard.type('fixture@example.test');
  await page.getByRole('button',{name:'Next field',exact:true}).click();
  await page.keyboard.type('fixture-password');await input.press('Backspace');
  await page.waitForFunction(()=>document.querySelector('[aria-label="Type in the selected OnlyFans field"]')?.type==='password');
  await until(()=>posted.some(b=>b.input?.key==='Backspace'));await page.waitForFunction(()=>document.querySelector('[aria-label="OnlyFans sign-in screen"]')?.width===864);assert.equal(await screen.evaluate(el=>el.width),864,'Preserve high resolution frame pixels');
  const inputs=posted.filter(b=>b.action==='input'&&b.input.type!=='login').map(b=>b.input);assert.equal(inputs[0].type,'click');assert(Math.abs(inputs[0].x-.4)<.01&&Math.abs(inputs[0].y-.2)<.01,'Click maps to the provider viewport');
  assert.deepEqual(inputs.slice(1).reduce((a,v)=>{if(v.type==='text'&&a.at(-1)?.type==='text')a.at(-1).text+=v.text;else a.push({...v});return a;},[]),[{type:'text',text:'fixture@example.test'},{type:'key',key:'Tab'},{type:'text',text:'fixture-password'},{type:'key',key:'Backspace'}]);
  await screen.click({position:{x:bounds.width*.5,y:bounds.height*.3}});assert(await input.evaluate(el=>document.activeElement!==el),'Tapping verification dismisses an already-open keyboard');const refreshedBounds=await screen.boundingBox();assert(Math.abs(refreshedBounds.width-bounds.width)<1&&Math.abs(refreshedBounds.x-bounds.x)<1,'High-resolution refresh does not resize or move the verification frame');const closeBounds=await page.getByRole('button',{name:'Close connection setup'}).boundingBox(),backBounds=await page.getByRole('button',{name:'Back to sign-in',exact:true}).boundingBox();assert(closeBounds.y>=0&&backBounds.y+backBounds.height<=844,'Close and verification controls remain in the viewport');await page.screenshot({path:out+'/'+name+'-sign-in.png',fullPage:true});
  await page.waitForFunction(()=>document.querySelector('[aria-label="OnlyFans sign-in screen"]')?.getAttribute('aria-disabled')==='false');
  // A paired response paints immediately even while an older GET is stalled.
  const stale=gate(),pairedFrame=gate();frameGate=stale;combinedGate=pairedFrame;combinedFrames=true;
  const beforeStale=framesStarted,beforePaired=combinedStarted,beforeTap=posted.filter(b=>b.action==='input').length;
  await until(()=>framesStarted>beforeStale);
  await screen.click({position:{x:bounds.width*.5,y:bounds.height*.3}});await until(()=>combinedStarted>beforePaired);
  assert.equal(await screen.getAttribute('aria-disabled'),'true','Paired response must wait for actual image bytes');
  await screen.dispatchEvent('wheel',{deltaY:100,clientX:bounds.x+20,clientY:bounds.y+20});
  assert.equal(posted.filter(b=>b.action==='input').length,beforeTap+1);
  combinedGate=null;pairedFrame.release();await page.waitForFunction(()=>document.querySelector('[aria-label="OnlyFans sign-in screen"]')?.getAttribute('aria-disabled')==='false');
  assert.equal(framesStarted,beforeStale+1,'Tap paints its response without requesting a second frame');
  const pixel=()=>screen.evaluate(el=>Array.from(el.getContext('2d').getImageData(0,0,1,1).data));
  assert.deepEqual(await pixel(),[223,243,255,255],'The input response contains the new screen');
  const completedBefore=framesCompleted;frameGate=null;stale.release();await until(()=>framesCompleted>completedBefore);await page.waitForTimeout(40);
  assert.deepEqual(await pixel(),[223,243,255,255],'An older GET cannot overwrite the paired response');
  // Benchmark both paths with the same simulated phone/request delay.
  requestDelay=180;const timings={};
  for(const [mode,paired]of [['separate',false],['paired',true]]){
    combinedFrames=paired;const samples=[];
    for(let i=0;i<3;i++){
      await page.waitForFunction(()=>document.querySelector('[aria-label="OnlyFans sign-in screen"]')?.getAttribute('aria-disabled')==='false');
      const started=performance.now();await screen.click({position:{x:bounds.width*.5,y:bounds.height*.3}});
      await page.waitForFunction(()=>document.querySelector('[aria-label="OnlyFans sign-in screen"]')?.getAttribute('aria-disabled')==='false');samples.push(Math.round(performance.now()-started));
    }
    timings[mode]=samples.sort((a,b)=>a-b)[1];
  }
  console.log(name+' simulated 180ms/request tap-to-paint median (ms): '+JSON.stringify(timings));requestDelay=0;
  combinedFrames=false;
  // Hold an old frame across an input ACK, then hold the replacement frame.
  // No tap/scroll may queue against either screen until the replacement is painted.
  const oldFrame=gate(),newFrame=gate(),action=gate();frameGate=oldFrame;inputGate=action;
  const beforeFrames=framesStarted,beforeInputs=posted.filter(b=>b.action==='input').length,beforeCompleted=inputsCompleted;
  await until(()=>framesStarted>beforeFrames);
  const tap=()=>page.mouse.click(refreshedBounds.x+refreshedBounds.width*.5,refreshedBounds.y+refreshedBounds.height*.3);
  await tap();await page.getByText('Updating…',{exact:true}).waitFor();await until(()=>posted.filter(b=>b.action==='input').length===beforeInputs+1);
  await tap();await tap();await screen.dispatchEvent('wheel',{deltaY:100,clientX:refreshedBounds.x+20,clientY:refreshedBounds.y+20});
  assert.equal(posted.filter(b=>b.action==='input').length,beforeInputs+1,'Rapid taps and scrolls are discarded while the action is pending');
  action.release();inputGate=null;await until(()=>inputsCompleted>beforeCompleted);
  assert.equal(await screen.getAttribute('aria-disabled'),'true','An input ACK alone must not unlock the stale screen');
  const oldCompleted=framesCompleted;frameGate=newFrame;oldFrame.release();await until(()=>framesCompleted>oldCompleted);
  await page.waitForTimeout(50);assert.equal(await screen.getAttribute('aria-disabled'),'true','An old in-flight frame must not unlock taps');
  await until(()=>framesStarted>beforeFrames+1);
  await tap();assert.equal(posted.filter(b=>b.action==='input').length,beforeInputs+1,'Taps remain blocked while the fresh frame is downloading');
  await page.screenshot({path:out+'/'+name+'-updating.png',fullPage:true});
  frameGate=null;newFrame.release();await page.waitForFunction(()=>document.querySelector('[aria-label="OnlyFans sign-in screen"]')?.getAttribute('aria-disabled')==='false');
  await page.getByText('Updating…',{exact:true}).waitFor({state:'hidden'});await tap();await until(()=>posted.filter(b=>b.action==='input').length===beforeInputs+2);
  await page.waitForFunction(()=>document.querySelector('[aria-label="OnlyFans sign-in screen"]')?.getAttribute('aria-disabled')==='false');
  assert.equal(posted.filter(b=>b.action==='input').length,beforeInputs+2,'Discarded taps are never replayed after recovery');
  combinedFrames=true;attempt={...attempt,phase:'ready',handle:'fixture_creator'};
  await page.getByRole('heading',{name:'Connect @fixture_creator?'}).waitFor();
  assert.equal(await page.locator('[data-state="connected"]').count(),0,'Capture alone must not claim connected');
  lostConfirm=true;await page.getByRole('button',{name:'Connect this account',exact:true}).click();
  await page.getByText('Your connection could not be confirmed. Retry the same confirmation.').waitFor();
  await page.getByRole('button',{name:'Connect this account',exact:true}).click();
  await page.getByText('Checking your account. You’ll return here when it’s connected.').waitFor();
  assert.equal(await page.getByRole('dialog').count(),1);assert.equal(await page.locator('[data-state="connected"]').count(),0,'Pending enrollment is not connected');
  const confirms=posted.filter(b=>b.action==='confirm');assert.deepEqual(confirms[0],confirms[1]);
  snapshot.onlyfans.enrollments[0]={...snapshot.onlyfans.enrollments[0],status:'accepted',accountId:'of-123'};
  snapshot.onlyfans.accounts=[{id:'of-123',handle:'fixture_creator',connection:{status:'verified',expiresAt:new Date(Date.now()+3600000).toISOString(),outgoingEnabled:false}}];
  await page.getByRole('dialog').waitFor({state:'hidden'});await page.locator('[data-state="connected"]').waitFor();
  assert.equal(await page.getByText('Outgoing messages disabled',{exact:true}).count(),1);
  await page.screenshot({path:out+'/'+name+'-connected.png',fullPage:true});
  assert.deepEqual(errors,[]);await context.close();
 }
 // Smaller phones retain a visible close button, the entire frame and its controls.
 for(const [width,height]of [[320,667],[430,932]]){reset();const context=await safari.newContext({viewport:{width,height},isMobile:true,hasTouch:true});const phone=await context.newPage();await phone.goto(url);await phone.getByRole('button',{name:'Connect OnlyFans',exact:true}).click();await phone.getByRole('button',{name:'Other sign-in options',exact:true}).click();await phone.waitForFunction(()=>document.querySelector('[aria-label="OnlyFans sign-in screen"]')?.dataset.ready==='true');const frame=await phone.getByLabel('OnlyFans sign-in screen').boundingBox(),back=await phone.getByRole('button',{name:'Back to sign-in',exact:true}).boundingBox();assert(frame.width>=240&&frame.y>=0&&frame.y+frame.height<=height,'Whole verification frame stays visible on small phones');assert(back.y+back.height<=height,'Phone controls stay visible');assert(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No phone horizontal overflow');await context.close();}
 // Expiry removes the attempt server-side; restarting must still reach start.
 reset();const page=await chrome.newPage({viewport:{width:390,height:844}});await page.goto(url);await page.getByRole('button',{name:'Connect OnlyFans',exact:true}).click();await page.getByRole('button',{name:'Other sign-in options',exact:true}).click();await page.getByLabel('OnlyFans sign-in screen').waitFor();
 unavailableFrame=true;const frameNotice=page.getByText('Your sign-in screen could not be loaded. Restart sign-in to continue.',{exact:true});await frameNotice.waitFor();unavailableFrame=false;await frameNotice.waitFor({state:'hidden'});
 const firstStart=posted.find(b=>b.action==='start');expired=true;await page.getByText('Your sign-in expired. Start again.').waitFor();await page.getByRole('button',{name:'Restart sign-in'}).click();await until(()=>posted.filter(b=>b.action==='start').length===2);await page.getByRole('button',{name:'Other sign-in options',exact:true}).click();await page.getByLabel('OnlyFans sign-in screen').waitFor();
 assert.equal(posted.filter(b=>b.action==='start').length,2);assert.notEqual(posted.filter(b=>b.action==='start')[1].startKey,firstStart.startKey);
 denied=true;await page.getByRole('button',{name:'Close connection setup'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.getByText('Sign in to your creator account again.',{exact:true}).first().waitFor();assert(await page.getByRole('button',{name:'Connect OnlyFans',exact:true}).isDisabled());await page.close();
 // A form must disappear on expiry, and transient status failures must clear after recovery.
 reset();const recovery=await chrome.newPage({viewport:{width:390,height:844}});await recovery.goto(url);await recovery.getByRole('button',{name:'Connect OnlyFans',exact:true}).click();
 await recovery.getByLabel('Email address',{exact:true}).fill('fixture@example.test');await recovery.getByLabel('OnlyFans password',{exact:true}).fill('fixture-password');
 unavailableStatus=true;await recovery.getByText('Your sign-in status could not be loaded.',{exact:true}).waitFor();unavailableStatus=false;await recovery.getByText('Your sign-in status could not be loaded.',{exact:true}).waitFor({state:'hidden'});
 expired=true;await recovery.getByText('Your sign-in expired. Start again.',{exact:true}).waitFor();assert.equal(await recovery.getByLabel('OnlyFans password',{exact:true}).count(),0,'Expired attempts must remove the credential form');
 await recovery.getByRole('button',{name:'Restart sign-in',exact:true}).click();await recovery.getByLabel('Email address',{exact:true}).waitFor();assert.equal(await recovery.getByLabel('OnlyFans password',{exact:true}).inputValue(),'','Restart clears credentials');
 denied=true;await recovery.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await recovery.getByLabel('OnlyFans password',{exact:true}).count(),0,'Authentication loss removes the credential form without a manual close');await recovery.close();
 // Multiple accounts reconnect the account the creator selected.
 reset();const multi=await chrome.newPage({viewport:{width:390,height:844}});await multi.goto(url);
 snapshot.onlyfans.accounts=['one','two'].map((handle,i)=>({id:'of-'+(i+1),handle,connection:{status:'expired',expiresAt:new Date(Date.now()-1000).toISOString(),outgoingEnabled:false}}));
 await multi.getByRole('button',{name:'Refresh status',exact:true}).click();await multi.getByRole('button',{name:'Reconnect @two',exact:true}).click();await multi.getByLabel('Email address',{exact:true}).waitFor();assert.equal(posted.find(body=>body.action==='start').accountId,'of-2');await multi.close();
 console.log('PASS creator sign-in UI: Chromium/mobile WebKit, delayed input/frame click guard, stale-frame refusal, no replayed taps/scrolls, serialized typing, account confirmation, exact retry, frame recovery, expiry/auth loss, clean restart and selected-account reconnect. Physical phone and live provider pilot remain release checks.');
}finally{inputGate?.release();frameGate?.release();combinedGate?.release();await Promise.allSettled([chrome.close(),safari.close()]);await new Promise(r=>server.close(r));}

