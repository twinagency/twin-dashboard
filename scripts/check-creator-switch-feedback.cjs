// Exercise the real switcher without a network or a live cookie.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const {JSDOM} = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', {url:'https://dashboard.test/users'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
const {createRoot} = require('react-dom/client');
let agency=false, actionCalls=0, refreshes=0, requests=0, gate, fail=false;
const deps = {
  './DashboardAccessProvider':{useDashboardAccess:()=>({isAgency:agency})},
  'next/link':{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)},
  'next/navigation':{usePathname:()=>'/users',useSearchParams:()=>new URLSearchParams(),useRouter:()=>({refresh:()=>refreshes++,push:()=>{throw Error('Unexpected navigation')}})},
  '@/app/actions/clone-scope':{setCloneScope:async()=>{actionCalls++;await gate;if(fail)throw Error('Fixture denied')}},
  '@/lib/flirt-overview-routing':{isFlirtOverviewPath:()=>false},
  '@/components/CreatorAvatar':{__esModule:true,default:({name})=>React.createElement('span',null,name+' avatar')},
  '@/lib/clone-switcher-bus':{onOpenCloneSwitcher:()=>()=>{}},
  '@/components/ui/dialog':Object.fromEntries(['Dialog','DialogContent','DialogHeader','DialogTitle'].map(name=>[name,({children})=>React.createElement('div',null,children)])),
  '@/components/ui/input':{Input:React.forwardRef((props,ref)=>React.createElement('input',{...props,ref}))},
};
const filename=process.env.SWITCHER_PATH||'components/CloneSwitcher.tsx';
const js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const mod={exports:{}};new Function('require','module','exports',js)(name=>deps[name]||require(name),mod,mod.exports);
const Switcher=mod.exports.default, root=createRoot(document.getElementById('root'));
const props={clones:[{id:'a',name:'Creator A',color:'#123456'}],activeCloneId:null};
const oldFetch=globalThis.fetch;
globalThis.fetch=async()=>{requests++;await gate;return {ok:!fail}};
const trigger=()=>document.querySelector('button[aria-busy]');
const pick=()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Creator A'));
(async()=>{
 try {
  await React.act(()=>root.render(React.createElement(Switcher,props)));
  assert.equal(trigger().getAttribute('aria-busy'),'false');
  let release;gate=new Promise(r=>release=r);
  await React.act(()=>pick().click());
  assert.equal(actionCalls,1);assert.equal(trigger().disabled,true);
  assert(document.querySelector('[role=status][aria-label="Switching creator"]'),'Feedback stays visible after the picker closes');
  await React.act(async()=>{release();await gate});
  assert.equal(refreshes,0,'Cookie server action already returns a revalidated tree');
  assert.equal(trigger().disabled,false);assert.equal(document.querySelector('[role=status]'),null);
  agency=true;await React.act(()=>root.render(React.createElement(Switcher,props)));
  gate=new Promise(r=>release=r);await React.act(()=>pick().click());
  assert.equal(requests,1);assert.equal(actionCalls,1);
  await React.act(async()=>{release();await gate});
  assert.equal(refreshes,1,'Agency cookie endpoint still needs its one tree refresh');
  fail=true;gate=Promise.resolve();await React.act(async()=>pick().click());
  assert.match(document.querySelector('[role=alert]').textContent,/Please try again/);
  assert.equal(trigger().disabled,false,'A failed switch can be retried');
  console.log('Creator switching: immediate pending feedback, one necessary refresh, unchanged scope mutation and recoverable failure passed');
 } finally {globalThis.fetch=oldFetch;await React.act(()=>root.unmount());dom.window.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
