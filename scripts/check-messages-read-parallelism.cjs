// Delayed database boundaries exercise the real Messages page. No live data.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const root=process.cwd(), filename=process.env.MESSAGES_PAGE_PATH||'app/users/page.tsx';
const fan={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',clone_id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',telegram_id:123,name:'Fixture Fan',username:'fixture',last_message_received:'2026-01-01T00:00:00Z',first_seen_at:'2025-01-01T00:00:00Z',total_spent_stars:50,message_credits:2,paused:false};
const clone={id:fan.clone_id,name:'Fixture Creator',slug:'fixture',engine:'live',onboarding_steps:[],drip_steps:[]};
const started=new Set(),finished=new Set();let overlap=false;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const db={from(table){const filters=[];let opts={};const q={then(resolve,reject){return(async()=>{
  const kind=table==='system_logs'?'routing':table==='chat_history'?'history':table==='star_transactions'&&filters.some(x=>x[0]==='eq'&&x[1]==='kind')?'unlocks':table;
  started.add(kind);if(['routing','unlocks','history'].every(x=>started.has(x))&&!['routing','unlocks','history'].some(x=>finished.has(x)))overlap=true;
  await sleep(25);finished.add(kind);
  return {data:table==='clones'?[clone]:table==='users'?[fan]:table==='chat_history'?[{id:'1',created_at:'2026-01-01T00:00:00Z',role:'human',content:'Fixture history'}]:table==='fan_profiles'?null:[],count:1,error:null};
 })().then(resolve,reject)}};for(const key of ['select','eq','or','gte','gt','in','order','limit','range','maybeSingle'])q[key]=(...args)=>{filters.push([key,...args]);return q};return q}};
const tag=({children})=>React.createElement('div',null,children);
const deps={
 'next/navigation':{redirect:()=>{throw Error('Unexpected redirect')}},
 '@/lib/supabase':{supabaseAdmin:db},'@/lib/clone-scope':{getCloneScope:async()=>null},
 '@/lib/select-all':{selectAllRows:async q=>({rows:(await q).data})},
 '@/lib/live-telegram':{loadV2Fans:async()=>({fans:[],originals:new Map(),unavailable:[]}),loadTelegramHistory:async()=>({rows:(await db.from('chat_history').select('*')).data,hasMore:false,combined:false,unavailable:false})},
 './actions':new Proxy({},{get:()=>()=>{}}),
};
function load(file){const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;const mod={exports:{}};
 new Function('require','module','exports',js)(name=>{
  if(deps[name])return deps[name];
  if(name==='@/components/users/ChatThread')return {__esModule:true,default:props=>React.createElement('div',{'data-thread':JSON.stringify({messages:props.messages,fanId:props.fanId,spentStars:props.spentStars,purchasedCount:props.purchasedCount})},props.historyNavigation)};
  if(name.startsWith('@/components/'))return new Proxy({__esModule:true,default:tag},{get:(o,k)=>k in o?o[k]:tag});
  if(name.startsWith('@/lib/'))return require(path.join(root,name.slice(2)));
  return require(name);
 },mod,mod.exports);return mod.exports.default;
}
(async()=>{
 const page=load(filename),tree=await page({searchParams:Promise.resolve({})});
 assert(overlap,'History, routing and unlock queries must start before any of those reads finish');
 assert.equal(started.has('fan_profiles'),true,'Selected fan profile still fetched');
 const html=renderToStaticMarkup(tree);
 assert(html.includes('Fixture Fan'));assert(html.includes('Fixture Creator'));assert(html.includes('Fixture history'),'Selected conversation content retained');
 if(process.env.BASELINE_PAGE_PATH){const baseline=await load(process.env.BASELINE_PAGE_PATH)({searchParams:Promise.resolve({})});assert.equal(renderToStaticMarkup(baseline),html,'Rendered fan list, history, controls and totals remain identical')}
 console.log('Messages reads: conversation, routing and paged unlocks overlap; existing fan, creator and profile rendering retained');
})().catch(e=>{console.error(e);process.exitCode=1});
