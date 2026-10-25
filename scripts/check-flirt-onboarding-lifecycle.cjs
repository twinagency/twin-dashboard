const assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path'),{build}=require('esbuild'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),dom=new JSDOM('<div id="root"></div>',{url:'https://dashboard.flirtaiagency.com/onlyfans/accounts'});
for(const k of ['window','document','HTMLElement','HTMLInputElement','HTMLFormElement','FormData','InputEvent','KeyboardEvent','Event','MouseEvent'])global[k]=dom.window[k];
const React=require('react'),{createRoot}=require('react-dom/client'),{act}=React;
global.IS_REACT_ACT_ENVIRONMENT=true;
const originalAny=AbortSignal.any,originalTimeout=AbortSignal.timeout;
Object.defineProperty(AbortSignal,'any',{value:undefined,configurable:true});Object.defineProperty(AbortSignal,'timeout',{value:undefined,configurable:true});
let paints=0,starts=0,cancels=0,posted=[],paths=[],refreshes=0,frameFailure=false,statusFailure=false,frameStatus=200,enrollmentStatus='accepted',creatorSaves=0;
const baseAttempt=()=>({id:crypto.randomUUID(),phase:'waiting',handle:null,expiresAt:new Date(Date.now()+900000).toISOString(),enrollmentId:null,width:432,height:720,keyboard:null});
let attempt=baseAttempt();
dom.window.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){paints++}});
global.createImageBitmap=async()=>({width:432,height:720,close(){}});
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});
global.fetch=async(url,options={})=>{
 const u=new URL(url,dom.window.location.href);
 if(options.signal?.aborted)throw options.signal.reason;
 if(options.method==='POST'){
  const b=JSON.parse(options.body);posted.push(b);
  if(u.pathname==='/api/onlyfans-connections/creators'){creatorSaves++;return json({ok:true,creator:{id:'fixture-creator',name:'Fixture creator'}})}
  if(b.action==='start'){starts++;assert.equal(b.connection.managedProxy.countryCode,'auto');assert.equal(b.connection.managedProxy.handle,'fixture_creator');attempt=baseAttempt();return json({ok:true,attempt,proxy:{status:'assigned',host:'127.0.0.1',countryCode:'PT',verifiedAt:null}})}
  assert.equal(b.attempt,attempt.id,'Commands remain bound to the current sign-in');
  if(b.action==='cancel'){cancels++;attempt={...attempt,phase:'cancelled'};}
  if(b.action==='input'&&b.input.type==='login')assert.equal(b.input.email,'fixture@example.test');
  if(b.action==='confirm')attempt={...attempt,phase:'submitted',enrollmentId:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'};
  return json({ok:true,attempt});
 }
 if(u.searchParams.get('enrollments')==='1')return json({ok:true,enrollments:[{id:attempt.enrollmentId,status:enrollmentStatus,accountId:enrollmentStatus==='accepted'?'of-fixture':null,error:null,expiresAt:attempt.expiresAt}]});
 if(u.searchParams.get('frame')==='1'){
  if(frameFailure||frameStatus!==200)return json({error:'Screen unavailable'},frameStatus===200?503:frameStatus);
  return new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png'}});
 }
 if(statusFailure)return json({error:'Your sign-in status could not be loaded.'},503);
 return json({ok:true,attempt});
};
const mocks={'next/navigation':{useRouter:()=>({push:p=>paths.push(p),refresh:()=>refreshes++})}};
const text=()=>document.body.textContent;
const byText=(name)=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===name);
async function flush(ms=0){await act(async()=>{await new Promise(r=>setTimeout(r,ms));});}
async function until(fn,timeout=6500){const end=Date.now()+timeout;while(Date.now()<end){await flush(50);if(fn())return;}assert(fn(),'Expected UI did not appear: '+text());}
async function click(name){const b=byText(name);assert(b,'Missing button '+name+' in '+text());assert(!b.disabled);await act(async()=>{b.click();});await flush();}
async function fill(selector,value){const el=document.querySelector(selector);assert(el);await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});}
(async()=>{
 const compiled=await build({entryPoints:[root+'/components/onlyfans-preview/AdminOnlyFansSignIn.tsx'],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',alias:{'@':root},loader:{'.css':'empty'},external:['react','react/jsx-runtime','react-dom','lucide-react'],plugins:[{name:'router',setup(b){b.onResolve({filter:/^next\/navigation$/},a=>({path:a.path,external:true}));b.onResolve({filter:/\.css$/},a=>({path:a.path,namespace:'style'}));b.onLoad({filter:/.*/,namespace:'style'},()=>({contents:'export default {}',loader:'js'}));}}]});
 const mod={exports:{}};vm.runInNewContext(compiled.outputFiles[0].text,{module:mod,exports:mod.exports,require:id=>mocks[id]||require(id),window,document,HTMLElement,FormData,InputEvent,AbortController,AbortSignal,DOMException,crypto,createImageBitmap:global.createImageBitmap,fetch:(...a)=>global.fetch(...a),Response,TextEncoder,Blob,performance,console,setTimeout:window.setTimeout.bind(window),clearTimeout:window.clearTimeout.bind(window),clearInterval:window.clearInterval.bind(window)},{filename:'admin-onboarding.fixture.cjs'});
 const ui=createRoot(document.getElementById('root'));await act(async()=>ui.render(React.createElement(React.StrictMode,null,React.createElement(mod.exports.default,{creators:[]}))));
 await click('Add OnlyFans account');await fill('input[maxlength="160"]','Fixture creator');await fill('input[placeholder="@username"]','@fixture_creator');await click('Sign in to OnlyFans');await until(()=>document.querySelector('form[aria-label="OnlyFans login"]'));
 assert.equal(creatorSaves,1);assert.equal(starts,1,'StrictMode starts one sign-in');
 assert.equal(document.querySelectorAll('form input').length,2);
 frameFailure=true;await fill('form input[name="email"]','fixture@example.test');await fill('form input[name="password"]','fixture-password');const form=document.querySelector('form');await act(async()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));await until(()=>document.querySelector('[role="alert"]'));assert(posted.some(b=>b.action==='input'&&b.input.type==='login'),'Login is submitted through the existing input command');assert.equal(form.querySelector('[name="password"]').value,'','Password is cleared after submission');
 assert(!text().includes('Loading your sign-in'),'Failed screen must replace the spinner');assert(byText('Restart sign-in'),'Recovery is available in the panel');
 frameFailure=false;const oldId=attempt.id;await click('Restart sign-in');await until(()=>document.querySelector('form[aria-label="OnlyFans login"]'));assert.equal(cancels,1);assert.equal(starts,2);assert.notEqual(attempt.id,oldId);assert.notEqual(posted.filter(x=>x.action==='start')[0].startKey,posted.filter(x=>x.action==='start')[1].startKey);
 await click('Other sign-in options');await until(()=>document.querySelector('canvas[data-ready="true"]'));assert(paints>0,'Frame renders with both static abort APIs absent');
 frameStatus=410;await until(()=>text().includes('Your sign-in expired'));assert(!document.querySelector('canvas'),'Expired attempt removes the screen');frameStatus=200;
 await click('Restart sign-in');await until(()=>document.querySelector('form'));
 attempt={...attempt,phase:'wrong_account'};await until(()=>text().includes('different OnlyFans account'));assert(!byText('Connect this account'),'Wrong account cannot be confirmed');
 await click('Restart sign-in');await until(()=>document.querySelector('form'));attempt={...attempt,phase:'ready',handle:'fixture_creator'};
 await until(()=>byText('Connect this account'));await click('Connect this account');await until(()=>paths.length===1);
 assert.equal(paths[0],'/onlyfans/accounts?creator=fixture-creator&account=of-fixture');assert.equal(refreshes,1);
 assert(!document.querySelector('[role="dialog"]'),'Accepted account closes setup');
 await act(async()=>ui.unmount());dom.window.close();console.log('PASS real Flirt onboarding components: creator save, auto proxy request, StrictMode, legacy browser APIs, failed frame recovery, cancel/restart, frame rendering, expiry, wrong-account refusal, confirmation and accepted-account navigation.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{Object.defineProperty(AbortSignal,'any',{value:originalAny,configurable:true});Object.defineProperty(AbortSignal,'timeout',{value:originalTimeout,configurable:true});setTimeout(()=>process.exit(process.exitCode||0),20);});
