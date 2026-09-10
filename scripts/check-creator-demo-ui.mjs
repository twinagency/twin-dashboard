// Browser test of the actual production components with generated demo data.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import {chromium} from 'playwright';
import {creatorDemoData,creatorDemoInsight} from '../lib/creator-demo-data.ts';
const root=process.cwd(),out='test-results/zane-demo';mkdirSync(out,{recursive:true});
const navigation=`import {useSyncExternalStore} from 'react';const sub=f=>{addEventListener('popstate',f);return()=>removeEventListener('popstate',f)};export const usePathname=()=>useSyncExternalStore(sub,()=>location.pathname);export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({refresh(){},push(p){history.pushState({},'',p);dispatchEvent(new PopStateEvent('popstate'))}});`;
const link=`import React from 'react';export default function Link({children,href,onClick,...props}){return <a href={href} {...props} onClick={e=>{onClick?.(e);e.preventDefault()}}>{children}</a>}`;
const fixture=`import React from 'react';import{createRoot}from'react-dom/client';import Shell from'./components/CreatorWorkspaceShell';import Revenue from'./components/RevenueDashboard';import Fix from'./components/RevenueTooltipFix';import Banner from'./components/CreatorDemoBanner';document.documentElement.dataset.brandTheme='lynq-light';document.documentElement.dataset.creatorWorkspace='true';createRoot(document.getElementById('root')).render(<Shell agencyName="LYNQ" creatorName="ZANE" connected={true} allTimeStars={10000}><Banner/><Fix/><Revenue cloneId="demo-zane"/></Shell>);`;
const bundle=await build({stdin:{contents:fixture,resolveDir:root,sourcefile:'zane-demo-fixture.tsx',loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':root},define:{'process.env.NODE_ENV':'"production"'},banner:{js:'var process={env:{NODE_ENV:"production",NEXT_PUBLIC_REPORT_TIMEZONE:"Australia/Sydney"},browser:true};'},plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^(next\/link|next\/navigation)$|(?:^|\/)TwinAssistant(?:\.tsx)?$/},args=>({path:args.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'jsx',resolveDir:root,contents:args.path.includes('TwinAssistant')?'export default function Assistant(){return null}':args.path==='next/link'?link:navigation}));}}]});
const css=await postcss([tailwind()]).process('@import "./app/globals.css";\n@import "./app/jess-kate-theme.css";\n@import "./app/creator-workspace.css";',{from:path.join(root,'zane-verification.css')});
const requests=[],responses=[];
const server=createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/styles.css'){res.setHeader('content-type','text/css');return res.end(css.css)}
 if(u.pathname==='/bundle.js'){res.setHeader('content-type','application/javascript');return res.end(bundle.outputFiles[0].text)}
 if(u.pathname.startsWith('/api/')){
  requests.push(u.pathname);res.setHeader('content-type','application/json');
  if(u.pathname==='/api/fx')return res.end(JSON.stringify({rate:1.5,audPerUsd:1.5}));
  if(u.pathname==='/api/dashboard'){const d=creatorDemoData(u.searchParams.get('period')||'1M');responses.push(d);return res.end(JSON.stringify(d))}
  if(u.pathname==='/api/dashboard/day-insight')return res.end(JSON.stringify(creatorDemoInsight(u.searchParams.get('date'))));
  res.statusCode=403;return res.end(JSON.stringify({error:'No live service allowed in the demo UI test'}));
 }
 res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><style>html{--font-sans:Arial;--font-display:Arial}body{margin:0;font-family:Arial}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch();const evidence=[];
try{
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:1000},colorScheme:'light'}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  try{
   await page.goto(origin+'/creator',{waitUntil:'networkidle'});await page.locator('.recharts-wrapper').first().waitFor();
   await page.locator('[data-creator-demo]').waitFor();assert.match(await page.locator('[data-creator-demo]').innerText(),/not real payments/);
   assert.ok(!(await page.locator('body').innerText()).includes('This window could not be loaded'));
   assert.ok(!(await page.locator('body').innerText()).includes('Fleet · Star revenue'));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   const before=responses.at(-1).totals.stars;
   await Promise.all([page.waitForResponse(r=>r.url().includes('period=1W')),page.getByRole('button',{name:'1W',exact:true}).click()]);
   assert.notEqual(responses.at(-1).totals.stars,before);
   await page.getByRole('button',{name:'Line chart',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Line chart',exact:true}).getAttribute('aria-pressed'),'true');await page.getByRole('button',{name:'Bar chart',exact:true}).click();
   await Promise.all([page.waitForResponse(r=>r.url().includes('fresh=force')),page.getByRole('button',{name:'Refresh',exact:true}).click()]);
   await page.getByRole('button',{name:/Full revenue report/i}).click();
   for(const title of ['What sells','Who pays','Peak hours','Peak days','Paid-message paywall','Buyer breakdown'])await page.getByRole('heading',{name:new RegExp('^'+title,'i')}).waitFor();
   for(const kind of ['Photos','Videos','Bundles']){
    const button=page.getByRole('button',{name:new RegExp(kind+'.*View purchased items','i')});await button.click();
    const dialog=page.getByRole('dialog');await dialog.waitFor();assert.match(await dialog.innerText(),/\(demo\)/);await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
   }
   await page.getByRole('heading',{name:/^What sells/i}).scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/zane-${width}-report.png`,fullPage:true});
   const daily=page.getByRole('button',{name:/Daily earnings analysis compared/i});await daily.click();
   await page.getByText('ZANE demo earnings comparison',{exact:true}).waitFor();
   await page.locator('.dashboard-main').evaluate(el=>el.scrollTop=0);await page.screenshot({path:`${out}/zane-${width}-earnings.png`,fullPage:true});
   const logo=page.locator('[data-lynq-core] canvas:visible').first();const first=await logo.evaluate(c=>c.toDataURL());await page.waitForTimeout(150);assert.notEqual(await logo.evaluate(c=>c.toDataURL()),first);
   assert.deepEqual(errors,[]);assert.ok(requests.every(p=>['/api/dashboard','/api/dashboard/day-insight','/api/fx'].includes(p)),'No real avatar, media, Telegram or other API requests');
   evidence.push({width,fullReport:true,threePurchasedCategoryDrilldowns:true,dailyComparison:true,dateChanges:true,refresh:true,demoLabel:true,originalParticles:true,noRuntimeErrors:true});
  }catch(e){await page.screenshot({path:`${out}/failure-${width}.png`,fullPage:true});writeFileSync(`${out}/failure-${width}.json`,JSON.stringify({error:String(e),errors,text:await page.locator('body').innerText()},null,2));throw e}finally{await page.close()}
 }
 writeFileSync(`${out}/results.json`,JSON.stringify(evidence,null,2));console.log('ZANE DEMO BROWSER PASSED',JSON.stringify(evidence));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
