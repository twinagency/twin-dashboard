/** Real UI components against isolated synthetic reads. No production URL or write is allowed. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync,copyFileSync,createWriteStream} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
const root=process.cwd(),out=path.join(root,'test-results/onlyfans-render');
const node=process.env.CODEX_PRIMARY_RUNTIME_NODE||process.execPath;
async function waitForCampaigns(page){
 await page.locator('[data-of-campaign-manager]').waitFor();
 await page.waitForFunction(()=>{
  const manager=document.querySelector('[data-of-campaign-manager]');
  if(!manager)return false;
  const text=manager.innerText;
  const historySettled=manager.querySelector('[data-of-campaign]')||text.includes('Campaign history is unavailable.')||text.includes('No campaigns are recorded for this account.');
  const loading=[...manager.querySelectorAll('p,button')].some(node=>/^Loading(?: campaigns| saved conversations| campaign detail)?…$/.test(node.textContent.trim()));
  return !!historySettled&&!loading;
 });
}
mkdirSync(out,{recursive:true});
const publicDir=path.join(root,'preview/onlyfans-integration/public/brand/platforms');
mkdirSync(publicDir,{recursive:true});
copyFileSync(path.join(root,'public/brand/platforms/onlyfans.svg'),path.join(publicDir,'onlyfans.svg'));
const server=spawn(node,['scripts/preview-onlyfans-ui.mjs'],{cwd:root,env:{...process.env,PORT:'4198'},stdio:['ignore','pipe','pipe']});
const log=createWriteStream(path.join(out,'preview.log'));server.stdout.pipe(log);server.stderr.pipe(log);
let browser;
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('UI fixture did not start')),60000);server.stdout.on('data',data=>{if(data.toString().includes('Ready in')){clearTimeout(timer);resolve();}});server.on('exit',code=>reject(Error(`UI fixture exited: ${code}`)));});
 browser=await chromium.launch({headless:true,...(process.env.PREVIEW_CHROME?{executablePath:process.env.PREVIEW_CHROME}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const writes=[];
 page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/')&&!['GET','HEAD'].includes(r.method()))writes.push(r.url());});
 for(const route of ['overview','accounts','inbox','campaigns','content','sales','settings','operations']){
  await page.goto(`http://127.0.0.1:4198/onlyfans/${route}`,{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:route[0].toUpperCase()+route.slice(1),exact:true}).waitFor();
  await page.evaluate(()=>document.fonts.ready);
  if(route==='campaigns')await waitForCampaigns(page);
  if(route==='content')await page.locator('[data-of-vault-grid]').waitFor();
  for(const width of [390,430,768,1440,1920]){
   await page.setViewportSize({width,height:1000});
   const sizes=await page.evaluate(()=>({document:document.documentElement.scrollWidth,viewport:innerWidth,main:document.querySelector('main.dashboard-main')?.scrollWidth,client:document.querySelector('main.dashboard-main')?.clientWidth}));
   assert(sizes.document<=width+1,`${route}: document overflow at ${width}`);
   assert(sizes.main<=sizes.client+1,`${route}: workspace overflow at ${width}`);
   if([390,1440].includes(width))await page.screenshot({path:path.join(out,`${route}-${width}.png`)});
  }
  if(route==='content'){
   await page.setViewportSize({width:1440,height:1000});
   await page.locator('[data-of-vault-item]').first().waitFor();
   const thumb=await page.locator('.of-media-cover').first().boundingBox();
   assert(thumb && thumb.y<500 && thumb.height>180,'The media grid must appear in the first desktop viewport');
   const logo=page.locator('.dashboard-sidebar .of-channel-logo');assert(await logo.evaluate(img=>img.complete&&img.naturalWidth>0),'The actual OnlyFans logo must load');
   await page.getByRole('button',{name:'Create offer',exact:true}).click();
   await page.locator('[data-of-vault-product-label]').fill('Unsaved visual test');
   await page.getByRole('tab',{name:'Offers',exact:true}).click();
   assert(await page.getByRole('button',{name:'Create offer',exact:true}).isVisible(),'Actions remain available on Offers');
   await page.getByRole('button',{name:'Create offer',exact:true}).click();
   assert.equal(await page.locator('[data-of-vault-product-label]').inputValue(),'Unsaved visual test');
   await page.getByRole('button',{name:'List view',exact:true}).click();
   assert.equal(await page.locator('[data-of-vault-grid]').getAttribute('data-view'),'list');
   await page.getByRole('button',{name:'Grid view',exact:true}).click();
   await page.getByRole('tab',{name:'Offers',exact:true}).click();
   await page.getByRole('button',{name:'Upload content',exact:true}).click();
   await page.locator('[data-of-media-picker]').waitFor();
   await page.getByRole('button',{name:'Done selecting media',exact:true}).click();
  }
  console.log(`PASS ${route}: five responsive widths`);
 }
 assert.deepEqual(writes,[],'Visual review must not submit any real or synthetic mutation');
 for(const script of ['check-onlyfans-vault-library-browser.mjs','check-onlyfans-vault-picker-browser.mjs']){
  const child=spawn(node,['scripts/'+script],{cwd:root,env:{...process.env,ONLYFANS_TEST_WEB_URL:'http://127.0.0.1:4198'},stdio:'inherit'});
  assert.equal(await new Promise(resolve=>child.on('exit',resolve)),0,script);
 }
 console.log('PASS OnlyFans render: eight routes, five widths, first-screen media, real brand asset, preserved drafts, upload entry and no writes.');
}finally{await browser?.close();server.kill('SIGTERM');}
