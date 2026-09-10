// Real creator components with synthetic, local-only API responses.
// No production sessions, accounts, data or authentication bypass are created.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { chromium } from 'playwright';
const root=process.cwd(),out=path.join(root,'test-results/creator-workspace');
mkdirSync(out,{recursive:true});
const own='33333333-3333-4333-8333-333333333333';
const stats={stars:22000,grossPaymentStars:22000,sales:6,newFans:18,activeUsers:15,totalFans:18,reachable24h:8,messages:120,buyers:3,repeatPct:1/3,costUsd:0,aiCalls:50,aiErrors:0};
const funnel={fans:18,buyers:3,repeat:1,oneTime:2,threePlus:1,nonBuyers:15,totalPurchases:6,buyerPct:1/6,repeatPct:1/3,oneTimePct:2/3,avgPurchasesPerBuyer:2,avgStarsPerBuyer:22000/3,medianStarsPerBuyer:7000,repeatRevenueShare:.3};
const source=readFileSync('components/RevenueDashboard.tsx','utf8');
const signals=Object.fromEntries([...source.matchAll(/\bf\.([A-Za-z0-9_]+)/g)].map(match=>[match[1],0]));
const byFeature=[['credits','Paid messages',4000,2],['photo','Paid photo',10000,2],['video','Paid video',5000,1],['bundle','Bundle',3000,1],['tip','Tips',0,0],['subscription','VIP subscription',0,0],['media','Media (untagged)',0,0],['other','Other',0,0]].map(([key,label,stars,sales])=>({key,label,stars,sales,avgStars:sales?stars/sales:0,share:stars/22000}));
// Production rollups always include hourly and weekday buckets. Empty arrays
// with positive revenue were an invalid fixture, not a rendering contract.
const byHour=Array.from({length:24},(_,hour)=>({hour,label:`${hour}:00`,stars:hour===21?22000:0,sales:hour===21?6:0}));
const byDow=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((label,dow)=>({dow,label,stars:dow===4?22000:0,sales:dow===4?6:0}));
const payload={period:'1M',clones:[{id:own,name:'Fixture Creator',slug:'fixture',color:'#148c6b',stars:22000}],bucketLabels:['Sep 8','Sep 9','Sep 10'],series:[{bucket:'Sep 8',[own]:12000},{bucket:'Sep 9',[own]:6000},{bucket:'Sep 10',[own]:4000}],recent:[],totals:stats,perClone:{[own]:stats},balance:{lifetimeStars:22000,totalBalanceStars:20000},cachedAt:Date.now(),ageSeconds:0,stale:false,analytics:{period:'1M',costIncluded:false,totals:{revenueStars:22000,costUsd:0,profitUsd:0,sales:6,fans:18,buyers:3},clones:[{id:own,name:'Fixture Creator',color:'#148c6b',revenueStars:22000,costUsd:0,profitUsd:0,sales:6,margin:0}],byKind:[],byFeature,paywallFunnel:{collecting:true,messaged:15,paywalled:0,purchased:0,paidMessageBuyers:2,paidMessagePurchases:2,paidMessageStars:4000,paywallViews:0,abandoned:0,paywallPct:0,purchasePct:0,overallPct:0,avgViewsPerFan:0},buyerConversion:{lifetimeFanProfiles:18,lifetimeBuyerProfiles:3,lifetimeBuyerRate:1/6,activeChatters:15,activeChatBuyers:3,activeChatBuyerRate:.2,activeBuyerProfiles7d:3,activeBuyerEngagement7d:1,purchaseMix:[]},conversationFunnel:{...signals,collecting:true},byFlow:[],byDay:[],byHour,byDow,byTier:[],whaleFans:[],topWeeklySpenders:[],weeklySpenderSummary:{buyers:0,stars:0,purchases:0,avgStars:0},funnel}};
const fixture=`
import React from 'react';import {createRoot} from 'react-dom/client';import {usePathname} from 'next/navigation';
import Shell from './components/CreatorWorkspaceShell';import Revenue from './components/RevenueDashboard';import Fix from './components/RevenueTooltipFix';import Identity from './components/CreatorIdentityEditor';import Media from './components/CreatorMediaLibrary';
const agencyName=new URLSearchParams(location.search).get('brand')==='LYNQ'?'LYNQ':'Tether';
document.documentElement.dataset.creatorWorkspace='true';
if(agencyName==='LYNQ'){document.documentElement.dataset.brandTheme='lynq-light';document.documentElement.dataset.agency='lynq'}
function App(){const p=usePathname();return <Shell agencyName={agencyName} creatorName="Fixture Creator" connected={true} allTimeStars={22000}><p className="mb-3 text-xs text-muted">Interface verification · synthetic test data</p>{p==='/creator/edit'?<Identity clone={{name:'Fixture Creator',intake:{fields:{},answers:''}}} revision="fixture-revision"/>:p==='/creator/ppvs'?<Media items={[]}/>:p==='/creator'?<><Fix/><Revenue cloneId="${own}"/></>:<h2>{p.split('/').pop()} · fixture route</h2>}</Shell>};createRoot(document.getElementById('root')).render(<App/>);
`;
const navigationMock=`
import {useSyncExternalStore} from 'react';
const subscribe=f=>{addEventListener('popstate',f);return()=>removeEventListener('popstate',f)};
export const usePathname=()=>useSyncExternalStore(subscribe,()=>location.pathname);
export const useSearchParams=()=>new URLSearchParams(location.search);
const router={refresh(){},push(p){history.pushState({},'',p);dispatchEvent(new PopStateEvent('popstate'))},replace(p){history.replaceState({},'',p);dispatchEvent(new PopStateEvent('popstate'))}};
export const useRouter=()=>router;
`;
const linkMock=`import React from 'react';export default function Link({children,href,onClick,...props}){return <a {...props} href={href} onClick={e=>{onClick?.(e);if(!e.defaultPrevented&&!e.metaKey&&!e.ctrlKey){e.preventDefault();history.pushState({},'',href);dispatchEvent(new PopStateEvent('popstate'));}}}>{children}</a>}`;
const bundle=await build({stdin:{contents:fixture,resolveDir:root,sourcefile:'creator-ui-fixture.tsx',loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':root},define:{'process.env.NODE_ENV':'"production"'},banner:{js:'var process={env:{NODE_ENV:"production",NEXT_PUBLIC_REPORT_TIMEZONE:"Australia/Sydney"},browser:true};'},plugins:[{name:'local-navigation',setup(b){
 b.onResolve({filter:/^(next\/link|next\/navigation)$|(?:^|\/)TwinAssistant(?:\.tsx)?$/},args=>({path:args.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'jsx',resolveDir:root,contents:args.path.includes('TwinAssistant')?'export default function Assistant(){return null}':args.path==='next/link'?linkMock:navigationMock}));
}}]});
const css=await postcss([tailwind()]).process('@import "./app/globals.css";\n@import "./app/jess-kate-theme.css";\n@import "./app/creator-workspace.css";',{from:path.join(root,'creator-verification.css')});
const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><style>body{margin:0;font-family:Arial,sans-serif}html{--font-sans:Arial;--font-display:Arial}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>';
const requests=[];
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/styles.css'){res.setHeader('Content-Type','text/css');return res.end(css.css)}
 if(url.pathname==='/bundle.js'){res.setHeader('Content-Type','application/javascript');return res.end(bundle.outputFiles[0].text)}
 if(url.pathname.startsWith('/api/')||url.pathname==='/creator-auth/identity'){
  res.setHeader('Content-Type','application/json');requests.push({path:url.pathname,search:url.search,method:req.method});
  if(url.pathname==='/api/dashboard')return res.end(JSON.stringify({...payload,period:url.searchParams.get('period')||'CUSTOM'}));
  if(url.pathname==='/api/fx')return res.end(JSON.stringify({rate:1.4,audPerUsd:1.4}));
  if(url.pathname==='/creator-auth/identity'){req.resume();return res.end(JSON.stringify({ok:true}))}
  res.statusCode=503;return res.end(JSON.stringify({error:'No live service in local UI test'}));
 }
 res.setHeader('Content-Type','text/html');res.end(html);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const evidence=[];
try{
 for(const brand of ['LYNQ','Tether'])for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:1000},colorScheme:'light'});const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error('Browser runtime error:',error.stack)});
  const prefix=`${brand.toLowerCase()}-creator-${width}`;
  try {
   await page.goto(origin+'/creator?brand='+brand,{waitUntil:'networkidle'});
   await page.getByRole('heading',{name:/^Earnings overview/}).waitFor();
   await page.locator('.recharts-wrapper').first().waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal document overflow');
   for(const period of ['1W','1D','2W','3M','6M','1Y','All','1M']){
    const response=page.waitForResponse(r=>r.url().includes('/api/dashboard?'));
    await page.getByRole('button',{name:period,exact:true}).click();await response;
    assert.ok(requests.some(r=>r.path==='/api/dashboard'&&new URLSearchParams(r.search).get('period')===period.toUpperCase()&&new URLSearchParams(r.search).get('clone')===own));
   }
   await page.getByRole('button',{name:'Line chart',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Line chart',exact:true}).getAttribute('aria-pressed'),'true');
   await page.getByRole('button',{name:'Bar chart',exact:true}).click();
   const refreshResponse=page.waitForResponse(r=>r.url().includes('fresh=force'));
   await page.getByRole('button',{name:'Refresh',exact:true}).click();await refreshResponse;
   const report=page.getByRole('button',{name:/revenue report/i}).first();await report.click();assert.equal(await report.getAttribute('aria-expanded'),'true');
   for(const title of ['What sells','Who pays','Peak hours','Peak days','Paid-message paywall','Buyer breakdown'])await page.getByRole('heading',{name:new RegExp('^'+title,'i')}).waitFor();
   assert.deepEqual(errors,[],'Every full report section must render without runtime errors');
   await page.getByRole('heading',{name:/^What sells/i}).scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(out,prefix+'-full-report.png'),fullPage:true});
   for(let item=0;item<3;item++){
    await page.getByRole('button',{name:/View purchased items/}).nth(item).click();
    const dialog=page.getByRole('dialog');await dialog.waitFor();
    await dialog.getByRole('heading',{name:/Purchased (photos|videos|bundles)/}).waitFor();
    await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
   }
   await page.locator('.dashboard-main').evaluate(el=>el.scrollTop=0);
   await page.screenshot({path:path.join(out,prefix+'-earnings.png'),fullPage:true});
   if(width<1024)await page.getByRole('button',{name:'Open navigation',exact:true}).click();
   const nav=page.locator('.creator-sidebar:visible');await nav.waitFor();
   assert.deepEqual(await nav.locator('nav a').allTextContents(),['Earnings','PPVs','Business','Info','Logs','Edit']);
   const canvas=nav.locator('[data-creator-core="hero"] canvas');const first=await canvas.evaluate(c=>c.toDataURL());await page.waitForTimeout(150);assert.notEqual(await canvas.evaluate(c=>c.toDataURL()),first,'Sphere animates');
   assert.ok(Math.abs((await canvas.boundingBox()).width-85.76)<1,'Same 64px × 1.34 core size as Ava');
   if(brand==='LYNQ'){
    const logo=nav.locator('[data-lynq-core="particles"] canvas');
    assert.equal((await logo.boundingBox()).width,48,'Use the original 48px LYNQ wordmark particle component');
    const frame=await logo.evaluate(c=>c.toDataURL());await page.waitForTimeout(150);assert.notEqual(await logo.evaluate(c=>c.toDataURL()),frame,'Original LYNQ header particles animate');
    const blue=await logo.evaluate(c=>getComputedStyle(c).getPropertyValue('--intelligence-core-front-rgb').replace(/\s/g,''));assert.equal(blue,'41,59,234','Original live LYNQ particle palette');
   }
   await page.screenshot({path:path.join(out,prefix+'-navigation.png'),fullPage:true});
   await nav.getByRole('link',{name:'Edit',exact:true}).click();
   await page.getByRole('heading',{name:'Edit identity',exact:true}).waitFor();
   for(const name of ['Configuration','Monetization','Advanced','View'])assert.equal(await page.getByRole('button',{name,exact:true}).isDisabled(),true);
   assert.equal(await page.locator('input[name="bot_token"],input[name="starting_credits"],select[name="text_model"]').count(),0);
   await page.locator('input[name="name"]').fill('Fixture identity updated');
   await page.getByRole('button',{name:'Save identity',exact:true}).click();await page.getByRole('status').filter({hasText:'Identity saved.'}).waitFor();
   await page.locator('.dashboard-main').evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(out,prefix+'-identity.png'),fullPage:true});
   assert.deepEqual(errors,[]);evidence.push({brand,width,animated:true,sameRevenueComponent:true,allPresetPeriods:true,refreshFunctional:true,fullReportSections:6,purchasedMediaDrilldowns:3,identitySaveFunctional:true,settingsLocked:true,noRuntimeErrors:true});
  } catch(error) { await page.screenshot({path:path.join(out,prefix+'-failure.png'),fullPage:true});writeFileSync(path.join(out,prefix+'-failure.json'),JSON.stringify({error:String(error),browserErrors:errors,text:await page.locator('body').innerText()},null,2));throw error; }
  finally { await page.close(); }
 }
 writeFileSync(path.join(out,'results.json'),JSON.stringify(evidence,null,2));console.log('CREATOR BROWSER CHECKS PASSED',JSON.stringify(evidence));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
