const assert=require('node:assert/strict'),React=require('react'),Module=require('module'),{JSDOM}=require('jsdom');
global.React=React;
require.extensions['.css']=module=>module.exports={__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
let destination=null,confirm;
const original=Module._load;
Module._load=function(id,parent,main){
 if(id==='next/navigation')return {useRouter:()=>({replace:path=>destination=path,refresh:()=>{}})};
 if(id==='next/link')return {__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};
 if(id.includes('creator-platforms/HostedConnect'))return {__esModule:true,default:props=>{confirm=props.onChanged;return React.createElement('div',{'data-hosted-connect':props.profileId});}};
 return original.call(this,id,parent,main);
};
const {renderToStaticMarkup}=require('react-dom/server');
const Choice=require('../components/CreatorOnboardingChoice').default;
const html=renderToStaticMarkup(React.createElement(Choice));
assert.match(html,/Sign in with OnlyFans/);assert.match(html,/Continue manually/);
assert.match(html,/href="\/creator\/onboarding\?step=onlyfans"/);assert.match(html,/href="\/creator\/onboarding\?step=content"/);
const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://dashboard.flirtaiagency.com'});
global.window=dom.window;global.document=dom.window.document;global.navigator=dom.window.navigator;global.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=require('react-dom/client'),{act}=React;
const Component=require('../components/CreatorOnlyFansOnboarding').default;
let mode='pending',calls=[];
function snapshot(){return {schemaVersion:'creator-platforms.v1',creatorName:'Test Creator',profileId:'profile-a',requested:['telegram','onlyfans'],readOnly:false,telegram:{configured:false,status:null,handle:null},onlyfans:{status:'ready',signIn:'hosted',error:null,enrollments:[{id:'enrollment-a',status:mode,accountId:mode==='accepted'?'account-a':null,expiresAt:new Date(Date.now()+60000).toISOString()}],accounts:mode==='accepted'?[{id:'account-a',handle:'creator',health:'ready',connection:{status:'verified',outgoingEnabled:false,verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),lastError:null}}]:[]}};}
global.fetch=async(url,init)=>{calls.push({url,method:init?.method||'GET'});return new Response(JSON.stringify(snapshot()),{headers:{'Content-Type':'application/json'}})};
(async()=>{
 const root=createRoot(document.querySelector('#root'));
 await act(async()=>{root.render(React.createElement(Component,{readOnly:false}));await new Promise(resolve=>setTimeout(resolve,20));});
 assert.ok(document.querySelector('[data-hosted-connect="profile-a"]'),'Real hosted sign-in receives server-owned profile');
 await act(async()=>{await confirm('enrollment-a');});assert.equal(destination,null,'Pending verification stays on sign-in');
 mode='failed';await act(async()=>{await confirm('enrollment-a');});assert.equal(destination,null,'Failed verification cannot open the dashboard');
 mode='accepted';await act(async()=>{await confirm('enrollment-a');});assert.equal(destination,'/creator?setup=onlyfans','Verified sign-in opens creator dashboard even while outgoing is disabled');
 assert.ok(calls.every(row=>row.url==='/creator-auth/platforms'),'Browser cannot choose another creator profile');
 await act(async()=>root.unmount());
 destination=null;confirm=null;calls=[];
 const readOnlyRoot=createRoot(document.querySelector('#root'));
 await act(async()=>{readOnlyRoot.render(React.createElement(Component,{readOnly:true}));await new Promise(resolve=>setTimeout(resolve,10));});
 assert.equal(calls.length,0,'Read-only views never start sign-in');assert.match(document.body.textContent,/read-only/);
 await act(async()=>readOnlyRoot.unmount());
 console.log('PASS: choice destinations, pending/failed/accepted redirects, scoped status reads, and read-only connection protection.');
})().catch(error=>{console.error(error);process.exitCode=1;});
