// Exercise real remote input/caret behaviour, with network delay and no provider login.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const root=process.cwd(),out=resolve('test-results/creator-sign-in-editing');
mkdirSync(out,{recursive:true});
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import HostedConnect from './components/creator-platforms/HostedConnect';createRoot(document.getElementById('root')).render(<HostedConnect profileId="fixture" accountId={null} disabled={false} onChanged={async()=>true}/>);`,loader:'tsx',resolveDir:root},bundle:true,write:false,outdir:out,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':root},define:{'process.env.NODE_ENV':'"development"'}});
const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text;
const css=bundle.outputFiles.find(f=>f.path.endsWith('.css')).text;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:process.platform==='win32'?[]:['--no-sandbox']});
const remote=await browser.newPage({viewport:{width:432,height:720},deviceScaleFactor:2});
await remote.setContent('<style>body{font:18px Arial;margin:24px}input{display:block;width:340px;height:42px;margin:16px 0}button{margin-top:20px}</style><h1>Test sign-in</h1><label>Email<input id="email" type="email" value="old@example.test"></label><label>Password<input id="password" type="password" value="test-secret"></label><button id="verify">Verification control</button>');
const attempt={id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',phase:'waiting',handle:null,expiresAt:new Date(Date.now()+900000).toISOString(),enrollmentId:null,width:432,height:720,keyboard:null};
const inputs=[];let delay=150,frames=0,paired=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const server=createServer(async(req,res)=>{
  try{
    if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(js);}
    if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css);}
    if(req.url.startsWith('/creator-auth/')){
      await sleep(delay);res.setHeader('Cache-Control','no-store');
      const url=new URL(req.url,'http://localhost');
      if(req.method==='GET'&&url.searchParams.get('frame')==='1'){
        frames++;const image=await remote.screenshot({type:'jpeg',quality:95});res.setHeader('Content-Type','image/jpeg');return res.end(image);
      }
      if(req.method==='POST'){
        let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);
        if(body.action==='input'){
          const input=body.input;inputs.push(input);
          if(input.type==='click')await remote.mouse.click(input.x*432,input.y*720);
          else if(input.type==='text')await remote.keyboard.insertText(input.text);
          else if(input.type==='key')await remote.keyboard.press(input.key);
          attempt.keyboard=await remote.evaluate(()=>{const e=document.activeElement;return e?.tagName==='INPUT'?e.type:null;});
          if(['image/png','image/jpeg, image/png'].includes(req.headers.accept)){
            paired++;const image=await remote.screenshot({type:'jpeg',quality:95});res.setHeader('Content-Type','image/jpeg');res.setHeader('X-Twin-Sign-In-Attempt',encodeURIComponent(JSON.stringify(attempt)));return res.end(image);
          }
        }
      }
      res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:true,attempt}));
    }
    res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>body{margin:0;font:16px Arial}#root{height:800px;padding:16px;box-sizing:border-box} [data-hosted-connect]{height:100%}</style><main id="root"></main><script src="/bundle.js"></script>');
  }catch(error){res.statusCode=500;res.end(JSON.stringify({error:error.message}));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port;
const page=await browser.newPage({viewport:{width:900,height:860}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const ready=()=>page.waitForFunction(()=>document.querySelector('canvas')?.getAttribute('aria-disabled')==='false');
const value=()=>remote.locator('#email').inputValue();
async function remoteClick(selector){
  await ready();const box=await remote.locator(selector).boundingBox(),canvas=await page.locator('canvas').boundingBox();
  await page.mouse.click(canvas.x+(box.x+box.width/2)/432*canvas.width,canvas.y+(box.y+box.height/2)/720*canvas.height);
}
try{
  await page.goto(url);await page.getByRole('button',{name:'Other sign-in options'}).click();await ready();
  await remoteClick('#email');
  const bridge=page.getByLabel('Type in the selected OnlyFans field');
  assert(await bridge.evaluate(e=>document.activeElement===e),'Clicking email must immediately capture desktop typing');
  // Start typing before the click response arrives. It must stay behind the click.
  await page.keyboard.press('Home');await page.keyboard.type('new-');await ready();
  assert.equal(await value(),'new-old@example.test','Immediate typing reaches the clicked remote field');
  await page.keyboard.press('Home');await page.keyboard.press('Delete');await page.keyboard.press('ArrowRight');await page.keyboard.press('Backspace');await ready();
  assert.equal(await value(),'w-old@example.test','Cursor movement, Delete and Backspace edit existing text');
  await remoteClick('#password');await page.keyboard.press('End');await page.keyboard.type('-edited');await ready();
  assert.equal(await remote.locator('#password').inputValue(),'test-secret-edited','Clicking another field retains working keyboard focus');
  const before=inputs.length;await remoteClick('#email');await page.keyboard.press('End');await page.keyboard.type('12345678901234567890');await ready();
  assert((await value()).endsWith('12345678901234567890'),'Fast typing is neither lost nor reordered');
  assert(inputs.slice(before).filter(x=>x.type==='text').length<20,'A typing burst is batched');
  assert(await bridge.evaluate(e=>document.activeElement===e),'Screen refreshes preserve desktop focus');
  assert.equal(await page.locator('canvas').evaluate(e=>e.width),864,'JPEG preserves full frame resolution');
  assert(paired>0,'Input responses include their updated frame');
  const beforeIdle=frames;for(let n=0;n<60&&frames===beforeIdle;n++)await sleep(50);assert(frames>beforeIdle,'Background refresh resumes after a paired input frame');
  await page.screenshot({path:out+'/desktop-editing.png',fullPage:true});
  const jpeg=await remote.screenshot({type:'jpeg',quality:95}),png=await remote.screenshot({type:'png'});
  console.log(JSON.stringify({transportDelayMs:delay,framePixels:[864,1440],jpegBytes:jpeg.length,pngBytes:png.length,frameGets:frames,pairedInputs:paired,batchedTextCommands:inputs.filter(x=>x.type==='text').length}));
  assert.deepEqual(errors,[]);
  console.log('PASS real remote login editing: click then immediate type, caret movement, delete/backspace, field switching, password edits, delayed ordered input, batching and focus after repaint.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
