import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const out=resolve('node_modules/.cache/moxy-creator-ui');
const shots=resolve('test-results/moxy-creator-ui');
await mkdir(out,{recursive:true});await mkdir(shots,{recursive:true});
await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import Shell from './components/CreatorStudioShell';import Home from './components/CreatorStudioHome';
import Setup from './components/CreatorSetupLayout';import Questionnaire from './components/CreatorProfileQuestionnaire';
import Content from './components/CreatorContentIntake';import Platforms from './components/creator-platforms/CreatorPlatforms';
import Payout from './components/PayoutDashboard';import Auth from './components/CreatorAuthFrame';
import Help from './components/CreatorStudioHelp';
import {COMPACT_QUESTIONNAIRE_PAGES} from './lib/creator-questionnaire-compact';
import {creatorStudioStatus} from './lib/creator-studio-model';
const p=new URLSearchParams(location.search),surface=p.get('surface'),phase=p.get('phase')||'submitted';
const linked=['ready','paused'].includes(phase),status=creatorStudioStatus(linked,phase==='draft'?'Draft / unfinished':'Submitted',linked?'active':null);
const prep={profile:{answered:22,total:22},content:{photos:24,videos:6,pending:0,folders:0},consentSaved:true};
const snapshot={schemaVersion:'creator-platforms.v1',creatorName:'Alex Morgan',profileId:'own',requested:[],readOnly:true,telegram:{configured:false,status:null,handle:null},onlyfans:{status:'ready',accounts:[],enrollments:[],error:null}};
const isSetup=location.pathname==='/creator/onboarding';
const content=isSetup?<Setup brand='moxy' creatorName='Alex Morgan' logoSrc='/moxy/moxy-ai-light.svg' activeSection={p.get('step')==='questionnaire'?'questionnaire':'content'} applicationStatus='Submitted'>{p.get('step')==='questionnaire'?<section data-creator-setup-panel><Questionnaire moxy submitted optional page={COMPACT_QUESTIONNAIRE_PAGES[0]} initialAnswers={{preferred_name:'Alex'}} initialRevision='fixture-rev'/></section>:<section data-creator-setup-panel><Content moxy submitted locked={false} loginPath='/creator/moxy/login' savedPhotos={0} savedVideos={0}/></section>}</Setup>
:surface==='platforms'?<Platforms initial={snapshot}/>:surface==='payouts'?<Payout audience='creator' brand='moxy'/>:surface==='help'?<Help brandName='Moxy'/>:<Home brand='moxy' name='Alex Morgan' cloneId={linked?'own':null} status={status} contentHref='/creator/onboarding?step=content' preparation={prep}/>;
createRoot(document.getElementById('app')).render(surface==='auth'?<Auth brand='twin' agencyBrand={{name:'Moxy',slug:'moxy',logo:'/moxy/moxy-ai-light.svg',dark:true}} heroTitle='' eyebrow='Creator workspace' title='Sign in to Moxy' description='Your creator studio, ready when you are.'><form><label><span>Email address</span><input className='tether-auth-input' type='email' aria-label='Email address'/></label><label><span>Password</span><input className='tether-auth-input' type='password' aria-label='Password'/></label><button type='submit'>Sign in</button></form></Auth>:<Shell brand='moxy' creatorName='Alex Morgan' status={status} contentHref='/creator/onboarding?step=content'>{content}</Shell>);
`},bundle:true,platform:'browser',format:'iife',jsx:'automatic',outfile:resolve(out,'app.js'),plugins:[{name:'fixtures',setup(b){
 b.onResolve({filter:/^(next\/link|next\/navigation)$|\/CurrencyProvider$|\/CreatorContentUploadProvider$|\/DashboardAccessProvider$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:process.cwd(),contents:a.path==='next/link'?`import React from 'react';export const useLinkStatus=()=>({pending:false});export default ({children,...p})=>React.createElement('a',p,children);`:a.path==='next/navigation'?`export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({refresh(){},push(href){location.assign(href)}});`:a.path.endsWith('/CurrencyProvider')?`export const useCurrency=()=>({currency:'AUD',rate:1.4,usdPerStar:0.01,setCurrency(){}});`:a.path.endsWith('/DashboardAccessProvider')?`export const useDashboardAccess=()=>({agencyName:'Moxy',isCreator:true,readOnly:true});`:`export const CreatorUploadActivity=()=>null;export const useContentUploads=()=>({items:[],revision:0,working:false,folderPending:false,folder:{folders:[],draft:'',setDraft(){},save:async()=>true},add(){},remove(){},retry(){}});` }));
}}]});
const css=await postcss([tailwind({base:process.cwd()})]).process(await readFile('app/globals.css','utf8'),{from:resolve('app/globals.css')});
const fontRoot=process.env.MOXY_UI_FONT_BUILD_DIR||resolve('.next/static');const fontDir=resolve(fontRoot,'media');
const available=(await readdir(fontDir).catch(()=>[])).filter(p=>p.endsWith('.woff2'));
// Use the app's cached Next font declarations to reproduce its actual typography.
const cssDir=resolve(fontRoot,'css');let cached='';
for(const name of await readdir(cssDir).catch(()=>[]))if(name.endsWith('.css'))cached+=await readFile(resolve(cssDir,name),'utf8');
function font(name){const rules=(cached.match(/@font-face\{[^}]+\}/g)||[]).filter(s=>s.includes(name)&&s.includes('font-style:normal'));return rules.at(-1)?.match(/url\([^)]*\/([^/()]+\.woff2)\)/)?.[1]||available[0];}
const sans=font('__Inter_'),display=font('__Inter_Tight_');
const html=`<!doctype html><html lang='en' data-agency='moxy'><head><meta name='viewport' content='width=device-width,initial-scale=1'><link rel='stylesheet' href='/global.css'><link rel='stylesheet' href='/app.css'><link rel='stylesheet' href='/moxy.css'><style>@font-face{font-family:MoxySans;src:url('/font-sans');font-weight:100 900}@font-face{font-family:MoxyDisplay;src:url('/font-display');font-weight:100 900}:root{--font-sans:MoxySans;--font-display:MoxyDisplay;--font-heading:MoxySans}*{box-sizing:border-box}body{margin:0;font-family:MoxySans,Arial,sans-serif}.moxy-auth form{display:grid;gap:20px}.moxy-auth label span{display:block;margin-bottom:8px}.moxy-auth input,.moxy-auth button{width:100%;padding:12px}</style></head><body><div id='app'></div><script src='/app.js'></script></body></html>`;
const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname;try{
 if(path==='/global.css'){res.setHeader('content-type','text/css');res.end(css.css);return;}
 if(path==='/moxy.css'){res.setHeader('content-type','text/css');res.end(await readFile('app/moxy-creator-ui.css'));return;}
 if(path==='/font-sans'||path==='/font-display'){res.setHeader('content-type','font/woff2');res.end(await readFile(resolve(fontDir,path==='/font-sans'?sans:display)));return;}
 if(path.startsWith('/moxy/')||path.startsWith('/brand/')){res.setHeader('content-type',path.endsWith('.svg')?'image/svg+xml':path.endsWith('.webp')?'image/webp':'image/png');res.end(await readFile(resolve('public',path.slice(1))));return;}
 if(path==='/app.js'||path==='/app.css'){res.setHeader('content-type',path.endsWith('.css')?'text/css':'application/javascript');res.end(await readFile(resolve(out,path.slice(1))));return;}
 res.setHeader('content-type','text/html');res.end(html);
}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;const browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/payouts?*',r=>r.fulfill({json:{brand:'moxy',creators:[{id:'own',name:'Alex Morgan',earnedUsdCents:42000,paid:{USD:0,AUD:20000},lastPaidOn:'2026-10-20'}],history:[{id:'fixture',creatorName:'Alex Morgan',amountCents:20000,currency:'AUD',paidOn:'2026-10-20',reference:'October payout',voided:false}],historyCount:1,pageSize:25,canManage:false}}));
await page.route('**/creator-auth/onboarding/draft',r=>r.fulfill({json:{revision:'fixture-next'}}));
await page.route('**/api/dashboard?*',r=>r.fulfill({json:{period:'1M',perClone:{own:{stars:7000,activeUsers:24}},analytics:{conversationFunnel:{conversations:40}},series:[],stale:false}}));
try{
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:width===1440?1000:844});
  for(const [name,path] of [['home','/creator'],['draft','/creator?phase=draft'],['ready','/creator?phase=ready'],['content','/creator/onboarding?step=content'],['profile','/creator/onboarding?step=questionnaire'],['platforms','/creator/platforms?surface=platforms'],['payouts','/creator/payouts?surface=payouts'],['help','/creator/help?surface=help'],['auth','/creator/moxy/login?surface=auth']]){
   console.log(width,name);await page.goto(origin+path);await page.locator('h1:visible').first().waitFor();await page.evaluate(()=>document.fonts.ready);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width} ${name} overflow`);
   assert.equal(await page.locator('h1:visible').count(),1,`${width} ${name} needs one page title`);
   if(['content','profile'].includes(name)){
    assert.equal(await page.locator('[data-creator-studio]').count(),0,'Persistent dashboard must not wrap setup');
    assert.equal(await page.locator('[data-creator-setup-brand="moxy"]').count(),1);
    assert.equal(await page.locator('[data-creator-setup-tab][aria-current="step"]').count(),1);
    assert.equal(await page.getByText('Follow these two simple steps to create your AI clone.',{exact:true}).count(),0);
   }else if(name!=='auth'){
    const nav=page.getByRole('navigation',{name:width<=900?'Mobile creator navigation':'Creator navigation',exact:true});
    assert.equal(await nav.locator('[aria-current="page"]').count(),['home','draft','ready','platforms','payouts'].includes(name)?(name==='payouts'&&width<=900?0:1):0);
   }
   if(name==='profile'){
    const next=page.getByRole('button',{name:'Continue',exact:true});await next.scrollIntoViewIfNeeded();
    const b=await next.boundingBox();assert(b&&b.y>=0&&b.y+b.height<=page.viewportSize().height,`${width} Continue hidden`);
    assert.equal(await page.locator('[data-questionnaire-navigation]').count(),1);
    await page.getByLabel('What name should fans call you?').fill('Alex Morgan');
    await page.getByText('Saved',{exact:true}).waitFor();
   }
   if(name==='payouts'){await page.getByText('October payout',{exact:true}).waitFor();assert.equal(await page.getByRole('combobox',{name:'Display currency'}).count(),width<=900?1:1);}
   if(width===390||width===1440)await page.screenshot({path:resolve(shots,`${name}-${width}.png`),fullPage:true});
  }
 }
 await page.setViewportSize({width:390,height:600});await page.goto(origin+'/creator');await page.getByRole('navigation',{name:'Mobile creator navigation',exact:true}).getByRole('link',{name:'Content',exact:true}).click();await page.getByRole('heading',{name:'Your content',exact:true}).waitFor();assert.equal(await page.locator('[data-creator-studio]').count(),0);await page.getByRole('link',{name:'Back to overview',exact:true}).click();await page.getByRole('heading',{name:'Your overview',exact:true}).waitFor();assert.equal(await page.locator('[data-creator-studio]').count(),1);assert.deepEqual(errors,[]);console.log('Moxy UI browser checks passed: 9 screens at 320/390/768/1440px, one shell/title, selected navigation, submitted copy, visible form actions, autosave, payouts and overflow.');
}catch(e){console.log((await page.locator('body').innerText()).slice(0,1500));await page.screenshot({path:resolve(shots,'failure.png'),fullPage:true});throw e;}finally{await browser.close();await new Promise(r=>server.close(r));}
