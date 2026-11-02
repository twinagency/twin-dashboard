import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, webkit } from 'playwright';

const port=3137,origin=`http://127.0.0.1:${port}`,output='test-results/catalogue-ownership';
const svg=(colour)=>`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640"><rect width="480" height="640" fill="${colour}"/><circle cx="240" cy="230" r="95" fill="#ded2bd"/></svg>`;
const item={id:'photo-a',type:'photo',description:'A portrait with its complete saved description.',stars:1,free:false,purchased:false,received:false,createdAt:'2026-09-27'};
await mkdir(output,{recursive:true});
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{env:{...process.env,NODE_ENV:'production',DASHBOARD_PASSWORD:'offline-only'},stdio:['ignore','pipe','pipe']});
let logs='';for(const stream of [server.stdout,server.stderr])stream.on('data',b=>{logs=(logs+b).slice(-5000)});
const results=[];
try {
  let ready=false;
  for(let n=0;n<80;n++){try{if((await fetch(`${origin}/catalogue/alanna-pow`,{signal:AbortSignal.timeout(1000)})).status<500){ready=true;break}}catch{}await delay(250)}
  assert.ok(ready,logs);
  for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
    const browser=await engine.launch();
    try {
      const page=await browser.newPage({viewport:{width:390,height:850}});
      let paid=false,checkoutCalls=0,invoiceOpens=0,originalReads=0,originalDownloads=0,failImage=false;
      const keys=[];let releaseImage;let imageGate=Promise.resolve();
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('https://telegram.org/js/telegram-web-app.js',route=>route.fulfill({contentType:'application/javascript',body:`window.chatOpens=0;window.appCloses=0;window.Telegram={WebApp:{initData:'offline',ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},setBottomBarColor(){},openTelegramLink(){if(!window.receiptConfirmed)window.prematureHandoff=true;window.chatOpens++},close(){if(!window.receiptConfirmed)window.prematureHandoff=true;window.appCloses++},openInvoice(url,cb){window.invoiceOpened=true;setTimeout(()=>cb('paid'),10)}}};`}));
      await page.route('**/owned-photo.svg*',async route=>{
        originalDownloads++;await imageGate;
        return route.fulfill({status:failImage?503:200,contentType:failImage?'text/plain':'image/svg+xml',body:failImage?'unavailable':svg('#166a8f')});
      });
      await page.route('**/api/catalogue/*',async route=>{
        const body=route.request().postDataJSON();
        const json=value=>route.fulfill({contentType:'application/json',body:JSON.stringify(value)});
        if(body.action==='catalogue')return json({name:'Alanna Pow',verified:true,presentation:'compact',checkoutMode:'invoice',items:[{...item,purchased:paid}],blur:11,admin:false,enabled:true,canSend:true,chatUrl:'https://t.me/alannapowofficialx',bundles:[],rewards:null,purchaseNote:'Your purchases appear here.'});
        if(body.action==='event')return json({ok:true});
        if(body.action==='preview')return route.fulfill({contentType:'image/svg+xml',body:svg('#313337')});
        if(body.action==='checkout'){
          checkoutCalls++;keys.push(body.requestKey);
          // The first response represents an expired request key whose old
          // response was lost. One user click must recover and open Telegram.
          return json(checkoutCalls===1?{orderId:'expired',status:'expired'}:{orderId:'current',status:'pending',invoiceUrl:'https://t.me/$fixture'});
        }
        if(body.action==='checkout_status'){
          assert.equal(await page.evaluate(()=>window.invoiceOpened),true);invoiceOpens++;
          paid=true;await page.evaluate(()=>window.receiptConfirmed=true);
          return json({orderId:'current',status:'paid'});
        }
        if(body.action==='content'){
          assert.equal(paid,true,'Originals require a real server receipt in the fixture');originalReads++;
          return json({type:'photo',url:`${origin}/owned-photo.svg?signature=${originalReads}`});
        }
        throw Error(`Unexpected action ${body.action}`);
      });
      const open=()=>page.locator('.cat-grid .cat-picture-button').first().click();
      const image=()=>page.locator('.cat-owned-media img');
      const decoded=()=>page.waitForFunction(()=>{const i=document.querySelector('.cat-owned-media img');return i?.complete&&i.naturalWidth===480&&i.getBoundingClientRect().height>100;});
      await page.goto(`${origin}/catalogue/alanna-pow`);await open();
      imageGate=new Promise(resolve=>{releaseImage=resolve});
      await page.getByRole('button',{name:'Unlock · ⭐1',exact:true}).click();
      await page.waitForFunction(()=>window.chatOpens===1&&window.appCloses===1);
      assert.equal(await page.evaluate(()=>window.prematureHandoff||false),false,'Chat handoff requires server-confirmed payment');
      assert.equal(originalReads,0,'Checkout hands off before any owned-image request');
      await page.waitForFunction(()=>window.invoiceOpened===true);
      assert.equal(checkoutCalls,2);assert.notEqual(keys[0],keys[1]);assert.equal(invoiceOpens,1);
      assert.equal(await page.getByText('This payment expired. Tap again to start a new payment.',{exact:true}).count(),0);
      await page.reload();await page.getByRole('button',{name:'My purchases'}).click();await open();
      await page.getByText('Loading your unlocked item…',{exact:true}).waitFor();
      assert.equal(await image().count(),0,'Do not replace the preview with an empty original before loading finishes');
      assert.equal(await page.getByText('Unlocked',{exact:true}).count(),0,'Do not claim the image is displayed before it loads');
      releaseImage();await decoded();
      const reads=originalReads,downloads=originalDownloads;
      for(let n=0;n<3;n++){
        await page.getByRole('button',{name:'Close item'}).click();await open();await decoded();
        assert.match(await page.getByRole('dialog',{name:'Item details'}).innerText(),/complete saved description/);
      }
      assert.equal(originalReads,reads,'Reopening uses the already-authorized session image');
      assert.equal(originalDownloads,downloads,'Closing a paid photo does not throw away its loaded image');
      assert.equal(checkoutCalls,2,'Viewing ownership never creates another checkout');
      assert.equal(await page.evaluate(()=>window.chatOpens),0,'Reopening owned photos does not hand off to chat again');
      await page.screenshot({path:`${output}/${name}-owned-reopened.png`,fullPage:false});
      await page.reload();await page.getByRole('button',{name:'My purchases'}).click();await open();await decoded();
      assert.equal(originalReads,reads+1,'A fresh session revalidates access and fetches a new signed original');
      assert.equal(checkoutCalls,2,'Ownership survives a full page reload');
      // A signed URL can succeed while its image request fails. Exercise the
      // actual image network failure, not just a mocked API error.
      failImage=true;await page.reload();await open();
      await page.getByRole('button',{name:'Retry loading item'}).waitFor();
      assert.equal(await image().count(),0);assert.equal(await page.getByRole('button',{name:/Unlock ·/}).count(),0);
      failImage=false;await page.getByRole('button',{name:'Retry loading item'}).click();await decoded();
      assert.equal(checkoutCalls,2,'Image recovery cannot charge for owned content');
      assert.deepEqual(errors,[]);
      results.push({browser:name,expiredRecoveredInOneClick:true,confirmedChatHandoff:true,reopenCount:3,reloadOwned:true,realImageFailureRecovered:true,extraCheckouts:0});
    }finally{await browser.close();}
  }
  await writeFile(`${output}/checks.json`,JSON.stringify(results,null,2));
  console.log('Chromium and WebKit: expired checkout recovers on one click and hands off after settlement; reopened owned image loads, reopens three times, survives reload and recovers an actual image failure without another payment. Fixtures only.');
}finally{server.kill('SIGTERM');setTimeout(()=>server.kill('SIGKILL'),5000).unref();}

