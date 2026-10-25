const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://dashboard.test/onlyfans/accounts'});
for(const key of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLSelectElement','Event'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=require('react'),{createRoot}=require('react-dom/client');
let captured=null,requests=[],pending=null;
const contract={parseEnrollment:()=>null},router={push(){},refresh(){}};
function load(file,dependencies={}){
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const m={exports:{}};new Function('require','module','exports',js)(n=>dependencies[n]??require(n),m,m.exports);return m.exports;
}
const proxy=load('lib/onlyfans-connections/proxy.ts');
const Component=load('components/onlyfans-preview/AdminOnlyFansSignIn.tsx',{'next/navigation':{useRouter:()=>router},'@/lib/onlyfans-connections/contract':contract,'@/lib/onlyfans-connections/proxy':proxy,'@/components/creator-platforms/HostedConnect':{__esModule:true,default:props=>{captured=props;return React.createElement('div',{'data-hosted':true},'Hosted login')}}}).default;
globalThis.fetch=async(url,init)=>{requests.push({url,init});return new Promise(resolve=>{pending=resolve})};
const root=createRoot(document.getElementById('root'));
const button=text=>[...document.querySelectorAll('button')].find(e=>e.textContent===text);
async function click(text){const b=button(text);assert(b,text);assert(!b.disabled,text+' enabled');await React.act(async()=>b.click())}
async function fill(label,value){
 const e=[...document.querySelectorAll('label')].find(e=>e.textContent.startsWith(label))?.querySelector('input,select');assert(e,label);
 await React.act(async()=>{Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new dom.window.Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));});
}
async function mount(creators=[],accountId=null){captured=null;await React.act(async()=>root.render(React.createElement(Component,{key:Math.random(),creators,accountId})))}
async function main(){
 try{
  await mount();await click('Add OnlyFans account');assert(button('Continue to OnlyFans login').disabled);
  await fill('Full name','Fixture New');await fill('OnlyFans handle','@fixture_new');await fill("Creator's fixed proxy",'proxy.example:8080:user:pass');
  await click('Continue to OnlyFans login');assert.equal(requests.length,1);assert.equal(requests[0].url,'/api/onlyfans-connections/creators');
  assert.deepEqual(JSON.parse(requests[0].init.body),{name:'Fixture New',handle:'@fixture_new'});
  assert(button('Preparing sign-in...').disabled,'Duplicate submit disabled');
  await React.act(async()=>pending(Response.json({ok:true,creator:{id:'new-creator',name:'Fixture New'}})));
  assert(captured);assert.equal(captured.profileId,'new-creator');assert.equal(captured.connection.proxyUrl,'http://user:pass@proxy.example:8080');assert.equal(captured.connection.accountId,null);
  await click('Close');assert(!document.querySelector('[role=dialog]'));
  await mount([{id:'existing',name:'Existing Creator'}]);await click('Add OnlyFans account');await click('Select creator');await fill('Creator','existing');await fill("Creator's fixed proxy",'proxy.example:8080:user:pass');await click('Continue to OnlyFans login');
  assert.equal(requests.length,1,'Existing creator does not create a duplicate');assert.equal(captured.profileId,'existing');
  await mount([{id:'existing',name:'Existing Creator'}],'of-existing');await click('Reconnect OnlyFans');assert(!button('Add a creator'));await click('Continue to OnlyFans login');assert.deepEqual(captured.connection,{accountId:'of-existing',proxyUrl:null});
  await mount();await click('Add OnlyFans account');await fill('Full name','Close Fixture');await fill('OnlyFans handle','close_fixture');await fill("Creator's fixed proxy",'proxy.example:8080:user:pass');await click('Continue to OnlyFans login');await click('Close');
  await React.act(async()=>pending(Response.json({ok:true,creator:{id:'late',name:'Late Response'}})));assert.equal(captured,null);assert(!document.querySelector('[role=dialog]'),'Late creation cannot reopen a closed dialog');
  await mount();await click('Add OnlyFans account');await fill('Full name','Expired Fixture');await fill('OnlyFans handle','expired_fixture');await fill("Creator's fixed proxy",'proxy.example:8080:user:pass');await click('Continue to OnlyFans login');
  await React.act(async()=>pending(Response.json({ok:false,error:'Sign in again'},{status:401})));assert.equal(document.querySelector('input[type=password]').value,'');assert(button('Continue to OnlyFans login').disabled);
  console.log('PASS real creator connection UI: empty roster, new/existing paths, proxy handoff, no duplicate request, saved-proxy reconnect, close-during-request and session loss.');
 }finally{await React.act(async()=>root.unmount());dom.window.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
