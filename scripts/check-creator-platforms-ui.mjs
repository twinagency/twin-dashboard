import assert from 'node:assert/strict';import {build} from 'esbuild';import {createServer} from 'node:http';import {mkdirSync} from 'node:fs';import {resolve} from 'node:path';import postcss from 'postcss';import tailwind from '@tailwindcss/postcss';import {chromium} from 'playwright';
const root=process.cwd(),out=resolve('test-results/creator-platforms');mkdirSync(out,{recursive:true});
const initial={schemaVersion:'creator-platforms.v1',creatorName:'Fixture creator',profileId:null,requested:[],readOnly:false,telegram:{configured:false,status:null,handle:null},onlyfans:{status:'ready',error:null,accounts:[],enrollments:[]}};
let snapshot=structuredClone(initial),denied=false,lost=false;const posted=[];
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import Platforms from './components/creator-platforms/CreatorPlatforms';createRoot(document.getElementById('root')).render(<div className="mx-auto max-w-5xl p-4 sm:p-8"><Platforms initial={${JSON.stringify(initial)}}/></div>);`;
const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:root},bundle:true,write:false,outdir:out,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':root},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'link',setup(b){b.onResolve({filter:/^next\/link$/},a=>({path:a.path,namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({resolveDir:root,loader:'jsx',contents:`import React from 'react';export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}`}))}}]});
const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text;
const css=(await postcss([tailwind()]).process('@import "./app/globals.css";',{from:resolve('creator-platform-review.css')})).css+'\nbody{margin:0;background:#111217;color:#f4f4f5;font-family:Arial,sans-serif}html{--font-heading:Arial,sans-serif}';
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;res.setHeader('Cache-Control','no-store');
 if(path==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(js)}if(path==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(css)}
 if(path.startsWith('/creator-auth/')){
  res.setHeader('Content-Type','application/json');if(denied){res.statusCode=401;return res.end(JSON.stringify({error:'Sign in to your creator account again.'}))}
  if(req.method==='POST'){let raw='';for await(const b of req)raw+=b;const body=JSON.parse(raw);posted.push({path,raw,body});if(path==='/creator-auth/platforms'){snapshot={...snapshot,profileId:'canonical-creator',requested:body.channels};return res.end(JSON.stringify(snapshot))}
   if(lost){res.statusCode=500;return res.end('{}')}
   const enrollment={id:'request-1',status:'pending',accountId:null,error:null,expiresAt:new Date(Date.now()+3600000).toISOString()};snapshot.onlyfans.enrollments=[enrollment];return res.end(JSON.stringify({ok:true,enrollment}));
  }
  return res.end(JSON.stringify(snapshot));
 }
 if(path.startsWith('/brand/')){res.setHeader('Content-Type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg"/>')}
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><main id="root"></main><script src="/bundle.js"></script></html>');
}catch{res.statusCode=500;res.end('{}')}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
 await page.getByRole('heading',{name:'Your platforms',exact:true}).waitFor();assert(await page.getByRole('button',{name:'Save platforms'}).isDisabled());
 await page.getByRole('checkbox',{name:'Telegram',exact:true}).check();await page.getByRole('checkbox',{name:'OnlyFans',exact:true}).check();await page.getByRole('button',{name:'Save platforms'}).click();await page.locator('[data-platform-onlyfans]').waitFor();await page.locator('[data-platform-telegram]').waitFor();assert.deepEqual(posted[0].body.channels,['telegram','onlyfans']);
 assert.equal(await page.locator('[data-platform-account]').count(),0);assert.match(await page.locator('[data-platform-telegram]').innerText(),/Setup requested/);
 const capture={headers:{user_id:'123',user_agent:'Synthetic agent',x_bc:'synthetic-bc',x_of_rev:'synthetic-rev'},signing:{rules:{static_param:'synthetic-static',start:'synthetic-start',end:'synthetic-end',checksum_indexes:Array(32).fill(1),checksum_constant:1}},cookies:[{name:'sess',value:'synthetic-session',domain:'.onlyfans.com',path:'/'}]};
 await page.getByLabel('OnlyFans username').fill('synthetic');await page.getByLabel('Connection file').setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({capture,xHash:'synthetic-hash'}))});await page.getByText('Connection file ready. Review the account name, then connect.').waitFor();
 lost=true;await page.getByRole('button',{name:'Connect account',exact:true}).click();await page.getByRole('button',{name:'Retry same connection request'}).waitFor();const first=posted.at(-1).raw;
 lost=false;await page.getByRole('button',{name:'Retry same connection request'}).click();await page.locator('[data-connection-request=pending]').waitFor();assert.equal(posted.at(-1).raw,first);assert.equal(await page.locator('[data-platform-account]').count(),0);assert.equal(await page.getByLabel('Connection file').inputValue(),'');
 snapshot.onlyfans.enrollments=[];snapshot.onlyfans.accounts=[{id:'of-123',handle:'synthetic',health:'paused',connection:{status:'verified',outgoingEnabled:false,expiresAt:new Date(Date.now()+3600000).toISOString()}}];await page.getByRole('button',{name:'Refresh status'}).click();await page.locator('[data-platform-account=of-123]').waitFor();assert.match(await page.locator('[data-platform-account]').innerText(),/Outgoing messages disabled/);assert.equal(await page.getByRole('link',{name:'View conversations'}).getAttribute('href'),'/creator/onlyfans/inbox?account=of-123');
 for(const width of [1440,390]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');await page.screenshot({path:out+'/'+width+'.png',fullPage:true})}
 denied=true;await page.getByRole('button',{name:'Refresh status'}).click();await page.getByText('This is a read-only view of your platform setup.').waitFor();assert.equal(await page.locator('[data-platform-account]').count(),0);assert.equal(await page.locator('[data-creator-session-connect]').count(),0);assert(await page.getByRole('button',{name:'Save platforms'}).isDisabled());assert.deepEqual(errors,[]);
 console.log('PASS creator platform UI: both choices, existing intake links, no premature connection, exact request retry, secret file clearing, verified status, owned inbox link, auth loss, desktop/mobile.');
}finally{await browser.close();server.close()}
