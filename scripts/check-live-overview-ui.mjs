// Isolated browser regression: fixtures are served on loopback, never production.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { chromium } from 'playwright';
import { creatorDemoData, creatorDemoInsight } from '../lib/creator-demo-data.ts';
const root=process.cwd(), out='/tmp/live-overview-ui';mkdirSync(out,{recursive:true});
const clones=[{id:'11111111-1111-4111-8111-111111111111',name:'Fixture Creator A',color:'#0878ff'},{id:'22222222-2222-4222-8222-222222222222',name:'Fixture Creator B',color:'#8050ab'}];
function fixture(period, cloneId, zero=false) {
 const base=creatorDemoData(period), old=base.clones[0].id;
 const stars=zero?0:cloneId===clones[1].id?20000:period==='1W'?50000:100000;
 const stats={...base.totals,stars,grossPaymentStars:stars,totalFans:zero?0:1234,activeUsers:zero?0:234,sales:zero?0:20,buyers:zero?0:12};
 const selected=clones.filter(c=>!cloneId||c.id===cloneId);
 return {...base,demo:undefined,analytics:null,totals:stats,clones:selected.map(c=>({...c,stars:stars/selected.length})),perClone:Object.fromEntries(selected.map(c=>[c.id,stats])),series:base.series.map(p=>({bucket:p.bucket,...Object.fromEntries(selected.map(c=>[c.id,zero?0:p[old]]))})),recent:zero?[]:selected.map(c=>({cloneId:c.id,cloneName:c.name,cloneColor:c.color,buyerName:'API buyer '+c.name.slice(-1),telegramId:null,stars:1000,kind:'photo',paidAt:new Date().toISOString()})),rankings:{fans:[],content:[],unlinked:{}}};
}
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import LiveDashboardOverview from './components/dashboard/LiveDashboardOverview';import TopBar from './components/TopBar';import WorkspaceShell from './components/WorkspaceShell';import CurrencyProvider from './components/CurrencyProvider';import DashboardAccessProvider from './components/DashboardAccessProvider';import BlurProvider from './components/BlurProvider';function App(){const[id,setId]=React.useState(null);window.changeCreator=setId;return <DashboardAccessProvider><CurrencyProvider><BlurProvider><WorkspaceShell activeCloneId={id}><div className="flex min-w-0 flex-1 flex-col overflow-hidden"><TopBar clones={${JSON.stringify(clones)}} activeCloneId={id} allTimeStars={0} signOut="simulated"/><div className="min-h-0 flex-1 overflow-y-auto"><LiveDashboardOverview key={id||'all'} cloneId={id} clones={${JSON.stringify(clones)}}/></div></div></WorkspaceShell></BlurProvider></CurrencyProvider></DashboardAccessProvider>}createRoot(document.getElementById('root')).render(<App/>);`;
const result=await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},outdir:out,bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':root},define:{'process.env.NODE_ENV':'"production"'},banner:{js:'var process={env:{NODE_ENV:"production"},browser:true};'},plugins:[{name:'isolated',setup(b){
 b.onResolve({filter:/^next\/(link|navigation)$|app\/actions\/clone-scope$/},a=>({path:a.path,namespace:'stub'}));
 b.onLoad({filter:/.*/,namespace:'stub'},({path})=>({loader:'jsx',resolveDir:root,contents:path==='next/link'?`import React from 'react';export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}`:path.endsWith('clone-scope')?`export async function setCloneScope(id){window.chosenCreator=id}`:`export const usePathname=()=>'/dashboard';export const useSearchParams=()=>new URLSearchParams();export const useRouter=()=>({refresh:()=>window.changeCreator(window.chosenCreator||null),push:()=>{}});`}))}}]});
const global=await postcss([tailwind()]).process('@import "./app/globals.css";',{from:resolve(root,'live-overview-review.css')});
const css=global.css+'\n'+result.outputFiles.find(f=>f.path.endsWith('.css')).text+'\nbody{margin:0}html{--font-body:Arial,sans-serif;--font-sans:Arial,sans-serif;--font-heading:Arial,sans-serif}';
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text;
let fail=false,zero=false;const requests=[];
const server=createServer((req,res)=>{const u=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');
 if(u.pathname==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(js)}
 if(u.pathname==='/styles.css'){res.setHeader('Content-Type','text/css');return res.end(css)}
 if(u.pathname==='/api/fx')return res.end(JSON.stringify({usd_to_aud:1.5}));
 if(u.pathname==='/api/dashboard'){requests.push(u.search);res.setHeader('Content-Type','application/json');if(fail){res.statusCode=503;return res.end(JSON.stringify({error:'Fixture refresh unavailable'}))}return res.end(JSON.stringify(fixture(u.searchParams.get('period')||'1M',u.searchParams.get('clone'),zero)))}
 if(u.pathname==='/api/dashboard/day-insight'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(creatorDemoInsight(u.searchParams.get('date')||'2026-10-13')))}
 if(u.pathname.startsWith('/api/')){res.statusCode=404;return res.end('{}')}
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><div id="root"></div><script src="/bundle.js"></script></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:["--no-sandbox"]});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});await page.addInitScript(()=>localStorage.setItem('currency','USD'));
 await page.goto('http://127.0.0.1:'+server.address().port);const kpi=page.locator('.revenue-kpi').first();await page.waitForFunction(()=>document.querySelector('.revenue-kpi')?.textContent.includes('1,300'));
 assert.equal(await page.locator('[data-live-overview=true]').count(),1);assert.equal(await page.locator('.revenue-kpi').count(),6);assert.match(await page.locator('.revenue-kpi').last().innerText(),/1,234/);assert.equal(await page.getByRole('heading',{name:'Recent purchases',exact:true}).count(),1);assert.equal(await page.getByText('Top fans',{exact:true}).count(),1);
 await page.screenshot({path:out+'/desktop.png',fullPage:true});
 await page.getByRole('button',{name:'1W',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.revenue-kpi')?.textContent.includes('650'));
 await page.getByRole('button',{name:'$USD',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.revenue-kpi')?.textContent.includes('975'));
 await page.getByRole('button',{name:'All creators',exact:false}).first().click();await page.getByRole('button',{name:/Fixture Creator B/}).click();await page.getByRole('heading',{name:clones[1].name,exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('.revenue-kpi')?.textContent.includes('390'));
 assert.ok(requests.some(s=>s.includes('clone='+clones[1].id)));assert.equal(await page.getByText('API buyer A',{exact:true}).count(),0);
 for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:900});await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow at ${width}`);if(width===390)await page.screenshot({path:out+'/mobile.png',fullPage:true})}
 fail=true;await page.getByRole('button',{name:/Refresh/}).first().click();await page.getByText('This window could not be loaded.',{exact:true}).waitFor();assert.match(await kpi.innerText(),/390/,'Refresh failure retains last good value');
 fail=false;zero=true;await page.getByRole('button',{name:/Refresh/}).first().click();await page.waitForFunction(()=>document.querySelector('.revenue-kpi')?.textContent.includes('0.00'));await page.getByText('No recorded purchases in this period.').waitFor();assert.equal(await page.locator('.revenue-kpi').last().locator('.revenue-kpi-value').innerText(),'0');assert.deepEqual(errors,[]);
 console.log('Live overview passed: API totals, six KPIs, dates, currency, shared-header currency and scope picker, rankings, mobile widths, failed refresh and empty ledger.');
}finally{await browser.close();server.close()}
