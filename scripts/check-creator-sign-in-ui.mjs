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
let snapshot,attempt,posted,expired,denied,lostConfirm,unavailableFrame;
const reset=()=>{snapshot=structuredClone(initial);attempt={id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',phase:'waiting',handle:null,expiresAt:new Date(Date.now()+900000).toISOString(),enrollmentId:null,width:432,height:720,keyboard:null};posted=[];expired=false;denied=false;lostConfirm=false;unavailableFrame=false;};reset();
async function until(check){for(let n=0;n<100;n++){if(check())return;await new Promise(r=>setTimeout(r,50));}assert(check(),'Expected fixture request was not received');}
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import Platforms from './components/creator-platforms/CreatorPlatforms';import Shell from './components/CreatorStudioShell';import {creatorStudioStatus} from './lib/creator-studio-model';createRoot(document.getElementById('root')).render(<React.StrictMode><Shell brand="moxy" creatorName="Fixture creator" status={creatorStudioStatus(false,"Draft / unfinished",null)} contentHref="/creator/onboarding?step=content"><Platforms initial={${JSON.stringify(initial)}}/></Shell></React.StrictMode>);`;
const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:root},bundle:true,write:false,outdir:out,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':root},define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'links',setup(b){b.onResolve({filter:/^next\/(link|navigation)$|\/CurrencyProvider$/},a=>({path:a.path,namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},a=>({resolveDir:root,loader:'jsx',contents:a.path==='next/link'?`import React from 'react';export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}`:a.path==='next/navigation'?`export const usePathname=()=>'/creator/platforms';export const useRouter=()=>({refresh(){}});`:`export const useCurrency=()=>({currency:'AUD',setCurrency(){}});`}))}}]});
const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text;
const css=(await postcss([tailwind()]).process('@import "./app/globals.css";',{from:resolve('creator-sign-in-review.css')})).css+'\n'+bundle.outputFiles.find(f=>f.path.endsWith('.css')).text+'\nbody{margin:0;font-family:Arial,sans-serif}html{--font-heading:Arial,sans-serif}';
const chrome=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:process.platform==='win32'?[]:['--no-sandbox']});
const framePage=await chrome.newPage({viewport:{width:432,height:720}});
await framePage.setContent('<html><body style="font:18px Arial;margin:40px"><h1>OnlyFans fixture</h1><p>Local test account</p><label>Email<input type="email" style="display:block;width:100%;height:48px"></label><p><label>Password<input type="password" style="display:block;width:100%;height:48px"></label></p><button style="padding:12px">Sign in</button></body></html>');
const jpeg=await framePage.screenshot({type:'jpeg'});await framePage.close();
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),path=url.pathname;res.setHeader('Cache-Control','no-store');
 if(path==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(js)}
 if(path==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css)}
 if(path.startsWith('/creator-auth/')){
  res.setHeader('Content-Type','application/json');
  if(denied){res.statusCode=401;return res.end(JSON.stringify({error:'Sign in to your creator account again.'}))}
  if(path==='/creator-auth/platforms')return res.end(JSON.stringify(snapshot));
  if(expired&&req.method==='GET'){res.statusCode=410;return res.end(JSON.stringify({error:'Your sign-in expired. Start again.'}))}
  if(req.method==='GET'&&url.searchParams.get('frame')==='1'){if(unavailableFrame){res.statusCode=503;return res.end('{}')}res.setHeader('Content-Type','image/jpeg');return res.end(jpeg)}
  if(req.method==='POST'){
   let raw='';for await(const b of req)raw+=b;const body=JSON.parse(raw);posted.push(body);
   if(body.action==='cancel'&&expired){res.statusCode=410;return res.end(JSON.stringify({error:'Your sign-in expired. Start again.'}))}
   if(body.action==='start'){expired=false;attempt={...attempt,id:randomUUID(),phase:'waiting',handle:null,keyboard:null,enrollmentId:null};}
   if(body.action==='input'){
    if(body.input.type==='click')attempt.keyboard='email';
    if(body.input.key==='Tab')attempt.keyboard='password';
    // Deliberate variable response delay exposes out-of-order client dispatch.
    await new Promise(r=>setTimeout(r,body.input.type==='text'?80:15));
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
  const screen=page.getByLabel('OnlyFans sign-in screen');await screen.waitFor();
  assert(await page.getByRole('dialog').evaluate(el=>!['transparent','rgba(0, 0, 0, 0)'].includes(getComputedStyle(el).backgroundColor)),'The real creator theme supplies an opaque dialog');
  assert.equal(posted.filter(b=>b.action==='start').length,1,'StrictMode must not launch twice');
  assert.equal(await page.getByText('Install Twin connector',{exact:false}).count(),0);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  const bounds=await screen.boundingBox();assert(bounds.width>200&&bounds.height<=720,'Whole remote viewport is scaled without clipping');
  await screen.click({position:{x:bounds.width*.4,y:bounds.height*.2}});
  const input=page.getByLabel('Type in the selected OnlyFans field');await input.fill('fixture@example.test');
  await page.getByRole('button',{name:'Next field',exact:true}).click();
  await input.fill('fixture-password');await input.press('Backspace');
  await page.waitForFunction(()=>document.querySelector('[aria-label="Type in the selected OnlyFans field"]')?.type==='password');
  await page.waitForTimeout(350);
  const inputs=posted.filter(b=>b.action==='input').map(b=>b.input);assert.equal(inputs[0].type,'click');assert(Math.abs(inputs[0].x-.4)<.01&&Math.abs(inputs[0].y-.2)<.01,'Click maps to the provider viewport');
  assert.deepEqual(inputs.slice(1),[{type:'text',text:'fixture@example.test'},{type:'key',key:'Tab'},{type:'text',text:'fixture-password'},{type:'key',key:'Backspace'}]);
  await page.screenshot({path:out+'/'+name+'-sign-in.png',fullPage:true});
  attempt={...attempt,phase:'ready',handle:'fixture_creator'};
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
 // Expiry removes the attempt server-side; restarting must still reach start.
 reset();const page=await chrome.newPage({viewport:{width:390,height:844}});await page.goto(url);await page.getByRole('button',{name:'Connect OnlyFans',exact:true}).click();await page.getByLabel('OnlyFans sign-in screen').waitFor();
 unavailableFrame=true;const frameNotice=page.getByText('Your sign-in screen could not be loaded. Restart sign-in to continue.',{exact:true});await frameNotice.waitFor();unavailableFrame=false;await frameNotice.waitFor({state:'hidden'});
 const firstStart=posted.find(b=>b.action==='start');expired=true;await page.getByText('Your sign-in expired. Start again.').waitFor();await page.getByRole('button',{name:'Restart sign-in'}).click();await until(()=>posted.filter(b=>b.action==='start').length===2);await page.getByLabel('OnlyFans sign-in screen').waitFor();
 assert.equal(posted.filter(b=>b.action==='start').length,2);assert.notEqual(posted.filter(b=>b.action==='start')[1].startKey,firstStart.startKey);
 denied=true;await page.getByRole('button',{name:'Close connection setup'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.getByText('Sign in to your creator account again.',{exact:true}).first().waitFor();assert(await page.getByRole('button',{name:'Connect OnlyFans',exact:true}).isDisabled());await page.close();
 console.log('PASS creator sign-in UI: Chromium and mobile WebKit, one start in StrictMode, serialized input, explicit account confirmation, exact retry, pending/verified states, frame failure/recovery, expired restart and authentication loss. Physical phone keyboard and live provider pilot remain release checks.');
}finally{await Promise.allSettled([chrome.close(),safari.close()]);await new Promise(r=>server.close(r));}
