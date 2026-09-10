// Production-build UI and real auth-handler redirect tests. No valid login,
// signup, password reset email, real account or database write is performed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const origin='http://127.0.0.1:3127';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3127'],{env:{...process.env,NODE_ENV:'production',DASHBOARD_PASSWORD:'offline-test-only',DASHBOARD_PUBLIC_ORIGIN:origin},stdio:['ignore','pipe','pipe']});
let output='';for(const stream of [server.stdout,server.stderr])stream.on('data',c=>output=(output+c).slice(-12000));
let browser;
try{
 let ready=false;for(let n=0;n<80;n++){try{if((await fetch(origin+'/creator/login?portal=link')).ok){ready=true;break}}catch{}await delay(250)}assert.ok(ready,'Production server started');
 for(const action of ['login','signup']){
  const res=await fetch(origin+'/creator-auth/'+action,{method:'POST',redirect:'manual',headers:{origin},body:new URLSearchParams({portal:'link',next:'https://evil.example',email:'',password:''})});
  assert.equal(res.status,303);assert.match(res.headers.get('set-cookie'),/creator_portal_brand=link/);
  const location=new URL(res.headers.get('location'));assert.equal(location.origin,origin);assert.equal(location.pathname,'/creator/'+action);assert.equal(location.searchParams.get('portal'),'link');
 }
 browser=await chromium.launch();await mkdir('test-results/link-creator-auth',{recursive:true});const results=[];
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:1000}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  for(const path of ['login','signup','forgot-password','reset-password']){
   await page.goto(origin+'/creator/'+path+'?portal=link',{waitUntil:'networkidle'});
   assert.match(await page.title(),/LYNQ/);assert.doesNotMatch(await page.locator('body').innerText(),/Twin/i);
   await page.locator('[data-lynq-core="particles"] canvas').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   for(const href of await page.locator('a[href^="/creator/"]').evaluateAll(els=>els.map(e=>e.getAttribute('href'))))assert.equal(new URL(href,origin).searchParams.get('portal'),'link');
   if(path==='login'){assert.equal(await page.locator('form').getAttribute('action'),'/creator-auth/login');assert.equal(await page.locator('input[name="email"]').count(),1);assert.equal(await page.locator('input[name="next"]').inputValue(),'/creator');await page.screenshot({path:`test-results/link-creator-auth/login-${width}.png`,fullPage:true})}
  }
  // A remembered Link creator must stay on the Link sign-in after sign-out.
  await context.addCookies([{name:'creator_portal_brand',value:'link',url:origin}]);
  await page.goto(origin+'/creator-auth/logout',{waitUntil:'networkidle'});assert.equal(new URL(page.url()).pathname,'/creator/login');assert.match(await page.title(),/LYNQ/);assert.doesNotMatch(await page.locator('body').innerText(),/Twin/i);
  // Explicit Twin entry still works; a presentation cookie does not rename it.
  await page.goto(origin+'/creator/login?portal=twin',{waitUntil:'networkidle'});assert.match(await page.title(),/Twin/);
  // Existing partner login still has its original, separate form action.
  await page.goto(origin+'/link',{waitUntil:'networkidle'});assert.equal(await page.locator('form').getAttribute('action'),'/link/auth');
  assert.deepEqual(errors,[]);results.push({width,linkScreens:4,originalParticles:true,logoutBrandPreserved:true,separateAgencyAuth:true,noRuntimeErrors:true});await context.close();
 }
 await writeFile('test-results/link-creator-auth/results.json',JSON.stringify(results,null,2));console.log('LINK CREATOR AUTH PASSED',JSON.stringify(results));
}catch(error){console.error(error,output);process.exitCode=1}finally{await browser?.close();server.kill('SIGTERM');setTimeout(()=>server.kill('SIGKILL'),5000).unref()}
