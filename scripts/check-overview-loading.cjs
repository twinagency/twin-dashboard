const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
let signingCalls = 0, signedPaths = [], truncate = false, failAssets = false;
const clones = [{id:'one',name:'One'},{id:'two',name:'Two'}];
const ledger = [];
for (const clone of clones) for (const [index,type] of ['photo','video','bundle'].entries()) ledger.push({clone_id:clone.id,telegram_id:100+index,amount_stars:100,kind:'media',feature:type,media_type:type,media_id:clone.id+'-'+type});
ledger.push({clone_id:'one',telegram_id:999,amount_stars:10000,kind:'tip'});
const db = {from(table) { const q={table,filters:{},select(){return q},in(key,values){q.filters[key]=values;return q},eq(key,value){q.filters[key]=value;return q},order(){return q},then(resolve,reject){return Promise.resolve({error:failAssets?{message:'offline'}:null,data:clones.flatMap(c=>[{id:c.id+'-photo',clone_id:c.id,storage_path:c.id+'/p',image_name:'Photo '+c.name},{id:c.id+'-video',clone_id:c.id,storage_path:'foreign/v',caption:'Video '+c.name},{id:c.id+'-bundle',clone_id:c.id,name:'Bundle '+c.name,photo_bundle_items:[{storage_path:c.id+'/last',sort_order:2},{storage_path:c.id+'/first',sort_order:1}]}])}).then(resolve,reject)}};return q}};
Module._load=function(id,parent,...rest){
 if(parent?.filename.endsWith('overview-rankings.ts')){
  if(id==='./supabase')return {supabaseAdmin:db};
  if(id==='./select-all')return {selectAllRows:async(q)=>q.filters.is_test?{rows:[{clone_id:'one',telegram_id:999}],truncated:truncate}:{rows:[{clone_id:'one',telegram_id:100,name:'Display',stated_name:'Preferred'},{clone_id:'two',telegram_id:100,name:'Other creator'}],truncated:false}};
  if(id==='./media-signing-cache')return {signDashboardMedia:async paths=>{signingCalls++;signedPaths=paths;return {error:null,data:paths.map(path=>({path,signedUrl:'signed:'+path}))}}};
 }
 return originalLoad.call(this,id,parent,...rest);
};
const {getOverviewRankings}=require('../lib/overview-rankings.ts');
Module._load=originalLoad;
(async()=>{
 const result=await getOverviewRankings(ledger,clones);
 assert.equal(signingCalls,1,'all creator previews use one signing batch');
 assert.deepEqual(new Set(signedPaths),new Set(['one/p','two/p','one/first','two/first']));
 assert(!result.fans.some(f=>f.telegramId===999),'test fans remain excluded');
 assert.equal(result.fans.find(f=>f.cloneId==='one'&&f.telegramId===100).name,'Preferred');
 assert.equal(result.fans.find(f=>f.cloneId==='two'&&f.telegramId===100).name,'Other creator');
 for(const item of result.content){assert.equal(item.stars,100);assert.equal(item.purchases,1);assert.equal(item.url,item.type==='video'?null:'signed:'+item.cloneId+'/'+(item.type==='photo'?'p':'first'))}
 truncate=true;await assert.rejects(()=>getOverviewRankings(ledger,clones),/eligibility/);truncate=false;
 failAssets=true;await assert.rejects(()=>getOverviewRankings(ledger,clones),/content could not/);
 console.log('PASS overview loading: one signing batch, same names/rankings, bundle order, creator ownership and failed-read handling');
})().catch(e=>{console.error(e);process.exitCode=1});
