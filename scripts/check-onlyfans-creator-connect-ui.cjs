/* Real account form; hosted login and HTTP are synthetic fixtures. */
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync}=require('node:fs');
const {join}=require('node:path');
const {build}=require('esbuild');
const {JSDOM}=require('jsdom');
async function main(){
 const directory=mkdtempSync(join(process.cwd(),'automatic-connect-ui-'));
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://dashboard.example/onlyfans/accounts'});
 for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLSelectElement','Event','MouseEvent'])globalThis[key]=dom.window[key];
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const React=require('react'),{act}=React,{createRoot}=require('react-dom/client');
 const state=globalThis.__automaticConnect={props:null,requests:[],navigation:[],status:'pending',failure:0,held:null};
 const stubs={
  'next/navigation':`export const useRouter=()=>({push(value){globalThis.__automaticConnect.navigation.push(value)},refresh(){}});`,
  '@/components/creator-platforms/HostedConnect':`import React from 'react';export default function HostedConnect(props){globalThis.__automaticConnect.props=props;return React.createElement('button',{onClick:()=>props.onChanged('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb')},'Check connection');}`,
 };
 let root;
 const originalFetch=globalThis.fetch;
 try{
  await build({entryPoints:['components/onlyfans-preview/AdminOnlyFansSignIn.tsx'],outfile:join(directory,'form.cjs'),bundle:true,platform:'node',format:'cjs',jsx:'automatic',alias:{'@':process.cwd()},external:['react','react/jsx-runtime'],plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(stubs,a.path)?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'tsx'}));}}]});
  const Form=require(join(directory,'form.cjs')).default;
  globalThis.fetch=async(url,options={})=>{
   state.requests.push({url,options});
   if(state.held)await state.held;
   if(state.failure)return Response.json({ok:false,error:'Sign in to your dashboard again.'},{status:state.failure});
   if(options.method==='POST')return Response.json({ok:true,creator:{id:'creator-new',name:'Fixture creator'}});
   return Response.json({ok:true,enrollments:[{id:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',status:state.status,accountId:state.status==='accepted'?'of-123':null,error:null,expiresAt:new Date(Date.now()+600000).toISOString()}]});
  };
  const button=text=>[...document.querySelectorAll('button')].find(x=>x.textContent===text);
  const click=async text=>{const b=button(text);assert(b,'Missing button: '+text);await act(async()=>b.dispatchEvent(new MouseEvent('click',{bubbles:true})));};
  const field=text=>[...document.querySelectorAll('label')].find(x=>x.textContent.startsWith(text))?.querySelector('input,select');
  const fill=async(text,value)=>{const input=field(text);assert(input,'Missing field: '+text);await act(async()=>{Object.getOwnPropertyDescriptor(input instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event(input instanceof HTMLSelectElement?'change':'input',{bubbles:true}));});};
  async function mount(props={creators:[]}){
   if(root)await act(async()=>root.unmount());
   state.props=null;state.requests=[];state.navigation=[];state.failure=0;state.status='pending';state.held=null;
   root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(Form,props)));
  }
  await mount();await click('Add OnlyFans account');
  assert.equal(document.querySelectorAll('input').length,2,'New setup asks only for name and handle');
  assert.equal(document.querySelector('input[type="password"]'),null);
  assert(!/proxy|IPRoyal|country/i.test(document.body.textContent),'Agencies must not configure network infrastructure');
  assert(button('Sign in to OnlyFans').disabled);
  await fill('Full name','Fixture creator');await fill('OnlyFans handle','@Fixture_Creator');
  assert(!button('Sign in to OnlyFans').disabled);await click('Sign in to OnlyFans');
  assert.equal(state.requests.length,1);assert.deepEqual(JSON.parse(state.requests[0].options.body),{name:'Fixture creator',handle:'@Fixture_Creator'});
  assert.deepEqual(state.props.connection,{accountId:null,proxyUrl:null,managedProxy:{countryCode:'auto',handle:'fixture_creator'}});
  assert.equal(state.props.profileId,'creator-new');
  await click('Check connection');assert.equal(state.navigation.length,0,'Pending enrollment cannot navigate as connected');
  state.status='accepted';await click('Check connection');assert.equal(state.navigation.length,1);assert(state.navigation[0].includes('account=of-123'));

  await mount({creators:[{id:'creator-existing',name:'Existing creator'}]});await click('Add OnlyFans account');await click('Select creator');
  await fill('OnlyFans handle','existing_handle');await click('Sign in to OnlyFans');
  assert.equal(state.requests.length,0,'Selecting a creator must not create another one');assert.equal(state.props.profileId,'creator-existing');assert.equal(state.props.connection.managedProxy.countryCode,'auto');

  await mount({creators:[{id:'creator-existing',name:'Existing creator'}],accountId:'of-123'});await click('Reconnect OnlyFans');await click('Sign in to OnlyFans');
  assert.deepEqual(state.props.connection,{accountId:'of-123',proxyUrl:null},'Reconnect must retain the saved connection');

  await mount();await click('Add OnlyFans account');await fill('Full name','Fixture creator');await fill('OnlyFans handle','fixture_creator');state.failure=401;await click('Sign in to OnlyFans');
  assert.equal(state.props,null);assert(document.body.textContent.includes('Sign in to your dashboard again.'));assert(button('Sign in to OnlyFans').disabled);

  await mount();await click('Add OnlyFans account');await fill('Full name','Fixture creator');await fill('OnlyFans handle','fixture_creator');
  let release;state.held=new Promise(resolve=>{release=resolve});
  await act(async()=>{const b=button('Sign in to OnlyFans');b.dispatchEvent(new MouseEvent('click',{bubbles:true}));b.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
  assert.equal(state.requests.length,1,'Repeated taps cannot create duplicate setup requests');
  await click('Close');await act(async()=>{release();await Promise.resolve();});assert.equal(state.props,null,'A closed setup must ignore the late response');
  console.log('PASS automatic account form: new/existing creators, no proxy fields, automatic assignment, verified enrollment, saved-network reconnect, expired sessions, duplicate taps and cancelled setup.');
 }finally{if(root)await act(async()=>root.unmount());globalThis.fetch=originalFetch;delete globalThis.__automaticConnect;dom.window.close();rmSync(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1});
