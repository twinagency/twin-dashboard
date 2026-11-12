const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildSync } = require('esbuild');
const ts = require('typescript');
const Module = require('node:module');
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS', name); }
function loadModel() {
  const code = ts.transpileModule(fs.readFileSync('lib/payouts/model.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const compiled = new Module(path.resolve('lib/payouts/model.test.cjs'), module);
  compiled.filename = path.resolve('lib/payouts/model.test.cjs');
  compiled._compile(code, compiled.filename);
  return compiled.exports;
}
const model = loadModel();
const creator = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const valid = { cloneId: creator, amount: '10.29', currency: 'USD', paidOn: '2026-10-20', requestId };
check('cent precision never rounds a typed payment', () => assert.equal(model.parseAmount('110.29'), 11029));
check('one fractional digit is accepted exactly', () => assert.equal(model.parseAmount('0.1'), 10));
for (const amount of ['0', '-1', '1.001', '1e3', 'Infinity', '', '.01', '1000000000', '1,000']) check('reject amount ' + JSON.stringify(amount), () => assert.throws(() => model.parseAmount(amount)));
check('valid historical payout', () => assert.equal(model.parsePayout(valid, '2026-10-23').amountCents, 1029));
for (const paidOn of ['', '2026-02-30', '2026-10-24', '1999-12-31', '2026-2-01']) check('reject invalid date ' + JSON.stringify(paidOn), () => assert.throws(() => model.parsePayout({ ...valid, paidOn }, '2026-10-23')));
check('Brisbane calendar date at midnight boundary', () => assert.equal(model.todayBrisbane(new Date('2026-10-23T14:01:00Z')), '2026-10-24'));
check('unsupported currencies are rejected', () => assert.throws(() => model.parsePayout({ ...valid, currency: 'BTC' }, '2026-10-23')));
check('creator ownership cannot be supplied as an arbitrary field', () => assert.throws(() => model.parsePayout({ ...valid, recorded_by: 'admin' }, '2026-10-23')));
check('oversized reference is rejected', () => assert.throws(() => model.parsePayout({ ...valid, reference: 'x'.repeat(241) }, '2026-10-23')));
check('request id must be a UUID', () => assert.throws(() => model.parsePayout({ ...valid, requestId: '' }, '2026-10-23')));
check('all three brand variants', () => assert.deepEqual(['Twin','Moxy','FLIRT'].map(model.payoutBrand), ['twin','moxy','flirt']));

async function serverChecks() {
  const state = { creator: null, access: null, viewAs: null, authed: false, calls: [], handler: () => ({ data: null, error: null }) };
  global.__payoutTest = state;
  const mocks = {
    'next/headers': 'export async function cookies(){return {}}',
    '../auth': 'export async function isAuthed(){return globalThis.__payoutTest.authed}',
    '../dashboard-access': 'export async function getDashboardAccess(){return globalThis.__payoutTest.access}',
    '../creator-dashboard': 'export async function getCreatorWorkspace(){return globalThis.__payoutTest.creator}',
    '../agency-management-policy': 'export function agencyCanManage(x){return !!x?.canManage}',
    '../agency-policy': 'export function isPartnerPreview(x){return x === "Twin Technologies"}',
    '../view-as': 'export async function activeViewAs(){return globalThis.__payoutTest.viewAs}',
    '../platform-cut': 'export async function getViewerTermsFor(){return {starMult:0.6,usdPerStar:0.013}}',
    '../supabase-service': `export function serviceClientForAccess(){const s=globalThis.__payoutTest; return {rpc:(name,args)=>{s.calls.push({table:name,args});return Promise.resolve(s.handler({table:name,args,ops:[]}))},from(table){const q={table,ops:[]};const b={};for(const method of ['select','order','in','eq','is','range','insert','update'])b[method]=(...args)=>{q.ops.push([method,...args]);return b};b.then=(ok,bad)=>{s.calls.push(q);return Promise.resolve(s.handler(q)).then(ok,bad)};b.single=b.maybeSingle=()=>{s.calls.push(q);return Promise.resolve(s.handler(q))};return b}}}`,
  };
  const temp = path.join(os.tmpdir(), 'payout-server-' + process.pid + '.cjs');
  await require('esbuild').build({ entryPoints: ['lib/payouts/server.ts'], outfile: temp, bundle: true, platform: 'node', format: 'cjs', plugins: [{name:'payout-test-services',setup(build){build.onResolve({filter:/.*/},args=>mocks[args.path]?{path:args.path,namespace:'payout-mock'}:undefined);build.onLoad({filter:/.*/,namespace:'payout-mock'},args=>({contents:mocks[args.path],loader:'js'}))}}] });
  const api = require(temp);
  const viewer = { audience: 'admin', cloneIds: [creator], canManage: true, actor: 'agency:test:owner', brand: 'moxy' };
  async function rejects(name, fn, status) { await assert.rejects(fn, error => error.status === status); checks++; console.log('PASS',name); }
  await rejects('route authenticates independently of middleware and development mode', () => api.requirePayoutViewer(), 401);
  state.creator = {cloneIds:[creator],accountId:creator,name:'Moxy'};
  check('creator cannot acquire write authority', () => {});
  assert.equal((await api.requirePayoutViewer()).canManage, false);
  state.creator = null; state.access = {id:creator,userId:other,name:'Moxy',cloneIds:[creator],canManage:true}; state.viewAs = {};
  assert.equal((await api.requirePayoutViewer()).canManage, true); checks++; console.log('PASS Flirt retains its existing verified owner authority');
  state.viewAs = null;
  assert.equal((await api.requirePayoutViewer()).canManage, true); checks++; console.log('PASS verified agency owner can record');
  await rejects('read-only agency cannot record', () => api.recordPayout({...viewer,canManage:false},valid),403);
  await rejects('creator cannot record even if caller claims management', () => api.recordPayout({...viewer,audience:'creator'},valid),403);
  await rejects('cross-creator mutation rejected before database access', () => api.recordPayout(viewer,{...valid,cloneId:other}),403);
  await rejects('cross-creator history rejected before database access', () => api.payoutSnapshot(viewer,other),403);
  state.calls=[];
  state.handler = q => q.table === 'clones' ? {data:{id:creator},error:null} : {data:{id:requestId},error:null};
  assert.deepEqual(await api.recordPayout(viewer,valid),{id:requestId});
  const insert=state.calls.find(q=>q.ops.some(op=>op[0]==='insert')).ops.find(op=>op[0]==='insert')[1];
  check('saved amount is integer cents and ownership comes from the validated creator',()=>{assert.equal(insert.amount_cents,1029);assert.equal(insert.clone_id,creator);assert.equal(insert.recorded_by,viewer.actor);assert.equal(insert.paid_on,'2026-10-20')});
  state.handler=q=>q.table==='clones'?{data:{id:creator},error:null}:q.ops.some(op=>op[0]==='insert')?{data:null,error:{code:'23505'}}:{data:{id:requestId,...insert},error:null};
  assert.deepEqual(await api.recordPayout(viewer,valid),{id:requestId});checks++;console.log('PASS identical retry returns original receipt');
  await rejects('reusing a request id for a different amount is a conflict',()=>api.recordPayout(viewer,{...valid,amount:'11.29'}),409);
  state.calls=[];
  state.handler=q=>q.table==='clones'?{data:[{id:creator,name:'Test creator'}],error:null}:q.table==='telegram_payout_earnings'?{data:[{clone_id:creator,stars:1000}],error:null}:q.table==='telegram_payout_summary'?{data:[{clone_id:creator,currency:'USD',paid_cents:'1029',last_paid_on:'2026-10-20'},{clone_id:creator,currency:'AUD',paid_cents:'2000',last_paid_on:'2026-10-21'}],error:null}:{data:[],count:0,error:null};
  const snapshot=await api.payoutSnapshot(viewer);
  check('both viewers use the creator rate and split',()=>assert.equal(snapshot.creators[0].earnedUsdCents,1300));
  check('different payout currencies are never silently added',()=>assert.deepEqual(snapshot.creators[0].paid,{USD:1029,AUD:2000}));
  check('latest payout date includes every currency',()=>assert.equal(snapshot.creators[0].lastPaidOn,'2026-10-21'));
  check('history query always carries assigned creator filter',()=>assert.deepEqual(state.calls.find(q=>q.table==='telegram_creator_payouts').ops.find(op=>op[0]==='in'),['in','clone_id',[creator]]));
  state.calls=[];state.handler=()=>({data:{id:requestId},error:null});
  await api.voidPayout(viewer,{id:requestId,reason:'Incorrect amount'});
  check('correction query retains scope and can only void once',()=>{assert(state.calls[0].ops.some(op=>op[0]==='in'&&op[1]==='clone_id'));assert(state.calls[0].ops.some(op=>op[0]==='is'&&op[1]==='voided_at'&&op[2]===null))});
  fs.unlinkSync(temp);delete global.__payoutTest;
}

async function uiChecks() {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://dashboard.example.test/payouts',pretendToBeVisual:true});
  for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLSelectElement','Event','FormData','MutationObserver'])global[key]=dom.window[key];
  global.IS_REACT_ACT_ENVIRONMENT=true;
  global.localStorage=dom.window.localStorage;
  dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  const temp=path.resolve('.payout-test');fs.mkdirSync(temp,{recursive:true});
  buildSync({stdin:{contents:'export { default } from "./components/PayoutDashboard"; export { default as CurrencyProvider, useCurrency } from "./components/CurrencyProvider";',resolveDir:process.cwd(),loader:'tsx'},outfile:path.join(temp,'ui.cjs'),bundle:true,platform:'node',format:'cjs',packages:'external',loader:{'.css':'local-css'},jsx:'automatic'});
  const React=require('react');const {act}=React;const {createRoot}=require('react-dom/client');const UI=require(path.join(temp,'ui.cjs')).default;
  const Provider=require(path.join(temp,'ui.cjs')).CurrencyProvider;const useCurrency=require(path.join(temp,'ui.cjs')).useCurrency;
  function SharedToggle(){const {currency,setCurrency}=useCurrency();return React.createElement('button',{'data-shared-currency':currency,onClick:()=>setCurrency(currency==='AUD'?'USD':'AUD')},'Toggle shared currency')}
  const View=props=>React.createElement(Provider,null,React.createElement(SharedToggle),React.createElement(UI,props));
  const snapshot={audience:'admin',canManage:true,brand:'twin',creators:[{id:creator,name:'Test creator',earnedUsdCents:780,paid:{USD:0,AUD:0},lastPaidOn:null}],history:[],historyCount:0,page:0,pageSize:50,checkedAt:new Date().toISOString()};
  let posts=0;
  global.fetch=async(_url,options)=>{if(_url==='/api/fx')return Response.json({usd_to_aud:2});if(options?.method==='POST'){posts++;return Response.json({id:requestId},{status:201})}return Response.json(snapshot)};
  const root=createRoot(document.getElementById('root'));
  await act(async()=>{root.render(React.createElement(View,{audience:'admin',brand:'twin'}));await new Promise(resolve=>setTimeout(resolve,25))});
  check('admin payout screen has no manual recording controls',()=>{assert.equal(document.querySelectorAll('form').length,0);assert(!/add payout|record a payout/i.test(document.body.textContent))});
  check('empty ledger has clear honest empty state',()=>assert(document.body.textContent.includes('No payouts recorded yet')));
  check('available balance is not displayed',()=>assert(!/available to withdraw|withdrawable balance|remaining balance/i.test(document.body.textContent)));
  snapshot.creators[0].paid={USD:100,AUD:2000};
  snapshot.history=[{id:'usd',cloneId:creator,creatorName:'Test creator',amountCents:100,currency:'USD',paidOn:'2026-10-20',reference:'USD receipt',voided:false},{id:'aud',cloneId:creator,creatorName:'Test creator',amountCents:2000,currency:'AUD',paidOn:'2026-10-21',reference:'AUD receipt',voided:false}];snapshot.historyCount=2;
  const displaySelect=()=>Array.from(document.querySelectorAll('label')).find(label=>label.textContent.includes('Display currency')).querySelector('select');
  async function sharedSwitch(){await act(async()=>document.querySelector('[data-shared-currency]').click())}
  async function pageSwitch(value){await act(async()=>{displaySelect().value=value;displaySelect().dispatchEvent(new Event('change',{bubbles:true}))})}
  function checkAmounts(expectedCurrency,earned,paid,history) {
    const totals=document.querySelector('[aria-label="Earnings and payout totals"]');
    assert(totals.textContent.includes(earned));assert(totals.textContent.includes(paid));
    const cells=Array.from(document.querySelectorAll('#payout-history tbody tr')).map(row=>row.children[2]?.textContent);
    for(let index=0;index<history.length;index++)assert(cells[index].includes(history[index]),JSON.stringify(cells));
    assert.equal(displaySelect().value,expectedCurrency);
    assert.equal(document.querySelector('[data-shared-currency]').dataset.sharedCurrency,expectedCurrency);
  }
  await act(async()=>{window.dispatchEvent(new Event('focus'));await new Promise(resolve=>setTimeout(resolve,25))});
  await sharedSwitch();
  check('shared USD switch converts earnings, mixed-currency totals, creator row and every receipt',()=>{checkAmounts('USD','$7.80','$11.00',['$1.00','$10.00']);assert(document.getElementById('payout-creators-title').closest('section').textContent.includes('$11.00'))});
  await pageSwitch('AUD');
  check('page AUD switch also updates shared currency with live rate',()=>checkAmounts('AUD','A$15.60','A$22.00',['A$2.00','A$20.00']));
  check('converted history keeps the original recorded amount in its label',()=>assert(document.querySelector('[title="Originally paid $1.00 USD"]')));
  check('display conversion never posts or changes source payout cents',()=>{assert.equal(posts,0);assert.equal(snapshot.history[0].amountCents,100);assert.equal(snapshot.history[1].amountCents,2000);assert.equal(snapshot.history[1].currency,'AUD')});
  await act(async()=>root.unmount());
  const creatorRoot=createRoot(document.getElementById('root'));snapshot.audience='creator';snapshot.canManage=false;
  await act(async()=>{creatorRoot.render(React.createElement(View,{audience:'creator',brand:'moxy'}));await new Promise(resolve=>setTimeout(resolve,20))});
  check('creator has no payout recording or correction control',()=>{assert.equal(document.querySelectorAll('input[name="paidOn"], #correct-payout-title').length,0);assert(!document.body.textContent.includes('Add payout'));assert(!document.body.textContent.includes('Save payout'))});
  check('creator sees history and automatic sync state',()=>{assert(document.body.textContent.includes('Payment history'));assert(document.body.textContent.includes('New payments appear automatically.'))});
  check('Moxy styling is selected without changing layout',()=>assert(document.querySelector('[data-payout-brand="moxy"]')));
  await act(async()=>document.querySelector('[data-shared-currency]').click());
  check('creator payout history and totals share the same currency toggle',()=>{assert(document.querySelector('[aria-label="Earnings and payout totals"]').textContent.includes('$11.00'));assert(document.getElementById('payout-history').textContent.includes('$10.00'))});
  await act(async()=>creatorRoot.unmount());dom.window.close();fs.rmSync(temp,{recursive:true,force:true});
}
(async()=>{await serverChecks();await uiChecks();console.log(`Telegram payouts: ${checks} checks passed.`)})().catch(error=>{console.error(error);process.exit(1)});
