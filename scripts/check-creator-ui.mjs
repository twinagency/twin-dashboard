// Runs real creator components against synthetic local-only API responses.
// No production sessions, accounts, data or authentication bypass are created.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { chromium } from 'playwright';
const root=process.cwd();
const out=path.join(root,'test-results/creator-workspace');
mkdirSync(out,{recursive:true});
const own='33333333-3333-4333-8333-333333333333';
const stats={stars:22000,grossPaymentStars:22000,sales:6,newFans:18,activeUsers:15,totalFans:18,reachable24h:8,messages:120,buyers:3,repeatPct:33,costUsd:0,aiCalls:50,aiErrors:0};
const funnel={fans:18,buyers:3,repeat:1,oneTime:2,threePlus:1,nonBuyers:15,totalPurchases:6,buyerPct:1/6,repeatPct:1/3,oneTimePct:2/3,avgPurchasesPerBuyer:2,avgStarsPerBuyer:22000/3,medianStarsPerBuyer:7000,repeatRevenueShare:.3};
const source=readFileSync('components/RevenueDashboard.tsx','utf8');
const signals=Object.fromEntries([...source.matchAll(/\bf\.([A-Za-z0-9_]+)/g)].map(match=>[match[1],0]));
const payload={period:'1M',clones:[{id:own,name:'Fixture Creator',slug:'fixture',color:'#148c6b',stars:22000}],bucketLabels:['Sep 8','Sep 9','Sep 10'],series:[{bucket:'Sep 8',[own]:12000},{bucket:'Sep 9',[own]:6000},{bucket:'Sep 10',[own]:4000}],recent:[],totals:stats,perClone:{[own]:stats},balance:{lifetimeStars:22000,totalBalanceStars:20000,availableBalanceStars:19000},cachedAt:Date.now(),ageSeconds:0,stale:false,analytics:{period:'1M',costIncluded:false,totals:{revenueStars:22000,costUsd:0,profitUsd:0,sales:6,fans:18,buyers:3},clones:[{id:own,name:'Fixture Creator',color:'#148c6b',revenueStars:22000,costUsd:0,profitUsd:0,sales:6,margin:0}],byKind:[],byFeature:[],paywallFunnel:{collecting:true,messaged:15,paywalled:0,purchased:0,paidMessageBuyers:0,paidMessagePurchases:0,paidMessageStars:0,paywallViews:0,abandoned:0,paywallPct:0,purchasePct:0,overallPct:0,avgViewsPerFan:0},buyerConversion:{lifetimeFanProfiles:18,lifetimeBuyerProfiles:3,lifetimeBuyerRate:1/6,activeChatters:15,activeChatBuyers:3,activeChatBuyerRate:.2,activeBuyerProfiles7d:3,activeBuyerEngagement7d:1,purchaseMix:[]},conversationFunnel:{...signals,collecting:true},byFlow:[],byDay:[],byHour:[],byDow:[],byTier:[],whaleFans:[],topWeeklySpenders:[],weeklySpenderSummary:{buyers:0,stars:0,purchases:0,avgStars:0},funnel}};
const fixture=`
import React from 'react';import {createRoot} from 'react-dom/client';import {usePathname} from 'next/navigation';
import Shell from './components/CreatorWorkspaceShell';import Revenue from './components/RevenueDashboard';import Fix from './components/RevenueTooltipFix';import Identity from './components/CreatorIdentityEditor';import Media from './components/CreatorMediaLibrary';
document.documentElement.dataset.creatorWorkspace='true';
function App(){const p=usePathname();return <Shell agencyName="Tether" creatorName="Fixture Creator" connected={true} allTimeStars={22000}><p className="mb-3 text-xs text-muted">Interface verification · synthetic test data</p>{p==='/creator/edit'?<Identity clone={{name:'Fixture Creator',intake:{fields:{},answers:''}}} revision="fixture-revision"/>:p==='/creator/ppvs'?<Media items={[]}/>:p==='/creator'?<><Fix/><Revenue cloneId="${own}"/></>:<h2>{p.split('/').pop()} · fixture route</h2>}</Shell>};createRoot(document.getElementById('root')).render(<App/>);
`;
const bundle=await build({stdin:{contents:fixture,resolveDir:root,sourcefile:'creator-ui-fixture.tsx',loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':root},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'local-navigation',setup(b){
 b.onResolve({filter:/^(next\/link|next\/navigation)$|(?:^|\/)TwinAssistant(?:\.tsx)?$/},args=>({path:args.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'jsx',resolveDir:root,contents:args.path.includes('TwinAssistant')?'export default function Assistant(){return null}':args.path==='next/link'?'import React from "react";export default function Link({children,href,onClick,...props}){return <a {...props} href={href} onClick={e=>{onClick?.(e);if(!e.defaultPrevented&&!e.metaKey&&!e.ctrlKey){e.preventDefault();history.pushState({},"",href);dispatchEvent(new PopStateEvent("popstate"));}}}>{children}</a>}':'import {useSyncExternalStore} from "react";const subscribe=f=>{addEventListener("popstate",f);return()=>removeEventListener("popstate",f)};export const usePathname=()=>useSyncExternalStore(subscribe,()=>location.pathname);export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({refresh(){},push(p){history.pushState({},"",p);dispatchEvent(new PopStateEvent("popstate"))},replace(p){history.replaceState({},"",p);dispatchEvent(new PopStateEvent("popstate"))}};'}));
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
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:1000},colorScheme:'light'});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/creator',{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'Earnings overview',exact:true}).waitFor();
  await page.locator('.recharts-wrapper').first().waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal document overflow');
  await page.getByRole('button',{name:'1W',exact:true}).click();await page.waitForTimeout(180);
  assert.ok(requests.some(r=>r.path==='/api/dashboard'&&r.search.includes('period=1W')));
  await page.getByRole('button',{name:'Line chart',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Line chart',exact:true}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'Bar chart',exact:true}).click();
  const report=page.getByRole('button',{name:/revenue report/i}).first();await report.click();assert.equal(await report.getAttribute('aria-expanded'),'true');await page.waitForTimeout(100);
  assert.deepEqual(errors,[],'Revenue and full report must render without runtime errors');
  await page.locator('.dashboard-main').evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:path.join(out,`creator-${width}-earnings.png`),fullPage:true});
  if(width<1024)await page.getByRole('button',{name:'Open navigation',exact:true}).click();
  const nav=page.locator('.creator-sidebar:visible');await nav.waitFor();
  assert.deepEqual(await nav.locator('nav a').allTextContents(),['Earnings','PPVs','Business','Info','Logs','Edit']);
  const canvas=nav.locator('canvas').first();const first=await canvas.evaluate(c=>c.toDataURL());await page.waitForTimeout(150);assert.notEqual(await canvas.evaluate(c=>c.toDataURL()),first,'Sphere animates');
  assert.ok(Math.abs((await canvas.boundingBox()).width-85.76)<1,'Same 64px × 1.34 core size as Ava');
  await page.screenshot({path:path.join(out,`creator-${width}-navigation.png`),fullPage:true});
  await nav.getByRole('link',{name:'Edit',exact:true}).click();
  await page.getByRole('heading',{name:'Edit identity',exact:true}).waitFor();
  for(const name of ['Configuration','Monetization','Advanced','View'])assert.equal(await page.getByRole('button',{name,exact:true}).isDisabled(),true);
  assert.equal(await page.locator('input[name="bot_token"],input[name="starting_credits"],select[name="text_model"]').count(),0);
  await page.locator('input[name="name"]').fill('Fixture identity updated');
  await page.getByRole('button',{name:'Save identity',exact:true}).click();await page.getByRole('status').filter({hasText:'Identity saved.'}).waitFor();
  await page.locator('.dashboard-main').evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(out,`creator-${width}-identity.png`),fullPage:true});
  assert.deepEqual(errors,[]);evidence.push({width,animated:true,sameRevenueComponent:true,reportFunctional:true,identitySaveFunctional:true,settingsLocked:true,noRuntimeErrors:true});await page.close();
 }
 writeFileSync(path.join(out,'results.json'),JSON.stringify(evidence,null,2));console.log('CREATOR BROWSER CHECKS PASSED',JSON.stringify(evidence));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
