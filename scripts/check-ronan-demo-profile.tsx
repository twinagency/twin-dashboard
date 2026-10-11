import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React, { act } from 'react';
import * as demo from '../components/inbox/movie-night-model';
import * as profile from '../components/inbox/ronan-profile-model';
import * as fanPhoto from '../components/inbox/useDemoFanAvatar';
import * as fanModel from '../components/fans/model';
import * as fanTypes from '../components/fans/types';

const requireLocal=createRequire(import.meta.url);
function compile(path:string,imports:Record<string,unknown>) {
  const js=ts.transpileModule(readFileSync(path,'utf8'),{fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const mod={exports:{} as any};
  new Function('require','module','exports',js)((name:string)=>Object.hasOwn(imports,name)?imports[name]:requireLocal(name),mod,mod.exports);
  return mod.exports.default;
}
export async function checkRonanDemoProfile() {
  // Verify every checkpoint, including the interval between offer and payment.
  for(let step=0;step<=demo.DEMO_EVENT_COUNT;step++){
    const state=demo.restoreDemoProgress(step);
    assert.equal(demo.demoProgress(state),step);
    assert.equal(state.playing,false);assert.equal(state.auto,false);
    const fan=profile.buildRonanProfile(state),totals=demo.demoTotals(state);
    assert.equal(fan.purchases.length,totals.purchases);
    assert.equal(fan.purchases.reduce((sum,item)=>sum+item.amount,0),totals.spent);
    assert.equal(fan.memories.some(item=>item.id==='tonight-shift'),state.messages.some(item=>item.id==='movie-0-3'));
    assert.equal(fan.memories.some(item=>item.id==='rest-follow-up'),state.memorySaved);
    assert.equal(fan.purchases.some(item=>item.id==='ronan-new-photo'),state.purchased);
    assert.equal(fan.memories.some(item=>item.id==='tonight-purchase'),state.purchased);
    for(const item of [...fan.memories,...fan.purchases,...fan.history!]){
      assert.ok(fan.messages.some(message=>message.id===item.sourceMessageId),`Visible source: ${item.id}`);
    }
    assert.equal(new URL(demo.demoProfileHref(state),'https://demo.test').searchParams.get('step'),String(step));
    if(step<demo.DEMO_EVENT_COUNT){
      const resumed=demo.movieDemoReducer(demo.movieDemoReducer(state,{type:'start',auto:true}),{type:'tick'});
      assert.equal(demo.demoProgress(resumed),step+1,'Returning resumes at the next event, without duplication');
    }
  }
  assert.equal(demo.demoProgress(demo.restoreDemoProgress('invalid')),0);
  assert.equal(demo.demoProgress(demo.restoreDemoProgress(-100)),0);
  assert.equal(demo.demoProgress(demo.restoreDemoProgress(Infinity)),0);
  assert.equal(demo.demoProgress(demo.restoreDemoProgress(10000)),demo.DEMO_EVENT_COUNT);
  assert.equal(demo.restoreDemoProgress(4,'Human').mode,'Human');
  const complete=demo.restoreDemoProgress(demo.DEMO_EVENT_COUNT);
  const fan=profile.buildRonanProfile(complete);
  assert.match(fan.memories.find(item=>item.id==='birthday')!.value,/17 May 1991/);
  assert.match(fan.memories.find(item=>item.id==='graduation')!.value,/18 September 2026/);
  assert.ok(fan.memories.length>=25);

  const {JSDOM}=requireLocal('jsdom');
  const dom=new JSDOM('<html><body><div id="profile-root"></div></body></html>',{url:`https://dashboard.test${demo.demoProfileHref(complete)}`});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,localStorage:dom.window.localStorage,IS_REACT_ACT_ENVIRONMENT:true});
  const original='{"existing":"normal fan workspace must survive"}';
  dom.window.localStorage.setItem(fanModel.STORAGE_KEY,original);
  const fetchBefore=globalThis.fetch;
  globalThis.fetch=async()=>{throw Error('Demo profile must not contact a live service');};
  let navigation='';
  const Workspace=compile('components/fans/FanWorkspace.tsx',{
    'next/navigation':{useRouter:()=>({push:(href:string)=>{navigation=href;}})},
    './PlatformMark':{__esModule:true,default:()=>null},
    './brianna-ledger':{withBriannaLedger:()=>{throw Error('No live/demo ledger mixing');}},
    './model':fanModel,'./types':fanTypes,
    './FanWorkspace.module.css':{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})},
  });
  const Profile=compile('components/inbox/RonanDemoProfile.tsx',{
    '../fans/FanWorkspace':{__esModule:true,default:Workspace},
    '../dashboard/fan-avatars':{fanAvatarUrl:()=>'/dashboard/fans/fan-01.webp'},
    './movie-night-model':demo,'./ronan-profile-model':profile,
    './useDemoFanAvatar':fanPhoto,
  });
  const {createRoot}=requireLocal('react-dom/client');
  const root=createRoot(document.getElementById('profile-root')!);
  const click=async(selector:string)=>act(async()=>{const item=document.querySelector<HTMLElement>(selector);assert.ok(item,selector);item.click();});
  await act(async()=>root.render(<Profile step={demo.DEMO_EVENT_COUNT}/>));
  assert.match(document.body.textContent!,/Fictional demo profile/);
  assert.match(document.querySelector('.metrics')!.textContent!,/US\$144.00/);
  assert.equal(document.querySelector('.profileHeader img')?.getAttribute('src'),fanPhoto.DEMO_UPLOADED_FAN_PHOTO);
  await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'m',bubbles:true})));
  for(const img of document.querySelectorAll('.profileHeader img,.fanRow img')) assert.equal(img.getAttribute('src'),'/dashboard/fans/fan-01.webp');
  await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'m',bubbles:true})));
  for(const img of document.querySelectorAll('.profileHeader img,.fanRow img')) assert.equal(img.getAttribute('src'),fanPhoto.DEMO_UPLOADED_FAN_PHOTO);
  assert.ok(document.querySelector('.railMobileHidden'),'Phone opens the profile immediately');
  await click('#fan-tab-memory');
  assert.equal(document.querySelectorAll('.memoryEntryValue').length,fan.memories.length);
  assert.doesNotMatch(document.querySelector('.sectionIntro')!.textContent!,/Shared across/);
  await click('[aria-label="View source for Birthday"]');
  assert.match(document.querySelector('[role="dialog"]')!.textContent!,/May 17, 1991/);
  assert.equal(navigation,'','Source context remains on the profile');
  await click('[aria-label="Close dialog"]');
  await click('#fan-tab-history');
  assert.equal(document.querySelectorAll('.historyEvent').length,fan.history!.length);
  await click('#fan-tab-purchases');
  assert.equal(document.querySelectorAll('.purchaseRow').length,5);
  await click('[aria-label="View Private photo purchase on OnlyFans"]');
  assert.match(document.querySelector('[role="dialog"]')!.textContent!,/US\$18.00/);
  assert.doesNotMatch(document.querySelector('[role="dialog"]')!.textContent!,/Content Library/);
  await click('[aria-label="Close dialog"]');
  const params=new URLSearchParams(window.location.search);
  assert.equal(params.get('presentation'),'movie-night');
  assert.equal(params.get('step'),String(demo.DEMO_EVENT_COUNT),'Tabs preserve the checkpoint on refresh');
  await click('.headerActions .primaryButton');
  assert.equal(navigation,demo.demoConversationHref(complete));
  assert.equal(dom.window.localStorage.getItem(fanModel.STORAGE_KEY),original);
  await act(async()=>root.unmount());
  globalThis.fetch=fetchBefore;dom.window.close();

  let admin=false,viewAs:unknown=null;
  const route=compile('app/fans/page.tsx',{
    'next/headers':{cookies:async()=>({})},
    'next/navigation':{redirect:(href:string)=>{throw Error(`redirect:${href}`);}},
    '@/lib/internal-admin':{hasInternalAdminAccess:async()=>admin},
    '@/lib/view-as':{activeViewAs:async()=>viewAs},
    '@/components/fans/FanWorkspace':{__esModule:true,default:Workspace},
    '@/components/inbox/RonanDemoProfile':{__esModule:true,default:Profile},
    '@/components/fans/data':{creators:[],authoredFans:[]},
  });
  const request={searchParams:Promise.resolve(Object.fromEntries(new URLSearchParams(demo.demoProfileHref(complete).split('?')[1])))};
  await assert.rejects(route(request),/redirect:\/twin/);
  admin=true;viewAs={targetType:'agency'};
  await assert.rejects(route(request),/redirect:\/revenue/);
  viewAs=null;
  const result=await route(request);
  assert.equal(result.type,Profile);assert.equal(result.props.step,String(demo.DEMO_EVENT_COUNT));
  assert.equal((await route()).type,Workspace,'Normal fan page is unchanged');
  console.log('Ronan profile: all checkpoints, sourced memory, purchase parity, tabs, receipts, return link, storage isolation and route access passed');
}
