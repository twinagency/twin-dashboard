// Real shared login UI with controlled service delays. No external login or credentials.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {chromium,webkit} from 'playwright';
const root=process.cwd();
const entry=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import HostedConnect from './components/creator-platforms/HostedConnect';function Test(){const[open,setOpen]=useState(true);return <><button onClick={()=>setOpen(false)}>Close fixture</button>{open&&<HostedConnect profileId="fixture" accountId={null} disabled={false} endpoint={location.pathname==='/'?undefined:'/api/onlyfans-connections/creators/fixture/sign-in'} onChanged={async()=>true}/>}</>};createRoot(document.getElementById('root')).render(<React.StrictMode><Test/></React.StrictMode>);`;
const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:root},bundle:true,write:false,outdir:resolve('test-results/sign-in-startup'),format:'iife',platform:'browser',jsx:'automatic',alias:{'@':root},define:{'process.env.NODE_ENV':'"development"'}});
const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text,css=bundle.outputFiles.find(f=>f.path.endsWith('.css')).text;
const chrome=await chromium.launch({headless:true,args:process.platform==='win32'?[]:['--no-sandbox']}),safari=await webkit.launch({headless:true});
const framePage=await chrome.newPage({viewport:{width:432,height:720}});
await framePage.setContent('<h1>Verification fixture</h1><p>Test only</p>');const png=await framePage.screenshot({type:'png'});await framePage.close();
let phase='opening',posts=[],startGate,releaseStart,uncertain=false;
const reset=()=>{phase='opening';posts=[];uncertain=false;startGate=new Promise(r=>{releaseStart=r;});};reset();
const id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const state=()=>({id,phase,handle:phase==='ready'?'fixture':null,expiresAt:new Date(Date.now()+900000).toISOString(),enrollmentId:phase==='submitted'?'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb':null,width:432,height:720,keyboard:null});
const server=createServer(async(req,res)=>{
 try{
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(js);}
  if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
  if(req.url.startsWith('/creator-auth/')||req.url.startsWith('/api/')){
   res.setHeader('Content-Type','application/json');
   if(req.method==='POST'){
    let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);posts.push(body);
    if(body.action==='start')await startGate;
    if(body.action==='input'&&uncertain){res.statusCode=503;return res.end(JSON.stringify({error:'interrupted'}));}
    if(body.action==='confirm')phase='submitted';
   }
   if(req.url.includes('frame=1')){res.setHeader('Content-Type','image/png');return res.end(png);}
   return res.end(JSON.stringify({ok:true,attempt:state()}));
  }
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script>');
 }catch{res.statusCode=500;res.end('{}');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
async function until(fn){for(let n=0;n<100;n++){if(fn())return;await new Promise(r=>setTimeout(r,50));}assert(fn());}
try{
 for(const [brand,browser]of [['twin',chrome],['moxy',safari],['flirt',safari]]){
  reset();const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.addInitScript(()=>{const later=window.setTimeout.bind(window);window.setTimeout=(fn,ms,...args)=>later(fn,ms===20000?250:ms,...args);});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/'+brand);
  await page.getByLabel('Email address',{exact:true}).fill('fixture@example.test');await page.getByLabel('OnlyFans password',{exact:true}).fill('synthetic-password');
  assert(await page.getByRole('button',{name:'Preparing connection…',exact:true}).isDisabled());
  assert.equal(posts.filter(b=>b.action==='start').length,1,'StrictMode opens one session');
  releaseStart();await page.getByText('The secure connection is taking longer than expected. You can restart below.',{exact:true}).waitFor();
  assert(await page.getByRole('button',{name:'Restart sign-in',exact:true}).isEnabled());
  assert.equal(await page.getByLabel('OnlyFans password',{exact:true}).inputValue(),'synthetic-password','Opening status polls preserve typed details');
  const readyAt=performance.now();phase='waiting';await page.getByRole('button',{name:'Sign in',exact:true}).waitFor();const observedMs=Math.round(performance.now()-readyAt);assert(observedMs<1100,'Ready sign-in should appear without a 1.5 second poll delay');console.log(JSON.stringify({brand,readyObservedMs:observedMs}));
  assert.equal(await page.getByLabel('Email address',{exact:true}).inputValue(),'fixture@example.test');
  assert.equal(await page.getByLabel('OnlyFans password',{exact:true}).inputValue(),'synthetic-password','Browser readiness preserves typed details');
  uncertain=true;await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByText('The sign-in response was interrupted. Check the screen below before trying again.',{exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.ready==='true');
  assert.equal(posts.filter(b=>b.action==='input').length,1,'Uncertain submission must not replay a password');
  await page.getByRole('button',{name:'Close fixture',exact:true}).click();await until(()=>posts.some(b=>b.action==='cancel'));
  assert.equal(posts.filter(b=>b.action==='cancel').length,1,'Closing releases the existing session once');
  assert.deepEqual(errors,[]);await context.close();console.log('PASS '+brand+': immediate editable form, preserved input, slow startup recovery, no duplicate login, close cleanup');
 }
 reset();const pending=await chrome.newPage();await pending.goto(url+'/twin');await until(()=>posts.some(b=>b.action==='start'));
 await pending.getByRole('button',{name:'Close fixture',exact:true}).click();releaseStart();await until(()=>posts.some(b=>b.action==='cancel'));
 assert.equal(posts.filter(b=>b.action==='cancel').length,1,'A start completed after close must be released');await pending.close();
 reset();phase='ready';releaseStart();const confirmed=await chrome.newPage();await confirmed.goto(url+'/flirt');await confirmed.getByRole('button',{name:'Connect this account',exact:true}).click();
 await confirmed.getByText('Checking your account. You’ll return here when it’s connected.',{exact:true}).waitFor();await confirmed.getByRole('button',{name:'Close fixture',exact:true}).click();
 await confirmed.waitForTimeout(100);assert.equal(posts.filter(b=>b.action==='cancel').length,0,'Closing must preserve a submitted enrollment');await confirmed.close();
 console.log('PASS late startup cleanup and durable submitted connection preservation');
}finally{releaseStart();await Promise.allSettled([chrome.close(),safari.close()]);await new Promise(r=>server.close(r));}
