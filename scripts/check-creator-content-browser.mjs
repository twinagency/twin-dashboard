// Render real intake components with synthetic files and a local upload server.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { chromium } from 'playwright';
const out = path.resolve('test-results/creator-content');mkdirSync(out,{recursive:true});
const fixture = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{AppRouterContext}from'next/dist/shared/lib/app-router-context.shared-runtime';
import Layout from './components/CreatorSetupLayout';import Intake from './components/CreatorContentIntake';
import{CreatorContentUploadProvider}from'./components/CreatorContentUploadProvider';
import Wizard from './components/CreatorQuestionnaireWizard';import{COMPACT_QUESTIONNAIRE_PAGES as pages}from'./lib/creator-questionnaire-compact';
function Fixture(){const[section,setSection]=useState('content');const[total,setTotal]=useState(0);const[brand]=useState(()=>new URLSearchParams(location.search).get('brand')||'moxy');
const router={push(href){history.pushState({},'',href);setSection(new URL(href,location.href).searchParams.get('step')||'questionnaire');},refresh(){fetch('/fixture-total').then(r=>r.json()).then(r=>setTotal(r.total));}};globalThis.__contentRouter=router;
return <AppRouterContext.Provider value={router}><CreatorContentUploadProvider accountId={brand}><Layout brand={brand} logoSrc="/fixture-logo.svg" activeSection={section}><section data-creator-setup-panel><h2>Your content</h2>{section==='content'?<Intake locked={false} loginPath="/login" savedPhotos={total} savedVideos={0}/>:<Wizard page={pages[0]} initialAnswers={{}} initialRevision="" optional/>}</section></Layout></CreatorContentUploadProvider></AppRouterContext.Provider>};createRoot(document.getElementById('root')).render(<Fixture/>);`;
await build({stdin:{contents:fixture,resolveDir:process.cwd(),loader:'tsx'},outfile:path.join(out,'bundle.js'),bundle:true,platform:'browser',jsx:'automatic',plugins:[{name:'router',setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:'router',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const useRouter=()=>globalThis.__contentRouter;'}));}}]});
const css=await postcss([tailwind()]).process('@import "./app/globals.css";',{from:path.resolve('creator-content-check.css')});writeFileSync(path.join(out,'globals.css'),css.css);
const saved=new Set();let posts=0,folderSaved=false,draftSaved=false;
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');const json=body=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(body));};
 if(url.pathname==='/creator-auth/uploads')return json({uploads:url.searchParams.get('ids').split(',').map(id=>({id,state:saved.has(id)?'saved':'needs_file'}))});
 if(url.pathname==='/creator-auth/onboarding/draft'){for await(const chunk of req){}draftSaved=true;return json({revision:'saved-revision'});}
 if(url.pathname==='/creator-auth/onboarding'){for await(const chunk of req){}res.writeHead(303,{location:'/creator/onboarding?step=content&status=questionnaire_saved'});res.end();return;}
 if(url.pathname==='/creator-auth/upload'){for await(const chunk of req){}posts++;await new Promise(r=>setTimeout(r,1800));saved.add(req.headers['x-creator-upload-id']);return json({status:'content_saved'});}
 if(url.pathname==='/creator-auth/content-folders'){let data='';for await(const chunk of req)data+=chunk;await new Promise(r=>setTimeout(r,150));folderSaved=true;return json({folders:[{...JSON.parse(data),provider:'Google Drive',submittedAt:new Date().toISOString()}]});}
 if(url.pathname==='/creator-auth/files')return json({files:[],hasMore:false});
 if(url.pathname==='/fixture-total')return json({total:saved.size});
 if(url.pathname==='/fixture-logo.svg'){res.writeHead(200,{'content-type':'image/svg+xml'});res.end('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="60"><text x="4" y="43" fill="white" font-family="Arial" font-size="40">Brand</text></svg>');return;}
 if(['/bundle.js','/bundle.css','/globals.css'].includes(url.pathname)){res.writeHead(200,{'content-type':url.pathname.endsWith('.js')?'text/javascript; charset=utf-8':'text/css'});res.end(readFileSync(path.join(out,url.pathname.slice(1))));return;}
 res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/bundle.css"><style>body{margin:0;font-family:Arial,sans-serif}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});const errors=[];
try{
 for(const brand of process.argv.includes('--flirt')?['flirt']:['moxy','twin'])for(const width of [360,1280]){
  saved.clear();posts=0;folderSaved=false;draftSaved=false;const context=await browser.newContext({viewport:{width,height:900}});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/creator/onboarding?brand=${brand}`);
  await page.getByText('Upload minimum of 50 combined photos and videos of both non explicit (and explicit if applicable) content.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const picker=page.getByLabel('Add photos and videos',{exact:true});
  await picker.setInputFiles([{name:'photo.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHfsAAAAASUVORK5CYII=','base64')},{name:'clip.mp4',mimeType:'video/mp4',buffer:Buffer.from('synthetic-video')}]);
  await page.getByRole('button',{name:'Continue to questions →',exact:true}).click();await page.getByRole('heading',{name:'A quick introduction',exact:true}).waitFor();
  await page.locator('[data-content-upload-activity]').waitFor();
  await page.getByLabel('What name do you want your fans to call you?').fill('Synthetic Creator');
  await page.getByRole('button',{name:'View uploads',exact:true}).click();
  assert.equal(draftSaved,true,'View uploads saves questionnaire edits before switching');
  await page.getByText('2 of 2 files saved',{exact:true}).waitFor();assert.equal(posts,2);
  await page.getByText('Already have a folder? Paste the link.',{exact:true}).click();
  await page.getByLabel('Google Drive or Dropbox folder').fill('https://drive.google.com/drive/folders/synthetic');
  await page.locator('[data-creator-setup-tab="questionnaire"]').click();await page.getByRole('heading',{name:'A quick introduction',exact:true}).waitFor();assert.equal(folderSaved,true,'Folder revision saves before questionnaire navigation');
  for(let part=0;part<4;part++){await page.getByRole('button',{name:'Continue',exact:true}).click();}
  await page.getByRole('button',{name:'Review and finish',exact:true}).click();
  await page.getByText('2 of 2 files saved',{exact:true}).waitFor();
  await page.waitForURL(url=>url.searchParams.get('review')==='1',{timeout:10000});
  assert.equal(new URL(page.url()).searchParams.get('review'),'1');
  assert.equal(new URL(page.url()).hash,'#creator-setup-submit');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(out,`${brand}-${width}.png`),fullPage:true});await context.close();
 }
 assert.deepEqual(errors,[]);console.log('Content browser checks passed: phone/desktop sizing, automatic mixed selection, persistent transfers across tabs and folder-save navigation ordering.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
