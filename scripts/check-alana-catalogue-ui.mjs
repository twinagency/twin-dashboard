import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const port=3133, origin=`http://127.0.0.1:${port}`, output='test-results/alana-catalogue';
const ids=Array.from({length:5},(_,i)=>`photo-${i}`);
const items=ids.map((id,i)=>({id,type:'photo',description:`Portrait ${i+1} with the complete original caption for details and search`,stars:350,free:false,purchased:false,received:false,createdAt:'2026-09-27'}));
items.push({id:'free',type:'photo',description:'Free introduction photo',stars:0,free:true,purchased:false,received:false,createdAt:'2026-09-26'});
items.push({id:'video',type:'video',description:'Video preview with complete caption',stars:800,free:false,purchased:false,received:false,createdAt:'2026-09-25'});
const featured={id:'featured',title:'Photo collection 1',photoIds:ids,stars:1400,regularStars:1750,owned:false,partial:false};
const response={name:'Alana Powell',verified:true,presentation:'compact',featuredBundleId:featured.id,items,blur:11,admin:false,enabled:true,canSend:true,chatUrl:'https://t.me/alannapowofficialx',purchaseNote:'Purchases linked to catalogue items appear here.',bundles:[featured],rewards:null};
const teaser='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="400"><rect width="320" height="400" fill="#765c70"/><circle cx="160" cy="120" r="75" fill="#ad8b9e" opacity=".3"/><rect x="50" y="215" width="220" height="160" rx="75" fill="#b899a7" opacity=".25"/></svg>';

async function main(){
  await mkdir(output,{recursive:true});
  const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{env:{...process.env,NODE_ENV:'production',DASHBOARD_PASSWORD:'offline-catalogue-preview-only'},stdio:['ignore','pipe','pipe']});
  let logs='';for(const stream of [server.stdout,server.stderr])stream.on('data',b=>{logs=(logs+b).slice(-10000)});
  let browser;
  try{
    let ready=false;
    for(let i=0;i<80;i++){try{if((await fetch(`${origin}/catalogue/alanna-pow`,{signal:AbortSignal.timeout(1000)})).status<500){ready=true;break}}catch{}await delay(250)}
    assert.ok(ready,`Catalogue server failed: ${logs}`);
    browser=await chromium.launch();
    const page=await browser.newPage({viewport:{width:390,height:850},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://telegram.org/js/telegram-web-app.js',route=>route.fulfill({contentType:'application/javascript',body:`window.catalogueChatOpens=0;window.Telegram={WebApp:{initData:'fixture',ready(){},expand(){},close(){},openTelegramLink(){window.catalogueChatOpens++},setHeaderColor(){},setBackgroundColor(){},setBottomBarColor(){}}};`}));
    await page.route('**/api/catalogue/*',route=>{
      const body=route.request().postDataJSON();
      if(body.action==='catalogue')return route.fulfill({contentType:'application/json',body:JSON.stringify(route.request().url().includes('briana-redd')?{...response,name:'Briana Redd',presentation:'standard',verified:false,featuredBundleId:null}:response)});
      if(body.action==='preview')return route.fulfill({contentType:'image/svg+xml',body:teaser});
      throw new Error(`Unexpected request: ${body.action}`);
    });
    const results=[];
    for(const width of [320,375,390,430,760]){
      await page.setViewportSize({width,height:850});
      await page.goto(`${origin}/catalogue/alanna-pow`);
      await page.getByRole('heading',{name:'Daddy’s Daily Reward Sale'}).waitFor();
      await page.locator('.cat-approved-badge').evaluate(image=>image.decode());
      const metrics=await page.evaluate(()=>{
        const badge=document.querySelector('.cat-approved-badge'),chat=document.querySelector('.cat-message'),primary=document.querySelector('.cat-compact-bundle .cat-primary');
        return {overflow:document.documentElement.scrollWidth-innerWidth,badgeLoaded:badge.complete&&badge.naturalWidth===1254,badgeBox:badge.getBoundingClientRect().width,chatColor:getComputedStyle(chat).color,chatBackground:getComputedStyle(chat).backgroundColor,chatRadius:getComputedStyle(chat).borderRadius,purchaseRadius:getComputedStyle(primary).borderRadius,headerRight:Math.max(...[...document.querySelectorAll('.cat-header button')].map(e=>e.getBoundingClientRect().right))};
      });
      assert.ok(metrics.overflow<=1,`${width}: no horizontal overflow`);
      assert.equal(metrics.badgeLoaded,true,`${width}: badge loads`);
      assert.equal(metrics.badgeBox,28);
      assert.equal(metrics.chatColor,'rgb(17, 17, 17)');
      assert.equal(metrics.chatBackground,'rgb(255, 255, 255)');
      assert.equal(metrics.chatRadius,'9999px');
      assert.equal(metrics.purchaseRadius,'9999px');
      assert.ok(metrics.headerRight<=width+1,`${width}: header actions fit`);
      assert.equal(await page.locator('.cat-compact-bundle').count(),1);
      await page.screenshot({path:`${output}/bundles-${width}.png`,fullPage:true,animations:'disabled'});
      results.push({width,...metrics});
    }
    await page.setViewportSize({width:390,height:850});
    await page.getByRole('button',{name:'Photos',exact:true}).click();
    assert.equal(await page.locator('.cat-card').count(),6,'Free photo stays in Photos');
    await page.screenshot({path:`${output}/photos-390.png`,fullPage:true});
    await page.locator('.cat-picture-button').first().click();
    assert.match(await page.getByRole('dialog',{name:'Item details'}).innerText(),/complete original caption/);
    await page.screenshot({path:`${output}/item-detail-390.png`,fullPage:true});
    await page.getByRole('button',{name:'Close item'}).click();
    await page.getByRole('button',{name:'Videos',exact:true}).click();
    assert.equal(await page.locator('.cat-card').count(),1);
    await page.screenshot({path:`${output}/videos-390.png`,fullPage:true});
    await page.getByRole('button',{name:'Bundles',exact:true}).click();
    await page.locator('.cat-bundle-details-button').click();
    assert.equal(await page.locator('.cat-bundle-included>div').count(),5);
    await page.screenshot({path:`${output}/bundle-detail-390.png`,fullPage:true});
    await page.getByRole('button',{name:'Close bundle'}).click();
    await page.getByRole('button',{name:'My purchases'}).click();
    await page.screenshot({path:`${output}/my-purchases-390.png`,fullPage:true});
    await page.getByRole('button',{name:'Message me'}).click();
    assert.equal(await page.evaluate(()=>window.catalogueChatOpens),1,'Telegram chat handoff');
    await page.goto(`${origin}/catalogue/briana-redd`);
    await page.getByRole('heading',{name:'Briana Redd'}).waitFor();
    assert.equal(await page.locator('.catalogue-compact').count(),0,'Other creator retains standard layout');
    assert.deepEqual(errors,[],'No client errors');
    await writeFile(`${output}/checks.json`,JSON.stringify(results,null,2));
    console.log('Alana UI passed: five widths, six views, badge, chat, creator isolation and no overflow. Previews are mocked; no payments or fan messages.');
  }finally{await browser?.close();server.kill('SIGTERM');setTimeout(()=>server.kill('SIGKILL'),5000).unref()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
