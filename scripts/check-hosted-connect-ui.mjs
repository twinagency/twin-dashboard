import assert from 'node:assert/strict';import {build} from 'esbuild';import {createServer} from 'node:http';import {mkdirSync,readFileSync} from 'node:fs';import {resolve} from 'node:path';import postcss from 'postcss';import tailwind from '@tailwindcss/postcss';import {chromium} from 'playwright';
const root=process.cwd(),out=resolve('test-results/hosted-connect');mkdirSync(out,{recursive:true});
const initial={schemaVersion:'creator-platforms.v1',creatorName:'Fixture creator',profileId:null,requested:[],readOnly:false,telegram:{configured:false,status:null,handle:null},onlyfans:{hostedConnect:true,status:'ready',error:null,accounts:[],enrollments:[]}};
let snapshot=structuredClone(initial),providerPhase='waiting';const posted=[];
const sdk=`export function startOnlyFansAuthentication(token,options){window.__hostedStarts=(window.__hostedStarts||0)+1;window.__hostedSuccess=options.onSuccess;const box=document.createElement('div');box.id='synthetic-provider-overlay';box.setAttribute('role','region');box.setAttribute('aria-label','Synthetic provider sign-in');box.style.cssText='position:fixed;inset:20px;z-index:99999;background:white;color:black;padding:24px';box.innerHTML='<h2>OnlyFans sign-in fixture</h2><p>Provider screen simulation</p>';document.body.appendChild(box)}export function closeOnlyFansAuthentication(){document.getElementById('synthetic-provider-overlay')?.remove()}`;
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import Platforms from './components/creator-platforms/CreatorPlatforms';import Shell from './components/CreatorStudioShell';import {creatorStudioStatus} from './lib/creator-studio-model';createRoot(document.getElementById('root')).render(<Shell brand="moxy" creatorName="Fixture creator" status={creatorStudioStatus(false,"Draft / unfinished",null)} contentHref="/creator/onboarding?step=content"><Platforms initial={${JSON.stringify(initial)}}/></Shell>);`;
const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:root},bundle:true,write:false,outdir:out,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':root},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'isolated-ui-adapters',setup(b){b.onResolve({filter:/^@onlyfansapi\/auth$|^next\/(link|navigation)$|\/CurrencyProvider$/},a=>({path:a.path,namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},a=>({resolveDir:root,loader:'jsx',contents:a.path==='@onlyfansapi/auth'?sdk:a.path==='next/link'?`import React from 'react';export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}`:a.path==='next/navigation'?`export const usePathname=()=>'/creator/platforms';export const useRouter=()=>({refresh(){}});`:`export const useCurrency=()=>({currency:'AUD',setCurrency(){}});`}))}}]});
const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text;
const css=(await postcss([tailwind()]).process('@import "./app/globals.css";',{from:resolve('hosted-connect-review.css')})).css+'\n'+bundle.outputFiles.find(f=>f.path.endsWith('.css')).text+'\nbody{margin:0;font-family:Arial,sans-serif}html{--font-heading:Arial,sans-serif}';
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;res.setHeader('Cache-Control','no-store');
 if(path==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(js)}if(path==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css)}
 if(path.startsWith('/creator-auth/')){
  res.setHeader('Content-Type','application/json');if(req.method==='POST'){
   let raw='';for await(const b of req)raw+=b;const body=JSON.parse(raw);posted.push({path,body});
   if(path==='/creator-auth/platforms'){snapshot={...snapshot,profileId:'canonical-creator',requested:body.channels};return res.end(JSON.stringify(snapshot))}
   assert.equal(path,'/creator-auth/platforms/onlyfans/hosted');
   const result=body.action==='start'?{ok:true,kind:'signin',token:'ofapi_cs_syntheticfixture'}:body.action==='reconnect'?{ok:true,kind:'reconnect',phase:'waiting'}:{ok:true,kind:'reconnect',phase:body.action==='code'?'checking':providerPhase};return res.end(JSON.stringify(result));
  }return res.end(JSON.stringify(snapshot));
 }
 if(/^\/(?:brand\/(?:platforms\/)?|moxy\/)[^.\/]+\.(svg|png|webp)$/.test(path)){try{res.setHeader('Content-Type',path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':'image/webp');return res.end(readFileSync(resolve(root,'public',path.slice(1))))}catch{res.statusCode=404;return res.end()}}
 if(path.startsWith('/brand/')){res.setHeader('Content-Type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg"/>')}
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><main id="root"></main><script src="/bundle.js"></script></html>');
}catch(error){console.error(error);res.statusCode=500;res.end('{}')}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://dashboard.tgaiclone.xyz/**',async route=>{const r=route.request();const response=await page.request.fetch('http://127.0.0.1:'+server.address().port+new URL(r.url()).pathname,{method:r.method(),headers:r.headers(),data:r.postDataBuffer()||undefined});await route.fulfill({response});});
 await page.goto('https://dashboard.tgaiclone.xyz/creator/platforms');await page.getByRole('button',{name:'Connect OnlyFans',exact:true}).click();await page.getByRole('region',{name:'Synthetic provider sign-in'}).waitFor();
 assert.equal(await page.locator('dialog[open]').count(),0,'Provider overlay must not sit behind a native dialog');assert.equal(await page.evaluate(()=>window.__hostedStarts),1);
 assert.deepEqual(posted.map(p=>p.body),[{channels:['onlyfans']},{action:'start'}]);assert.equal(await page.locator('input[type=file]').count(),0);assert.equal(await page.locator('[data-state=connected]').count(),0);
 await page.evaluate(()=>window.__hostedSuccess({accountId:'acct_forged',onlyfansData:{id:999}}));await page.getByText('Checking your account. This page will update when it’s connected.').waitFor();
 assert.equal(posted.length,2,'Browser callback must never submit an account identity');assert.equal(await page.locator('[data-state=connected]').count(),0);
 await page.screenshot({path:out+'/checking-mobile.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile overflow');
 const verified={id:'of-123',handle:'fixture',health:'healthy',connection:{status:'verified',expiresAt:new Date(Date.now()+3600000).toISOString(),outgoingEnabled:false}};
 snapshot.onlyfans.accounts=[verified];snapshot.onlyfans.enrollments=[{id:'request-1',status:'accepted',accountId:'of-123',error:null,expiresAt:verified.connection.expiresAt}];
 await page.getByRole('button',{name:'Refresh status',exact:true}).click();await page.getByText('Your OnlyFans is connected. Your account will continue syncing in the background.').waitFor();
 assert.equal(await page.getByRole('region',{name:'OnlyFans sign-in'}).count(),0);assert.equal(await page.locator('[data-state=connected]').count(),1);
 for(const width of [390,1440]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:out+'/connected-'+width+'.png',fullPage:true});}
 snapshot.onlyfans.accounts=[{...verified,connection:{...verified.connection,status:'expired',expiresAt:new Date(Date.now()-10000).toISOString()}}];providerPhase='code';
 await page.getByRole('button',{name:'Refresh status',exact:true}).click();await page.getByRole('button',{name:'Reconnect OnlyFans',exact:true}).click();await page.getByLabel('Verification code',{exact:true}).waitFor();
 assert.deepEqual(posted.find(p=>p.body.action==='reconnect').body,{action:'reconnect',accountId:'of-123'});
 await page.getByLabel('Verification code',{exact:true}).fill('123456');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByText('Checking your account. This page will update when it’s connected.').waitFor();
 assert.deepEqual(posted.find(p=>p.body.action==='code').body,{action:'code',code:'123456'});assert.equal(await page.evaluate(()=>window.__hostedStarts),1,'Reconnection uses the existing provider account');
 assert.deepEqual(errors,[]);console.log('PASS hosted UI: mobile/desktop shared theme, one sign-in launch, overlay visibility, no technical upload, no browser callback binding, worker-confirmed connection and owned reconnection verification code. SDK and provider are simulated; real sign-in remains a release gate.');
}finally{await browser.close();await new Promise(r=>server.close(r));}

