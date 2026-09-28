import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const port = 3138;
const origin = process.env.CATALOGUE_TEST_ORIGIN || `http://127.0.0.1:${port}`;
const output = 'test-results/callace-fit-sid-catalogue';
const creators = [
  { slug: 'mrs-callace', name: 'Mrs Callace', chat: 'mrscallacex' },
  { slug: 'fit-sid', name: 'Fit Sid', chat: 'fitsidofficial' },
];
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="400"><defs><filter id="b"><feGaussianBlur stdDeviation="24"/></filter></defs><rect width="320" height="400" fill="#33343d"/><g filter="url(#b)"><circle cx="170" cy="120" r="70" fill="#ad9aa4"/><path d="M40 380 Q70 180 170 200 Q270 180 300 380" fill="#746572"/></g></svg>';
const poster = 'data:image/svg+xml,' + encodeURIComponent(svg);
const now = new Date().toISOString();
function item(id, type, stars, purchased = false) {
  return { id, type, description: `Fixture ${type} with saved caption ${id}`, stars,
    free: false, purchased, received: false, createdAt: now };
}
function payload(creator, purchased = false) {
  const items = [item('photo-1','photo',350,purchased),item('video-1','video',800),
    item('photo-2','photo',499),item('video-2','video',900)];
  return { name: creator.name, verified: true, presentation: 'compact', checkoutMode: 'invoice',
    featuredBundleId: null, items, blur: 11, admin: false, enabled: true, canSend: true,
    chatUrl: `https://t.me/${creator.chat}`, purchaseNote: 'Your purchases appear here.',
    bundles: [], tonEnabled: false, rewards: { balance: 400, earned: 0, spent: 0,
      welcomeBonus: 400, cost: 2500, startsAt: now, photoIds: ['photo-2'], videoIds: ['video-2'] } };
}
async function main() {
  await mkdir(output,{recursive:true});
  const server = process.env.CATALOGUE_TEST_ORIGIN ? null : spawn(process.execPath,
    ['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],
    {env:{...process.env,NODE_ENV:'production',DASHBOARD_PASSWORD:'offline-fixture-only'},stdio:['ignore','pipe','pipe']});
  let logs = '';
  if (server) for (const stream of [server.stdout,server.stderr])
    stream.on('data',b=>{ logs=(logs+b).slice(-5000); });
  let browser;
  try {
    let ready=false;
    for(let i=0;i<80;i++){try{if((await fetch(`${origin}/catalogue/mrs-callace`,{signal:AbortSignal.timeout(1000)})).status<500){ready=true;break}}catch{}await delay(250)}
    assert.ok(ready,`Catalogue server failed: ${logs}`);
    browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {});
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://telegram.org/js/telegram-web-app.js',route=>route.fulfill({
      contentType:'application/javascript',
      body:"window.Telegram={WebApp:{initData:'fixture',ready(){},expand(){},close(){},openTelegramLink(){},setHeaderColor(){},setBackgroundColor(){},setBottomBarColor(){}}};"
    }));
    let creator=creators[0], purchased=false;
    const actions=[];
    await page.route('**/api/catalogue/*',async route=>{
      const body=route.request().postDataJSON();actions.push(body.action);
      if(body.action==='catalogue')return route.fulfill({contentType:'application/json',body:JSON.stringify(payload(creator,purchased))});
      if(body.action==='event')return route.fulfill({contentType:'application/json',body:'{"ok":true}'});
      if(body.action==='preview')return body.type==='video'
        ? route.fulfill({contentType:'application/json',body:JSON.stringify({url:'https://catalogue-fixture.test/protected.mp4',posterUrl:poster,seconds:5,durationSeconds:62})})
        : route.fulfill({contentType:'image/svg+xml',body:svg});
      throw new Error(`Fixture forbids ${body.action}`);
    });
    const reports=[];
    for(const target of creators) {
      creator=target;purchased=false;
      await page.goto(`${origin}/catalogue/${target.slug}`);
      await page.getByRole('heading',{name:target.name}).waitFor();
      await page.getByRole('button',{name:'Trending',exact:true}).waitFor();
      await page.locator('.cat-grid .cat-card').first().locator('.cat-preview img').waitFor();
      assert.equal(await page.locator('.cat-grid .cat-card').count(),4);
      assert.equal(await page.locator('.cat-grid .cat-card').nth(1).locator('.cat-video-preview').count(),1);
      assert.equal(await page.locator('.cat-reward-meter').count(),1);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
      assert.ok(overflow<=1,`${target.slug}: no horizontal overflow`);
      await page.screenshot({path:`${output}/${target.slug}-profile-mixed-grid-390.png`,fullPage:true,animations:'disabled'});
      await page.getByRole('button',{name:'Rewards Daddy'}).click();
      await page.getByText('Includes your one-time 400-point welcome gift.').waitFor();
      await page.screenshot({path:`${output}/${target.slug}-rewards-390.png`,fullPage:true,animations:'disabled'});
      await page.getByRole('button',{name:'Videos',exact:true}).click();
      await page.locator('.cat-grid .cat-card').first().locator('.cat-picture-button').click();
      await page.getByRole('dialog',{name:'Item details'}).waitFor();
      await page.screenshot({path:`${output}/${target.slug}-video-detail-390.png`,fullPage:false,animations:'disabled'});
      await page.getByRole('button',{name:'Close item'}).click();
      purchased=true;
      await page.reload();
      await page.getByRole('button',{name:'My purchases',exact:true}).click();
      await page.locator('.cat-grid .cat-card').first().waitFor();
      assert.equal(await page.locator('.cat-grid .cat-card').count(),1);
      await page.screenshot({path:`${output}/${target.slug}-purchases-390.png`,fullPage:true,animations:'disabled'});
      reports.push({creator:target.slug,width:390,overflow,fixture:true});
    }
    assert.deepEqual(errors,[]);
    assert.ok(actions.every(action=>['catalogue','preview','event'].includes(action)),
      'Fixture must not charge, deliver, claim, or message');
    await writeFile(`${output}/checks.json`,JSON.stringify(reports,null,2));
    console.log('Mrs Callace and Fit Sid mobile fixture views passed. No payment, claim or message request.');
  } finally { await browser?.close();server?.kill('SIGTERM');if(server)setTimeout(()=>server.kill('SIGKILL'),5000).unref(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
