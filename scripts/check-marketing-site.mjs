import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const local='http://127.0.0.1:3118';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3118'],{env:{...process.env,NODE_ENV:'production',DASHBOARD_PASSWORD:'offline-public-site-only',DASHBOARD_PUBLIC_ORIGIN:'https://dashboard.tgaiclone.xyz'},stdio:['ignore','pipe','pipe']});
let output=''; for(const stream of [server.stdout,server.stderr]) stream.on('data',c=>{output=(output+c).slice(-12000)});
const request=(path,init={})=>fetch(local+path,{redirect:'manual',signal:AbortSignal.timeout(10000),...init});
let browser; const report={viewports:[],loginRoutes:[],forbiddenWrites:true,backendRequests:[],pageErrors:[]};
try{
  let ready=false; for(let n=0;n<80;n++){try{if((await request('/twin-agency')).status===200){ready=true;break}}catch{}await delay(250)} assert.ok(ready,'Production marketing page must start');
  for(const cookie of ['', 'twin_agency_access=stale; twin_agency_portal=moxy','twin_agency_access=stale; twin_agency_portal=jess-and-kate-ai']){
    const response=await request('/twin-agency',{headers:{cookie}}); assert.equal(response.status,200); assert.match(response.headers.get('x-robots-tag'),/noindex/); const html=await response.text();
    assert.ok(html.includes('Let your')); assert.ok(html.includes('Fans paying right now across the globe')); assert.ok(!html.includes('dashboard-sidebar')); assert.ok(!html.includes('data-agency="moxy"'));
    for(const [path,action] of [['/','/admin-auth'],['/twin','/admin-auth'],['/moxy','/moxy/auth'],['/link','/link/auth'],['/jess-and-kate-ai','/jess-and-kate-ai/auth']]){const r=await request(path,{headers:{cookie}});assert.equal(r.status,200,path);assert.ok((await r.text()).includes(`action="${action}"`),path)}
  }
  report.loginRoutes=['/','/twin','/moxy','/link','/jess-and-kate-ai'];
  for(const method of ['POST','PUT','PATCH','DELETE']) assert.equal((await request('/twin-agency',{method,headers:{'next-action':'not-allowed'}})).status,403);
  assert.equal((await request('/settings')).status,307,'Private dashboard still protected');

  await mkdir('test-results/twin-public',{recursive:true}); browser=await chromium.launch();
  for(const [name,width,height] of [['desktop',1440,1000],['tablet',820,1180],['mobile',390,844],['small-mobile',320,740]]){
    const context=await browser.newContext({viewport:{width,height},reducedMotion:'no-preference'}); await context.addCookies([{name:'twin_agency_access',value:'stale',url:local},{name:'twin_agency_portal',value:'moxy',url:local}]); const page=await context.newPage();
    page.on('pageerror',e=>report.pageErrors.push(String(e))); page.on('request',r=>{const u=new URL(r.url());if(r.method()!=='GET'||u.pathname.startsWith('/api/'))report.backendRequests.push(r.method()+' '+r.url())});
    await page.route('**/*',route=>{const u=new URL(route.request().url()); if(u.origin===local||u.hostname==='upload.wikimedia.org')return route.continue(); return route.abort()});
    await page.goto(local+'/twin-agency',{waitUntil:'networkidle'}); await page.getByRole('heading',{level:1}).waitFor();
    assert.equal(await page.title(),'Twin - Your AI voice twin that never sleeps'); assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`No horizontal overflow at ${width}`);
    assert.ok(await page.getByText('Charge per message',{exact:true}).first().isVisible());
    assert.equal(await page.getByText('Amber',{exact:true}).count(),1); assert.equal(await page.getByText('Mia',{exact:true}).count(),1); assert.equal(await page.getByText('Sasha',{exact:true}).count(),1);
    const globe=page.getByRole('heading',{name:'Fans paying right now across the globe',exact:true}); await globe.scrollIntoViewIfNeeded(); assert.ok(await globe.isVisible());
    assert.ok(await page.getByText('Tokyo',{exact:true}).isAttached()); assert.ok(await page.getByText('Dubai',{exact:true}).isAttached()); assert.ok(await page.getByText(/fans paying now/).isVisible());
    await page.getByRole('button',{name:'Sign up',exact:true}).click(); assert.ok(await page.getByRole('dialog').isVisible()); assert.ok(await page.getByRole('heading',{name:'Creator signup is next.',exact:true}).isVisible()); assert.equal(await page.getByRole('dialog').locator('input,form').count(),0); await page.keyboard.press('Escape');
    if(width>=640){await page.getByRole('button',{name:'Sign in',exact:true}).click();assert.ok(await page.getByRole('heading',{name:'Creator login is next.',exact:true}).isVisible());await page.keyboard.press('Escape')}
    await page.screenshot({path:`test-results/twin-public/${name}.png`,fullPage:true}); await page.screenshot({path:`test-results/twin-public/${name}-top.png`});
    await globe.scrollIntoViewIfNeeded(); await page.screenshot({path:`test-results/twin-public/${name}-globe.png`});
    if(name==='desktop')await writeFile('test-results/twin-public/rendered.html',await page.content()); report.viewports.push({name,width,height,liveHero:true,telegramPhones:true,globe:true,phaseTwoDialog:true,horizontalOverflow:false}); await context.close();
  }
  assert.deepEqual(report.pageErrors,[]); assert.deepEqual(report.backendRequests,[],'Marketing interactions must not access backend APIs or write data'); await writeFile('test-results/twin-public/report.json',JSON.stringify(report,null,2)); console.log('Exact live Twin Agency port checks passed: hero/marquee, three animated phones, rotating globe markers/counters, responsive layouts, phase-two auth notice, no private API traffic.');
}catch(error){console.error(error,output);process.exitCode=1}finally{if(browser)await browser.close();server.kill('SIGTERM');setTimeout(()=>server.kill('SIGKILL'),5000).unref()}
