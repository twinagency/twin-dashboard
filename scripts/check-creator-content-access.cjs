// Actual creator shell and links; unrelated widgets use local fixtures.
const assert=require('node:assert/strict');
const {readFileSync,mkdirSync}=require('node:fs');
const {createServer}=require('node:http');
const path=require('node:path');
const {build}=require('esbuild');
const postcss=require('postcss');
const tailwind=require('@tailwindcss/postcss');
const {chromium,webkit}=require('playwright');
(async()=>{
 const root=process.cwd(),out=path.join(root,'test-results/creator-content-access');mkdirSync(out,{recursive:true});
 const fixture=[
  'import React from "react";import{createRoot}from"react-dom/client";',
  'import Shell from "./components/CreatorWorkspaceShell";',
  'const q=new URLSearchParams(location.search);',
  'createRoot(document.getElementById("root")).render(<Shell agencyName={q.get("brand")||"Moxy"} creatorName="Disposable navigation fixture" clones={[]} activeCloneId={null} connected={q.get("connected")==="1"} onboardingFinished={q.get("submitted")==="1"} onboardingEditable={true} allTimeStars={0}><h1>Pay Per View fixture</h1></Shell>);'
 ].join('\n');
 const bundle=await build({stdin:{contents:fixture,resolveDir:root,sourcefile:'content-access-fixture.tsx',loader:'tsx'},
  bundle:true,write:false,outdir:out,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},
  plugins:[{name:'unrelated-dashboard-widgets',setup(b){
   b.onResolve({filter:/^(next\/link|\.\/(?:BlurProvider|CurrencyProvider|DashboardAccessProvider|MainShell|MobileMenu|Sidebar|TopBar|TwinWordmark))$/},a=>({path:a.path,namespace:'fixture'}));
   b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'jsx',resolveDir:root,contents:a.path==='next/link'
    ?'import React from "react";export default function Link({children,href,...p}){return <a href={href} {...p}>{children}</a>;}'
    :a.path==='./MainShell'?'import React from "react";export default function Main({children}){return <main className="overflow-y-auto p-4">{children}</main>;}'
    :a.path==='./CurrencyProvider'?'export const useCurrency=()=>({currency:"AUD",setCurrency(){}});export default function Provider({children}){return children;}'
    :/Provider/.test(a.path)?'export default function Provider({children}){return children;}'
    :'export default function Widget(){return null;}'}));
  }}]});
 const script=bundle.outputFiles.find(file=>file.path.endsWith('.js'));
 const moduleStyles=bundle.outputFiles.filter(file=>file.path.endsWith('.css')).map(file=>file.text).join('\n');
 assert.ok(script,'The creator fixture must emit JavaScript');
 assert.ok(moduleStyles,'The actual creator shell CSS must be bundled');
 const css=await postcss([tailwind()]).process('@import "./app/globals.css";',{from:path.join(root,'content-access-fixture.css')});
 const server=createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(script.text);}
  if(u.pathname==='/fixture.css'){res.setHeader('Content-Type','text/css');return res.end(css.css+'\n'+moduleStyles);}
  res.setHeader('Content-Type','text/html');
  if(u.pathname==='/creator/onboarding')return res.end('<h1>'+(u.searchParams.get('step')==='content'?'Saved uploads destination':'Onboarding details destination')+'</h1>');
  res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{
  for(const[name,engine]of [['chromium',chromium],['webkit',webkit]]){
   const executablePath=name==='chromium'?process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:undefined;
   const browser=await engine.launch({headless:true,...(executablePath?{executablePath}:{})});
   try{
    for(const brand of ['Moxy','FLIRT'])for(const width of [390,1280])for(const connected of [0,1])for(const submitted of [0,1]){
     const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
     const url=origin+'/creator/ppvs?'+new URLSearchParams({brand,connected:String(connected),submitted:String(submitted)});
     await page.goto(url);
     let section=page.getByRole('region',{name:'Your saved content and onboarding'});
     const uploads=section.getByRole('link',{name:'My uploaded content',exact:true});
     await uploads.waitFor();assert.equal(await uploads.isVisible(),true);
     const box=await uploads.boundingBox();assert.ok(box.height>=44&&box.x>=0&&box.x+box.width<=width,'Visible mobile content button');
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal overflow');
     assert.doesNotMatch(await page.locator('body').innerText(),/Your onboarding is complete\./);
     const setupBanner=page.getByRole('status',{name:'AI clone setup status'});
     const expectsSetup=!!submitted&&!connected&&brand==='Moxy';
     assert.equal(await setupBanner.count(),expectsSetup?1:0,'Setup banner only appears for a submitted, unconnected creator');
     if(expectsSetup){
       await setupBanner.getByRole('heading',{name:'Your AI clone is being created.',exact:true}).waitFor();
       const bannerBox=await setupBanner.boundingBox(), contentBox=await section.boundingBox();
       assert.ok(bannerBox.y>=0&&bannerBox.y+bannerBox.height<=844,'Entire setup message is visible above the fold');
       assert.ok(bannerBox.y+bannerBox.height<=contentBox.y,'Setup message appears before dashboard content');
       assert.ok(bannerBox.x>=0&&bannerBox.x+bannerBox.width<=width,'Setup message fits mobile width');
     }
     await uploads.click();await page.getByRole('heading',{name:'Saved uploads destination'}).waitFor();
     assert.equal(new URL(page.url()).pathname+new URL(page.url()).search,'/creator/onboarding?step=content');
     await page.goto(url);
     await section.getByRole('link',{name:'Onboarding details',exact:true}).click();
     await page.getByRole('heading',{name:'Onboarding details destination'}).waitFor();
     assert.deepEqual(errors,[]);
     if(!connected&&submitted&&width===390){await page.goto(url);await section.waitFor();await page.screenshot({path:path.join(out,name+'-'+brand+'-submitted-mobile.png'),fullPage:true});}
     await page.close();
    }
    console.log(name+': saved-content and onboarding navigation passed for mobile/desktop, submitted/draft and connected/unconnected.');
   }finally{await browser.close();}
  }
  assert.ok(readFileSync('app/creator/ppvs/page.tsx','utf8').includes('href="/creator/onboarding?step=content"'));
 }finally{await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
