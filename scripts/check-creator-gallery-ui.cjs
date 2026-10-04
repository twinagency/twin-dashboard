const assert=require('node:assert/strict');
const {createRequire}=require('node:module');const {resolve}=require('node:path');const {rmSync}=require('node:fs');
const app=createRequire(resolve('package.json'));const {JSDOM}=app('jsdom');const {build}=app('esbuild');
const dom=new JSDOM('<div id="root"></div>',{url:'https://dashboard.lynqai.co/creator/onboarding?step=content'});
for(const name of ['window','document','HTMLElement','Event','MouseEvent'])global[name]=dom.window[name];Object.defineProperty(global,'navigator',{value:dom.window.navigator,configurable:true});global.IS_REACT_ACT_ENVIRONMENT=true;
let present=true, failRemove=true, refreshes=0;const calls=[];global.__galleryRouter={refresh:()=>refreshes++};
const file={id:'11111111-1111-4111-8111-111111111111',name:'Synthetic HEVC.mov',bytes:1024,mime:'video/quicktime',createdAt:new Date().toISOString(),status:'verified',previewAvailable:true,removalAvailable:true};
global.fetch=async(url,init={})=>{
 calls.push({url,method:init.method||'GET'});
 if(init.method==='DELETE'){if(failRemove)return {ok:false,status:503,json:async()=>({error:'storage_removal_failed'})};present=false;return {ok:true,json:async()=>({removed:true,progressSaved:true})};}
 if(url.includes('/access'))return {ok:true,json:async()=>({url:'https://private-storage.invalid/synthetic',expiresIn:3600})};
 return {ok:true,json:async()=>({files:present?[file]:[],hasMore:false})};
};
(async()=>{
 const outfile=resolve('node_modules/.cache/creator-gallery-ui.cjs');
 await build({entryPoints:['components/CreatorContentGallery.tsx'],outfile,bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',plugins:[{name:'router',setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:'router',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export function useRouter(){return globalThis.__galleryRouter;}'}));}}]});
 const React=app('react');const {act}=React;const {createRoot}=app('react-dom/client');const Gallery=require(outfile).default;const root=createRoot(document.getElementById('root'));
 await act(async()=>root.render(React.createElement(Gallery,{kind:'content_sfw_video',revision:'1',loginPath:'/creator/moxy/login'})));
 await act(async()=>{await new Promise(r=>setTimeout(r,20));});
 assert.match(document.body.textContent,/Synthetic HEVC.mov/);assert.match(document.body.textContent,/Saved and verified/);
 const click=async(text)=>act(async()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(button,text);button.click();});
 await click('Preview / play');await act(async()=>{await new Promise(r=>setTimeout(r,20));});const video=document.querySelector('video');assert.ok(video.controls);assert.ok(video.hasAttribute('playsinline'));
 await act(async()=>video.dispatchEvent(new Event('error')));assert.match(document.body.textContent,/compatible player/);assert.match(document.body.textContent,/Download/);
 await click('Remove saved file');assert.ok(document.body.textContent.includes('Confirm removal'));await click('Cancel');assert.equal(calls.some(c=>c.method==='DELETE'),false);
 await click('Remove saved file');await click('Confirm removal');await act(async()=>{await new Promise(r=>setTimeout(r,20));});assert.match(document.body.textContent,/could not be removed/);assert.match(document.body.textContent,/Synthetic HEVC.mov/);
 failRemove=false;await click('Confirm removal');await act(async()=>{await new Promise(r=>setTimeout(r,20));});assert.match(document.body.textContent,/No saved files/);assert.equal(refreshes,1);
 await act(async()=>root.unmount());rmSync(outfile,{force:true});console.log('Gallery UI passed: persisted list before connection, native playback controls, codec fallback, confirm/cancel, recoverable removal error and refreshed empty gallery. Native playback is not established by this DOM test.');
})().catch(e=>{console.error(e);process.exitCode=1;});
