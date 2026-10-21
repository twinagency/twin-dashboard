const assert=require('node:assert/strict'),Module=require('node:module');
const originalLoad=Module._load;
const start=Date.parse('2026-10-01T00:00:00Z'),range={startMs:start,endMs:start+86400000};
const clones=[{id:'one',slug:'one',name:'One',intake:{},created_at:new Date(start).toISOString()},{id:'two',slug:'two',name:'Two',intake:{},created_at:new Date(start).toISOString()}];
const purchases=Array.from({length:350},(_,i)=>({id:'p'+i,clone_id:i%2?'one':'two',amount_stars:i%11===0?-10:100,paid_at:new Date(start+i*1000).toISOString(),telegram_id:1000+i,kind:'media',feature:'photo',invoice_payload:i%11===0?'refund':null}));
let recentBuyers=0;
const db={from(table){const q={table,filters:{},select(){return q},order(){return q},limit(){return q},gte(){return q},lte(){return q},contains(){return q},in(k,v){q.filters[k]=v;return q},then(resolve,reject){return Promise.resolve({data:table==='clones'?clones:[],error:null}).then(resolve,reject)}};return q}};
Module._load=function(id,parent,...rest){
 if(parent?.filename.endsWith('dashboard-data.ts')){
  if(id==='./supabase')return {supabaseAdmin:db};
  if(id==='./media-signing-cache')return {signDashboardMedia:async()=>({data:[],error:null})};
  if(id==='./analytics-data')return {getOverviewConversion:async()=>({activeChatters:30,activeChatBuyers:2,activeChatBuyerRate:2/30})};
  if(id==='./overview-rankings')return {getOverviewRankings:async()=>({fans:[],content:[],unlinked:{}})};
  if(id==='./select-all')return {
   selectAllRowsParallel:async(factory)=>{const q=factory();return {rows:purchases.filter(p=>!q.filters.clone_id||q.filters.clone_id.includes(p.clone_id)),truncated:false}},
   selectAllRows:async(q)=>{const ids=q.filters.telegram_id||[];recentBuyers=ids.length;return {rows:purchases.filter(p=>ids.includes(p.telegram_id)).map(p=>({clone_id:p.clone_id,telegram_id:p.telegram_id,name:'Display '+p.telegram_id,stated_name:'Preferred '+p.telegram_id,username:'fan'+p.telegram_id})),truncated:false}}
  };
  if(id==='./rollup')return {cloneUserStats:async()=>[],cloneUserStatsWindow:async()=>[],usageRollup:async()=>[]};
  if(id==='./revenue-window')return {resolveRevenueWindow:async()=>range};
  if(id==='./v2-bundle-sales')return {loadV2BundleSales:async()=>new Map(),v2BundleLabel:()=>''};
 }
 return originalLoad.call(this,id,parent,...rest);
};
const {getDashboard}=require('../lib/dashboard-data.ts');Module._load=originalLoad;
(async()=>{
 const full=await getDashboard('CUSTOM',range,start+86400000);
 assert.equal(full.recent.length,300);assert.equal(recentBuyers,300);
 for(const cloneId of [null,'one','two']){
  const summary=await getDashboard('CUSTOM',range,start+86400000,{overviewCloneId:cloneId});
  assert.deepEqual(summary.totals,full.totals);assert.deepEqual(summary.perClone,full.perClone);assert.deepEqual(summary.series,full.series);assert.deepEqual(summary.rankings,full.rankings);
  assert.deepEqual(summary.recent,full.recent.filter(r=>!cloneId||r.cloneId===cloneId).slice(0,5));
  assert.equal(recentBuyers,5,'only visible buyers need enrichment');
 }
 console.log('PASS overview recent rows: exact full-report totals/chart/rankings and visible purchases including refunds and creator scope; five buyer reads instead of 300');
})().catch(e=>{console.error(e);process.exitCode=1});
