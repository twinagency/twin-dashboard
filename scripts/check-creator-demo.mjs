// Offline only: fabricated API fixtures; never a production session or DB write.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NextRequest} from 'next/server';
import {creatorDemoData,creatorDemoInsight} from '../lib/creator-demo-data.ts';
import {DEMO_CLONE_ID,ZANE_DEMO_ACCOUNT_ID,isZaneDemo} from '../lib/creator-demo-policy.ts';
import {creatorDashboardIdentity} from '../lib/creator-dashboard-identity.ts';
import {signCreatorSession,CREATOR_SESSION_COOKIE} from '../lib/creator-session.ts';
import {middleware} from '../middleware.ts';
import {withDashboardAccess} from '../lib/dashboard-access.ts';
import {GET as revenueGET} from '../app/api/dashboard/route.ts';
import {GET as insightGET} from '../app/api/dashboard/day-insight/route.ts';
const now=Date.parse('2026-09-11T03:00:00Z');
const sums=a=>a.reduce((n,r)=>n+r.stars,0);
const snapshots=['1D','1W','2W','1M','3M','6M','1Y','ALL'].map(period=>creatorDemoData(period,undefined,now));
for(const d of snapshots){
 assert.equal(d.demo,true);assert.equal(d.clones.length,1);assert.equal(d.clones[0].id,DEMO_CLONE_ID);
 assert.equal(d.totals.stars,d.analytics.totals.revenueStars);assert.equal(d.totals.stars,sums(d.analytics.byFeature));assert.equal(d.totals.stars,sums(d.analytics.byKind));
 assert.equal(d.totals.stars,d.series.reduce((n,r)=>n+r[DEMO_CLONE_ID],0));
 assert.equal(d.totals.stars,sums(d.analytics.byHour));assert.equal(d.totals.stars,sums(d.analytics.byDow));
 assert.equal(d.totals.sales,d.analytics.byFeature.reduce((n,r)=>n+r.sales,0));
 assert.ok(d.recent.every(r=>r.cloneId===DEMO_CLONE_ID&&r.mediaUrl===null&&r.buyerName.endsWith('(demo)')));
 assert.ok(d.analytics.whaleFans.every(r=>r.cloneId===DEMO_CLONE_ID&&r.telegramId<0));
 assert.ok(Number.isFinite(d.analytics.funnel.medianStarsPerBuyer));
}
for(let i=1;i<snapshots.length;i++)assert.ok(snapshots[i].totals.stars>snapshots[i-1].totals.stars,'Date range changes the generated amounts');
assert.deepEqual(creatorDemoData('1M',undefined,now),creatorDemoData('1M',undefined,now),'Refresh is deterministic at the same time');
const custom=creatorDemoData('CUSTOM',{startMs:now-3*86400000,endMs:now},now);assert.ok(custom.totals.stars<snapshots[1].totals.stars);
const empty=creatorDemoData('CUSTOM',{startMs:0,endMs:86400000},now);assert.equal(empty.totals.stars,0);assert.equal(empty.recent.length,0);
const insight=creatorDemoInsight('2026-09-10',now);assert.ok(insight.totals.stars>0);assert.equal(insight.comparison.sampleDays,30);assert.equal(insight.totals.stars,sums(insight.byFeature));
assert.throws(()=>creatorDemoInsight('2026-02-31',now));assert.throws(()=>creatorDemoInsight('2030-01-01',now));
const source=readFileSync('lib/creator-demo-data.ts','utf8');
assert.doesNotMatch(source,/\b(?:fetch|serviceClient|supabaseAdmin)\s*\(/);
// Array.from creates chart buckets; .from("table") would access a database.
assert.doesNotMatch(source,/\.from\(\s*["'`]|\.rpc\(|\.insert\(|\.update\(|\.upsert\(/);
Object.assign(process.env,{NODE_ENV:'production',SUPABASE_URL:'https://creator-offline.supabase.co',SUPABASE_SERVICE_KEY:'offline-only-fixture',CREATOR_SESSION_SECRET:'offline-secret-never-used-in-production',DASHBOARD_PASSWORD:'offline-admin'});
const user='22222222-2222-4222-8222-222222222222',real='44444444-4444-4444-8444-444444444444',other='55555555-5555-4555-8555-555555555555';
let linked=false,archived=false,onboarded=true;let calls=0;
const original=globalThis.fetch;
globalThis.fetch=async input=>{
 const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 assert.equal(u.hostname,'creator-offline.supabase.co','No live network calls');calls++;
 let result;
 if(u.pathname==='/rest/v1/creator_accounts')result={id:u.searchParams.get('id').slice(3),auth_user_id:user,display_name:'ZANE',account_status:archived?'archived':'applicant'};
 else if(u.pathname==='/rest/v1/creator_applications')result={status:onboarded?'submitted':'draft'};
 else if(u.pathname==='/rest/v1/creator_agency_assignments')result=null;
 else if(u.pathname==='/rest/v1/creator_clone_links')result=linked?{clone_id:real,clones:{id:real,name:'Real linked fixture'}}:null;
 else throw new Error('Unexpected financial or account operation '+u.pathname);
 return new Response(JSON.stringify(result),{headers:{'content-type':'application/json'}});
};
try{
 const token=await signCreatorSession(ZANE_DEMO_ACCOUNT_ID,user),otherToken=await signCreatorSession(other,user);
 const identity=await creatorDashboardIdentity(token);assert.ok(identity);assert.equal(identity.name,'LYNQ');assert.deepEqual(identity.cloneIds,[]);assert.ok(isZaneDemo(identity));
 const origin='https://dashboard.tgaiclone.xyz';
 const req=(path,method='GET',cookie=`${CREATOR_SESSION_COOKIE}=${token}`)=>new NextRequest(origin+path,{method,headers:{cookie,referer:origin+'/creator',origin}});
 for(const path of ['/creator','/api/dashboard/day-insight?date=2026-09-10'])assert.equal((await middleware(req(path))).status,200,path);
 for(const path of ['/api/dashboard?clone='+DEMO_CLONE_ID,'/api/dashboard?clone='+real,'/api/dashboard?clone='+DEMO_CLONE_ID+'&clone='+real,'/api/avatar?clone='+DEMO_CLONE_ID+'&tg=-1','/api/media-sign?clone='+DEMO_CLONE_ID,'/api/models','/settings','/clones/'+real,'/api/dashboard/day-insight?clone='+DEMO_CLONE_ID])assert.equal((await middleware(req(path))).status,403,path);
 assert.equal((await middleware(req('/api/dashboard?clone='+DEMO_CLONE_ID,'POST'))).status,403);
 assert.equal((await middleware(req('/api/dashboard?clone='+DEMO_CLONE_ID,'GET',`${CREATOR_SESSION_COOKIE}=${otherToken}`))).status,403,'A different account also named ZANE gets no demo access');
 assert.equal((await middleware(req('/api/dashboard?clone='+DEMO_CLONE_ID,'GET',''))).status,403,'Unauthenticated access denied');
 const before=calls;
 await withDashboardAccess(identity,async()=>{
  const r=await revenueGET(req('/api/dashboard?period=1W&clone='+DEMO_CLONE_ID));assert.equal(r.status,403);assert.equal(r.headers.get('x-data-mode'),null);assert.match((await r.json()).error,/not connected/);
  const d=await insightGET(req('/api/dashboard/day-insight?date=2026-09-10'));assert.equal(d.status,403);assert.match((await d.json()).error,/not connected/);
 });
 assert.equal(calls,before,'Synthetic endpoints do not read or write live financial tables, cache or Telegram');
 linked=true;const live=await creatorDashboardIdentity(token);assert.ok(live);assert.equal(isZaneDemo(live),false);assert.deepEqual(live.cloneIds,[real]);assert.equal(live.name,'Twin');
 assert.equal((await middleware(req('/api/dashboard?clone='+DEMO_CLONE_ID))).status,403,'Demo turns off after a real profile is connected');
 linked=false;onboarded=false;assert.equal((await creatorDashboardIdentity(token)).applicationSubmitted,false);
 onboarded=true;archived=true;assert.equal(await creatorDashboardIdentity(token),null);
 assert.equal(isZaneDemo(null),false);assert.equal(isZaneDemo({id:'creator:'+ZANE_DEMO_ACCOUNT_ID,kind:'agency',onboarded:true,cloneIds:[]}),false);
 console.log('PASS: archived test fixtures remain isolated; disconnected creator cannot receive synthetic earnings or query live financial records.');
}finally{globalThis.fetch=original;}
