import assert from 'node:assert/strict';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import path from 'node:path';

const dir=path.resolve('artifacts/moxy-browser');await mkdir(dir,{recursive:true});
await build({entryPoints:['preview/moxy/App.tsx'],outfile:path.join(dir,'app.js'),bundle:true,jsx:'automatic',format:'iife',platform:'browser'});
const css=await postcss([tailwind()]).process(await readFile('app/globals.css','utf8'),{from:path.resolve('app/globals.css')});
await writeFile(path.join(dir,'style.css'),css.css);
const html='<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body><div id="root"></div><script src="/app.js"></script></body></html>';
const server=createServer(async(req,res)=>{const name=req.url==='/app.js'?'app.js':req.url==='/style.css'?'style.css':null;
res.setHeader('Content-Type',name?.endsWith('.js')?'text/javascript':name?'text/css':'text/html');res.end(name?await readFile(path.join(dir,name)):html)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});
try {
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
let mode='off',revision=1,ready=false,reader=false,fail=false,writes=0,lose=false;
await page.route('**/api/onlyfans-configuration/accounts/*/moxy',async route=>{
const account=route.request().url().split('/').at(-2);
if(route.request().method()==='POST'){
 writes++;const b=route.request().postDataJSON();assert.equal(b.expectedRevision,revision);assert.equal(b.actor,undefined);mode=b.mode;revision++;
 if(lose){lose=false;return route.abort('failed')}
 return route.fulfill({json:{ok:true,schemaVersion:'of-configuration.v3',accountId:account,moxy:{mode,revision,readiness:{ready,blockers:ready?[]:['real_inventory_mapping_incomplete']}}}});
}
if(fail)return route.fulfill({status:503,json:{ok:false,error:'Fixture configuration unavailable.'}});
return route.fulfill({json:{ok:true,schemaVersion:'of-configuration.v3',accountId:account,canManage:!reader,
 moxy:{engine:'moxy',moxySelected:true,mode,revision,readiness:{ready,blockers:ready?[]:['real_inventory_mapping_incomplete']},
 settings:{creator_key:account,products:[],sequences:{},catalogue_bindings:{},operational:{}},
 decisions:[{id:'fixture',fanId:101,kind:'campaign',status:'held',reason:'missing_approved_product_mapping',decision:null,intentId:null}]}}});
});
await page.goto(base);await page.locator('[data-moxy-mode]').waitFor();assert.equal(await page.locator('[data-owner]').textContent(),'true');
assert(await page.locator('option[value="on"]').evaluate(el=>el.disabled));await page.getByText('Recent decisions (1)',{exact:true}).click();
for(const width of [1280,390,320]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.screenshot({path:path.join(dir,`controls-${width}.png`),fullPage:true});}
await page.getByLabel('Mode',{exact:true}).selectOption('preview');await page.getByRole('button',{name:'Save mode'}).click();
await page.getByText('Moxy settings saved.',{exact:true}).waitFor();assert.equal(writes,1);assert.equal(mode,'preview');
ready=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByText('Configured prerequisites met',{exact:true}).waitFor();
await page.getByLabel('Mode',{exact:true}).selectOption('on');lose=true;await page.getByRole('button',{name:'Save mode'}).click();
await page.getByText(/save outcome is unconfirmed/i).waitFor();await page.locator('[data-moxy-mode="on"]').waitFor();assert.equal(writes,2);
reader=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByText('Read-only access.',{exact:true}).waitFor();assert(await page.getByRole('button',{name:'Save mode'}).isDisabled());
fail=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.locator('[data-owner]').textContent(),'null');
assert.equal(await page.getByRole('button',{name:'Save mode'}).count(),0);assert.deepEqual(errors,[]);
console.log('PASS rendered Moxy controls: 1280/390/320px, readiness gating, mode saves, uncertain acknowledgement refresh, read-only and unavailable states');
} finally {await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
