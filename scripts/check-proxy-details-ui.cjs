const assert=require('node:assert/strict'),{build}=require('esbuild'),{JSDOM}=require('jsdom'),{mkdtempSync,rmSync}=require('node:fs'),{join}=require('node:path');
async function main(){
 const dir=mkdtempSync(join(process.cwd(),'proxy-ui-check-')),dom=new JSDOM('<div id="root"></div>',{url:'https://dashboard.example'});
 for(const k of ['window','document','HTMLElement','HTMLInputElement','Event','MouseEvent'])globalThis[k]=dom.window[k];
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;const React=require('react'),{act}=React,{createRoot}=require('react-dom/client');
 const previous=globalThis.fetch;let root;
 try{
  await build({entryPoints:['components/creator-platforms/HostedConnect.tsx','components/onlyfans-preview/ProxyDetails.tsx'],outdir:dir,bundle:true,platform:'node',format:'cjs',jsx:'automatic',alias:{'@':process.cwd()},external:['react','react/jsx-runtime'],plugins:[{name:'css',setup(b){b.onResolve({filter:/\.module\.css$/},a=>({path:a.path,namespace:'fixture-css'}));b.onLoad({filter:/.*/,namespace:'fixture-css'},()=>({contents:'export default {}',loader:'js'}));}}]});
  const Hosted=require(join(dir,'creator-platforms/HostedConnect.js')).default,Details=require(join(dir,'onlyfans-preview/ProxyDetails.js')).default;
  const proxy={host:'203.0.113.25',countryCode:'PT',status:'assigned',verifiedAt:null};
  const attempt={id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',phase:'waiting',handle:null,enrollmentId:null,expiresAt:new Date(Date.now()+600000).toISOString(),width:432,height:720,keyboard:null};
  globalThis.fetch=async()=>Response.json({ok:true,attempt,proxy});
  root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(Hosted,{profileId:'creator-a',accountId:null,disabled:false,endpoint:'/fixture',connection:{accountId:null,proxyUrl:null,managedProxy:{countryCode:'auto',handle:'fixture'}},onChanged:async()=>false})));
  assert(document.body.textContent.includes('Proxy assigned'));assert(document.body.textContent.includes('203.0.113.25'));assert(document.body.textContent.includes('Portugal'));assert(document.body.textContent.includes('verification pending'));assert(!document.body.textContent.includes('connection verified'));
  await act(async()=>root.unmount());root=createRoot(document.getElementById('root'));
  globalThis.fetch=async()=>Response.json({ok:true,proxy:{...proxy,status:'verified',verifiedAt:'2026-10-25T12:00:00Z'}});
  await act(async()=>root.render(React.createElement(Details,{creatorId:'creator-a',accountId:'of-fixture'})));
  await act(async()=>document.querySelector('button').dispatchEvent(new MouseEvent('click',{bubbles:true})));
  assert(document.body.textContent.includes('203.0.113.25'));assert(document.body.textContent.includes('OnlyFans connection verified'));assert(document.body.textContent.includes('Last account verification'));
  await act(async()=>document.querySelector('button').dispatchEvent(new MouseEvent('click',{bubbles:true})));
  globalThis.fetch=async()=>Response.json({ok:false,error:'Connection status could not be verified.'},{status:503});
  await act(async()=>document.querySelector('button').dispatchEvent(new MouseEvent('click',{bubbles:true})));
  assert(document.body.textContent.includes('could not be verified'));assert(!document.body.textContent.includes('203.0.113.25'),'A failed refresh must clear stale proof');
  console.log('PASS real hosted sign-in and saved proxy UI: actual returned IP/country, pending versus verified, timestamp, failed refresh clears stale proof.');
 }finally{if(root)await act(async()=>root.unmount());globalThis.fetch=previous;dom.window.close();rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1});
