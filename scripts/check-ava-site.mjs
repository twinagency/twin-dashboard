import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const revision = 'compact-mobile-20260910';
const httpOnly = process.argv.includes('--http-only');
const port = 3128;
const origin = process.env.AVA_CHECK_ORIGIN || `http://127.0.0.1:${port}`;
const outputDir = 'test-results/twin-public/ava';
const viewportWidths = [320,360,375,390,414,430,480,640,680,681,768,900,1024,1280,1440,1920];

async function verifyPublicPage() {
  for (const path of ['/ava', '/ava/']) {
    const response = await fetch(`${origin}${path}?ava-check=${revision}`, { signal: AbortSignal.timeout(15000), headers: { 'Cache-Control': 'no-cache' } });
    assert.equal(response.status, 200, `${path}: public page returns 200`);
    assert.match(new URL(response.url).pathname, /^\/ava\/?$/, `${path}: must not redirect to a login`);
    const html = await response.text();
    assert.ok(html.includes(`data-ava-revision="${revision}"`), `${path}: correct released revision`);
    for (const text of ['Mia Vale','Sienna Rose','Earnings overview','384,729.84','72,441.18','Demo data','not actual earnings']) assert.ok(html.includes(text), `${path}: ${text}`);
    assert.doesNotMatch(html, /Tru Kait|True Kate|Riley Mae|Trusted by top creators|Demo creator testimonial/);
    assert.doesNotMatch(html, /<form\b/);
    console.log(`PUBLIC PASS ${path}: Ava revision ${revision}, no login redirect, fictional demo identities and earnings disclosure.`);
  }
}

async function main() {
  // Runs after the container swap. GET only; no browser or package install required.
  if (httpOnly) {
    assert.ok(process.env.AVA_CHECK_ORIGIN, 'Explicit public origin required for deployment smoke');
    for (let attempt=0; attempt<6; attempt++) {
      try { await verifyPublicPage(); return; }
      catch (error) { if (attempt===5) throw error; await delay(5000); }
    }
    return;
  }
  const source = await readFile('app/ava/page.tsx','utf8');
  assert.doesNotMatch(source, /supabase|serviceClient|supabaseAdmin|fetch\s*\(|["']use server["']|localStorage|sessionStorage|<form\b|<input\b|\u2014/);
  assert.ok(source.includes('IntelligenceCoreIcon'), 'Reuse the actual decorative core component');
  assert.ok(source.indexOf('import "./ava-mobile-compact.css"') > source.indexOf('import "./ava.css"'), 'Compact presentation is imported after the base styles');
  const compactCss = (await readFile('app/ava/ava-mobile-compact.css','utf8')).replace(/\/\*[\s\S]*?\*\//g,'').trim();
  assert.match(compactCss, /^@media\s*\(max-width:\s*680px\)\s*\{/);
  assert.equal((compactCss.match(/@media/g)||[]).length,1,'All new presentation rules use the same small-screen boundary');
  assert.doesNotMatch(compactCss, /:root|\.dashboard-sidebar|\.dashboard-main/, 'No private dashboard/global styling');
  const server = process.env.AVA_CHECK_ORIGIN ? null : spawn(process.execPath, ['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)], {
    env:{...process.env,NODE_ENV:'production',DASHBOARD_PASSWORD:'offline-ava-preview-only',NEXT_TELEMETRY_DISABLED:'1'}, stdio:['ignore','pipe','pipe']
  });
  let log='';
  if (server) for (const stream of [server.stdout,server.stderr]) stream.on('data',b=>{log=(log+b).slice(-12000);});
  let browser;
  try {
    let ready=false;
    for(let attempt=0;attempt<60;attempt++) {
      if(server && server.exitCode!==null) throw new Error(`Preview test server exited: ${log}`);
      try { if((await fetch(`${origin}/ava`,{signal:AbortSignal.timeout(1000)})).status===200) {ready=true;break;} } catch {}
      await delay(250);
    }
    assert.ok(ready,'Production preview must start');
    await verifyPublicPage();
    const { chromium } = await import('playwright');
    browser = await chromium.launch();
    const context = await browser.newContext({reducedMotion:'reduce'});
    const page = await context.newPage();
    const errors=[], forbiddenRequests=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{
      const url=new URL(request.url());
      if(request.method()!=='GET' || url.pathname.startsWith('/api/')) forbiddenRequests.push(`${request.method()} ${url.pathname}`);
    });
    await mkdir(outputDir,{recursive:true});
    const results=[];
    for(const width of viewportWidths) {
      await page.setViewportSize({width,height:900});
      await page.goto(`${origin}/ava`,{waitUntil:'networkidle'});
      await page.evaluate(()=>document.fonts.ready);
      await page.evaluate(()=>window.scrollTo(0,0));
      assert.equal(await page.locator('.ava-site').getAttribute('data-ava-revision'),revision);
      const body=await page.locator('.ava-site').innerText();
      for(const text of ['Hey handsome 💕','Good to see you here...','You got any new content? 😏','I do... want a little preview? 😉','This set is so hot 🔥','Unlock for $12','You’re amazing 😍','Should I send you a custom video?','Yes please 🔥','Just for you 💗']) assert.ok(body.includes(text),`Approved chat copy preserved: ${text}`);
      const dimensions=await page.evaluate(()=>({
        width:innerWidth, overflow:document.documentElement.scrollWidth-innerWidth,
        offscreen:[...document.querySelectorAll('.ava-site *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.left < -1||r.right>innerWidth+1);}).map(e=>String(e.className)),
        phones:[...document.querySelectorAll('.ava-phone')].map(e=>({width:e.offsetWidth,height:e.offsetHeight,visualWidth:e.getBoundingClientRect().width,visualHeight:e.getBoundingClientRect().height,overflow:e.querySelector('.ava-chat').scrollHeight-e.querySelector('.ava-chat').clientHeight})),
        phoneStageHeight:document.querySelector('.ava-phone-stage').getBoundingClientRect().height,
        heroVisualHeight:document.querySelector('.ava-hero-visual').getBoundingClientRect().height,
        dashboardWidth:document.querySelector('.ava-dashboard-frame').getBoundingClientRect().width,
        dashboardHeight:document.querySelector('.ava-dashboard-frame').getBoundingClientRect().height,
        previewHeight:document.querySelector('.ava-dashboard-preview').getBoundingClientRect().height,
        clippedNumbers:[...document.querySelectorAll('.ava-revenue-value,.ava-stars-value,.ava-balance-value')].some(e=>e.scrollWidth>e.clientWidth+1),
        actionHeights:[...document.querySelectorAll('.ava-button,.ava-mobile-nav summary')].filter(e=>e.offsetHeight>0).map(e=>e.getBoundingClientRect().height),
        moneyFont:parseFloat(getComputedStyle(document.querySelector('.ava-revenue-value strong')).fontSize),
        moneyColor:getComputedStyle(document.querySelector('.ava-revenue-value strong')).color,
        sidebar:getComputedStyle(document.querySelector('.ava-dashboard-sidebar')).display,
        displayedStats:[...document.querySelectorAll('.ava-dashboard-stats article')].filter(e=>e.offsetHeight>0).length,
        clippedChart:[...document.querySelectorAll('.ava-dashboard-bars>i')].some(e=>e.offsetHeight>document.querySelector('.ava-chart-plot').offsetHeight),
        wordmarkFont:getComputedStyle(document.querySelector('.ava-wordmark')).fontFamily,
      }));
      // Capture review evidence even when a size assertion fails.
      if([320,390,680,768,1440].includes(width)) {
        await page.screenshot({path:`${outputDir}/page-${width}.png`,fullPage:true,animations:'disabled'});
        await page.locator('.ava-dashboard-preview').screenshot({path:`${outputDir}/dashboard-${width}.png`,animations:'disabled'});
        await page.evaluate(()=>window.scrollTo(0,0));
      }
      console.log(`MEASURE ${width}: ${JSON.stringify(dimensions)}`);
      assert.ok(dimensions.overflow<=1,`${width}: no page overflow`);
      assert.deepEqual(dimensions.offscreen,[],`${width}: no content pushed off screen`);
      assert.equal(dimensions.phones.length,2);
      assert.ok(dimensions.phones.every(p=>p.overflow<=1),`${width}: chat content fits device`);
      assert.equal(dimensions.clippedChart,false,`${width}: chart bars contained at every breakpoint`);
      assert.equal(dimensions.moneyColor,'rgb(16, 140, 102)',`${width}: financial figures stay green`);
      assert.match(dimensions.wordmarkFont,/Georgia/,`${width}: real Ava serif wordmark, not inherited nav font`);
      if(width<=680) {
        assert.equal(dimensions.sidebar,'none');
        assert.equal(dimensions.displayedStats,2);
        // User requested smaller visual density, not another full-screen app.
        assert.ok(dimensions.moneyFont>=24&&dimensions.moneyFont<=25,`${width}: compact but prominent revenue`);
        assert.ok(dimensions.phones.every(p=>p.visualWidth<=122&&p.visualHeight<=242),`${width}: both phones visibly smaller`);
        assert.ok(dimensions.phoneStageHeight<=253,`${width}: compact phone composition`);
        assert.ok(dimensions.heroVisualHeight<=282,`${width}: no leftover blank space from scaling`);
        assert.ok(dimensions.dashboardWidth<=321,`${width}: inset dashboard preview`);
        assert.ok(dimensions.dashboardHeight<=390,`${width}: dashboard should not fill a mobile screen`);
        assert.ok(dimensions.previewHeight<=438,`${width}: full preview and disclosure remain compact`);
        assert.equal(dimensions.clippedNumbers,false,`${width}: full revenue, balance and Stars remain visible`);
        assert.ok(dimensions.actionHeights.every(h=>h>=44),`${width}: full-size touch targets preserved`);
        await page.locator('.ava-mobile-nav summary').click();
        assert.equal(await page.locator('.ava-mobile-nav').getAttribute('open'),'');
        assert.ok(await page.locator('.ava-mobile-nav nav').isVisible());
        await page.locator('.ava-mobile-nav summary').click();
      } else {
        assert.notEqual(dimensions.sidebar,'none');
        assert.equal(dimensions.displayedStats,6);
        assert.ok(dimensions.phones.every(p=>p.width===(width<=900?166:188)&&p.height===(width<=900?370:405)),`${width}: desktop/tablet phone dimensions unchanged`);
        const pixels=await page.locator('.ava-dashboard-core canvas').evaluate(canvas=>{
          const bytes=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
          let visible=0;for(let i=3;i<bytes.length;i+=4)if(bytes[i]>30)visible++;return visible;
        });
        assert.ok(pixels>50,`${width}: original animated core actually draws, not a blank placeholder`);
      }
      await page.locator('.ava-faq-items summary').first().click();
      assert.ok(await page.locator('.ava-faq-items details').first().locator('p').isVisible());
      await page.locator('.ava-faq-items summary').first().click();
      const beforeUrl=page.url();
      await page.locator('.ava-button').first().dispatchEvent('click');
      assert.equal(page.url(),beforeUrl,'CTA remains an unwired preview');
      results.push(dimensions);
      console.log(`LAYOUT PASS ${width}px: compact product previews, no overflow, chat copy intact, readable earnings, contained chart.`);
    }
    assert.deepEqual(errors,[],'No client-side errors');
    assert.deepEqual(forbiddenRequests,[],'Preview must never call private APIs or submit data');
    await writeFile(`${outputDir}/checks.json`,JSON.stringify(results,null,2));
    console.log(`Ava production browser checks passed: ${viewportWidths.length} viewport widths, compact mobile previews, unchanged desktop phone sizes, no private data calls, original core rendering and non-functional CTAs.`);
  } finally {
    await browser?.close();
    if(server) { server.kill('SIGTERM'); setTimeout(()=>server.kill('SIGKILL'),5000).unref(); }
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
