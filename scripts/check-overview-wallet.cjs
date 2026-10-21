const assert=require('node:assert/strict'),Module=require('node:module');
const originalLoad=Module._load;
let tokens=0,wallets=0,cuts=0;
let access={id:'agency',name:'Agency',cloneIds:['one']};
const data={totals:{stars:100},perClone:{one:{stars:100}},clones:[{id:'one'}],recent:[{cloneId:'one',stars:100}],series:[]};
Module._load=function(id,parent,...rest){
 if(parent?.filename.endsWith('/app/api/dashboard/route.ts')){
  const stubs={
   '@/lib/clone-credentials':{cloneBotToken:async()=>{tokens++;return 'fixture'}},
   '@/lib/dashboard-reader':{dashboardReader:fn=>fn},
   '@/lib/dashboard-access':{getDashboardAccess:async()=>access},
   '@/lib/revenue-cache':{getRevenueRollup:async()=>({dashboard:data,analytics:null,cachedAt:1,ageSeconds:0,stale:false})},
   '@/lib/star-balance':{getStarBalance:async()=>{wallets++;return {lifetimeStars:100,totalBalanceStars:80}}},
   '@/lib/creator-demo-policy':{isZaneDemo:()=>false,DEMO_CLONE_ID:'demo'},
   '@/lib/revenue-projection':{redactCostFields:x=>x,resolveCloneCuts:async ids=>{cuts++;return new Map(ids.map(id=>[id,{platformPct:20,agencyCreatorPct:0}]))}},
   '@/lib/creator-share':{creatorShare:()=>1,applyCreatorShare:x=>x},
   '@/lib/creator-dashboard-privacy':{withoutCreatorPurchaseHistory:x=>x},
   '@/lib/creator-dashboard-policy':{},'@/lib/creator-demo-data':{},'@/lib/revenue-why-changed':{}
  };
  if(id in stubs)return stubs[id];
 }
 return originalLoad.call(this,id,parent,...rest);
};
const {GET}=require('../app/api/dashboard/route.ts');Module._load=originalLoad;
(async()=>{
 const summary=await GET({nextUrl:new URL('http://fixture/api/dashboard?clone=one&period=1M&summary=1')});
 assert.equal(summary.status,200);const body=await summary.json();
 assert.deepEqual(body.totals,data.totals);assert.deepEqual(body.recent,data.recent);assert.equal(body.balance,null);assert.equal(tokens,0);assert.equal(wallets,0);
 const full=await GET({nextUrl:new URL('http://fixture/api/dashboard?clone=one&period=1M')});
 assert.equal(full.status,200);const report=await full.json();assert.deepEqual(report.balance,{lifetimeStars:100,totalBalanceStars:80});assert.equal(tokens,1);assert.equal(wallets,1);assert.deepEqual(report.totals,body.totals);
 access=null;
 const adminSummary=await (await GET({nextUrl:new URL('http://fixture/api/dashboard?period=1M&summary=1')})).json();
 assert.equal(cuts,0);assert.equal(adminSummary.perCloneCuts,undefined);assert.deepEqual(adminSummary.totals,data.totals);
 const adminFull=await (await GET({nextUrl:new URL('http://fixture/api/dashboard?period=1M')})).json();
 assert.equal(cuts,1);assert.deepEqual(adminFull.perCloneCuts.one,{platformCutPct:20,agencyCreatorCutPct:0,netStars:80});
 console.log('PASS overview wallet: summary never reads bot credentials or waits for Telegram; full reporting retains the balance');
})().catch(e=>{console.error(e);process.exitCode=1});
