import assert from 'node:assert/strict';import {build} from 'esbuild';import {createServer} from 'node:http';import {mkdirSync,readFileSync} from 'node:fs';import {resolve} from 'node:path';import postcss from 'postcss';import tailwind from '@tailwindcss/postcss';import {chromium} from 'playwright';
const root=process.cwd(),out=resolve('test-results/creator-platforms');mkdirSync(out,{recursive:true});
const initial={schemaVersion:'creator-platforms.v1',creatorName:'Fixture creator',profileId:null,requested:[],readOnly:false,telegram:{configured:false,status:null,handle:null},onlyfans:{status:'ready',error:null,accounts:[],enrollments:[]}};
let snapshot=structuredClone(initial),denied=false,lost=false,statusUnavailable=false;const posted=[];
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import Platforms from './components/creator-platforms/CreatorPlatforms';import Shell from './components/CreatorStudioShell';import {creatorStudioStatus} from './lib/creator-studio-model';createRoot(document.getElementById('root')).render(<Shell brand="moxy" creatorName="Fixture creator" status={creatorStudioStatus(false,"Draft / unfinished",null)} contentHref="/creator/onboarding?step=content"><Platforms initial={${JSON.stringify(initial)}}/></Shell>);`;
const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:root},bundle:true,write:false,outdir:out,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':root},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'link',setup(b){b.onResolve({filter:/^next\/(link|navigation)$|\/CurrencyProvider$/},a=>({path:a.path,namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},a=>({resolveDir:root,loader:'jsx',contents:a.path==='next/link'?`import React from 'react';export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}`:a.path==='next/navigation'?`export const usePathname=()=>'/creator/platforms';export const useRouter=()=>({refresh(){}});`:`export const useCurrency=()=>({currency:'AUD',setCurrency(){}});`}))}}]});
const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text;
const css=(await postcss([tailwind()]).process('@import "./app/globals.css";',{from:resolve('creator-platform-review.css')})).css+'\n'+bundle.outputFiles.find(f=>f.path.endsWith('.css')).text+'\nbody{margin:0;font-family:Arial,sans-serif}html{--font-heading:Arial,sans-serif}';
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;res.setHeader('Cache-Control','no-store');
 if(path==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(js)}if(path==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css)}
 if(path.startsWith('/creator-auth/')){
  res.setHeader('Content-Type','application/json');if(denied){res.statusCode=401;return res.end(JSON.stringify({error:'Sign in to your creator account again.'}))}
  if(statusUnavailable&&req.method==='GET'){res.statusCode=503;return res.end('{}')}
  if(req.method==='POST'){let raw='';for await(const b of req)raw+=b;const body=JSON.parse(raw);posted.push({path,raw,body});if(path==='/creator-auth/platforms'){snapshot={...snapshot,profileId:'canonical-creator',requested:body.channels};return res.end(JSON.stringify(snapshot))}
   if(lost){res.statusCode=500;return res.end('{}')}
   const enrollment={id:'request-1',status:'pending',accountId:null,error:null,expiresAt:new Date(Date.now()+3600000).toISOString()};snapshot.onlyfans.enrollments=[enrollment];return res.end(JSON.stringify({ok:true,enrollment}));
  }
  return res.end(JSON.stringify(snapshot));
 }
 if(/^\/(?:brand\/(?:platforms\/)?|moxy\/)[^.\/]+\.(svg|png|webp)$/.test(path)){try{res.setHeader('Content-Type',path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':'image/webp');return res.end(readFileSync(resolve(root,'public',path.slice(1))))}catch{res.statusCode=404;return res.end()}}
 if(path.startsWith('/brand/')){res.setHeader('Content-Type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg"/>')}
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><main id="root"></main><script src="/bundle.js"></script></html>');
}catch{res.statusCode=500;res.end('{}')}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 const routePage=async p=>p.route('https://dashboard.tgaiclone.xyz/**',async route=>{const r=route.request();const response=await p.request.fetch('http://127.0.0.1:'+server.address().port+new URL(r.url()).pathname,{method:r.method(),headers:r.headers(),data:r.postDataBuffer()||undefined});await route.fulfill({response});});
 await routePage(page);
 await page.addInitScript(()=>{window.__connectorPhase='idle';window.__starts=0;window.addEventListener('message',event=>{const m=event.data;if(m?.source!=='twin-dashboard')return;const phase=m.type==='start'?'waiting':m.type==='status'?window.__connectorPhase:'idle';if(m.type==='start'){window.__starts++;window.__connectorPhase='waiting';}window.postMessage({source:'twin-connector',id:m.id,ok:true,version:'1.0.0',phase},location.origin);});});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://dashboard.tgaiclone.xyz/creator/platforms');
 await page.getByRole('heading',{name:'Your platforms',exact:true}).waitFor();
 await page.locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
 assert(await page.locator('img').evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth>0)),'Brand assets must load');
 assert.equal(await page.getByRole('checkbox').count(),0);
 assert.equal(await page.getByRole('button',{name:'Save platforms'}).count(),0);
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');await page.screenshot({path:out+'/simple-'+width+'.png',fullPage:true});}
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('button',{name:'Connect OnlyFans',exact:true}).click();
 await page.getByRole('dialog').waitFor();
 await page.getByRole('button',{name:'Connection in progress',exact:true}).waitFor();
 assert.deepEqual(posted[0].body,{channels:['onlyfans']});
 assert.equal(await page.evaluate(()=>window.__starts),1,'The primary action starts the installed connector once');
 assert.equal(await page.locator('[data-platform-account]').count(),0,'Opening login is not an account connection');
 await page.getByRole('button',{name:'Close connection setup'}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Set up Telegram',exact:true}).click();
 await page.getByRole('link',{name:'Continue Telegram setup',exact:true}).waitFor();
 assert.deepEqual(posted.at(-1).body,{channels:['telegram','onlyfans']},'Adding Telegram preserves OnlyFans and the canonical profile');
 assert.equal(await page.getByRole('link',{name:'Continue Telegram setup',exact:true}).getAttribute('href'),'/creator/onboarding?step=questionnaire');
 assert.equal(await page.getByRole('link',{name:'Your content',exact:true}).getAttribute('href'),'/creator/onboarding?step=content');
 await page.getByRole('button',{name:'Connect OnlyFans',exact:true}).click();
 await page.getByRole('button',{name:'Connection in progress',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.__starts),1,'Reopening resumes the current attempt');
 await page.getByText('Agency-assisted connection',{exact:true}).click();
 const capture={headers:{user_id:'123',user_agent:'Synthetic agent',x_bc:'synthetic-bc',x_of_rev:'synthetic-rev'},signing:{rules:{static_param:'synthetic-static',start:'synthetic-start',end:'synthetic-end',checksum_indexes:Array(32).fill(1),checksum_constant:1}},cookies:[{name:'sess',value:'synthetic-session',domain:'.onlyfans.com',path:'/'}]};
 await page.getByLabel('OnlyFans username').fill('synthetic');
 await page.getByLabel('Connection file').setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({capture,xHash:'synthetic-hash'}))});
 await page.getByText('Connection file ready. Review the account name, then connect.').waitFor();
 lost=true;await page.getByRole('button',{name:'Connect account',exact:true}).click();
 await page.getByRole('button',{name:'Retry same connection request'}).waitFor();const first=posted.at(-1).raw;
 lost=false;await page.getByRole('button',{name:'Retry same connection request'}).click();
 await page.locator('[data-connection-request=pending]').waitFor();assert.equal(posted.at(-1).raw,first);
 assert.equal(await page.getByLabel('Connection file').inputValue(),'');
 assert.equal(await page.locator('[data-platform-account]').count(),0,'A pending enrollment is not connected');
 snapshot.onlyfans.enrollments=[{id:'request-1',status:'accepted',accountId:'of-123',error:null,expiresAt:new Date(Date.now()+3600000).toISOString()},{id:'older-attempt',status:'failed',accountId:null,error:'session_unavailable',expiresAt:new Date(Date.now()+3600000).toISOString()}];
 snapshot.onlyfans.accounts=[{id:'of-123',handle:'synthetic',health:'paused',connection:{status:'verified',outgoingEnabled:false,expiresAt:new Date(Date.now()+3600000).toISOString()}}];
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.getByRole('status').filter({hasText:/^Your OnlyFans is connected\.$/}).waitFor();
 await page.locator('[data-platform-account=of-123]').waitFor();
 assert.equal(await page.locator('[data-connection-request]').count(),0,'A completed connection hides older failure notices');
 assert.equal(await page.locator('[data-connection-state=connected]').count(),1);
 assert.match(await page.locator('[data-platform-account]').innerText(),/Outgoing messages disabled/);
 assert.equal(await page.getByRole('link',{name:'View conversations'}).getAttribute('href'),'/creator/onlyfans/inbox?account=of-123');
 await page.screenshot({path:out+'/connected.png',fullPage:true});
 snapshot.onlyfans.accounts[0].connection.expiresAt=new Date(Date.now()-1000).toISOString();
 await page.getByRole('button',{name:'Refresh status'}).click();
 await page.getByRole('button',{name:'Reconnect OnlyFans',exact:true}).waitFor();
 assert.equal(await page.locator('[data-connection-state=connected]').count(),0,'An expired session never displays Connected');
 await page.screenshot({path:out+'/reconnect.png',fullPage:true});
 snapshot.onlyfans.accounts[0].connection={status:'paused',expiresAt:new Date(Date.now()+3600000).toISOString(),outgoingEnabled:false};
 await page.getByRole('button',{name:'Refresh status',exact:true}).click();await page.getByRole('heading',{name:'Your OnlyFans is paused.',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Reconnect OnlyFans',exact:true}).count(),0,'A paused account does not require another login');
 snapshot.onlyfans.enrollments=[{id:'stale-attempt',status:'pending',accountId:null,error:null,expiresAt:new Date(Date.now()-1000).toISOString()}];
 await page.getByRole('button',{name:'Refresh status',exact:true}).click();await page.getByText('Your connection attempt expired. Try connecting again.',{exact:true}).waitFor();assert(await page.getByRole('button',{name:'Connect another account',exact:true}).isEnabled(),'An expired pending attempt cannot lock connection setup');
 statusUnavailable=true;await page.getByRole('button',{name:'Refresh status',exact:true}).click();await page.getByText('Your latest connection status could not be loaded. Please try again.',{exact:true}).waitFor();await page.getByText('Status needs refresh',{exact:true}).waitFor();
 statusUnavailable=false;await page.getByRole('button',{name:'Refresh status',exact:true}).click();await page.getByText('Your latest connection status could not be loaded. Please try again.',{exact:true}).waitFor({state:'hidden'});await page.getByRole('heading',{name:'Your OnlyFans is paused.',exact:true}).waitFor();
 snapshot=structuredClone(initial);
 const phoneContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
 const phone=await phoneContext.newPage();await routePage(phone);
 await phone.goto('https://dashboard.tgaiclone.xyz/creator/platforms');
 await phone.getByRole('button',{name:'Connect OnlyFans',exact:true}).click();
 await phone.getByText('Continue on a computer',{exact:true}).waitFor();
 assert.equal(await phone.getByRole('button',{name:'Open OnlyFans',exact:true}).count(),0,'Unconfigured hosted sign-in must not pretend to work on a phone');
 assert(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await phone.screenshot({path:out+'/iphone-connection.png',fullPage:true});
 await phoneContext.close();
 denied=true;await page.getByRole('button',{name:'Refresh status'}).click();
 await page.getByText('This is a read-only view of your platform setup.').waitFor();
 assert.equal(await page.locator('[data-platform-account]').count(),0);
 assert.equal(await page.locator('[data-creator-session-connect]').count(),0);
 assert(await page.getByRole('button',{name:'Connect OnlyFans',exact:true}).isDisabled());
 assert(await page.getByRole('button',{name:'Set up Telegram',exact:true}).isDisabled());
 assert.deepEqual(errors,[]);
 console.log('PASS simple creator connection UI: direct platform actions, shared canonical profile, existing intake, one automatic desktop launch, resume current attempt, no premature connection, exact retry and secret clearing, verified/expired states, owned inbox, auth loss, desktop/mobile and honest unsupported mobile state. Hosted provider NOT tested.');
} finally {await browser.close();server.close();}
