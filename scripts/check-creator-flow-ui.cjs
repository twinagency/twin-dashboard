const assert=require('node:assert/strict');
const {createRequire}=require('node:module'); const {resolve,basename}=require('node:path'); const {rmSync}=require('node:fs');
const app=createRequire(resolve('package.json')); const {JSDOM}=app('jsdom'); const {build}=app('esbuild');
const dom=new JSDOM('<div id="root"></div>',{url:'https://creator.example/creator/onboarding?step=consent'});
for(const name of ['window','document','HTMLElement','Event','MouseEvent','FormData'])global[name]=dom.window[name];
Object.defineProperty(global,'navigator',{value:dom.window.navigator,configurable:true});global.IS_REACT_ACT_ENVIRONMENT=true;
const navigations=[];global.__flowNavigate=url=>navigations.push(url);
let authError=null,authThrows=false,resetRedirect='',signouts=0;
global.__flowAuth={auth:{
 resetPasswordForEmail:async(email,options)=>{resetRedirect=options.redirectTo;if(authThrows)throw Error('network');return{error:authError};},
 getSession:async()=>({data:{session:{user:{id:'synthetic'}}}}),
 onAuthStateChange:()=>({data:{listener:null,subscription:{unsubscribe(){}}}}),
 updateUser:async()=>{if(authThrows)throw Error('network');return{error:authError};},
 signOut:async()=>{signouts++;return{};},
}};
(async()=>{
 const stem=resolve('node_modules/.cache/creator-flow-'+basename(process.cwd()));
 const entries={Action:'components/CreatorOnboardingActionForm.tsx',Wizard:'components/CreatorQuestionnaireWizard.tsx',Forgot:'components/CreatorForgotPasswordScreen.tsx',Reset:'components/CreatorResetPasswordScreen.tsx',Recovery:'lib/creator-recovery.ts',Questions:'lib/creator-questionnaire-draft.ts'};
 await build({entryPoints:entries,outdir:stem,bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',define:{'window.location.assign':'globalThis.__flowNavigate','window.location.replace':'globalThis.__flowNavigate'},plugins:[{name:'auth-ui-fixtures',setup(b){
  b.onResolve({filter:/^(?:@\/components\/CreatorAuthFrame|@supabase\/supabase-js|@\/lib\/creator-browser-auth|next\/link)$/},args=>({path:args.path,namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({resolveDir:process.cwd(),contents:args.path==='next/link'?'import React from "react";export default function Link(props){return React.createElement("a",props);}':args.path.includes('CreatorAuthFrame')?'import React from "react";export default function Frame({children}){return React.createElement("div",null,children);}export const creatorAuthPaths=(brand)=>{const path=brand==="twin"?"/creator":"/creator/"+brand;return {login:path+"/login",forgot:path+"/forgot-password",reset:path+"/reset-password"};};export const linkAuthLinkClass="";export const tetherAuthButtonClass="";export const tetherAuthInputClass="";export const tetherAuthLinkClass="";':'export const createClient=()=>globalThis.__flowAuth;export const creatorBrowserAuth=()=>globalThis.__flowAuth;'}));
 }}]});
 const React=app('react'); const {act}=React; const {createRoot}=app('react-dom/client'); const h=React.createElement;
 let root=createRoot(document.getElementById('root'));
 const render=async(Component,props,children)=>act(async()=>root.render(h(Component,props,children)));
 const reset=async()=>{await act(async()=>root.unmount());document.getElementById('root').innerHTML='';root=createRoot(document.getElementById('root'));};
 const submit=async()=>act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 const click=async(label)=>act(async()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===label);assert.ok(b,label);b.click();});
 const Action=require(stem+'/Action.js').default;
 let resolveRequest,calls=0,payload;
 global.fetch=async(url,init)=>{calls++;payload=init.body;return new Promise(r=>resolveRequest=r);};
 await render(Action,{pendingLabel:'Saving consent…',successStatuses:['consent_saved'],loginPath:'/creator/moxy/login'},[h('input',{key:'a',name:'action',type:'hidden',value:'consent'}),h('input',{key:'n',name:'legal_name',defaultValue:'Synthetic Test'}),h('input',{key:'c',name:'agreed',type:'checkbox',defaultChecked:true}),h('button',{key:'b',type:'submit'},'Save consent')]);
 await submit();assert.equal(document.querySelector('fieldset').disabled,true);assert.match(document.body.textContent,/Saving consent/);assert.equal(payload.get('legal_name'),'Synthetic Test');await submit();assert.equal(calls,1);
 await act(async()=>resolveRequest({ok:false,status:503,url:'https://creator.example/creator/onboarding?step=consent&status=error'}));assert.equal(document.querySelector('fieldset').disabled,false);assert.equal(document.querySelector('[name="legal_name"]').value,'Synthetic Test');assert.match(document.body.textContent,/entries are still here/);
 global.fetch=async()=>({ok:true,status:200,url:'https://creator.example/creator/onboarding?step=consent&status=file_removal_pending'});await submit();assert.match(document.body.textContent,/Finish removing your pending file in Saved content, then submit again/);assert.equal(document.querySelector('a').getAttribute('href'),'/creator/onboarding?step=content');assert.equal(document.querySelector('fieldset').disabled,false);
 global.fetch=async()=>({ok:true,status:200,url:'https://creator.example/creator/moxy/login'});await submit();assert.match(document.body.textContent,/session expired/);assert.equal(new URL(document.querySelector('a').href).searchParams.get('next'),'/creator/onboarding?step=consent');
 global.fetch=async()=>({ok:true,status:200,url:'https://creator.example/creator/onboarding?step=consent&status=consent_saved'});await submit();assert.equal(navigations.pop(),'https://creator.example/creator/onboarding?step=consent&status=consent_saved');
 await reset();
 const {CREATOR_QUESTIONNAIRE_PAGES}=require(stem+'/Questions.js');const Wizard=require(stem+'/Wizard.js').default;
 global.fetch=async()=>({ok:false,status:500,url:'https://creator.example/creator/onboarding?step=questionnaire&status=error'});
 await render(Wizard,{page:CREATOR_QUESTIONNAIRE_PAGES.at(-1),initialAnswers:{},initialRevision:'',optional:true});
 await click('Continue to content');assert.match(document.body.textContent,/could not be finished/);assert.ok([...document.querySelectorAll('button')].every(b=>!b.disabled),'failed finish must restore navigation');
 global.fetch=async()=>{throw Error('network');};await click('Continue to content');assert.match(document.body.textContent,/save could not be confirmed/);assert.ok([...document.querySelectorAll('button')].every(b=>!b.disabled));
 await reset();
 let draftCalls=0,finishCalls=0;
 global.fetch=async(url)=>{if(url.endsWith('/draft')){draftCalls++;return{ok:true,status:200,json:async()=>({revision:'2026-10-04T00:00:00Z'})};}finishCalls++;throw Error('must not submit optional skip');};
 const firstPage=CREATOR_QUESTIONNAIRE_PAGES[0];await render(Wizard,{page:firstPage,initialAnswers:{},initialRevision:'',optional:true});
 const textField=document.querySelector('input:not([type=radio])')||document.querySelector('textarea');assert.ok(textField);
 await act(async()=>{textField.value='Synthetic optional answer';textField.dispatchEvent(new Event('input',{bubbles:true}));});
 await click('Skip questionnaire');assert.equal(draftCalls,1);assert.equal(finishCalls,0);assert.equal(navigations.pop(),'/creator/onboarding?step=content');
 await reset();
 dom.reconfigure({url:'https://creator.example/creator/forgot-password?next=%2Fcreator%2Fonboarding%3Fstep%3Dcontent'});
 const Forgot=require(stem+'/Forgot.js').default;const sharedProps={brand:'twin',agencyBrand:{name:'Moxy',slug:'moxy',dark:true,logo:null},authConfig:{url:'https://fixture.invalid',key:'public-fixture'}};
 authThrows=true;await render(Forgot,sharedProps);await submit();assert.match(document.body.textContent,/Could not send/);assert.equal(document.querySelector('button').disabled,false);
 authThrows=false;await submit();assert.equal(new URL(resetRedirect).searchParams.get('next'),'/creator/onboarding?step=content');assert.equal(new URL(document.querySelector('a').href).searchParams.get('next'),'/creator/onboarding?step=content');
 await reset();
 dom.reconfigure({url:'https://creator.example/creator/reset-password?next=%2Fcreator%2Fonboarding%3Fstep%3Dcontent'});
 const Reset=require(stem+'/Reset.js').default;await render(Reset,sharedProps);
 const setInput=async(index,value)=>act(async()=>{const el=document.querySelectorAll('input')[index];Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
 await setInput(0,'Synthetic-pw-123!');await setInput(1,'Synthetic-pw-123!');authError={message:'expired fixture'};await submit();assert.match(document.body.textContent,/new password could not be saved/);assert.doesNotMatch(document.body.textContent,/Passwords must match/);assert.equal(document.querySelector('button').disabled,false);
 authError=null;await submit();assert.equal(signouts,1);assert.equal(navigations.pop(),'/creator-auth/logout?next=%2Fcreator%2Fonboarding%3Fstep%3Dcontent');
 const {creatorRecoveryPath}=require(stem+'/Recovery.js');for(const value of ['https://evil.example','//evil.example','/creator-management','/creator/login'])assert.equal(creatorRecoveryPath('/creator/login',value),'/creator/login?next=%2Fcreator');
 await act(async()=>root.unmount());rmSync(stem,{recursive:true,force:true});
 console.log('Creator flow UI passed: pending/double-submit protection, preserved consent input, expired-session return, failed Finish recovery, saved optional skip without submission, recovery next across email/logout and honest reset errors. Controlled-inbox delivery and live journeys remain separate checks.');
})().catch(e=>{console.error(e);process.exitCode=1;});
