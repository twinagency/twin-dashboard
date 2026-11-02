// Render the real login shell, CSS module and form with all shared styles.
// Requests stay on localhost and credentials are dummy fixture values only.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { chromium } from 'playwright';

const root=process.cwd();
const out=path.join(root,'test-results/lynq-login');
mkdirSync(out,{recursive:true});
const fixture=`
import React from 'react';
import {createRoot} from 'react-dom/client';
import LoginShell from './app/lynq/LoginShell';
import LoginForm from './app/lynq/LoginForm';
const action=location.pathname==='/lynq'?'/lynq/auth':'/link/auth';
createRoot(document.getElementById('root')).render(<LoginShell><LoginForm action={action} initialError={new URLSearchParams(location.search).has('error')}/></LoginShell>);
`;
const built=await build({stdin:{contents:fixture,resolveDir:root,sourcefile:'lynq-login-fixture.tsx',loader:'tsx'},
  bundle:true,write:false,outfile:path.join(out,'bundle.js'),format:'iife',platform:'browser',jsx:'automatic',
  alias:{'@':root},define:{'process.env.NODE_ENV':'"production"'},loader:{'.css':'local-css'}});
const javascript=built.outputFiles.find(f=>f.path.endsWith('.js')).text;
const moduleCss=built.outputFiles.find(f=>f.path.endsWith('.css')).text;
const globals=await postcss([tailwind()]).process('@import "./app/globals.css";\n@import "./app/jess-kate-theme.css";',{from:path.join(root,'lynq-login-verification.css')});
const css=globals.css+'\n'+moduleCss;
const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><style>body{margin:0;font-family:Arial,sans-serif}html{--font-sans:Arial;--font-display:Arial}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>';
const server=createServer((req,res)=>{
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/styles.css'){res.setHeader('Content-Type','text/css');res.end(css);}
  else if(url.pathname==='/bundle.js'){res.setHeader('Content-Type','application/javascript');res.end(javascript);}
  else {res.setHeader('Content-Type','text/html');res.end(html);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch();
const results=[];
try {
  for(const width of [360,390,1440]) {
    const page=await browser.newPage({viewport:{width,height:900},colorScheme:'dark'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/link',{waitUntil:'networkidle'});
    await page.locator('[data-lynq-login]').waitFor();
    const state=await page.evaluate(()=>{
      const scene=document.querySelector('[data-lynq-login]');
      const card=document.querySelector('[data-login-card]');
      const form=card.querySelector('form');
      const input=form.querySelector('input');
      return {background:getComputedStyle(scene).backgroundColor,scheme:getComputedStyle(scene).colorScheme,card:getComputedStyle(card).backgroundColor,text:getComputedStyle(card).color,wash:getComputedStyle(document.querySelector('[data-login-wash]')).backgroundImage,button:getComputedStyle(form.querySelector('button')).backgroundImage,action:form.getAttribute('action'),fontSize:getComputedStyle(input).fontSize,required:input.required,autocomplete:input.autocomplete,overflow:document.documentElement.scrollWidth>innerWidth};
    });
    assert.equal(state.background,'rgb(250, 249, 252)');assert.equal(state.scheme,'light');
    assert.equal(state.card,'rgb(255, 255, 255)');assert.equal(state.text,'rgb(25, 25, 31)');
    assert.match(state.wash,/255, 139, 53/);assert.match(state.wash,/233, 75, 156/);assert.match(state.wash,/63, 85, 255/);
    assert.match(state.button,/41, 59, 234/);assert.equal(state.action,'/link/auth');
    assert.equal(state.fontSize,'16px');assert.equal(state.required,true);assert.equal(state.autocomplete,'current-password');assert.equal(state.overflow,false);
    assert.equal(await page.locator('canvas').count(),1,'Only the original compact animation');
    const core=page.locator('[data-lynq-core] canvas');
    assert.equal((await core.boundingBox()).width,40);
    const frame=await core.evaluate(c=>c.toDataURL());await page.waitForTimeout(180);
    assert.notEqual(await core.evaluate(c=>c.toDataURL()),frame,'Original particle animation still runs');
    await page.screenshot({path:path.join(out,`login-${width}.png`),fullPage:true});
    await page.getByLabel('Password',{exact:true}).fill('visual-fixture-only');
    let release;
    const hold=new Promise(resolve=>{release=resolve});
    await page.route('**/link/auth',async route=>{
      assert.equal(route.request().method(),'POST');
      assert.ok(route.request().postData().includes('visual-fixture-only'));
      await hold;
      await route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'credentials'})});
    });
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.getByRole('button',{name:'Signing in…',exact:true}).waitFor();
    assert.equal(await page.getByLabel('Password',{exact:true}).isDisabled(),true);
    release();
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').textContent(),/wasn’t accepted/);
    assert.equal(await page.getByRole('button',{name:'Sign in',exact:true}).isEnabled(),true);
    await page.goto(origin+'/lynq?error=1',{waitUntil:'networkidle'});
    assert.equal(await page.locator('form').getAttribute('action'),'/lynq/auth');
    assert.match(await page.getByRole('alert').textContent(),/Unable to sign in/);
    assert.deepEqual(errors,[]);results.push({width,...state,animation:true,pendingAndErrorHandling:true});
    await page.close();
  }
  const reduced=await browser.newPage({viewport:{width:390,height:400},reducedMotion:'reduce'});
  await reduced.goto(origin+'/link',{waitUntil:'networkidle'});
  assert.equal(await reduced.locator('[data-login-wash]').evaluate(e=>getComputedStyle(e).animationName),'none');
  await reduced.getByRole('button',{name:'Sign in',exact:true}).scrollIntoViewIfNeeded();
  assert.equal(await reduced.getByRole('button',{name:'Sign in',exact:true}).isVisible(),true);
  assert.equal(await reduced.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await reduced.close();
  writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
  console.log('LYNQ login passed: matching light palette, mobile and desktop layouts, original animated particles, unchanged auth endpoints, pending/errors and reduced motion.');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
