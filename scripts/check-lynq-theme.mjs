// Isolated UI verification. Uses the real shell/components and all global CSS.
// No auth bypass, production credentials, database calls, or customer data.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { chromium } from 'playwright';

const root=process.cwd();
const out=path.join(root,'test-results/lynq-theme');
mkdirSync(out,{recursive:true});
const fixture=`
import React from 'react';
import { createRoot } from 'react-dom/client';
import Access from './components/DashboardAccessProvider';
import Sidebar from './components/Sidebar';
import MobileMenu from './components/MobileMenu';
import Wordmark from './components/TwinWordmark';
import MainShell from './components/MainShell';
import WorkspaceShell from './components/WorkspaceShell';
const agency=new URLSearchParams(location.search).get('agency') || 'LYNQ';
const name=agency==='Twin'?undefined:agency;
if(agency==='Moxy')document.documentElement.setAttribute('data-agency','moxy');
if(agency==='LYNQ')document.documentElement.setAttribute('data-brand-theme','lynq-light');
function App(){return <Access agencyName={name} canManage={agency!=='Moxy'}><WorkspaceShell activeCloneId={null}><Sidebar clones={[]} activeCloneId={null}/><div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden"><header className="dashboard-mobile-header flex shrink-0 items-center justify-between border-b border-white/12 px-4 py-3 lg:hidden"><Wordmark inverse agencyName={name}/><div className="flex items-center gap-1"><button className="rounded-lg px-3 py-2 text-sm font-medium text-white/80">Sign out</button><MobileMenu activeCloneId={null}/></div></header><div className="dashboard-topbar flex h-20 shrink-0 items-center justify-center border-b border-line"><div className="flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-ink"><span>All creators</span><span className="text-muted">⌄</span><span className="border-l border-line pl-3 text-muted">$AUD</span></div></div><MainShell><div className="dashboard-page space-y-5"><h1 className="text-3xl font-bold text-ink">Earnings overview</h1><p className="text-sm text-muted">Visual verification · no customer data</p><section data-slot="card" className="rounded-2xl p-4"><div className="flex flex-wrap items-center gap-4 text-sm text-muted"><span>All</span><span>1Y</span><span>6M</span><span>3M</span><button className="rounded-full bg-accent px-3 py-2 text-white">1M</button><span>2W</span><span>1W</span><span>1D</span></div></section><section data-slot="card" className="rounded-2xl p-5"><p className="text-sm text-muted">Fleet · Star revenue, 1M</p><p className="mt-2 text-2xl text-good">—</p><div className="flex h-48 items-center justify-center text-muted">No earnings data in this visual test</div></section><section data-slot="card" className="rounded-2xl p-5"><h2 className="font-semibold text-ink">Creators</h2><input aria-label="Search creators" placeholder="Search creators..." className="mt-3 w-full rounded-xl border px-3 py-2"/></section><section data-slot="card" className="rounded-2xl p-5"><h2 className="font-semibold text-ink">Daily earnings analysis</h2><p className="mt-2 text-sm text-muted">Previous days and weeks</p></section></div></MainShell></div></WorkspaceShell></Access>}
createRoot(document.getElementById('root')).render(<App/>);
`;
writeFileSync(path.join(out,'fixture.tsx'),fixture);
const bundle=await build({
  stdin:{contents:fixture,resolveDir:root,sourcefile:'lynq-theme-fixture.tsx',loader:'tsx'},
  bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',
  alias:{'@':root},define:{'process.env.NODE_ENV':'"production"'},
  plugins:[{name:'isolated-navigation',setup(b){
    b.onResolve({filter:/^(next\/link|next\/navigation)$|(?:^|\/)TwinAssistant(?:\.tsx)?$/},args=>({path:args.path,namespace:'ui-fixture'}));
    b.onLoad({filter:/.*/,namespace:'ui-fixture'},args=>({loader:'jsx',resolveDir:root,contents:
      args.path.includes('TwinAssistant') ? 'export default function Assistant(){return null}' :
      args.path==='next/link' ? 'import React from "react";export default function Link({children,...p}){return React.createElement("a",p,children)}' :
      'export const usePathname=()=>"/revenue";export const useSearchParams=()=>new URLSearchParams();'
    }));
  }}],
});
const css=await postcss([tailwind()]).process('@import "./app/globals.css";\n@import "./app/jess-kate-theme.css";\n@import "./app/studio-workspace.css";',{from:path.join(root,'lynq-verification.css')});
writeFileSync(path.join(out,'bundle.js'),bundle.outputFiles[0].text);
writeFileSync(path.join(out,'styles.css'),css.css);
const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><style>body{margin:0;font-family:Arial,sans-serif}html{--font-sans:Arial;--font-display:Arial}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>';
const server=createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/styles.css'){res.setHeader('Content-Type','text/css');res.end(css.css);}
  else if(u.pathname==='/bundle.js'){res.setHeader('Content-Type','application/javascript');res.end(bundle.outputFiles[0].text);}
  else {res.setHeader('Content-Type','text/html');res.end(html);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const evidence=[];
try {
  for(const width of [390,1440]){
    const page=await browser.newPage({viewport:{width,height:900},colorScheme:'dark'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin,{waitUntil:'networkidle'});
    await page.locator('[data-lynq-core] canvas:visible').first().waitFor();
    await page.waitForTimeout(180);
    const state=await page.evaluate(()=>{
      const style=s=>getComputedStyle(document.querySelector(s));
      const root=getComputedStyle(document.documentElement);
      return {theme:document.documentElement.dataset.brandTheme,scheme:root.colorScheme,background:style('body').backgroundColor,card:style('[data-slot="card"]').backgroundColor,text:style('[data-slot="card"]').color,header:style('.dashboard-mobile-header').backgroundColor,main:style('main').backgroundImage,orange:root.getPropertyValue('--lynq-orange').trim(),pink:root.getPropertyValue('--lynq-pink').trim(),blue:root.getPropertyValue('--lynq-blue').trim(),overflow:document.documentElement.scrollWidth>innerWidth};
    });
    assert.equal(state.theme,'lynq-light');assert.equal(state.scheme,'light');
    assert.equal(state.background,'rgb(250, 249, 252)');assert.equal(state.card,'rgb(255, 255, 255)');
    assert.equal(state.text,'rgb(25, 25, 31)');assert.equal(state.header,'rgb(255, 255, 255)');
    assert.equal(state.main,'none');assert.equal(state.orange,'#ff8b35');assert.equal(state.pink,'#e94b9c');assert.equal(state.blue,'#293bea');assert.equal(state.overflow,false);
    const core=page.locator('[data-lynq-core] canvas:visible').first();
    assert.equal((await core.boundingBox()).width,48);
    const frame1=await core.evaluate(c=>c.toDataURL());await page.waitForTimeout(150);
    assert.notEqual(await core.evaluate(c=>c.toDataURL()),frame1,'Original particle canvas is animated, not a static placeholder');
    await page.screenshot({path:path.join(out,`lynq-${width}-overview.png`),fullPage:true});
    if(width<1024)await page.getByRole('button',{name:'Open navigation',exact:true}).click();
    const sidebar=page.locator('.dashboard-sidebar:visible');await sidebar.waitFor();
    const nav=await sidebar.evaluate(s=>{
      const status=s.querySelector(':scope > .px-7.py-4');
      return {background:getComputedStyle(s).backgroundColor,coreCount:s.querySelectorAll('[data-lynq-core] canvas').length,before:status?getComputedStyle(status,'::before').content:null,after:status?getComputedStyle(status,'::after').content:null,statusHeight:status?status.getBoundingClientRect().height:0};
    });
    assert.equal(nav.background,'rgb(255, 255, 255)');assert.equal(nav.coreCount,1);
    assert.ok(!nav.before||['none','normal'].includes(nav.before),'No CSS-generated sphere');
    assert.ok(!nav.after||['none','normal'].includes(nav.after),'No fake core label');
    assert.ok(nav.statusHeight<80,'No leftover large sphere spacer');
    await page.screenshot({path:path.join(out,`lynq-${width}-navigation.png`),fullPage:true});
    assert.deepEqual(errors,[]);evidence.push({width,...state,navigation:nav,animated:true});
    if(width<1024){await sidebar.getByRole('button',{name:'Close navigation',exact:true}).click();await sidebar.waitFor({state:'hidden'});}
    await page.close();
  }
  for(const agency of ['Twin','Moxy']){
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    await page.goto(origin+'?agency='+agency,{waitUntil:'networkidle'});
    const state=await page.evaluate(()=>({theme:document.documentElement.dataset.brandTheme||null,lynqCore:document.querySelectorAll('[data-lynq-core]').length,sidebar:getComputedStyle(document.querySelector('.dashboard-sidebar')).backgroundImage}));
    assert.equal(state.theme,null);assert.equal(state.lynqCore,0);evidence.push({agency,...state});await page.close();
  }
  console.log('LYNQ BROWSER CHECKS PASSED',JSON.stringify(evidence,null,2));
  writeFileSync(path.join(out,'results.json'),JSON.stringify(evidence,null,2));
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
