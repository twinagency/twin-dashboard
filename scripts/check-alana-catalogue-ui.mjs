import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const port=3133, origin=process.env.CATALOGUE_TEST_ORIGIN || `http://127.0.0.1:${port}`, output='test-results/alana-catalogue';
const ids=Array.from({length:5},(_,i)=>`photo-${i}`);
const items=ids.map((id,i)=>({id,type:'photo',description:`Portrait ${i+1} with the complete original caption for details and search`,stars:350,free:false,purchased:false,received:false,createdAt:'2026-09-27'}));
items.push({id:'free',type:'photo',description:'Free introduction photo',stars:0,free:true,purchased:false,received:false,createdAt:'2026-09-26'});
items.push({id:'video',type:'video',description:'Video preview with complete caption',stars:800,free:false,purchased:false,received:false,createdAt:'2026-09-25'});
const featured={id:'featured',title:'Photo collection 1',kind:'photo',photoIds:ids,videoIds:[],stars:1400,regularStars:1750,owned:false,partial:false};
const response={name:'Alanna Pow',verified:true,presentation:'compact',checkoutMode:'chat',featuredBundleId:featured.id,items,blur:11,admin:false,enabled:true,canSend:true,chatUrl:'https://t.me/alannapowofficialx',purchaseNote:'Purchases linked to catalogue items appear here.',bundles:[featured],rewards:null};
const teaser='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="400"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#696471"/><stop offset="1" stop-color="#434e61"/></linearGradient><filter id="b"><feGaussianBlur stdDeviation="20"/></filter></defs><rect width="320" height="400" fill="url(#g)"/><g filter="url(#b)" opacity=".65"><circle cx="165" cy="120" r="65" fill="#c0a995"/><rect x="72" y="205" width="200" height="195" rx="85" fill="#a8968f"/></g></svg>';
const svgUrl='data:image/svg+xml,'+encodeURIComponent(teaser);
const videoBytes=Buffer.from('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','base64');
const orders=new Map(), purchased=new Set(), requests=[];
let settle='pending', contentFails=false, delaySettlement=0, originalBeforePaid=false, transientPhoto=true, fixtureMode='chat', receivedOnly=false;

async function main(){
  await mkdir(output,{recursive:true});
  const server=process.env.CATALOGUE_TEST_ORIGIN ? null : spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{env:{...process.env,NODE_ENV:'production',DASHBOARD_PASSWORD:'offline-catalogue-preview-only'},stdio:['ignore','pipe','pipe']});
  let logs='';if(server)for(const stream of [server.stdout,server.stderr])stream.on('data',b=>{logs=(logs+b).slice(-10000)});
  let browser;
  try{
    let ready=false;
    for(let i=0;i<80;i++){try{if((await fetch(`${origin}/catalogue/alanna-pow`,{signal:AbortSignal.timeout(1000)})).status<500){ready=true;break}}catch{}await delay(250)}
    assert.ok(ready,`Catalogue server failed: ${logs}`);
    browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{});
    const page=await browser.newPage({viewport:{width:390,height:850},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://telegram.org/js/telegram-web-app.js',route=>route.fulfill({contentType:'application/javascript',body:`window.catalogueChatOpens=0;window.catalogueInvoiceOpens=0;window.catalogueInvoiceStatus='cancelled';window.Telegram={WebApp:{initData:'fixture',ready(){},expand(){},close(){window.catalogueCloses=(window.catalogueCloses||0)+1},openInvoice(url,callback){window.catalogueInvoiceOpens++;setTimeout(()=>callback(window.catalogueInvoiceStatus),20)},openTelegramLink(){window.catalogueChatOpens++},setHeaderColor(){},setBackgroundColor(){},setBottomBarColor(){}}};`}));
    await page.route('https://catalogue-fixture.test/preview.mp4',route=>route.fulfill({contentType:'video/mp4',body:videoBytes}));
    await page.route('**/api/catalogue/*',async route=>{
      const body=route.request().postDataJSON();requests.push(body);
      const json=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
      if(body.action==='catalogue')return json(route.request().url().includes('briana-redd')?{...response,name:'Briana Redd',presentation:'standard',checkoutMode:'chat',verified:false,featuredBundleId:null}:{...response,checkoutMode:fixtureMode,items:items.map(item=>({...item,purchased:purchased.has(item.id),received:receivedOnly&&item.id==='photo-0'})),bundles:[{...featured,owned:ids.every(id=>purchased.has(id)),partial:ids.some(id=>purchased.has(id))&&!ids.every(id=>purchased.has(id))}]});
      if(body.action==='event')return json({ok:true});
      if(body.action==='preview'){
        if(body.type==='photo'&&body.id==='photo-0'&&transientPhoto){transientPhoto=false;return json({error:'Preview is busy, try again.'},503)}
        return body.type==='video'?json({url:'https://catalogue-fixture.test/preview.mp4',posterUrl:svgUrl,durationSeconds:62}):route.fulfill({contentType:'image/svg+xml',body:teaser});
      }
      if(body.action==='checkout'){
        if(!orders.has(body.requestKey))orders.set(body.requestKey,{orderId:`order-${orders.size}`,invoiceUrl:'https://t.me/$fixture',type:body.type,id:body.id,status:'pending'});
        return json(orders.get(body.requestKey));
      }
      if(body.action==='checkout_status'){
        const order=[...orders.values()].find(order=>order.orderId===body.orderId);assert.ok(order);
        order.status=delaySettlement-->0?'pending':settle;
        if(order.status==='paid')for(const id of order.type==='bundle'?ids:[order.id])purchased.add(id);
        return json({status:order.status,retryAfterSeconds:0});
      }
      if(body.action==='request'){
        assert.ok(fixtureMode==='chat'||route.request().url().includes('briana-redd'),'Invoice UI may not enqueue unpaid chat offers');
        return json({id:'legacy-request',status:'delivered',reused:body.type==='bundle'});
      }
      if(body.action==='content'){
        if(!purchased.has(body.id)&&body.id!=='free')originalBeforePaid=true;
        assert.ok(purchased.has(body.id)||body.id==='free','Original requires settled ownership');
        return contentFails?json({error:'Could not load your item.'},503):json({url:body.type==='video'?'https://catalogue-fixture.test/preview.mp4':svgUrl,type:body.type});
      }
      throw new Error(`Unexpected request: ${body.action}`);
    });
    const results=[];
    for(const width of [320,375,390,430,760]){
      await page.setViewportSize({width,height:850});
      await page.goto(`${origin}/catalogue/alanna-pow`);
      await page.getByRole('button',{name:'Trending',exact:true}).waitFor();
      await page.locator('.cat-approved-badge').evaluate(image=>image.decode());
      // The first photo deliberately receives one 503. Await its actual recovery,
      // not whichever later preview happens to resolve first.
      await page.locator('.cat-grid .cat-card').first().locator('.cat-preview > img').waitFor();
      for (const card of await page.locator('.cat-grid .cat-card').all()) {
        await card.scrollIntoViewIfNeeded();
        if (!await card.locator('.cat-video-preview').count()) await card.locator('.cat-preview > img').waitFor();
      }
      await page.evaluate(()=>window.scrollTo(0,0));
      assert.equal(await page.getByRole('region',{name:'About this collection'}).isVisible(),true,`${width}: creator bio remains visible`);
      assert.equal(await page.locator('.cat-stars-help').getAttribute('open'),null,`${width}: Stars help starts collapsed`);
      const metrics=await page.evaluate(()=>{
        const badge=document.querySelector('.cat-approved-badge'),message=document.querySelector('.cat-message'),pill=message.firstElementChild,card=document.querySelector('.cat-card'),preview=card.querySelector('.cat-preview'),body=card.querySelector('.cat-card-body');
        return {overflow:document.documentElement.scrollWidth-innerWidth,badgeLoaded:badge.complete&&badge.naturalWidth===1254,headerHeight:document.querySelector('.cat-header').getBoundingClientRect().height,galleryTop:document.querySelector('.cat-grid').getBoundingClientRect().top,galleryGap:document.querySelector('.cat-grid').getBoundingClientRect().top-document.querySelector('.cat-navigation').getBoundingClientRect().bottom,messageHeight:message.getBoundingClientRect().height,pillHeight:pill.getBoundingClientRect().height,pillRadius:getComputedStyle(pill).borderRadius,headerRight:Math.max(...[...document.querySelectorAll('.cat-header button')].map(e=>e.getBoundingClientRect().right)),identityRight:document.querySelector('.cat-header h1').getBoundingClientRect().right,messageLeft:message.getBoundingClientRect().left,cardHeight:card.getBoundingClientRect().height,previewHeight:preview.getBoundingClientRect().height,captionOverlay:getComputedStyle(body).position,activeColour:getComputedStyle(document.querySelector('.cat-tabs .active')).color};
      });
      assert.ok(metrics.overflow<=1,`${width}: no horizontal overflow`);
      assert.equal(metrics.badgeLoaded,true,`${width}: badge loads`);
      assert.ok(metrics.headerHeight<=45,`${width}: one compact header row`);
      assert.ok(metrics.galleryGap>=0&&metrics.galleryGap<=12,`${width}: gallery directly below categories`);
      assert.ok(metrics.messageHeight>=44&&metrics.pillHeight<=34,`${width}: small Message pill with a full touch target`);
      assert.equal(metrics.pillRadius,'9999px');
      assert.ok(metrics.headerRight<=width+1,`${width}: header actions fit`);
      assert.ok(metrics.identityRight<=metrics.messageLeft+1,`${width}: name does not overlap Message`);
      assert.ok(Math.abs(metrics.cardHeight-metrics.previewHeight)<1,`${width}: caption has no separate footer`);
      assert.equal(metrics.captionOverlay,'absolute');
      assert.equal(metrics.activeColour,'rgb(67, 184, 255)');
      assert.equal(await page.locator('.cat-daily-sale').count(),0,'No duplicate offer above the gallery');
      assert.equal(await page.locator('.cat-item-unlock').count(),0,'Gallery has one detail action per card');
      assert.equal(await page.locator('.cat-card').count(),7,'Trending retains the existing mixed gallery');
      assert.equal(await page.locator('.cat-card').nth(0).locator('.cat-video-preview').count(),0);
      assert.equal(await page.locator('.cat-card').nth(1).locator('.cat-video-preview').count(),1,'Photo and video share opening row');
      await page.screenshot({path:`${output}/trending-${width}.png`,fullPage:true,animations:'disabled'});
      if(width===390)await page.screenshot({path:`${output}/trending-390-viewport.png`,fullPage:false,animations:'disabled'});
      results.push({width,...metrics});
    }
    await page.setViewportSize({width:390,height:850});
    // Preserve the legacy path without forced navigation or repeated payable cards.
    const caption=await page.locator('.cat-grid .cat-card-description').first().boundingBox();
    await page.mouse.click(caption.x+caption.width/2,caption.y+caption.height/2);
    await page.screenshot({path:`${output}/chat-item-detail-390.png`,fullPage:false});
    await page.getByRole('button',{name:'Pay in Telegram · ⭐350',exact:true}).click();
    await page.getByRole('button',{name:'Open payment in chat',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.catalogueChatOpens),0,'Preparing payment never closes the Mini App or opens chat');
    assert.match(await page.getByRole('dialog',{name:'Item details'}).innerText(),/complete original caption/,'Chat payment retains full caption');
    let deliveredCount=requests.filter(r=>r.action==='request').length;
    assert.equal(deliveredCount,1);
    await page.getByRole('button',{name:'Open payment in chat',exact:true}).click();
    assert.equal(requests.filter(r=>r.action==='request').length,deliveredCount,'Paid retry never sends another item');
    await page.screenshot({path:`${output}/chat-payment-ready-390.png`,fullPage:false});
    await page.getByRole('button',{name:'Close item'}).click();
    await page.getByRole('button',{name:'Bundles',exact:true}).click();
    assert.equal(await page.locator('.cat-bundle-card').count(),1,'Previously featured bundle remains in Bundles');
    assert.equal(await page.locator('.cat-compact-bundle .cat-preview').count(),4,'Bundle summary shows four preview cards');
    assert.equal(await page.locator('.cat-bundle-stack-count').innerText(),'5 pics','Bundle summary retains the full item count');
    for(const preview of await page.locator('.cat-compact-bundle .cat-preview').all())await preview.locator('img').waitFor();
    await page.screenshot({path:`${output}/bundles-390.png`,fullPage:false});
    await page.getByRole('button',{name:'Pay in Telegram for 1,400 Stars',exact:true}).click();
    await page.getByRole('button',{name:'Open payment in chat',exact:true}).waitFor();
    deliveredCount=requests.filter(r=>r.action==='request').length;
    assert.equal(deliveredCount,2,'Bundle request made once');
    assert.match(await page.locator('.cat-notice').innerText(),/already in your chat/,'A previous bundle is explained, not reported as newly sent');
    await page.getByRole('button',{name:'Open payment in chat',exact:true}).click();
    assert.equal(requests.filter(r=>r.action==='request').length,deliveredCount,'Bundle retry never sends another bundle');
    await page.getByRole('button',{name:'Photos',exact:true}).click();
    await page.locator('.cat-card').filter({hasText:'Free introduction photo'}).locator('.cat-picture-button').click();
    await page.getByRole('button',{name:'Send free item to chat',exact:true}).click();
    await page.getByRole('button',{name:'Open item in chat',exact:true}).waitFor();
    deliveredCount=requests.filter(r=>r.action==='request').length;
    assert.equal(deliveredCount,3,'Free item delivered once');
    await page.getByRole('button',{name:'Open item in chat',exact:true}).click();
    assert.equal(requests.filter(r=>r.action==='request').length,deliveredCount,'Free item retry never sends another item');
    await page.getByRole('button',{name:'Close item'}).click();
    purchased.add('photo-0');
    await page.reload();
    await page.locator('.cat-grid .cat-picture-button').first().click();
    await page.getByRole('button',{name:'View in chat',exact:true}).click();
    assert.equal(requests.filter(r=>r.action==='request').length,deliveredCount,'Owned media opens chat without another delivery');
    assert.equal(await page.evaluate(()=>window.catalogueInvoiceOpens),0,'Live chat mode never opens native invoice');
    assert.equal(requests.filter(r=>r.action==='checkout'||r.action==='content').length,0,'Live chat mode never requests invoice or originals');
    purchased.clear();fixtureMode='invoice';
    const nativeRequestBaseline=requests.filter(r=>r.action==='request').length;
    await page.goto(`${origin}/catalogue/alanna-pow`);
    await page.getByRole('button',{name:'Photos',exact:true}).click();
    assert.equal(await page.locator('.cat-card').count(),6,'Free photo stays in Photos');
    await page.locator('.cat-grid .cat-preview img').first().waitFor();
    await page.screenshot({path:`${output}/invoice-photos-390.png`,fullPage:true});
    await page.locator('.cat-picture-button').filter({has:page.locator('.cat-preview')}).nth(1).click();
    assert.match(await page.getByRole('dialog',{name:'Item details'}).innerText(),/complete original caption/);
    await page.screenshot({path:`${output}/invoice-item-detail-390.png`,fullPage:true});
    const unlock=()=>page.getByRole('dialog',{name:'Item details'}).getByRole('button',{name:'Unlock · ⭐350',exact:true});
    await unlock().click();
    await page.getByText('Payment cancelled. You have not unlocked this item.',{exact:true}).waitFor();
    assert.equal(orders.size,1,'First click creates one order');
    assert.equal(requests.filter(r=>r.action==='content').length,0,'Cancellation does not expose content');
    await unlock().click();
    await page.getByText('Payment cancelled. You have not unlocked this item.',{exact:true}).waitFor();
    assert.equal(orders.size,1,'Cancelled retry reuses order');
    assert.equal(requests.filter(r=>r.action==='checkout').length,1,'Cancelled retry does not create another invoice');
    // An invoice callback alone is insufficient. Server must first confirm payment.
    await page.evaluate(()=>window.catalogueInvoiceStatus='paid');
    settle='paid';delaySettlement=3;contentFails=true;
    await unlock().click();
    await page.getByRole('button',{name:'Retry loading item',exact:true}).waitFor();
    assert.equal(orders.size,1);
    assert.equal(originalBeforePaid,false,'Telegram paid callback does not grant original access before server settlement');
    assert.equal(await page.locator('.cat-owned-media').count(),0);
    contentFails=false;
    await page.getByRole('button',{name:'Retry loading item',exact:true}).click();
    await page.locator('.cat-owned-media img').waitFor();
    assert.match(await page.getByRole('dialog',{name:'Item details'}).innerText(),/complete original caption/,'Caption remains with owned media');
    assert.equal(await page.evaluate(()=>window.catalogueChatOpens),0,'Invoice checkout stays in Mini App');
    assert.equal(requests.filter(r=>r.action==='request').length,nativeRequestBaseline,'Invoice checkout never enqueues chat delivery');
    await page.screenshot({path:`${output}/invoice-unlocked-390.png`,fullPage:true});
    await page.getByRole('button',{name:'Close item'}).click();
    await page.getByRole('button',{name:'My purchases',exact:true}).click();
    assert.equal(await page.locator('.cat-card').count(),1,'Confirmed purchase appears in owned collection');
    await page.screenshot({path:`${output}/invoice-my-purchases-390.png`,fullPage:true});
    await page.getByRole('button',{name:'Videos',exact:true}).click();
    assert.equal(await page.locator('.cat-card').count(),1);
    await page.locator('.cat-video-preview video').evaluate(video=>video.play());
    assert.ok(await page.locator('.cat-video-preview video').evaluate(video=>!video.paused&&video.readyState>=2),'Synthetic blurred preview actually plays');
    await page.screenshot({path:`${output}/invoice-videos-390.png`,fullPage:true});
    await page.locator('.cat-grid .cat-picture-button').first().click();
    await page.getByRole('dialog',{name:'Item details'}).getByRole('button',{name:'Unlock · ⭐800',exact:true}).click();
    await page.locator('.cat-owned-media video').waitFor();
    await page.locator('.cat-owned-media video').evaluate(video=>video.play());
    assert.ok(await page.locator('.cat-owned-media video').evaluate(video=>video.readyState>=2&&!video.paused),'Purchased video plays in the Mini App');
    assert.equal(await page.evaluate(()=>window.catalogueChatOpens),0);
    assert.equal(await page.evaluate(()=>window.catalogueCloses||0),0,'Payment never closes Mini App');
    await page.screenshot({path:`${output}/invoice-video-unlocked-390.png`,fullPage:true});
    await page.getByRole('button',{name:'Close item'}).click();
    purchased.clear();orders.clear();
    await page.reload();
    await page.getByRole('button',{name:'Bundles',exact:true}).click();
    await page.locator('.cat-bundle-details-button').click();
    assert.equal(await page.locator('.cat-bundle-included > .cat-picture-button').count(),5,'Bundle details show all five included photos');
    await page.locator('.cat-bundle-included .cat-preview img').first().waitFor();
    await page.screenshot({path:`${output}/invoice-bundle-detail-390.png`,fullPage:true});
    await page.getByRole('dialog',{name:'Bundle details'}).getByRole('button',{name:'Unlock · ⭐1,400',exact:true}).click();
    await page.getByText('Unlocked. Tap a photo to view it.',{exact:true}).waitFor();
    assert.equal(purchased.size,5,'Confirmed bundle grants all five photos');
    assert.equal(requests.filter(r=>r.action==='request').length,nativeRequestBaseline,'Bundle UI does not enqueue unpaid chat offers');
    await page.screenshot({path:`${output}/invoice-bundle-unlocked-390.png`,fullPage:true});
    await page.getByRole('button',{name:'Close bundle'}).click();
    await page.getByRole('button',{name:'Message me'}).click();
    assert.equal(await page.evaluate(()=>window.catalogueChatOpens),1,'Explicit chat action works');
    purchased.clear();receivedOnly=true;
    await page.reload();
    const originalReads=requests.filter(r=>r.action==='content').length;
    await page.locator('.cat-grid .cat-picture-button').first().click();
    await page.getByRole('button',{name:'View in chat',exact:true}).click();
    assert.equal(requests.filter(r=>r.action==='content').length,originalReads,'Received without purchased uses chat fallback, never requests protected original');
    receivedOnly=false;
    await page.goto(`${origin}/catalogue/briana-redd`);
    await page.getByRole('heading',{name:'Briana Redd'}).waitFor();
    assert.equal(await page.locator('.catalogue-compact').count(),0,'Other creator retains standard layout');
    await page.locator('.cat-picture-button').first().click();
    await page.getByRole('dialog',{name:'Item details'}).getByRole('button',{name:'Pay in Telegram · ⭐350',exact:true}).click();
    await page.getByRole('button',{name:'Open payment in chat',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.catalogueInvoiceOpens),0,'Legacy creator keeps chat checkout');
    const legacyRequests=requests.filter(r=>r.action==='request').length;
    await page.getByRole('button',{name:'Open payment in chat',exact:true}).click();
    assert.equal(requests.filter(r=>r.action==='request').length,legacyRequests,'Delivered legacy item is not enqueued again');
    assert.equal(legacyRequests,nativeRequestBaseline+1);
    assert.deepEqual(errors,[],'No client errors');
    await writeFile(`${output}/checks.json`,JSON.stringify(results,null,2));
    console.log('Alana UI passed: five widths, Trending label with unchanged mixed gallery, small Message pill, overlaid captions, full bundle under Bundles, scoped style, cancelled retry, confirmed native checkout, owned-media retry, retained captions, no unpaid chat offers and creator isolation. Fixtures only.');
  }finally{await browser?.close();server?.kill('SIGTERM');if(server)setTimeout(()=>server.kill('SIGKILL'),5000).unref()}
}
main().catch(e=>{console.error(e);process.exitCode=1});

