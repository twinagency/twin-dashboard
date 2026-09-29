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
const videoBytes=Buffer.from('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','base64');
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
    await page.route('https://catalogue-fixture.test/protected.mp4',route=>route.fulfill({contentType:'video/mp4',body:videoBytes}));
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
