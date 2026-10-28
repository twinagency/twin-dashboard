import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const origin=process.env.ONLYFANS_TEST_WEB_URL||'http://127.0.0.1:3028';
assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin));
const browser=await chromium.launch({headless:true,...(process.env.PREVIEW_CHROME?{executablePath:process.env.PREVIEW_CHROME}:{})});
const schemaVersion='of-content.v1',accountId='acc-a',hash='a'.repeat(64);
const envelope=extra=>({schemaVersion,ok:true,accountId,...extra});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSFEAAAAASUVORK5CYII=','base64');
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const rows=Array.from({length:50},(_,i)=>({mediaId:String(i+1),kind:(i+1)%3===0?'video':'photo',durationSeconds:(i+1)%3===0?630:null,width:640,height:480,ready:false,reason:'readiness_unknown',description:`Synthetic landscape ${i+1}`}));
 let description='Original landscape',tags=['coast'],fingerprint=hash,loseReply=true,deny=false,readFailure=false;
 const writes=[];let lastQuery=null;
 await page.route('**/api/onlyfans-content/accounts/acc-a/vault**',async route=>{
  const req=route.request(),url=new URL(req.url()),suffix=url.pathname.split('/vault')[1];
  const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(!suffix){lastQuery=url.searchParams;let filtered=rows.filter(r=>(!lastQuery.get('kind')||r.kind===lastQuery.get('kind'))&&(!lastQuery.get('q')||r.description.includes(lastQuery.get('q')))&&(!lastQuery.get('folderId')||Number(r.mediaId)<=2));const matching=filtered.length;filtered=filtered.filter(r=>Number(r.mediaId)>Number(lastQuery.get('afterMediaId')||0));return json(envelope({vault:{items:filtered.slice(0,24),nextCursor:filtered.length>24?filtered[23].mediaId:null,connectionRevision:1,sync:null,summary:{total:50,photos:34,videos:16,other:0,matching,folders:1}}}));}
  if(suffix==='/manage/folders')return json(envelope({folders:[{folderId:'7',name:'Outdoors',count:2}]}));
  if(suffix.startsWith('/manage/assets/')){
   const mediaId=suffix.split('/').at(-1);
   if(deny)return json({ok:false},401);
   if(req.method()==='GET')return readFailure?json({ok:false},503):json(envelope({asset:{mediaId,fingerprint,description,tags}}));
   writes.push(req.postData());const body=req.postDataJSON();description=body.patch.description;tags=body.patch.tags;fingerprint='b'.repeat(64);rows.find(r=>r.mediaId===mediaId).description=description;
   if(loseReply){loseReply=false;return route.abort('connectionfailed');}
   return json(envelope({applied:true,commandKey:'c'.repeat(64),targetId:mediaId,fingerprint}));
  }
  if(suffix.startsWith('/previews/'))return route.fulfill({status:200,contentType:'image/png',body:png});
  if(suffix==='/uploads')return json(envelope({uploads:{schemaVersion:'of-vault-media.v1',accountId,maxFiles:40,maxFileBytes:4000*1024**2,chunkBytes:8*1024**2,enabled:true,jobs:[]}}));
  throw Error('Unexpected fixture request: '+req.method()+' '+suffix);
 });
 await page.goto(origin+'/vault-fixture',{waitUntil:'networkidle'});
 await page.locator('[data-of-vault-item="24"]').waitFor();
 assert.equal(await page.locator('[data-of-vault-item]').count(),24);
 await page.locator('.of-sync-tools > summary').click();
 const totals=page.locator('[data-of-vault-summary]');assert.match(await totals.innerText(),/All media\s*50/);assert.match(await totals.innerText(),/Photos\s*34/);assert.match(await totals.innerText(),/Videos\s*16/);
 assert.equal(await page.getByText('Needs review',{exact:true}).count(),0);
 await page.getByRole('tab',{name:'Videos',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-of-vault-item]').length===16);assert.equal(lastQuery.get('kind'),'video');
 await page.getByRole('tab',{name:'All media',exact:true}).click();await page.locator('[data-of-vault-item="1"]').waitFor();
 await page.locator('[data-of-vault-next]').click();await page.locator('[data-of-vault-item="25"]').waitFor();assert.match(await totals.innerText(),/All media\s*50/);await page.getByRole('button',{name:'Previous',exact:true}).click();await page.locator('[data-of-vault-item="1"]').waitFor();
 assert(await page.locator('[data-of-folder-card="7"]').isVisible(),'Category cards are visible without opening folder tools');
 assert.match(await page.locator('[data-of-folder-card="7"]').innerText(),/Outdoors\s*2/);
 await page.locator('[data-of-folder-card="7"]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-of-vault-item]').length===2);assert.equal(lastQuery.get('folderId'),'7');
 assert.equal(await page.locator('[data-of-folder-card="7"]').getAttribute('aria-pressed'),'true');
 await page.locator('[data-of-folder-card=""]').click();await page.locator('[data-of-vault-item="24"]').waitFor();
 await page.locator('[data-of-vault-folder-filter]').selectOption('7');await page.waitForFunction(()=>document.querySelectorAll('[data-of-vault-item]').length===2);assert.equal(lastQuery.get('folderId'),'7');
 await page.locator('[data-of-vault-folder-filter]').selectOption('');await page.locator('[data-of-vault-item="24"]').waitFor();
 await page.getByLabel('Search your media').fill('landscape 50');await page.locator('[data-of-vault-search]').click();await page.locator('[data-of-vault-item="50"]').waitFor();assert.equal(await page.locator('[data-of-vault-item]').count(),1);
 await page.getByLabel('Search your media').fill('');await page.locator('[data-of-vault-search]').click();await page.locator('[data-of-vault-item="24"]').waitFor();
 // Edit from far down a mobile grid: the dialog must be visibly in the viewport.
 await page.locator('[data-of-vault-edit="24"]').click();const dialog=page.getByRole('dialog');await dialog.getByRole('textbox',{name:'Description',exact:true}).waitFor();
 const rect=await dialog.boundingBox();assert(rect&&rect.y>=0&&rect.y+rect.height<=844,'Editor must open within mobile viewport');
 await dialog.getByRole('textbox',{name:'Description',exact:true}).fill('Updated landscape');await dialog.getByRole('textbox',{name:'Tags, separated by commas',exact:true}).fill('outdoors, summer');
 await dialog.locator('[data-of-vault-asset-save]').click();await dialog.getByText('Save not confirmed.',{exact:false}).waitFor();await dialog.locator('[data-of-vault-edit-retry]').click();await dialog.getByText('Description and tags saved.',{exact:true}).waitFor();assert.equal(writes.length,2);assert.equal(writes[0],writes[1]);
 await dialog.getByRole('button',{name:'Close',exact:true}).click();await page.locator('[data-of-vault-edit="24"]').click();await dialog.getByRole('textbox',{name:'Description',exact:true}).waitFor();assert.equal(await dialog.getByRole('textbox',{name:'Description',exact:true}).inputValue(),'Updated landscape');
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Editor overflow at ${width}`);const r=await dialog.boundingBox();assert(r&&r.x>=0&&r.x+r.width<=width,`Dialog outside viewport at ${width}`);}
 await dialog.getByRole('button',{name:'Close',exact:true}).click();
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Library overflow at ${width}`);}
 readFailure=true;await page.locator('[data-of-vault-edit="24"]').click();await dialog.getByText('The description and tags could not be loaded.',{exact:false}).waitFor();readFailure=false;await dialog.getByRole('button',{name:'Reload saved details',exact:true}).click();await dialog.getByRole('textbox',{name:'Description',exact:true}).waitFor();
 deny=true;await dialog.getByRole('textbox',{name:'Description',exact:true}).fill('Must clear');await dialog.locator('[data-of-vault-asset-save]').click();await dialog.getByText('Your session cannot edit this asset.',{exact:false}).waitFor();assert.equal(await dialog.locator('textarea').count(),0);
 console.log('PASS vault library browser: full-library totals, immediate media filters, folder/search filtering, next/previous, visible mobile editor, saved values, exact lost-reply retry, read errors, session clearing, 320/390/1440px layouts');
}finally{await browser.close();}
