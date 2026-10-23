import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const origin=process.env.ONLYFANS_TEST_WEB_URL||'http://127.0.0.1:3029';
assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin));
const browser=await chromium.launch({headless:true,...(process.env.PREVIEW_CHROME?{executablePath:process.env.PREVIEW_CHROME}:{})});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),accountId='acc-a',hash='a'.repeat(64);
 const envelope=extra=>({schemaVersion:'of-content.v1',ok:true,accountId,...extra});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSFEAAAAASUVORK5CYII=','base64');
 const rows=Array.from({length:30},(_,i)=>({mediaId:String(i+1),kind:'photo',durationSeconds:null,width:640,height:480,ready:i!==1,reason:i===1?'not_ready':null,description:`Landscape ${i+1}`}));
 const syncStatus={enabled:false,status:'off',revision:0,blockedReason:null,lastIncrementalAt:null,nextIncrementalAt:null,lastReconcileAt:null,nextReconcileAt:null,lastFullReconcileAt:null,coveredThroughMessageId:null,backlog:0,initial:null,
  coverage:Object.fromEntries(['media','paidMessages','paidPosts'].map(source=>[source,{state:'not_started',checkedAt:null,detail:null}])),openConflicts:0,
  uploads:{draft:0,queued:0,uploading:0,verifying:0,synced:0,retrying:0,connectionRequired:0,needsReview:0,outcomeUnconfirmed:0}};
 let deny=false,failRead=false,folder=null;const members=new Set(),products=[],folderWrites=[];
 await page.route('**/api/onlyfans-content/accounts/acc-a/**',async route=>{
  const req=route.request(),url=new URL(req.url()),suffix=url.pathname.split('/acc-a')[1];
  const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(suffix==='/sync/status'&&req.method()==='GET'&&!url.search)return deny?json({ok:false},401):json({schemaVersion:'of-content-sync.v1',ok:true,accountId,data:syncStatus});
  if(suffix==='/sync/drafts'&&req.method()==='GET'&&url.search==='?limit=10')return deny?json({ok:false},401):json({schemaVersion:'of-content-sync.v1',ok:true,accountId,data:{items:[],nextCursor:null}});
  if(suffix==='/items'&&req.method()==='POST'){products.push(req.postDataJSON());return json({ok:false},503);}
  if(suffix==='/vault'){
   if(deny)return json({ok:false},401);if(failRead)return json({ok:false},503);
   let filtered=rows.filter(r=>(!url.searchParams.get('q')||r.description.includes(url.searchParams.get('q')))&&(!url.searchParams.get('kind')||r.kind===url.searchParams.get('kind'))&&(!url.searchParams.get('folderId')||members.has(r.mediaId)));
   const matching=filtered.length;filtered=filtered.filter(r=>Number(r.mediaId)>Number(url.searchParams.get('afterMediaId')||0));
   return json(envelope({vault:{items:filtered.slice(0,24),nextCursor:filtered.length>24?filtered[23].mediaId:null,sync:null,connectionRevision:1,summary:{total:30,photos:30,videos:0,other:0,matching,folders:folder?1:0}}}));
  }
  if(suffix==='/vault/manage/folders'&&req.method()==='GET')return json(envelope({folders:folder?[{folderId:'7',name:folder,count:members.size}]:[]}));
  if(suffix==='/vault/manage/folders/7'&&req.method()==='GET')return json(envelope({folder:{folderId:'7',name:folder,count:members.size,fingerprint:hash,archived:false}}));
  if(suffix.startsWith('/vault/manage/folders')&&req.method()==='POST'){
   const body=req.postDataJSON();folderWrites.push(body);if(body.action==='create')folder=body.name;if(body.action==='add')body.mediaIds.forEach(id=>members.add(id));
   return json(envelope({applied:true,commandKey:hash,targetId:'7',fingerprint:hash}));
  }
  if(suffix.startsWith('/vault/previews/'))return route.fulfill({status:200,contentType:'image/png',body:png});
  if(suffix==='/vault/uploads')return json(envelope({uploads:{schemaVersion:'of-vault-media.v1',accountId,maxFiles:40,maxFileBytes:4000*1024**2,chunkBytes:8*1024**2,enabled:true,jobs:[]}}));
  throw Error('Unexpected request '+req.method()+' '+suffix);
 });
 await page.goto(origin+'/vault-fixture',{waitUntil:'networkidle'});
 await page.locator('[data-of-vault-item="24"]').waitFor();
 await page.locator('.of-folder-tools > summary').click();
 await page.getByRole('button',{name:'New folder / add to folder',exact:true}).click();
 assert(await page.locator('[data-of-vault-folder-create]').isVisible(),'Create folder remains available in the compact folder tools');
 await page.getByRole('button',{name:'Create offer',exact:true}).click();
 await page.locator('[data-of-vault-product-label]').fill('Draft landscape');await page.locator('[data-of-vault-product-price]').fill('3');await page.locator('[data-of-vault-product-description]').fill('A landscape photo');
 for(const enabled of [false,true]){await page.locator('[data-of-vault-product-enabled]').setChecked(enabled);assert(await page.locator('[data-of-vault-create]').isDisabled());assert.match(await page.locator('[data-of-product-issues]').innerText(),/Add at least one photo or video/);}
 await page.locator('[data-of-add-media]').click();const picker=page.locator('[data-of-media-picker]');await picker.locator('[data-of-picker-item="24"]').waitFor();
 assert(await picker.getByRole('checkbox',{name:'Add asset 2',exact:true}).isDisabled());assert.match(await picker.locator('[data-of-picker-item="2"]').innerText(),/Full access unconfirmed/);
 await picker.getByRole('checkbox',{name:'Add asset 1',exact:true}).check();
 await picker.getByRole('button',{name:'Next media',exact:true}).click();await picker.locator('[data-of-picker-item="25"]').waitFor();await picker.getByRole('checkbox',{name:'Add asset 25',exact:true}).check();
 await picker.getByRole('button',{name:'Previous media',exact:true}).click();await picker.getByRole('checkbox',{name:'Add asset 1',exact:true}).waitFor();assert(await picker.getByRole('checkbox',{name:'Add asset 1',exact:true}).isChecked());
 await picker.getByRole('button',{name:'New folder / add to folder',exact:true}).click();await picker.locator('[data-of-vault-folder-name]').fill('Summer');await picker.locator('[data-of-vault-folder-create]').click();await picker.locator('[data-of-vault-folder]').selectOption('7');await picker.locator('[data-of-vault-folder-add]').click();await page.waitForFunction(()=>document.querySelector('[data-of-media-picker] [data-of-vault-folder]')?.textContent.includes('Summer (2)'));
 assert.deepEqual(folderWrites.at(-1).mediaIds,['1','25']);
 await picker.locator('[data-of-vault-folder-filter]').selectOption('7');await page.waitForFunction(()=>document.querySelectorAll('[data-of-picker-item]').length===2);
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Picker overflow at ${width}`);const r=await picker.boundingBox();assert(r&&r.x>=0&&r.x+r.width<=width&&r.y>=0&&r.y+r.height<=844,`Picker outside ${width}px viewport`);}
 await picker.getByRole('button',{name:'Done selecting media',exact:true}).click();assert.equal(await page.locator('[data-of-vault-product-label]').inputValue(),'Draft landscape');assert.equal(await page.locator('[data-of-vault-product-price]').inputValue(),'3');assert.equal(await page.locator('[data-of-vault-product-description]').inputValue(),'A landscape photo');
 for(const enabled of [false,true]){await page.locator('[data-of-vault-product-enabled]').setChecked(enabled);assert(await page.locator('[data-of-vault-create]').isEnabled());const response=page.waitForResponse(r=>r.url().endsWith('/items')&&r.request().method()==='POST');await page.locator('[data-of-vault-create]').click();assert.equal((await response).status(),503);await page.waitForFunction(()=>!document.querySelector('[data-of-vault-product-label]')?.closest('fieldset').disabled);}
 assert.deepEqual(products.map(v=>v.product.enabled),[false,true]);assert.deepEqual(products[0].product.mediaIds,['1','25']);
 await page.locator('[data-of-upload-new]').click();await picker.locator('input[type=file]').waitFor({state:'visible'});await picker.locator('input[type=file]').setInputFiles({name:'test.png',mimeType:'image/png',buffer:png});assert(await picker.getByRole('button',{name:'Upload to OnlyFans',exact:true}).isEnabled());assert.match(await picker.innerText(),/does not publish a feed post/);
 await picker.getByRole('button',{name:'Done selecting media',exact:true}).click();assert.equal(await page.locator('[data-of-vault-product-description]').inputValue(),'A landscape photo');
 failRead=true;await page.locator('[data-of-add-media]').click();await picker.getByText('Media could not be loaded.',{exact:false}).waitFor();failRead=false;await picker.getByRole('button',{name:'Refresh media',exact:true}).click();await picker.locator('[data-of-picker-item="1"]').waitFor();
 deny=true;await picker.getByRole('button',{name:'Refresh media',exact:true}).click();await page.locator('[data-of-vault-notice]').filter({hasText:'Sign in again'}).waitFor();assert.equal(await picker.count(),0);assert.equal(await page.locator('[data-of-vault-product-description]').count(),0);
 console.log('PASS vault picker: visible selection, blocked-file explanations, cross-page selection, inline folder create/add/filter, retained draft, enabled and disabled saves, inline file chooser, read retry, session clearing, 320/390/1440px');
}finally{await browser.close();}
