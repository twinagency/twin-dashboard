/* Render the real account grid, sign-in controls and proxy details as an agency. */
const assert=require('node:assert/strict'),{build}=require('esbuild'),{mkdtempSync,rmSync}=require('node:fs'),{join}=require('node:path');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
async function main(){
 const dir=mkdtempSync(join(process.cwd(),'agency-account-proxy-ui-'));
 const stubs={
  'next/link':`import React from 'react';export default function Link(p){return React.createElement('a',p,p.children)}`,
  'next/navigation':`export const useRouter=()=>({push(){},refresh(){}});`,
  './CreatorPlatformPage':`import React from 'react';export const CreatorPlatformHeading=({title})=>React.createElement('h1',null,title);`,
  '@/components/ui/card':`import React from 'react';export const Card=({children,...p})=>React.createElement('div',p,children);`,
  './labels':`export const HealthPill=()=>null,ModePill=()=>null,SimulatedTag=()=>null;`,
  './PreviewChrome':`export const FreshnessLine=()=>null;`,
  './PreviewNotice':`export default ()=>null;`,
  './RequestStateBlock':`export const RequestStateBlock=({state,render})=>render(state.data??[]);`,
  './ConnectionEditor':`export default ()=>null;export const RegisterConnection=()=>null;`,
  './CreatorPortrait':`export default ()=>null;`,
 };
 try{
  await build({entryPoints:['components/onlyfans-preview/AccountsView.tsx'],outfile:join(dir,'view.cjs'),bundle:true,platform:'node',format:'cjs',jsx:'automatic',alias:{'@':process.cwd()},external:['react','react/jsx-runtime'],plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(stubs,a.path)?{path:a.path,namespace:'fixture'}:/\.module\.css$/.test(a.path)?{path:'css',namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='css'?'export default {}':stubs[a.path],loader:'tsx'}));}}]});
  const View=require(join(dir,'view.cjs')).default;
  const account={accountId:'of-fixture',binding:{creatorId:'creator-owned',creatorName:'Agency fixture',handle:'fixture',bindingId:'binding'},health:'connected',healthReason:null,automationMode:'manual',syncFreshness:{asOf:null},capabilities:{}};
  const props={accountsState:{status:'ready',data:[account]},activeAccountId:null,onSelectAccount(){},readOnly:false,creatorName:null,sourceLabel:'Live',showPreviewChrome:false,connectionsConfigured:true,connectionCreators:[{id:'creator-owned',name:'Agency fixture'}],agencyConnections:true};
  const render=extra=>renderToStaticMarkup(React.createElement(View,{...props,...extra}));
  const live=render({});assert(live.includes('Add OnlyFans account'));assert(live.includes('Reconnect OnlyFans'));assert(live.includes('Proxy details'));
  for(const extra of [{readOnly:true},{showPreviewChrome:true},{connectionsConfigured:false}]){const html=render(extra);assert(!html.includes('Proxy details'));assert(!html.includes('Reconnect OnlyFans'));}
  const empty=render({accountsState:{status:'empty',data:[]}});assert(empty.includes('Add OnlyFans account'));assert(!empty.includes('Proxy details'));
  console.log('PASS actual agency accounts surface: new account action, per-account reconnect and proxy details, hidden for read-only/preview/unconfigured access, correct empty state.');
 }finally{rmSync(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1});
