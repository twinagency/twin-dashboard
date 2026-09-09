import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Local production build only. No production credentials or real account writes.
const local = 'http://127.0.0.1:3118';
const origin = 'https://dashboard.tgaiclone.xyz';
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3118'], {
  env: { ...process.env, NODE_ENV: 'production', DASHBOARD_PASSWORD: 'offline-public-site-only', DASHBOARD_PUBLIC_ORIGIN: origin },
  stdio: ['ignore','pipe','pipe'],
});
let output = '';
for (const stream of [server.stdout,server.stderr]) stream.on('data',chunk => { output = (output + chunk).slice(-12000); });
const request = (path,init={}) => fetch(local+path,{redirect:'manual',signal:AbortSignal.timeout(10000),...init});
let browser;
const report = { viewports: [], loginRoutes: [], forbiddenWrites: true, backendRequests: [], pageErrors: [] };
try {
  let ready=false;
  for (let n=0;n<80;n++) { try { if ((await request('/twin-agency')).status===200) {ready=true;break;} } catch {} await delay(250);
  }
  assert.ok(ready,'Production marketing page must start');
  const cookies = ['', 'twin_agency_access=stale; twin_agency_portal=moxy', 'twin_agency_access=stale; twin_agency_portal=jess-and-kate-ai'];
  for (const cookie of cookies) {
    const response = await request('/twin-agency',{headers:{cookie}});
    assert.equal(response.status,200);
    assert.match(response.headers.get('x-robots-tag'),/noindex/);
    const html=await response.text();
    assert.ok(html.includes('Your audience. Your AI twin.'));
    assert.ok(!html.includes('dashboard-sidebar'));
    assert.ok(!html.includes('data-agency="moxy"'));
    assert.ok(!html.includes('An error occurred in the Server Components render'));
    for (const [path,action] of [['/','/admin-auth'],['/twin','/admin-auth'],['/moxy','/moxy/auth'],['/link','/link/auth'],['/jess-and-kate-ai','/jess-and-kate-ai/auth']]) {
      const r=await request(path,{headers:{cookie}});
      assert.equal(r.status,200,path);
      assert.ok((await r.text()).includes(`action="${action}"`),path);
    }
  }
  report.loginRoutes=['/','/twin','/moxy','/link','/jess-and-kate-ai'];
  for (const method of ['POST','PUT','PATCH','DELETE']) assert.equal((await request('/twin-agency',{method,headers:{'next-action':'not-allowed'}})).status,403);
  assert.equal((await request('/settings')).status,307,'Private dashboard still protected');
  await mkdir('test-results/twin-public',{recursive:true});
  browser=await chromium.launch();
  for (const [name,width,height] of [['desktop',1440,1000],['tablet',820,1180],['mobile',390,844],['small-mobile',320,740]]) {
    const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
    await context.addCookies([{name:'twin_agency_access',value:'stale',url:local},{name:'twin_agency_portal',value:'moxy',url:local}]);
    const page=await context.newPage();
    page.on('pageerror',e=>report.pageErrors.push(String(e)));
    page.on('request',r=>{if(r.method()!=='GET'||new URL(r.url()).pathname.startsWith('/api/'))report.backendRequests.push(r.method()+' '+r.url());});
    await page.route('**/*',route=>new URL(route.request().url()).origin===local?route.continue():route.abort());
    await page.goto(local+'/twin-agency',{waitUntil:'networkidle'});
    await page.getByRole('heading',{level:1}).waitFor();
    assert.ok(await page.getByRole('heading',{level:1}).isVisible());
    assert.equal(await page.title(),'Twin Agency | Your audience. Your AI twin.');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`No horizontal overflow at ${width}`);
    await page.getByRole('button',{name:'Paid content',exact:true}).click();
    await page.getByRole('button',{name:'Preview the unlock',exact:true}).click();
    assert.ok(await page.getByText('Demo only. No payment was taken.',{exact:true}).isVisible());
    await page.getByRole('button',{name:'Voice',exact:true}).click();
    assert.ok(await page.getByText('Visual example',{exact:true}).isVisible());
    await page.getByRole('button',{name:'Conversations',exact:true}).first().click();
    await page.getByRole('button',{name:'Content',exact:true}).click();
    assert.ok(await page.getByText('One library. More possibilities.',{exact:true}).isVisible());
    await page.getByRole('button',{name:'Conversations',exact:true}).last().click();
    assert.ok(await page.getByText('Keep the conversation in view.',{exact:true}).isVisible());
    await page.getByRole('button',{name:'Overview',exact:true}).click();
    const toggle=page.getByRole('switch',{name:'Optional voice replies',exact:true});
    assert.equal(await toggle.getAttribute('aria-checked'),'false');
    await toggle.click(); assert.equal(await toggle.getAttribute('aria-checked'),'true'); await toggle.click();
    const question=page.locator('summary').filter({hasText:'Do I need to clone my voice?'});
    await question.click(); assert.ok(await page.getByText('No. Start with text conversations and your content.',{exact:false}).isVisible()); await question.click();
    await page.getByRole('button',{name:'Sign up',exact:true}).click();
    assert.ok(await page.getByRole('dialog').isVisible());
    assert.equal(await page.getByRole('dialog').locator('input,form').count(),0);
    await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(),0);
    if(width<=760){await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('button',{name:'Creator log in',exact:true}).click();}else{await page.getByRole('button',{name:'Log in',exact:true}).click();}
    assert.ok(await page.getByRole('heading',{name:'Your creator space.',exact:true}).isVisible());
    await page.getByRole('button',{name:'Close dialog',exact:true}).click();
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:`test-results/twin-public/${name}.png`,fullPage:true});
    await page.screenshot({path:`test-results/twin-public/${name}-top.png`});
    if(name==='desktop') await writeFile('test-results/twin-public/rendered.html',await page.content());
    report.viewports.push({name,width,height,interactiveChecks:'passed',horizontalOverflow:false});
    await context.close();
  }
  assert.deepEqual(report.pageErrors,[]);
  assert.deepEqual(report.backendRequests,[],'Marketing interactions must not access backend APIs or write data');
  await writeFile('test-results/twin-public/report.json',JSON.stringify(report,null,2));
  console.log('Public site production/browser checks passed: desktop/tablet/mobile, product previews, menu/dialogs/FAQ, no data calls or horizontal overflow, independent existing logins.');
} catch(error) { console.error(error,output);process.exitCode=1; }
finally { if(browser)await browser.close();server.kill('SIGTERM');setTimeout(()=>server.kill('SIGKILL'),5000).unref(); }
